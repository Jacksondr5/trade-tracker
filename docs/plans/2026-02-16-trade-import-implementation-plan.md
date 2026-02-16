# Trade Import Implementation Plan (AI Sub-Agent Execution)

Date: 2026-02-16
Primary inputs:
- `docs/plans/2026-02-16-trade-import-architecture-design.md`
- `docs/plans/2026-02-16-brokerage-capabilities-findings.md`

Scope: implement v1 brokerage import pipeline (IBKR + Kraken) with inbox-first review flow, periodic/manual sync, and resilient connector behavior.

## 1) Execution Model

This plan is organized for parallel AI sub-agents with clear handoffs and merge order.

- Keep PRs/work units small and mergeable.
- Prefer schema and backend contracts before UI integration.
- Treat IBKR session/pacing behavior as a first-class reliability track, not an afterthought.
- Do not auto-link imported trades; always require inbox review before final linkage.

## 2) Workstreams (Parallelizable)

### WS-A: Data Model + Schema Foundation

Goal: add all required storage primitives and trade shape changes.

Target files:
- `convex/schema.ts`
- `convex/trades.ts`
- `convex/_generated/*` (regenerated)

Deliverables:
1. Add new tables:
- `brokerageConnections`
- `importJobs`
- `externalExecutions`
- `importCursorState`
2. Add explicit ownership to all new import-domain tables:
- `userId` (or equivalent auth subject id) required and indexed for query filtering.
3. Extend `trades` table with import/linkage fields from architecture doc:
- `source`, `externalExecutionId`, `externalOrderId`, `brokerAccountRef`, `importJobId`
- `campaignId`, `inboxStatus`, `suggestedTradePlanId`, `suggestionReason`
4. Add optional `userId` on `trades` for new writes in this feature (imported trades and new manual trades), without blocking this feature on a full legacy backfill.
5. Add required indexes and uniqueness constraints from design.
6. Update trade validators/mutations/queries so imported and manual trades both validate.

Acceptance criteria:
- `npx convex dev --once` succeeds.
- Existing manual-trade flows continue to function.
- New schema supports idempotent execution upsert keys.
- New import-domain records are user-owned and queryable by owner.

Dependencies: none.

---

### WS-B: Import Domain Contracts + Shared Connector Interface

Goal: establish stable internal API for connectors and ingestion pipeline.

Target files:
- `src/lib/imports/types.ts` (new)
- `src/lib/imports/connectors/base.ts` (new)
- `src/lib/imports/normalization.ts` (new)
- `src/lib/imports/dedupe.ts` (new)

Deliverables:
1. Canonical execution types for normalized fills.
2. Connector contract:
- `sync(connection, mode, cursorState) => { executions, nextCursor, diagnostics }`
3. Symbol normalization helpers used by suggestion + dedupe.
4. Idempotency helpers:
- native external id key
- ingestion hash fallback key

Acceptance criteria:
- Type-safe connector contract consumed by both IBKR and Kraken adapters.
- Reprocessing identical payloads yields stable dedupe keys.

Dependencies: WS-A (types tied to schema enums/fields).

---

### WS-C: IBKR Connector (Complex Path)

Goal: production-safe IBKR polling behavior for scheduled and manual sync.

Target files:
- `src/lib/imports/connectors/ibkr.ts` (new)
- `src/lib/imports/connectors/http-client.ts` (new)
- `src/lib/imports/connectors/rate-limit.ts` (new)

Deliverables:
1. Session preflight and auth-state handling.
2. Keepalive/tickle around polling windows.
3. Pacing enforcement equivalent to 1 request / 5 sec endpoint behavior.
4. Retry/backoff + jitter for transient failures/429s.
5. Single-flight locking per connection to prevent overlapping sync races.
6. Health diagnostics surfaced as:
- `degraded`
- `maintenance_window`
- `needs_reauth`

Acceptance criteria:
- Expired session path marks connection as `needs_reauth` and job as `blocked_reauth`.
- Overlapping manual + scheduled triggers do not run concurrent fetches for same connection.
- 429/retry behavior bounded and observable.

Dependencies: WS-B.

---

### WS-D: Kraken Connector

Goal: reliable paginated trade history retrieval with cursor progression.

