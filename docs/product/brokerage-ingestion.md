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
sync: scheduling, Flex Web Service requests, durable waits, bounded retries, and
per-connection fan-out. Convex actions perform the external requests and XML
parsing, while internal mutations own all canonical product writes. There is no
separate brokerage worker or second product data model.

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

- owner
- brokerage connection
- report type
- query ID
- report date

For IBKR Flex Web Service, the implemented workflow is:

1. The nightly Convex job selects active IBKR connections and starts one durable
   child workflow per connection for the expected report date.
2. An internal mutation creates the keyed sync run, joins an existing
   succeeded or in-flight run, or atomically requeues a failed run.
3. A Convex action decrypts that connection's token, calls `SendRequest`, and
   records the returned reference code.
4. The workflow durably waits and retries `GetStatement` with bounded
   exponential backoff until the report is ready, a terminal error occurs, or
   the polling cutoff is reached.
5. When ready, an action stores the raw XML in Convex file storage, records its
   content hash, parses the report, and submits normalized results to an
   internal ingestion mutation.
6. The ingestion mutation stages new trades for review, writes position and
   cash snapshots, reconciles positions, and updates the sync run.

Workflow arguments and step results must contain only the minimum durable
coordination data. Credentials never enter the workflow journal. External I/O
and parsing stay in actions; canonical writes stay in internal mutations.

## Idempotency

Every ingestion step must be safe to retry.

Use stable keys for dedupe:

- sync run uniqueness for `(connectionId, reportType, reportDate, queryId)`;
  ownership is inherited from the connection and recorded on the run
- one raw report attachment per sync run, with a content hash for audit and
  duplicate identification
- broker-native execution ID when importing trades
- fallback composite keys only when IBKR does not provide a stable execution ID

Convex ingestion mutations should accept repeated calls for the same report
without duplicating inbox trades, snapshots, or reconciliation issues.

## Reconciliation

Brokerage snapshots are operational evidence, not replacements for accepted
trades.

After each successful sync, Convex should compare brokerage snapshots with local
state:

- open position quantity by brokerage account, symbol, asset type, and direction
- cash balance by brokerage account and currency, once cash snapshot parsing is
  proven
- new imported trades still waiting in the import inbox

Reconciliation issues should be durable, reviewable, and tied to the sync run
that produced them.

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
`brokerageConnectionSecrets` table. The encryption key comes from the Convex
deployment environment; each encrypted row records a key version so future key
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

Raw brokerage reports are sensitive financial records. Store only what is
needed for audit and debugging. The first implementation should use Convex
storage for raw Flex XML and store the storage reference plus content hash in
normal tables. Daily reports are expected to be small, but keeping the raw
payload out of ordinary queryable documents preserves a cleaner security and
client-query boundary.

Keep raw report access internal.

## Failure Handling

Expected retryable failures include:

- IBKR report not ready
- temporary IBKR server load
- transient network errors
- rate limits
- transient Convex action or workflow-step failures

Expected terminal or user-action failures include:

- expired or invalid Flex token
- invalid query ID
- report schema no longer matching the parser
- missing required report sections
- repeated report generation failure past the cutoff

Terminal failures should update Convex sync status and surface a clear
operational issue. They should not block the rest of the product from loading.

## Operational Verification

The automated path is not considered proven by unit tests or a successful
deployment alone. A production acceptance run should use a real Activity Flex
Query containing trades, open positions, and cash data for the prior business
day, then verify that one sync:

- completes without exposing the write-only token
- stores a raw report reference and content hash
- stages new executions in the import inbox without duplicates
- writes position and cash snapshots for every account in the report
- creates or resolves reviewable reconciliation issues
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
