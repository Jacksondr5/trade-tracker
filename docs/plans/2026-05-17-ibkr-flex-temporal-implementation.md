# IBKR Flex Temporal Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build automated IBKR Flex Web Service ingestion orchestrated by Temporal, with Convex as the durable product database for sync runs, staged trades, snapshots, reconciliation, and valuation freshness.

**Architecture:** Temporal owns the external workflow: scheduled sync start, IBKR `/SendRequest`, durable waiting, `/GetStatement`, retry, parsing, and calls into Convex. Convex owns all user-facing state: connection metadata, sync runs, raw report references, imported inbox trades, brokerage snapshots, reconciliation issues, and portfolio freshness. Worker activities perform all side effects; Temporal workflow code only orchestrates deterministic steps.

**Tech Stack:** TypeScript, Temporal TypeScript SDK, Convex, Next.js App Router, Vitest, fast-xml-parser, IBKR Flex Web Service.

---

## Design References

- Evergreen design: `docs/product/brokerage-ingestion.md`
- Portfolio analytics rules: `docs/product/portfolio-analytics.md`
- Operational worker architecture: `docs/product/technical-architecture-overview.md`
- Research note: `docs/plans/2026-05-17-ibkr-sync-research.md`
- Detailed workflow model: `docs/plans/2026-05-17-temporal-portfolio-pipeline-workflow-model.md`
- Convex rules: `convex/_generated/ai/guidelines.md`

## Implementation Notes

- Do not store the IBKR Flex token in normal user-facing Convex documents.
- Use a service-to-Convex HTTP boundary for Temporal worker writes. Protect it with `Authorization: Bearer ${BROKERAGE_INGESTION_TOKEN}`.
- Temporal workflow IDs should be stable: `ibkr-flex:${connectionId}:${reportType}:${reportDate}`.
- Convex must dedupe independently of Temporal. Every HTTP action and mutation must be safe if the worker retries it.
- Store full raw XML in Convex storage; store only the storage ID/reference and content hash in tables. Do not store raw XML in ordinary queryable documents unless real report sizes or Convex storage limitations force a revision.
- The first version should support one IBKR connection per user, but the schema and workflow IDs should not prevent multiple connections later.
- The first reconciliation version should compare open position quantities. Cash reconciliation follows after position sync is proven.
- The daily Activity Flex schedule should start at 1:00 a.m. Eastern Time for the prior business day.
- Do not rely on `getEasternDateString(Date.now())` after midnight for this flow. Pass the explicit prior-business-day `reportDate` through brokerage sync, market data refresh, reconciliation, and valuation.
- Deployment should follow the existing self-hosted homelab Temporal service pattern used by `pr-review-orchestrator`: dedicated namespace, dedicated task queue, env-file based secrets, and a long-running worker container that reaches Convex over the service HTTP boundary.
- Treat removal or shrinking of the existing Convex market-data cron/worker path as a multi-PR migration. The first PRs may run Temporal alongside existing Convex functions; a later migration PR should move traffic to Temporal, disable old crons, and explicitly tell the user/operator which migration/deployment steps to run.

## Multi-PR Migration Strategy

This effort should not land as one giant PR.

Recommended PR sequence:

1. Documentation and Linear planning.
2. Parser, fixtures, and pure normalization contracts.
3. Convex schema and internal ingestion/status APIs, with no production worker traffic.
4. Temporal worker skeleton and daily pipeline in dry-run or manually triggered mode.
5. Market-data orchestration migration into Temporal while preserving existing Convex actions as the data-writing implementation.
6. Valuation freshness, reconciliation, and UI/status surfaces.
7. Cron migration PR: disable or shrink `convex/crons.ts` market-data scheduling after the Temporal path is deployed and verified.

Any PR that changes schema or operational scheduling must call out required
operator steps in the PR body. In particular, the migration PR that disables old
Convex scheduling must flag that the Temporal worker and schedule must already
be deployed and healthy.

### Task 1: Add Dependencies And Worker Scripts

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `tsconfig.json`

**Step 1: Add runtime dependencies**