Target files:
- `src/lib/imports/connectors/kraken.ts` (new)

Deliverables:
1. `TradesHistory` pagination loop until watermark boundary.
2. Private REST authentication plumbing.
3. Rate-limit aware retry logic.
4. Cursor update semantics aligned with ingestion durability.

Acceptance criteria:
- Multi-page history import works idempotently.
- Cursor only advances after successful durable write phase.

Dependencies: WS-B.

---

### WS-E: Ingestion Orchestrator + Convex Import Functions

Goal: create end-to-end import pipeline (trigger -> fetch -> normalize -> dedupe -> trade materialize -> finalize).

Target files:
- `convex/imports.ts` (new)
- `convex/trades.ts`
- `src/lib/imports/ingestion.ts` (new)
- `src/lib/imports/suggestion.ts` (new)

Deliverables:
1. Convex actions/mutations/queries:
- `syncNow` (per connection + all)
- internal sync executor for scheduled/manual mode
- inbox listing query (`pending_review`)
- import errors query
- review mutation to set linkage + mark reviewed
2. Import job lifecycle management (`running` -> terminal state with stats).
3. External execution upsert/idempotent materialization into `trades`.
4. Suggestion engine (single candidate only):
- symbol match
- side-direction consistency
- `campaignId` remains user-driven unless derived by selected trade plan.
5. Linkage validation rule:
- if `tradePlanId` set, campaign is derived
- direct `campaignId` allowed only when no `tradePlanId`

Acceptance criteria:
- Every imported trade lands in inbox as `pending_review`.
- Re-running same window does not create duplicates.
- Review mutation flips inbox row to `reviewed` and applies linkage rules.

Dependencies: WS-A, WS-B, WS-C, WS-D.

---

### WS-F: Scheduler + Operational Reliability

Goal: enable periodic sync and operational observability.

Target files:
- `convex/crons.ts` (new)
- `convex/imports.ts`

Deliverables:
1. 15-minute default cron over active connections.
2. Guardrails against overlapping runs.
3. Circuit-breaker behavior after repeated failures.
4. Clear import error recording for auth/pacing/maintenance/partial import.

Acceptance criteria:
- Scheduled sync executes without duplicating same connection in parallel.
- Failure states are queryable by UI and actionable.

Dependencies: WS-E.

---

### WS-G: Import Inbox UI + Controls

Goal: ship user-facing import review and sync controls.

Target files:
- `src/app/imports/page.tsx` (new)
- `src/components/imports/import-inbox-table.tsx` (new)
- `src/components/imports/import-sync-controls.tsx` (new)
- `src/components/imports/import-errors-panel.tsx` (new)
- `src/components/Header.tsx`

Deliverables:
1. Import Inbox page with required row fields:
- provider/account/symbol/side/qty/price/time
- suggested trade plan
- editable trade plan selector
- editable campaign selector
2. Row save action and bulk apply trade-plan action.
3. Filters: provider/account/symbol/date/pending.
4. Sync controls:
- sync now per connection
- sync all now
- last successful sync, next scheduled sync, connection health
5. Import Errors panel for actionable failures.
6. Navigation entry for `/imports`.

Acceptance criteria:
- Users can review/confirm/change/clear linkage for each imported trade.
- No auto-linking side effects on arrival.
- Manual sync controls reflect running/blocked/error states.

Dependencies: WS-E, WS-F.

---

### WS-H: Analytics/Position Compatibility + Regression Hardening

Goal: preserve current analytics semantics while introducing campaign direct linkage.

Target files:
- `convex/analytics.ts`
- `convex/positions.ts`
- optionally `convex/lib/plCalculation.ts` if needed

Deliverables:
1. Ensure imported trades participate in existing P/L and positions calculations correctly.
2. Decide and implement campaign aggregation precedence:
- use tradePlan-derived campaign when tradePlan exists
- include direct `campaignId` when no tradePlan
3. Confirm no regression for manual trades.

Acceptance criteria:
- Dashboard and positions queries remain correct after mixed manual/imported data.
- Campaign stats do not double count when both fields exist.

Dependencies: WS-A, WS-E.

---

### WS-I: IBKR Historical Backfill Path (Release 1 Scope)

