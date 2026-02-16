# Trade Import Architecture Design (Periodic Sync + Manual Sync)

Date: 2026-02-16
Context: Existing app uses Convex + Next.js with `campaigns`, `tradePlans`, and manually-entered `trades`.

## Goals

1. Stop manual execution entry for brokerage-backed trades.
2. Pull executed trades from IBKR and Kraken on periodic schedule (15-minute default).
3. Support manual "Sync now" for immediate refresh.
4. Route every newly imported trade through a single inbox workflow.
5. Keep `tradePlanId` and `campaignId` editable like normal fields.

## Non-goals (v1)

- Full real-time stream ingestion.
- Automated order placement.
- TradingView as authoritative source of fills.
- Auto-linking trades without user confirmation.

## Updated Product Decision

Use an **inbox-first pipeline** with **one suggested linkage** per trade and **no auto-apply**.

Rules:
- Every imported trade goes to the inbox.
- Suggestion engine may prefill one `tradePlanId` candidate.
- `campaignId` is not independently suggested; it remains blank unless user-selected (or derived from selected trade plan).
- User confirms, changes, or clears linkage.
- Suggestion artifacts are not stored as a separate long-lived table in v1.

Rationale:
- Maintains trust and explicit control.
- Keeps the model simple: linkage is just editable trade data.
- Avoids hidden coupling between automation and campaign analytics.

## Domain Model Changes (Convex)

### New tables

1. `brokerageConnections`
- `provider`: `ibkr | kraken`
- `accountRef`: broker account identifier
- `status`: `active | needs_reauth | error | disconnected`
- `auth`: provider auth/token payload (stored with Convex-native encryption at rest)
- `createdAt`, `updatedAt`, `lastValidatedAt`, `lastSyncAt`

2. `importJobs`
- `connectionId`
- `mode`: `scheduled | manual`
- `status`: `running | succeeded | partial | failed | blocked_reauth`
- `startedAt`, `finishedAt`
- `windowStart`, `windowEnd`
- `cursorBefore`, `cursorAfter`
- `stats`: fetched/inserted/updated/pendingReview/skipped/errors
- `errorSummary`

3. `externalExecutions` (raw canonicalized fills)
- `connectionId`, `provider`, `accountRef`
- `externalExecutionId` (native broker id)
- `externalOrderId` (optional)
- `occurredAt`
- `symbol`, `side`, `quantity`, `price`, `fee`, `feeCurrency`
- `rawPayload` (original broker payload)
- `ingestionHash` (normalized fallback dedupe key)
- `importJobId`
- Unique indexes:
  - `(provider, accountRef, externalExecutionId)`
  - fallback `(provider, accountRef, ingestionHash)`

4. `importCursorState`
- Per connection/provider cursor/watermark state for incremental sync
- Stores last successful boundary and optional endpoint cursor offsets

### Changes to existing `trades`

Add fields:
- `source`: `manual | ibkr | kraken`
- `externalExecutionId` (optional)
- `externalOrderId` (optional)
- `brokerAccountRef` (optional)
- `importJobId` (optional)
- `campaignId` (optional direct campaign linkage)
- `inboxStatus`: `pending_review | reviewed`
- `suggestedTradePlanId` (optional)
- `suggestionReason`: `symbol_and_side_match | none`

Notes:
- Remove `tradeLinkSuggestions` table from v1.
- Remove ranked candidates from v1.
- User controls final linkage via `tradePlanId` and/or direct `campaignId`.

## Shared Connector Architecture

Create provider adapters behind a common interface:
- `BrokerConnector.sync(connection, mode, cursorState)`
- returns normalized executions + new cursor + diagnostics

Implementations:
- `IbkrConnector`
- `KrakenConnector`

### IBKR Connector (explicit complexity handling)

Responsibilities:
1. Brokerage session lifecycle
- Pre-flight: auth status check before each poll.
- Keepalive: `tickle` usage around active polling windows.
- Session-expired path: mark connection `needs_reauth`, fail job as `blocked_reauth`, surface actionable UI message.

2. Pacing and concurrency control
- Enforce endpoint pacing (`/iserver/account/trades` effectively 1 request per 5 seconds).
- Global request throttling and jittered retry on 429.
- Single-flight lock per IBKR connection (prevents overlapping scheduled/manual sync races).