Run:

```bash
pnpm add @temporalio/client @temporalio/worker @temporalio/workflow fast-xml-parser
pnpm add -D tsx
```

Expected: `package.json` and `pnpm-lock.yaml` include the new packages.

**Step 2: Add worker scripts**

Add these scripts to `package.json`:

```json
{
  "worker:ibkr": "tsx workers/ibkr-flex/worker.ts",
  "temporal:ibkr:schedule": "tsx workers/ibkr-flex/schedule.ts"
}
```

**Step 3: Add environment placeholders**

Add to `.env.example`:

```bash
TEMPORAL_ADDRESS=
TEMPORAL_NAMESPACE=trade-tracker
TEMPORAL_TASK_QUEUE=trade-tracker-portfolio-pipeline
IBKR_FLEX_TOKEN=
BROKERAGE_INGESTION_TOKEN=
BROKERAGE_INGESTION_BASE_URL=
```

`BROKERAGE_INGESTION_BASE_URL` should point to the Convex HTTP deployment base URL for the environment the worker writes to.

**Step 4: Confirm TypeScript includes worker files**

If `workers/**/*.ts` is not covered by `tsconfig.json`, add it to `include`.

**Step 5: Run validation**

Run:

```bash
pnpm typecheck
```

Expected: typecheck still passes before worker files are added.

**Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example tsconfig.json
git commit -m "chore: add ibkr temporal worker dependencies"
```

### Task 2: Add IBKR Flex Parser And Fixtures

**Files:**
- Create: `shared/brokerage/ibkr-flex/types.ts`
- Create: `shared/brokerage/ibkr-flex/parser.ts`
- Create: `shared/brokerage/ibkr-flex/parser.test.ts`
- Create: `shared/brokerage/ibkr-flex/fixtures/activity-sample.xml`
- Modify: `shared/imports/types.ts` if new shared result types need to reference `InboxTradeCandidate`

**Step 1: Create parser types**

Define types for:

```ts
export type IbkrFlexTrade = {
  assetType: "stock";
  brokerageAccountId: string;
  currency?: string;
  date: number;
  direction?: "long" | "short";
  executionId?: string;
  externalId: string;
  fees?: number;
  orderType?: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  taxes?: number;
  ticker: string;
};

export type IbkrFlexPositionSnapshot = {
  assetType: "stock";
  brokerageAccountId: string;
  currency?: string;
  marketValue?: number;
  quantity: number;
  reportDate: string;
  ticker: string;
};

export type IbkrFlexCashSnapshot = {
  brokerageAccountId: string;
  cash: number;
  currency: string;
  reportDate: string;
};

export type IbkrFlexParseResult = {
  cashSnapshots: IbkrFlexCashSnapshot[];
  errors: string[];
  positionSnapshots: IbkrFlexPositionSnapshot[];
  trades: IbkrFlexTrade[];
  warnings: string[];
};
```

**Step 2: Write failing parser tests**

Test that a sanitized Activity Flex XML fixture:

- parses one trade into a normalized IBKR trade
- uses the broker-native execution ID as `externalId`
- parses open positions
- parses cash snapshots when present
- reports a warning when a required optional section is missing

Run:

```bash
pnpm test shared/brokerage/ibkr-flex/parser.test.ts
```

Expected: FAIL because the parser does not exist yet.

**Step 3: Implement parser**

Use `fast-xml-parser`. Keep parser output pure and independent from Convex.

Rules:

- Normalize tickers to uppercase.
- Preserve IBKR execution IDs as `externalId`.
- Use fallback composite IDs only when no execution ID exists.
- Infer `side` from IBKR buy/sell fields.
- Infer direction conservatively. If the report does not provide enough detail, leave the trade with a validation warning so review can fix it.
- Do not throw for row-level parse failures; collect row errors.

**Step 4: Run parser tests**

Run:

```bash
pnpm test shared/brokerage/ibkr-flex/parser.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add shared/brokerage/ibkr-flex shared/imports/types.ts
git commit -m "feat: parse ibkr flex activity reports"
```

### Task 3: Add Convex Brokerage Ingestion Schema

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/brokerageIngestion.test.ts`