Goal: support initial history import beyond CP API 7-day limit.

Target files:
- `convex/importBackfill.ts` (new) or `convex/imports.ts`
- `src/app/imports/backfill/page.tsx` (optional new)
- `src/lib/imports/backfill/ibkr-flex.ts` (new)

Deliverables:
1. Flex/statement import flow for IBKR historical fills.
2. Parse -> normalize -> dedupe -> materialize through same ingestion boundary.
3. Clear operator UX/status for backfill job progress/errors.

Acceptance criteria:
- Backfill imports older-than-7-day fills without breaking incremental polling model.

Dependencies: WS-E (must reuse same ingestion core).

## 3) Recommended Merge Sequence

1. WS-A (schema)
2. WS-B (contracts)
3. WS-C + WS-D (connectors in parallel)
4. WS-E (orchestrator)
5. WS-F + WS-G + WS-H (parallel once WS-E merged)
6. WS-I (required before first release sign-off)

## 4) Task Breakdown for Sub-Agents

Assign one owner per workstream and enforce API-first handshakes:

- Agent 1: WS-A
- Agent 2: WS-B
- Agent 3: WS-C
- Agent 4: WS-D
- Agent 5: WS-E
- Agent 6: WS-F
- Agent 7: WS-G
- Agent 8: WS-H
- Agent 9: WS-I

Required handoff contracts:
1. WS-A publishes final schema fields/index names before WS-E starts.
2. WS-B publishes connector interface before WS-C/WS-D start coding.
3. WS-E publishes stable Convex query/mutation names before WS-G integration.

## 5) Definition of Done (Per PR)

Every workstream PR must include:
- Scope-limited code changes only.
- Typecheck and lint clean:
  - `pnpm typecheck`
  - `pnpm lint`
- Convex codegen/schema validity when backend changes:
  - `npx convex dev --once`
- Minimal test coverage for logic added (unit/integration where feasible).
- Short operator notes in PR description (env vars, mock data, known limits).

## 6) Quality Gates

Gate 1 (Backend foundation):
- WS-A/B/C/D merged.
- Can run manual sync against mocked connectors and persist idempotently.

Gate 2 (User workflow):
- WS-E/F/G merged.
- User can sync, review inbox, apply linkage, and see import errors.

Gate 3 (Regression + hardening):
- WS-H merged.
- Dashboard/positions unaffected by imported trade source mix.

Gate 4 (Release 1 historical completeness):
- WS-I merged.
- IBKR deep history available through backfill path.

## 7) Risks and Mitigations

1. IBKR session volatility causes noisy failures.
- Mitigation: preflight auth checks, blocked_reauth status, explicit reconnect UX.

2. Duplicate imports from overlapping jobs.
- Mitigation: per-connection single-flight lock + external execution uniqueness + hash fallback.

3. Cursor corruption on partial failures.
- Mitigation: advance cursor only after durable writes and successful job finalization.

4. Analytics regressions from new linkage fields.
- Mitigation: explicit precedence rules and focused regression tests.

5. Test infrastructure currently minimal (`pnpm test` placeholder).
- Mitigation: add focused test harness in first backend logic PR touching import utilities.

## 8) Decisions Locked + Remaining Notes

Confirmed decisions:
1. If `tradePlanId` is set, persist `campaignId = null` (strict rule).
2. Broker sync execution should run in Convex (cron + actions). Avoid Next.js proxy endpoints unless a provider callback flow requires them.
3. Keep manual `createTrade` available as a backup path in v1.
4. IBKR historical backfill is required in first release.
5. Leave unrelated working tree changes untouched.

Ownership decision for this feature:
1. Implement explicit `userId` ownership for new import-domain tables now.
2. Add optional `userId` to `trades` for new writes in this feature.
3. Defer full legacy ownership retrofit/migration of all existing domain tables to the separate architecture refactor.

Credential model note:
1. Per-user broker credentials/tokens belong in `brokerageConnections.auth` (encrypted at rest).
2. App-level secrets are still useful for operational concerns only, e.g. optional import callback signing secret, feature flags, and non-secret provider base URLs.
3. No global IBKR/Kraken trading credentials are required if each user connects their own account.