3. Resets/maintenance resilience
- Treat expected reset windows as retryable downtime.
- Circuit-breaker behavior after repeated failures.
- Health state exposed in UI (`degraded`, `maintenance_window`, `needs_reauth`).

4. Data strategy
- 15-minute poll reads bounded recent window, dedupes idempotently.
- Manual sync uses same path with optional wider lookback (still constrained by endpoint history limits).

## Ingestion Pipeline

1. Trigger
- Scheduled cron per active connection (15-minute default).
- User-triggered `Sync now` per connection and global.

2. Fetch
- IBKR: `GET /iserver/account/trades` (incremental lookback, dedupe).
- Kraken: `POST /private/TradesHistory` (paginated until watermark reached).

3. Normalize
- Convert broker payloads to canonical execution object.
- Normalize symbol format for matching.

4. Deduplicate / Upsert
- Prefer native execution id uniqueness.
- Fallback hash for safety.
- Make replays idempotent.

5. Materialize trade + suggestion
- Create/patch `trades` rows.
- Set `inboxStatus = pending_review` for every new imported trade.
- Compute one suggestion using only:
  - Symbol match to trade plan instrument
  - Side-direction consistency

6. Finalize job
- Persist cursor only after durable writes.
- Emit job summary and errors.

## IBKR Initial Backfill Strategy

`/iserver/account/trades` is limited to 7 days, so initial historical backfill needs a separate source:

1. Preferred: IBKR Flex Queries / statements export import path for historical fills.
2. Then switch to CP API incremental polling for ongoing sync.

This avoids forcing a brittle deep-history scrape from an endpoint that is intentionally short-window.

## Inbox UX

Single section: `Import Inbox`

Row contents:
- execution details (symbol/side/qty/price/time/account/provider)
- suggested `tradePlan` (or blank)
- editable `tradePlan` selector
- editable `campaign` selector (defaults blank when no trade plan is selected)
- campaign shown as derived when a chosen trade plan already belongs to a campaign

Actions:
- Save row with confirmed/changed/blank linkage
- Bulk apply selected trade plan to selected rows
- Filter by provider/account/symbol/date/pending

Separate panel/tab: `Import Errors`
- auth failures, pacing issues, maintenance downtime, partial imports

Manual sync controls:
- `Sync now` per connection
- `Sync all now`
- last successful sync time, next scheduled sync, connection health

## Linkage Semantics (simplified)

- Remove prior `linkageStatus` design (`auto_linked | suggested | confirmed | unlinked`) to avoid overlap.
- Use:
  - `inboxStatus=pending_review` while awaiting user action
  - `inboxStatus=reviewed` once user saves decision
- Final linkage fields:
  - `tradePlanId` (optional)
  - `campaignId` (optional, direct campaign linkage when no trade plan is selected)

Recommended v1 validation rule:
- If `tradePlanId` is set, treat campaign as derived from that plan in UI/analytics.
- Allow direct `campaignId` only when `tradePlanId` is unset.

## Reliability and Security

- Idempotent ingestion boundary on external execution identity.
- Exponential backoff + jitter for transient provider failures.
- Connection state machine for user-facing recovery (`needs_reauth` etc.).

Credential storage in Convex (v1 decision):
- Use Convex native encryption at rest and strict function-level access control as the default.
- Do not add separate app-layer token encryption in v1.
- Keep broker credentials/tokens minimal and scoped to read-only access where possible.
- Revisit app-layer encryption when moving from early development to production hardening.

## Testing Strategy

1. Unit tests
- normalization, dedupe, inbox suggestion rules
- IBKR connector throttling/session-state transitions

2. Integration tests
- 15-minute poll simulation + manual sync overlap handling
- reauth-required flow
- maintenance/retry/circuit-breaker behavior

3. End-to-end tests
- connect account (mock), sync, inbox review, analytics update

## Rollout Plan

Note: this project is early-stage and does not require preserving existing trade rows. If schema enforcement blocks a breaking schema change, delete existing development data and proceed.

1. Phase 1: schema + shared connector interface + IBKR/Kraken adapters + manual sync.
2. Phase 2: scheduled 15-minute sync + inbox UI + suggestion prefill.
3. Phase 3: IBKR historical backfill import path (Flex/statement ingestion) + hardened observability.