**Step 1: Write schema-focused tests**

Add tests that create:

- one `brokerageConnections` row
- one `brokerageSyncRuns` row
- one raw report reference
- one position snapshot
- one reconciliation issue

Run:

```bash
pnpm test convex/brokerageIngestion.test.ts
```

Expected: FAIL because functions and tables do not exist.

**Step 2: Add validators**

Add schema validators for:

```ts
brokerageSource: "ibkr"
brokerageConnectionStatus: "active" | "paused" | "needs_setup" | "error"
brokerageSyncReportType: "activity" | "trade_confirmation"
brokerageSyncRunStatus:
  | "queued"
  | "requesting"
  | "waiting_for_statement"
  | "processing"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
brokerageReconciliationIssueStatus: "open" | "resolved" | "dismissed"
brokerageValuationFreshnessStatus:
  | "current"
  | "pending_review"
  | "stale"
  | "mismatched"
  | "unmanaged"
```

**Step 3: Add tables**

Add:

- `brokerageConnections`
- `brokerageSyncRuns`
- `brokerageRawReports`
- `brokeragePositionSnapshots`
- `brokerageCashSnapshots`
- `brokerageReconciliationIssues`

Indexes should support:

- connections by owner/source/status
- sync runs by connection/report date/report type
- latest sync runs by owner
- snapshots by sync run
- snapshots by owner/account/symbol/report date
- open reconciliation issues by owner/status

**Step 4: Run schema tests**

Run:

```bash
pnpm test convex/brokerageIngestion.test.ts
```

Expected: tests may still fail because functions do not exist, but schema generation errors should be resolved.

**Step 5: Commit**

```bash
git add convex/schema.ts convex/brokerageIngestion.test.ts
git commit -m "feat: add brokerage ingestion schema"
```

### Task 4: Add Convex Ingestion Mutations And Queries

**Files:**
- Create: `convex/brokerageIngestion.ts`
- Modify: `convex/brokerageIngestion.test.ts`
- Modify: `convex/imports.ts` if shared internal import staging needs extraction

**Step 1: Write failing mutation tests**

Cover:

- authenticated user can create/update an IBKR connection metadata row
- service ingestion can start or reuse a sync run idempotently
- service ingestion can store request reference code
- service ingestion can store raw report metadata
- service ingestion can stage parsed trades into `inboxTrades`
- repeated ingestion of the same report does not duplicate inbox trades
- service ingestion can write position snapshots
- query returns latest connection/sync/reconciliation status for the user

Run:

```bash
pnpm test convex/brokerageIngestion.test.ts
```

Expected: FAIL because functions are missing.

**Step 2: Implement user-facing connection functions**

Add authenticated Convex functions:

- `upsertIbkrConnection`
- `pauseBrokerageConnection`
- `getBrokerageIngestionStatus`

These must use `requireUser(ctx)` and must not accept an arbitrary owner id from the client.

**Step 3: Implement internal service mutations**

Add internal mutations:

- `beginSyncRunForConnection`
- `markSyncRunRequested`
- `markSyncRunWaiting`
- `storeRawReportReference`
- `ingestParsedFlexReport`
- `markSyncRunSucceeded`
- `markSyncRunFailed`

These may operate by `connectionId` and `syncRunId`. They should derive `ownerId` from stored Convex records.

**Step 4: Reuse existing import review path**

When staging trades from Flex, reuse the existing `inboxTrades` shape and dedupe semantics:

- `source: "ibkr"`
- `externalId` from IBKR execution ID
- `brokerageAccountId` from Flex
- validation warnings preserved

If `imports.importTrades` cannot be reused directly because it requires authenticated user context, extract a shared internal helper inside `convex/imports.ts` rather than duplicating import validation and dedupe logic.

**Step 5: Run tests**

Run:

```bash
pnpm test convex/brokerageIngestion.test.ts convex/imports.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add convex/brokerageIngestion.ts convex/brokerageIngestion.test.ts convex/imports.ts
git commit -m "feat: ingest brokerage flex reports into convex"
```

### Task 5: Add Authenticated Convex HTTP Boundary

**Files:**
- Create: `convex/http.ts`
- Modify: `convex/brokerageIngestion.test.ts`

**Step 1: Add HTTP action routes**

Create a Convex HTTP router with internal service routes:

- `POST /internal/brokerage-ingestion/due-connections`
- `POST /internal/brokerage-ingestion/begin-sync-run`
- `POST /internal/brokerage-ingestion/mark-requested`
- `POST /internal/brokerage-ingestion/mark-waiting`
- `POST /internal/brokerage-ingestion/ingest-flex-report`
- `POST /internal/brokerage-ingestion/mark-failed`

Each route must:

- require `Authorization: Bearer ${BROKERAGE_INGESTION_TOKEN}`
- reject missing or invalid tokens with 401
- validate JSON body with explicit checks before calling internal mutations
- return compact JSON

**Step 2: Store raw report content**

For `ingest-flex-report`, accept raw XML plus parsed normalized data or raw XML only.

Preferred first implementation:

1. HTTP action receives raw XML and parser result from the worker.
2. HTTP action stores the raw XML in Convex storage.
3. HTTP action computes or receives a content hash.
4. HTTP action calls `internal.brokerageIngestion.ingestParsedFlexReport`.

If body size becomes an issue during real testing, switch to worker-owned blob storage and pass a private storage reference instead.

**Step 3: Test service auth**

Add tests or focused manual checks that:

- invalid token returns 401
- valid token can call a route
- repeated `begin-sync-run` returns the existing run for the same key

**Step 4: Run validation**

Run:

```bash
pnpm typecheck
pnpm test convex/brokerageIngestion.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add convex/http.ts convex/brokerageIngestion.test.ts
git commit -m "feat: add brokerage ingestion service api"
```

### Task 6: Build Temporal IBKR Flex Worker

**Files:**
- Create: `workers/ibkr-flex/types.ts`
- Create: `workers/ibkr-flex/activities.ts`
- Create: `workers/ibkr-flex/workflows.ts`
- Create: `workers/ibkr-flex/worker.ts`
- Create: `workers/ibkr-flex/schedule.ts`
- Create: `workers/ibkr-flex/workflows.test.ts`
- Modify: `package.json`

**Step 1: Write workflow tests with mocked activities**

Test:

- workflow starts a Convex sync run
- workflow calls SendRequest once
- workflow sleeps/retries when GetStatement reports not ready
- workflow ingests once when XML is ready
- terminal auth errors mark the run failed
- retryable network errors are retried by activity retry policy

Run:

```bash
pnpm test workers/ibkr-flex/workflows.test.ts
```

Expected: FAIL because worker files do not exist.

**Step 2: Implement activities**

Activities:

- `listDueConnections`
- `beginSyncRun`
- `sendFlexRequest`
- `markRequested`
- `getFlexStatement`
- `markWaiting`
- `parseFlexStatement`
- `ingestFlexReport`
- `markFailed`

All HTTP calls to IBKR and Convex happen in activities.

Classify failures:

- retryable: network errors, 429, 5xx, report not ready
- terminal: invalid token, invalid query ID, malformed report, missing required report sections

**Step 3: Implement workflow**

Workflow:

- receives `{ connectionId, reportType, reportDate }`
- uses stable activity retry policies
- stores IBKR reference code after `/SendRequest`
- loops with durable timers until statement ready or cutoff
- calls ingest activity once per retrieved report
- never logs raw XML or tokens

**Step 4: Implement worker entrypoint**

`worker.ts` should:

- read `TEMPORAL_ADDRESS`
- read `TEMPORAL_NAMESPACE`
- read `TEMPORAL_TASK_QUEUE`, defaulting to `trade-tracker-portfolio-pipeline`
- register workflows and activities
- fail fast if required env vars are missing

**Step 5: Implement schedule helper**

