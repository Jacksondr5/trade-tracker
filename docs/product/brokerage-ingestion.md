# Brokerage Ingestion

## Purpose

This document defines the intended product and architecture model for automated
brokerage data ingestion in Trade Tracker.

Use it when changing imports, brokerage connections, synced trades, position
snapshots, cash snapshots, reconciliation, or portfolio valuation freshness.

Brokerage ingestion exists to keep Trade Tracker's local records current enough
for review and portfolio analytics. It should not turn Trade Tracker into a
trading platform, broker replacement, or real-time account monitor.

## Product Job

Brokerage ingestion should help answer:

- what new brokerage trades need review
- whether local accepted trades match the brokerage's current positions
- whether portfolio valuation inputs are fresh enough to trust
- what went wrong when a brokerage sync failed or was delayed

Brokerage ingestion should not become:

- trade execution
- live order monitoring
- intraday risk management
- broker-grade accounting or tax-lot reporting
- a generic personal finance aggregation system

## Canonical Model

Convex is both the system of record and the durable orchestration runtime for
brokerage ingestion:

- accepted trades
- inbox trades
- portfolio cash ledger entries
- portfolio valuation rows
- brokerage sync runs
- reconciliation issues
- connection metadata that is safe to expose to the product
- encrypted, connection-bound brokerage credentials in a separate secrets table

The `@convex-dev/workflow` component coordinates the long-running parts of the
sync: Flex Web Service requests, durable waits, bounded action retries, and
per-connection fan-out. Convex cron and scheduler functions initiate the sync.
Convex actions perform the external requests and XML parsing, while internal
mutations own all canonical product writes. There is no separate brokerage
worker or second product data model.

## Initial Provider

Initial automated brokerage ingestion targets Interactive Brokers through IBKR
Flex Web Service.

IBKR Flex Web Service is the preferred source because:

- it avoids TWS and IB Gateway process management
- it avoids a constantly active brokerage session
- it uses Client Portal-created query IDs and tokens
- it is designed for report-style daily retrieval
- it can provide trades, open positions, cash, and audit-friendly source data

Client Portal `/iserver` endpoints and TWS API are not the default ingestion
path because they require brokerage-session mechanics that conflict with normal
IBKR usage and are better suited to trading systems.

Scheduled email or FTP Flex delivery is not the default path. It may be
revisited only if Flex Web Service proves unreliable enough that an inbound file
delivery workflow is simpler than direct request/retry orchestration.

## Report Types

The automated sync uses an Activity Flex Query for the prior business day.

The Activity Flex Query should include, as available:

- trades or executions
- open positions
- cash balances or statement of funds
- deposits and withdrawals
- enough stable brokerage identifiers to support dedupe and audit

A Trade Confirmation Flex Query may be added later if same-day trades need to be
reflected before the final activity statement is ready. It should supplement,
not replace, the daily Activity report.

## Schedule Timing

The Activity Flex sync starts at 1:00 a.m. Eastern Time for the prior business
day. A single Convex cron fires at 05:00 UTC. It starts immediately during
Eastern daylight time and uses a durable one-hour delay during Eastern standard
time, avoiding duplicate runs around daylight-saving transitions.

IBKR Activity Statements are not the right source for a final same-evening
valuation. They are updated after the reporting backend closes the prior day and
should be treated as an overnight source of record.

Downstream jobs must carry an explicit report or valuation date. After midnight
Eastern Time, "today" is no longer the market date being reconciled. Brokerage
sync, market price refresh, and daily portfolio valuation should all operate on
the same explicit prior-business-day date.

The preferred daily sequence is:

1. Sync IBKR Activity Flex for the prior business day at 1:00 a.m. Eastern.
2. Fetch or confirm market prices for that same prior business day.
3. Reconcile brokerage snapshots against accepted trades and pending imports.
4. Compute or refresh portfolio valuations for that prior business day with a
   brokerage freshness status.

If market prices are fetched earlier after the close, valuation should still
wait until brokerage freshness is known or be recomputed after the brokerage
sync completes.

## Sync Workflow

Each per-connection sync has a durable identity based on:

- brokerage connection
- report type
- query ID
- report date

Ownership is inherited from the connection and recorded on the run; it is not
part of the uniqueness key.

For IBKR Flex Web Service, the implemented workflow is:

1. The nightly Convex job selects active IBKR connections and starts one durable
   child workflow per connection for the expected report date.
2. An internal mutation creates the keyed sync run, joins an existing
   succeeded or in-flight run, or atomically requeues a terminal failed run. A
   manual sync may explicitly force-requeue a succeeded run or start a new date
   for an errored connection, but it never reclaims an in-flight run and
   nightly syncs keep the normal join behavior.
3. A Convex action decrypts that connection's token and calls `SendRequest`.
   The action returns the reference code, which a following internal mutation
   records on the run.
