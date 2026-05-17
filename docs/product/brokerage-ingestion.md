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

Convex remains the system of record for product state:

- accepted trades
- inbox trades
- portfolio cash ledger entries
- portfolio valuation rows
- brokerage sync runs
- reconciliation issues
- connection metadata that is safe to store in the product database

Temporal orchestrates the external ingestion workflow:

- scheduling IBKR Flex syncs
- calling the Flex Web Service
- waiting while reports are generated
- retrying transient failures
- invoking Convex functions with bounded, idempotent results

Temporal must not own a separate product data model. If a user-facing state is
needed, write it back to Convex through explicit ingestion functions.

## Initial Provider

Initial automated brokerage ingestion should target Interactive Brokers through
IBKR Flex Web Service.

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

The first implementation should use an Activity Flex Query for the prior
business day.

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

The Activity Flex sync should start at 1:00 a.m. Eastern Time for the prior
business day.

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

Each scheduled sync should have a durable identity based on:

- owner
- brokerage connection
- report type
- query ID
- report date

For IBKR Flex Web Service, the expected workflow is:

1. Temporal starts a sync workflow for the expected report date.
2. Temporal records or confirms a Convex sync run exists.
3. An activity calls `/SendRequest` and stores the returned reference code in
   Convex.
4. The workflow waits and retries `/GetStatement` until the report is ready, a
   terminal error occurs, or a configured cutoff is reached.
5. An activity stores the raw report content or a content-addressed reference
   and hash.
6. An activity parses the report into normalized trade candidates, position
   snapshots, and cash snapshots.
7. An activity calls Convex ingestion functions.
8. Convex stages new trades for review, writes snapshots, updates sync status,
   and records reconciliation issues.

Workflow code must only orchestrate deterministic steps. Network calls, XML
parsing, raw report storage, and Convex API calls belong in Temporal activities.

## Idempotency

Every ingestion step must be safe to retry.

Use stable keys for dedupe:

- workflow ID for the orchestration attempt
- sync run uniqueness for `(ownerId, connectionId, reportType, reportDate,
  queryId)`
- raw report content hash for duplicate report retrieval
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

Store raw tokens outside normal user-facing Convex documents when practical.
Convex may store metadata such as token label, expiration date, last validated
time, and status. Temporal activities or the worker runtime may read the secret
from deployment secret storage.

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
- worker restarts

Expected terminal or user-action failures include:

- expired or invalid Flex token
- invalid query ID
- report schema no longer matching the parser
- missing required report sections
- repeated report generation failure past the cutoff

Terminal failures should update Convex sync status and surface a clear
operational issue. They should not block the rest of the product from loading.

## Deployment

The Temporal worker should follow the existing self-hosted homelab pattern used
by `pr-review-orchestrator`.

Expected deployment shape:

- self-hosted Temporal cluster
- dedicated namespace for Trade Tracker portfolio ingestion
- dedicated task queue for portfolio pipeline work
- worker service configured through environment variables
- secrets mounted through deployment secret files or environment management
- Convex HTTP service token used for worker-to-Convex ingestion calls

The worker should be independently deployable from the Next.js app and Convex
deployment. Convex remains the durable product database; the worker can be
restarted or redeployed without losing pipeline state because Temporal and
Convex retain workflow and product state respectively.

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