`schedule.ts` should create/update a Temporal schedule for the daily IBKR sync dispatcher at 1:00 a.m. Eastern Time.

The dispatcher should compute the prior market/business date in `America/New_York`, call `listDueConnections`, and start one child workflow per connection/report date. For the MVP, the schedule helper may start one workflow per known connection if that is simpler.

Use a timezone-aware Temporal schedule if available. If the SDK setup cannot express `America/New_York` directly, document the UTC conversion strategy and avoid a fixed UTC hour that drifts across daylight saving time without an explicit decision.

**Step 6: Run tests**

Run:

```bash
pnpm test workers/ibkr-flex/workflows.test.ts shared/brokerage/ibkr-flex/parser.test.ts
pnpm typecheck
```

Expected: PASS.

**Step 7: Commit**

```bash
git add workers/ibkr-flex package.json
git commit -m "feat: orchestrate ibkr flex sync with temporal"
```

### Task 7: Add Reconciliation

**Files:**
- Modify: `convex/brokerageIngestion.ts`
- Modify: `convex/brokerageIngestion.test.ts`
- Modify: `convex/positions.ts` only if a shared position aggregation helper is needed

**Step 1: Write reconciliation tests**

Cover:

- matching brokerage and local open position quantities produce no open issue
- missing local position creates an open issue
- local quantity mismatch creates an open issue
- repeated sync replaces or resolves stale issues for the same key
- pending inbox trades make freshness `pending_review`

Run:

```bash
pnpm test convex/brokerageIngestion.test.ts
```

Expected: FAIL.

**Step 2: Implement local position aggregation**

Create a helper that aggregates accepted local trades by:

- owner
- brokerage account
- asset type
- ticker
- direction when needed by the existing position model

Keep this helper pure if practical.

**Step 3: Implement reconciliation mutation**

After position snapshots are written for a sync run:

- compare local positions to brokerage snapshots
- write open issues for mismatches
- resolve issues no longer present
- record summary counts on the sync run

**Step 4: Run tests**

Run:

```bash
pnpm test convex/brokerageIngestion.test.ts convex/imports.test.ts convex/portfolioAnalytics.test.ts
pnpm typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add convex/brokerageIngestion.ts convex/brokerageIngestion.test.ts convex/positions.ts
git commit -m "feat: reconcile brokerage positions"
```