4. The workflow durably waits and retries `GetStatement` with bounded
   exponential backoff until the report is ready, a terminal error occurs, or
   the polling cutoff is reached.
5. When ready, an action parses the report and compares the accounts present in
   its Flex statements with the connection's optional expected-account list.
   If any expected account is absent, the action retains the raw XML and hash,
   then fails terminally before any trade, snapshot, or reconciliation write.
   The comparison trims both sources and ignores letter case while preserving
   the configured and reported casing in operator-facing messages. An unset
   expected-account list skips this guard.
6. For a complete report, the action stores the raw XML in Convex file storage,
   records its content hash, and submits normalized results to an internal
   ingestion mutation. A parser failure is terminal and does not retain the raw
   XML.
7. The ingestion mutation stages new trades for review, writes position and
   cash snapshots, reconciles positions, and updates the sync run.

Workflow arguments and step results must contain only the minimum durable
coordination data. Credentials never enter the workflow journal. External I/O
and parsing stay in actions; canonical writes stay in internal mutations.

## Idempotency

Every ingestion step must be safe to retry.

Use stable keys for dedupe:

- sync run uniqueness for `(connectionId, reportType, reportDate, queryId)`;
  ownership is inherited from the connection and recorded on the run
- one current raw report attachment on the sync run, with a content hash for
  audit and duplicate identification; a re-sync repoints the run to newly
  returned content while retaining older reports as historical evidence
- broker-native order ID (`ibOrderID`) when importing IBKR trades; execution
  IDs remain in the Flex query only as the migration bridge for older records
- fallback composite keys only when IBKR does not provide a stable execution ID

Convex ingestion mutations should accept repeated calls for the same report
without duplicating inbox trades, snapshots, or reconciliation issues.
An ordinary retry that receives byte-identical content reuses the existing raw
report. A forced re-sync that receives identical content fails visibly because
IBKR served the cached statement and the system learned nothing new.

Requeue starts a fresh attempt on the same durable key. It resets completion,
error, reference-code, current raw-report pointer, request/start timestamps,
status, and the imported-trade, skipped-duplicate, position-snapshot, and
reconciliation-issue counters. It deliberately preserves the run ID and key
fields (`connectionId`, owner, source, report type/date, and query ID), while
prior raw-report rows and already-ingested canonical records remain historical
or idempotently replaceable evidence.

IBKR order ingestion reads `<Order>` rows rather than execution-level `<Trade>`
rows. This preserves IBKR's aggregated quantity, weighted-average price, and
commission when an order fills in pieces. A report containing Trade rows but no
Order rows fails visibly instead of silently falling back to split fills.

The supported IBKR trade scope is USD-denominated stock orders. Other asset
categories and non-USD orders are skipped with an explicit warning naming the
order, instrument, and reason. In particular, a `STK` asset category does not
override the currency guard: JPY-denominated stocks are not imported as though
their prices were USD. Crypto and cash/currency operations remain deferred.

## Reconciliation

Brokerage snapshots are operational evidence, not replacements for accepted
trades.

After each successful sync, Convex should compare brokerage snapshots with local
state:

- open position quantity by brokerage account, symbol, asset type, and direction
- cash balance by brokerage account and currency, once cash snapshot parsing is
  proven
- new imported trades still waiting in the import inbox

Position reconciliation issues are persistent discrepancies, not a daily
append-only log. Their identity is connection, issue type, brokerage account,
asset type, symbol, and direction; report date is the latest supporting
evidence, not part of identity. Reconciliation reuses a still-present issue,
resolves one that disappeared or changed type, and leaves unrelated legitimate
issues open. A corrected re-sync therefore converges instead of accumulating a
contradictory old issue alongside the corrected snapshot.

The first version should focus on position quantity mismatches. Cash
reconciliation can follow after position sync behavior is stable.

## Valuation Freshness

Daily portfolio valuation should not silently present stale brokerage-derived
state as trustworthy.

Portfolio valuation and portfolio review surfaces should be able to distinguish:

- `current`: expected brokerage sync succeeded and reconciled
- `pending_review`: new imported trades or mapping issues need review
- `stale`: expected brokerage sync has not succeeded
- `mismatched`: brokerage positions and local accepted trades disagree
- `unmanaged`: no automated brokerage connection is configured

A valuation row may still be computed when sync status is not `current`, but the
review surface should make the freshness problem visible.

## Secrets And Security

IBKR Flex tokens are sensitive credentials.

Each brokerage connection owns its own write-only token. Encrypt tokens with
AES-GCM in a Convex action before writing them to the separate
`brokerageConnectionSecrets` table. Every encryption generates a fresh,
cryptographically random 12-byte IV. The table stores that IV, the ciphertext
including its authentication tag, and the key version as internal-only fields.
The encryption key comes from the Convex deployment environment so future key
rotation can distinguish old and new ciphertext. Client-facing queries may
return safe metadata such as whether a token is configured and when it expires,
but must never return ciphertext, IVs, or plaintext.