### Task 8: Add Valuation Freshness Status

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/portfolioAnalytics.ts`
- Modify: `convex/portfolioAnalytics.test.ts`
- Modify: `docs/product/portfolio-analytics.md` only if the implementation reveals a needed doc correction

**Step 1: Write valuation freshness tests**

Cover:

- no configured brokerage connection yields `unmanaged`
- latest expected sync missing yields `stale`
- open reconciliation issue yields `mismatched`
- pending IBKR inbox trades yields `pending_review`
- successful sync with no issues yields `current`

Run:

```bash
pnpm test convex/portfolioAnalytics.test.ts
```

Expected: FAIL.

**Step 2: Add freshness field or joined status**

Prefer storing freshness on valuation rows only if it is needed for historical audit. Otherwise compute freshness in the portfolio detail query from brokerage sync tables.

If storing on valuation rows, add:

```ts
brokerageFreshnessStatus: brokerageValuationFreshnessStatusValidator
brokerageSyncRunId?: v.id("brokerageSyncRuns")
```

**Step 3: Integrate freshness into valuation compute/read path**

Portfolio valuation math remains based on trades, cash ledger, and prices. Freshness is an operational status layered onto the result.

For brokerage-managed portfolios, compute or refresh valuation for the explicit `reportDate` after the 1:00 a.m. Eastern IBKR sync and reconciliation path completes. If `refreshDailyPriceSnapshots` is reused after midnight, pass `date: reportDate`; do not allow it to default to the current Eastern calendar date.

**Step 4: Run tests**

Run:

```bash
pnpm test convex/portfolioAnalytics.test.ts convex/brokerageIngestion.test.ts
pnpm typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add convex/schema.ts convex/portfolioAnalytics.ts convex/portfolioAnalytics.test.ts docs/product/portfolio-analytics.md
git commit -m "feat: track brokerage freshness for valuations"
```

### Task 9: Add Compact UI For Sync Status

**Files:**
- Modify: `src/app/(app)/imports/ImportsPageClient.tsx`
- Modify: `src/app/(app)/portfolios/[id]/PortfolioDetailPageClient.tsx`
- Modify: `src/app/(app)/market-data/health/MarketDataHealthPageClient.tsx` if operational controls fit better there
- Modify: route page files as needed to preload new Convex queries
- Modify: Playwright test id constants if this repo has route-local constants
- Test: `tests/e2e/smoke/portfolios.spec.ts` or a new focused smoke spec

**Step 1: Add Convex status query to imports or health page**

Show:

- connection status
- latest successful sync
- latest failed sync
- pending imported trades count
- open reconciliation issues count

Keep this compact. This is operational status, not a full settings product.

**Step 2: Add valuation freshness display**

On portfolio detail, display freshness status near valuation/analytics status.

Use copy aligned with:

- `current`: synced and reconciled
- `pending_review`: imported trades need review
- `stale`: latest brokerage sync is missing
- `mismatched`: brokerage positions do not match accepted trades
- `unmanaged`: no automated brokerage sync configured

**Step 3: Add stable test ids**

Use exact `getByTestId()` selectors in any Playwright coverage.

Examples:

- `brokerage-sync-status`
- `brokerage-sync-latest-success`
- `brokerage-reconciliation-issues`
- `portfolio-brokerage-freshness`

**Step 4: Run checks**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: PASS.

If UI changes are substantial, start the app and run the relevant Playwright smoke test after bootstrapping the worktree per `AGENTS.md`.

**Step 5: Commit**

```bash
git add src tests convex
git commit -m "feat: surface brokerage sync freshness"
```

### Task 10: Run End-To-End Manual IBKR Flex Proof

**Files:**
- Modify: `docs/plans/2026-05-17-ibkr-sync-research.md` only if real IBKR fields contradict the research assumptions
- Add sanitized fixture updates under `shared/brokerage/ibkr-flex/fixtures/`

**Step 1: Configure IBKR Flex**

In IBKR Client Portal:

- create Activity Flex Query
- include trades, open positions, cash, deposits/withdrawals where available
- capture query ID
- create a short-lived token for testing

**Step 2: Configure local env**

Set:

```bash
TEMPORAL_ADDRESS=
TEMPORAL_NAMESPACE=default
IBKR_FLEX_TOKEN=
BROKERAGE_INGESTION_TOKEN=
BROKERAGE_INGESTION_BASE_URL=
```

**Step 3: Start worker**

Run:

```bash
pnpm worker:ibkr
```

Expected: worker connects to Temporal and polls the `trade-tracker-portfolio-pipeline` task queue.

**Step 4: Start one test workflow**

Use `schedule.ts` or a one-off Temporal CLI command to start a workflow for a known prior business date.

Expected:

- Temporal workflow completes
- Convex sync run is marked `succeeded`
- raw report reference is stored
- new trades appear in import review
- position snapshots are written
- reconciliation issues are visible if local data differs

**Step 5: Sanitize and save fixture**

Sanitize the real XML and replace/add fixture coverage for any fields that differ from the synthetic fixture.

**Step 6: Run full validation**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: PASS.

**Step 7: Commit**

```bash
git add .
git commit -m "test: verify ibkr flex sync against sanitized fixture"
```

## Rollout Checklist

- IBKR token has an expiration date recorded outside the raw secret.
- Temporal worker has logs and alerts for terminal failures.
- Convex status page shows stale/mismatched states.
- Portfolio valuation UI does not present stale brokerage data as clean.
- Raw XML is not committed and is not exposed in client queries.
- The import inbox remains the review gate before synced trades become accepted trades.
- Email and FTP delivery remain deferred.
- Old Convex market-data crons are not disabled until the Temporal worker,
  schedule, and equivalent pipeline path are deployed and verified.