Key rotation uses an active version plus retained versioned deployment keys so
old rows remain decryptable while replacement writes use the new version. A
separate rotation command or bulk migration is not required for the initial
implementation.

Decrypt a token only inside the action that is about to call IBKR, and keep the
plaintext local to that action. It must never become a workflow argument or a
workflow step return value because `@convex-dev/workflow` durably journals both.
Do not log or echo plaintext tokens.

Raw brokerage reports are sensitive financial records. After a report parses,
retain what is needed to audit or debug its ingestion. Store that raw Flex XML
in Convex storage and keep the storage reference plus content hash in normal
tables. An incomplete report is retained even though ingestion is blocked,
because it is the evidence needed to diagnose an account-scope failure. Daily
reports are expected to be small, but keeping the raw payload out of ordinary
queryable documents preserves a cleaner security and client-query boundary.
Parser failures happen before storage, so this raw report record is not
available for diagnosing a parser mismatch.

Keep raw report access internal.

## Failure Handling

Expected retryable failures include temporary IBKR server load, transient
network errors, and rate limits while sending or polling a Flex request. Each
request action is attempted up to three times. A report that is not ready uses
durable polling with a default cutoff of 24 attempts and exponential delays
capped at 15 minutes. Reaching that cutoff records `failed_retryable` on the run
and returns a `timed_out` workflow result, allowing a later sync to requeue the
same keyed run.

Expected terminal or user-action failures include:

- expired or invalid Flex token
- invalid query ID
- report schema no longer matching the parser
- missing required report sections
- a report missing one or more configured expected accounts
- a forced re-sync receiving the same cached report content

Terminal failures should update Convex sync status and surface a clear
operational issue. Retryable failures should do the same. Both failure classes
must preserve the brokerage connection's configuration status: an active
connection remains eligible for the next scheduled sync, while the failed sync
run, connection error, and failure timestamp explain why the latest attempt
did not succeed. A paused connection remains excluded from scheduling.

A manual force may recover the keyed terminal run without changing a normally
active connection's status. It reactivates a legacy errored connection only as
part of that explicit recovery. Force cannot make IBKR regenerate a cached Flex
statement. If the content hash is unchanged, the failure tells the operator to
edit the Flex query or wait for the reporting period to roll over.

`error` remains a schema-supported legacy connection status for compatibility.
No current app write path assigns it: public connection updates accept only
`active`, `paused`, or `needs_setup`, and sync-run failure and success mutations
preserve the existing connection status. The scheduler selects `active`
connections during nightly execution; its force-only `includeError` path
remains to let an operator recover a pre-existing errored connection. Retire
the enum only through a separate schema-migration decision.

Operator recovery should scope the force to the connection being repaired:

```bash
pnpm exec convex run ibkrFlexWorkflow:startManualSync '{"connectionId":"<connection-id>","force":true,"reportDate":"YYYY-MM-DD"}' --prod
```

Omitting `connectionId` deliberately preserves the date-wide operator command,
which forces every eligible IBKR connection. A supplied ID is an operator scope
and typo guard, not an authorization boundary: the internal mutation validates
that it names a real IBKR connection, and the workflow fails visibly if that
connection is not eligible for the requested sync. Nightly runs never force and
remain unscoped.

## Operational Verification

The automated path is not considered proven by unit tests or a successful
deployment alone. A production acceptance run should use a real Activity Flex
Query containing trades, open positions, and cash data for the prior business
day, then verify that one sync:

- completes without exposing the write-only token
- stores a raw report reference and content hash
- rejects a report that omits a configured expected account before ingestion
- stages new executions in the import inbox without duplicates
- writes position and cash snapshots for every account in the report
- creates, persists, and resolves reviewable reconciliation issues across
  report dates without accumulating contradictions
- exposes the resulting sync and freshness state in the product

After the manual acceptance run, observe at least one unattended 1:00 a.m.
Eastern run. This proves brokerage ingestion only. The broader brokerage to
market-data to valuation parent pipeline remains separate work and must not be
claimed as complete from this sync alone.

## User Experience

The ingestion UI should be operational and compact.

It should show:

- connection status
- latest successful sync
- latest failed sync and error
- pending imported trades
- reconciliation issues
- token or query setup guidance when needed
- an optional list of expected account IDs used to fail closed on partial Flex
  reports

It should avoid becoming a large settings product. The primary user task is to
know whether Trade Tracker is current enough to trust and what needs review.

## Deferred Work

Do not include these in the first version:

- trade execution through IBKR
- live order monitoring
- full tax-lot accounting
- multi-broker aggregation
- scheduled email or FTP ingestion
- same-day Trade Confirmation sync unless daily Activity sync proves too stale
- automatic correction of accepted trades without review
