# Temporal Portfolio Pipeline Workflow Model

Date: 2026-05-17

## Purpose

This document defines the detailed Temporal workflow model for automated
brokerage sync, market data refresh, portfolio valuation, recalculation, and
historical backfills.

It is intentionally implementation-oriented, but it is not code. It should give
the implementation agent enough detail to build the worker, activities, Convex
service boundary, and tests without rediscovering the workflow shape.

## Core Principle

Temporal owns orchestration. Convex owns product state.

Temporal workflows should decide what happens next, wait durably, retry
transient failures, fan out work, and coordinate dependencies. Temporal
activities should perform all side effects. Convex should store all canonical
user-facing state: trades, inbox trades, market price snapshots, brokerage sync
runs, reconciliation issues, valuation rows, and pipeline status.

Do not put raw XML, large market data payloads, or full parsed report arrays in
Temporal workflow history. Store raw IBKR Flex XML in Convex storage and pass
stable references plus hashes through workflow results. Daily reports are
expected to be small, but storing them in Convex storage instead of ordinary
queryable documents keeps raw financial records behind an internal access
boundary.

## Key Concepts

### Pipeline Date

A pipeline date is the market/business date being processed.

For the daily workflow that starts at 1:00 a.m. Eastern Time, the pipeline date
is the prior business day, not the current Eastern date.

Every workflow and activity should receive the explicit date it is processing.
Do not infer the pipeline date from `Date.now()` inside side-effecting code.

### Pipeline Modes

Use one shared date-level workflow with a mode:

```ts
type PipelineMode = "daily" | "backfill" | "recompute";
```

Meanings:

- `daily`: normal overnight processing for the prior business day
- `backfill`: processing dates that may not have complete historical data
- `recompute`: recalculating derived state from already-ingested source data

### Deployment Assumptions

The worker is expected to run in the user's existing self-hosted Temporal
homelab pattern, similar to the existing `pr-review-orchestrator` service:

- Temporal address: `temporal:7233` from inside the compose network
- dedicated namespace: `trade-tracker`
- dedicated task queue: `trade-tracker-portfolio-pipeline`
- worker configured through env-file style secrets
- Convex service access through `BROKERAGE_INGESTION_BASE_URL` and
  `BROKERAGE_INGESTION_TOKEN`

The worker process can be restarted without losing work. Temporal retains
workflow progress and Convex retains all product-visible status and data.

### Phase Selection

Backfills and recomputes should be configurable by phase.

```ts
type PipelinePhaseSelection = {
  syncBrokerage: boolean;
  refreshMarketData: boolean;
  reconcile: boolean;
  computeValuations: boolean;
};
```

Common configurations:

- Daily: all phases true.
- Valuation bug fix: only `computeValuations` true.
- Market data repair: `refreshMarketData` and `computeValuations` true.
- Initial IBKR import: all phases true over a historical range.
- Reconciliation repair: `reconcile` and `computeValuations` true.

### Force And Skip Semantics

```ts
type PipelineSkipPolicy = {
  forceBrokerageSync: boolean;
  forceMarketDataRefresh: boolean;
  forceReconciliation: boolean;
  forceValuationCompute: boolean;
};
```

When `force` is false for a phase, the worker should ask Convex whether that
phase is already complete for the owner/date and skip it if safe.

Skip decisions must be made by activities that query Convex. Workflow code must
not read Convex directly.

## Recommended Workflow Hierarchy

```text
DailyPortfolioPipelineWorkflow
  -> PortfolioDateWorkflow(ownerId, date, mode="daily")

PortfolioBackfillWorkflow
  -> BuildBackfillManifestActivity
  -> PortfolioBackfillChunkWorkflow
     -> PortfolioDateWorkflow(ownerId, date, mode="backfill")

PortfolioRecomputeWorkflow
  -> BuildRecomputeManifestActivity
  -> PortfolioBackfillChunkWorkflow
     -> PortfolioDateWorkflow(ownerId, date, mode="recompute")

PortfolioDateWorkflow
  -> BrokerageSyncWorkflow
  -> MarketDataDateWorkflow
  -> ReconciliationActivity
  -> ValuationComputeActivity
  -> FinalizePipelineDateActivity
```

Use child workflows for each date or small chunk. Do not run hundreds of dates
inside one workflow history. For long backfills, use child workflows and
`continue-as-new` if the parent history grows too large.

## Workflow Contracts

### `DailyPortfolioPipelineWorkflow`

Runs once per day from a Temporal Schedule at 1:00 a.m. Eastern Time.

Input:

```ts
type DailyPortfolioPipelineInput = {
  scheduleId: string;
  timezone: "America/New_York";
  mode?: "daily";
};
```

Output:

```ts
type DailyPortfolioPipelineOutput = {
  pipelineRunId: string;
  pipelineDate: string;
  ownerRunsStarted: number;
  ownerRunsSucceeded: number;
  ownerRunsFailed: number;
  status: "succeeded" | "partial" | "failed";
};
```

Workflow steps:

1. Call `resolvePriorBusinessDateActivity`.
2. Call `listDailyPipelineOwnersActivity`.
3. Call `startPipelineRunActivity`.
4. Start one `PortfolioDateWorkflow` child per owner/connection or owner,
   depending on the first implementation's ownership model.
5. Wait for all child workflows to finish.
6. Call `completePipelineRunActivity`.

Side effects:

- None directly. All writes happen in activities.

Notes:

- Use `ScheduleOverlapPolicy.SKIP` for the schedule so a delayed prior run does
  not overlap with the next daily run.
- Child workflow IDs should include owner and date:
  `portfolio-date:${ownerKey}:${pipelineDate}:daily`.

### `PortfolioBackfillWorkflow`

Runs manually from the app or CLI for a date range.

Input:

```ts
type PortfolioBackfillInput = {
  requestedByOwnerId: string;
  targetOwnerId: string;
  startDate: string;
  endDate: string;
  phases: PipelinePhaseSelection;
  skipPolicy: PipelineSkipPolicy;
  maxConcurrentDateWorkflows: number;
  chunkSizeDays: number;
  reason?: string;
};
```

Output:

```ts
type PortfolioBackfillOutput = {
  pipelineRunId: string;
  datesPlanned: number;
  datesSkipped: number;
  datesSucceeded: number;
  datesPartial: number;
  datesFailed: number;
  status: "succeeded" | "partial" | "failed" | "cancelled";
};
```

Workflow steps:

1. Call `authorizeBackfillRequestActivity`.
2. Call `buildBackfillManifestActivity`.
3. Call `startPipelineRunActivity`.
4. Split manifest dates into chunks.
5. Start `PortfolioBackfillChunkWorkflow` children with bounded concurrency.
6. Aggregate child outputs.
7. Call `completePipelineRunActivity`.

Side effects:

- None directly.

Notes:

- The manifest should include market days only, using the existing app market
  calendar rules.
- Use child workflows or `continue-as-new` to keep workflow history bounded.
- Cancellation should mark the Convex run as `cancelled` or `partial`, not leave
  it stuck in `running`.

### `PortfolioRecomputeWorkflow`

Runs manually when derived data needs recalculation from existing source data.

Input:

```ts
type PortfolioRecomputeInput = {
  requestedByOwnerId: string;
  targetOwnerId: string;
  startDate: string;
  endDate: string;
  recomputeReason:
    | "valuation_logic_change"
    | "market_data_repair"
    | "brokerage_reconciliation_repair"
    | "manual_operator_request";
  phases: PipelinePhaseSelection;
  skipPolicy: PipelineSkipPolicy;
  maxConcurrentDateWorkflows: number;
};
```

Output: same shape as `PortfolioBackfillOutput`.

Workflow steps:

1. Call `authorizeBackfillRequestActivity`.
2. Call `buildRecomputeManifestActivity`.
3. Delegate to the same chunk/date workflow structure as backfill.

Side effects:

- None directly.

Notes:

- Recompute should default `syncBrokerage` to false unless explicitly requested.
- Recompute should be the normal tool after valuation math changes.

### `PortfolioBackfillChunkWorkflow`

Processes a small list of dates for one owner.

Input:

```ts
type PortfolioBackfillChunkInput = {
  pipelineRunId: string;
  ownerId: string;
  dates: string[];
  mode: "backfill" | "recompute";
  phases: PipelinePhaseSelection;
  skipPolicy: PipelineSkipPolicy;
  maxConcurrentDateWorkflows: number;
};
```

Output:

```ts
type PortfolioBackfillChunkOutput = {
  datesStarted: number;
  datesSkipped: number;
  datesSucceeded: number;
  datesPartial: number;
  datesFailed: number;
};
```

Workflow steps:

1. For each date, start a `PortfolioDateWorkflow` child with bounded
   concurrency.
2. Aggregate outputs.
3. Return counts.

Side effects:

- None directly.

Notes:

- Child workflow ID:
  `portfolio-date:${ownerId}:${date}:${mode}:${pipelineRunId}`.
- A chunk can continue when one date fails; the parent should report partial
  success.

### `PortfolioDateWorkflow`

The reusable per-owner/per-date pipeline.

Input:

```ts
type PortfolioDateInput = {
  pipelineRunId: string;
  ownerId: string;
  date: string;
  mode: PipelineMode;
  phases: PipelinePhaseSelection;
  skipPolicy: PipelineSkipPolicy;
};
```

Output:

```ts
type PortfolioDateOutput = {
  pipelineDateRunId: string;
  date: string;
  brokerageStatus: PipelinePhaseStatus;
  marketDataStatus: PipelinePhaseStatus;
  reconciliationStatus: PipelinePhaseStatus;
  valuationStatus: PipelinePhaseStatus;
  finalStatus: "succeeded" | "partial" | "failed" | "skipped";
};

type PipelinePhaseStatus =
  | "not_requested"
  | "skipped"
  | "succeeded"
  | "partial"
  | "failed"
  | "blocked";
```

Workflow steps:

1. Call `startPipelineDateRunActivity`.
2. Call `loadDatePipelinePlanActivity`.
3. If `syncBrokerage`, run `BrokerageSyncWorkflow` unless skipped.
4. If `refreshMarketData`, run `MarketDataDateWorkflow` unless skipped.
5. If `reconcile`, call `reconcileBrokerageDateActivity` unless blocked.
6. If `computeValuations`, call `computePortfolioValuationsActivity` unless
   blocked.
7. Call `finalizePipelineDateActivity`.

Side effects:

- None directly.

Blocking rules:

- If brokerage sync has a terminal auth/config failure, reconciliation should be
  blocked and valuation freshness should become `stale` or `mismatched`.
- If market data fails for some symbols, valuation can still run and record
  `partial` price coverage.
- Pending inbox trades should not block valuation math, but should make
  brokerage freshness `pending_review`.

### `BrokerageSyncWorkflow`

Runs provider-specific brokerage sync for one owner/date.

Input:

```ts
type BrokerageSyncInput = {
  pipelineRunId: string;
  pipelineDateRunId: string;
  ownerId: string;
  date: string;
  provider: "ibkr";
  reportType: "activity" | "trade_confirmation";
  force: boolean;
};
```

Output:

```ts
type BrokerageSyncOutput = {
  brokerageSyncRunId: string | null;
  rawReportId: string | null;
  tradesStaged: number;
  positionSnapshotsWritten: number;
  cashSnapshotsWritten: number;
  status: "skipped" | "succeeded" | "partial" | "failed" | "blocked";
  errorCode?: string;
  errorMessage?: string;
};
```

Workflow steps:

1. Call `prepareBrokerageSyncActivity`.
2. If skipped, return skipped output.
3. Call `sendIbkrFlexRequestActivity`.
4. Call `recordIbkrFlexReferenceActivity`.
5. Poll `getIbkrFlexStatementActivity` with durable timers until:
   - report ready
   - terminal failure
   - configured cutoff reached
6. Call `storeRawBrokerageReportActivity`.
7. Call `parseIbkrFlexReportActivity`.
8. Call `ingestBrokerageReportActivity`.

Side effects:

- None directly.

Notes:

- The poll interval should start short and back off, for example 1 minute, 2
  minutes, 5 minutes, 15 minutes, then 30 minutes.
- `report not ready` is not an error; it is normal workflow state.
- Invalid token and invalid query ID are terminal failures.

### `MarketDataDateWorkflow`

Refreshes or confirms market prices for one owner/date.

Input:

```ts
type MarketDataDateInput = {
  pipelineRunId: string;
  pipelineDateRunId: string;
  ownerId: string;
  date: string;
  force: boolean;
  budgetCredits?: number;
};
```

Output:

```ts
type MarketDataDateOutput = {
  marketDataRunId: string | null;
  symbolsRequested: number;
  symbolsSucceeded: number;
  symbolsFailed: number;
  trackedPriceMarksWritten: number;
  status: "skipped" | "succeeded" | "partial" | "failed";
};
```

Workflow steps:

1. Call `prepareMarketDataRefreshActivity`.
2. If skipped, return skipped output.
3. Call `planMarketDataJobsActivity`.
4. Fetch provider-priced symbols using bounded concurrency and provider rate
   limits.
5. Call `writeMarketDataResultsActivity` in batches.
6. Call `completeMarketDataRunActivity`.

Side effects:

- None directly.

Notes:

- The current Convex market-data job table can be kept initially, but the target
  architecture should let Temporal own the polling/rate-limited worker loop.
- Provider fetch activities must be idempotent with respect to Convex writes:
  repeat writes should upsert the same snapshot for `(provider, symbol, date)`.
- Missing prices should be stored as `missing`, not treated as total workflow
  failure.

## Activity Contracts

Activities are grouped by side-effect boundary.

### Calendar And Manifest Activities

#### `resolvePriorBusinessDateActivity`

Input:

```ts
type ResolvePriorBusinessDateInput = {
  nowIso: string;
  timezone: "America/New_York";
};
```

Output:

```ts
type ResolvePriorBusinessDateOutput = {
  date: string;
  reason: "previous_market_day";
};
```

Side effects:

- None.

Notes:

- Use the same market calendar rule as `convex/lib/marketCalendar.ts`.
- If duplicated in worker code, add tests proving parity with Convex.

#### `buildBackfillManifestActivity`

Input:

```ts
type BuildBackfillManifestInput = {
  targetOwnerId: string;
  startDate: string;
  endDate: string;
  phases: PipelinePhaseSelection;
  skipPolicy: PipelineSkipPolicy;
};
```

Output:

```ts
type BuildBackfillManifestOutput = {
  dates: Array<{
    date: string;
    skipReasons: string[];
    existingStatus: {
      brokerage: PipelinePhaseStatus;
      marketData: PipelinePhaseStatus;
      reconciliation: PipelinePhaseStatus;
      valuation: PipelinePhaseStatus;
    };
  }>;
  datesSkippedBeforeWorkflow: number;
};
```

Side effects:

- Reads Convex.
- Does not write.

#### `buildRecomputeManifestActivity`

Same shape as `buildBackfillManifestActivity`, but optimized for already-known
source data and derived-state recomputation.

### Pipeline State Activities

#### `startPipelineRunActivity`

Input:

```ts
type StartPipelineRunInput = {
  ownerId?: string;
  requestedByOwnerId?: string;
  mode: "daily" | "backfill" | "recompute";
  startDate: string;
  endDate: string;
  phases: PipelinePhaseSelection;
  reason?: string;
  temporalWorkflowId: string;
};
```

Output:

```ts
type StartPipelineRunOutput = {
  pipelineRunId: string;
  status: "created" | "reused";
};
```

Side effects:

- Upserts a Convex `portfolioPipelineRuns` row.
- Must be idempotent by `temporalWorkflowId`.

#### `startPipelineDateRunActivity`

Input:

```ts
type StartPipelineDateRunInput = {
  pipelineRunId: string;
  ownerId: string;
  date: string;
  mode: PipelineMode;
  temporalWorkflowId: string;
};
```

Output:

```ts
type StartPipelineDateRunOutput = {
  pipelineDateRunId: string;
  status: "created" | "reused";
};
```

Side effects:

- Upserts a Convex `portfolioPipelineDateRuns` row.
- Must be idempotent by `(pipelineRunId, ownerId, date, mode)`.

#### `loadDatePipelinePlanActivity`

Input:

```ts
type LoadDatePipelinePlanInput = {
  ownerId: string;
  date: string;
  phases: PipelinePhaseSelection;
  skipPolicy: PipelineSkipPolicy;
};
```

Output:

```ts
type LoadDatePipelinePlanOutput = {
  runBrokerage: boolean;
  runMarketData: boolean;
  runReconciliation: boolean;
  runValuation: boolean;
  skipReasons: string[];
};
```

Side effects:

- Reads Convex.
- Does not write.

#### `finalizePipelineDateActivity`

Input:

```ts
type FinalizePipelineDateInput = {
  pipelineDateRunId: string;
  brokerageStatus: PipelinePhaseStatus;
  marketDataStatus: PipelinePhaseStatus;
  reconciliationStatus: PipelinePhaseStatus;
  valuationStatus: PipelinePhaseStatus;
  errorMessage?: string;
};
```

Output:

```ts
type FinalizePipelineDateOutput = {
  finalStatus: "succeeded" | "partial" | "failed" | "skipped";
  freshnessStatus:
    | "current"
    | "pending_review"
    | "stale"
    | "mismatched"
    | "unmanaged";
};
```

Side effects:

- Updates Convex date-run status.
- Updates or records portfolio freshness metadata for the owner/date.

#### `completePipelineRunActivity`

Input:

```ts
type CompletePipelineRunInput = {
  pipelineRunId: string;
  aggregate: {
    datesSucceeded: number;
    datesPartial: number;
    datesFailed: number;
    datesSkipped: number;
  };
};
```

Output:

```ts
type CompletePipelineRunOutput = {
  status: "succeeded" | "partial" | "failed" | "cancelled";
};
```

Side effects:

- Updates Convex `portfolioPipelineRuns`.

### Brokerage Activities

#### `prepareBrokerageSyncActivity`

Input:

```ts
type PrepareBrokerageSyncInput = {
  pipelineDateRunId: string;
  ownerId: string;
  date: string;
  provider: "ibkr";
  reportType: "activity" | "trade_confirmation";
  force: boolean;
};
```

Output:

```ts
type PrepareBrokerageSyncOutput = {
  shouldRun: boolean;
  brokerageConnectionId: string | null;
  brokerageSyncRunId: string | null;
  queryId?: string;
  skipReason?: string;
};
```

Side effects:

- Reads connection metadata from Convex.
- Creates or reuses a Convex brokerage sync run when `shouldRun` is true.

#### `sendIbkrFlexRequestActivity`

Input:

```ts
type SendIbkrFlexRequestInput = {
  brokerageSyncRunId: string;
  queryId: string;
  date: string;
  reportType: "activity" | "trade_confirmation";
};
```

Output:

```ts
type SendIbkrFlexRequestOutput = {
  referenceCode: string;
};
```

Side effects:

- Calls IBKR `/SendRequest`.
- Reads IBKR token from worker secret storage.

Notes:

- Do not log token or full URL with token.
- If using date overrides, use explicit `date` and keep the report template
  stable.

#### `recordIbkrFlexReferenceActivity`

Input:

```ts
type RecordIbkrFlexReferenceInput = {
  brokerageSyncRunId: string;
  referenceCode: string;
};
```

Output:

```ts
type RecordIbkrFlexReferenceOutput = {
  status: "recorded" | "already_recorded";
};
```

Side effects:

- Writes reference code and status to Convex.

#### `getIbkrFlexStatementActivity`

Input:

```ts
type GetIbkrFlexStatementInput = {
  brokerageSyncRunId: string;
  referenceCode: string;
};
```

Output:

```ts
type GetIbkrFlexStatementOutput =
  | { status: "ready"; rawXml: string }
  | { status: "not_ready"; message?: string }
  | { status: "terminal_error"; errorCode: string; errorMessage: string };
```

Side effects:

- Calls IBKR `/GetStatement`.
- Reads IBKR token from worker secret storage.

#### `storeRawBrokerageReportActivity`

Input:

```ts
type StoreRawBrokerageReportInput = {
  brokerageSyncRunId: string;
  date: string;
  reportType: "activity" | "trade_confirmation";
  rawXml: string;
};
```

Output:

```ts
type StoreRawBrokerageReportOutput = {
  rawReportId: string;
  storageId: string;
  sha256: string;
  status: "stored" | "already_stored";
};
```

Side effects:

- Stores raw XML in private storage.
- Writes raw report metadata to Convex.

#### `parseIbkrFlexReportActivity`

Input:

```ts
type ParseIbkrFlexReportInput = {
  rawReportId: string;
  storageId: string;
};
```

Output:

```ts
type ParseIbkrFlexReportOutput = {
  trades: NormalizedBrokerageTrade[];
  positionSnapshots: NormalizedBrokeragePositionSnapshot[];
  cashSnapshots: NormalizedBrokerageCashSnapshot[];
  warnings: string[];
  errors: string[];
};
```

Side effects:

- Reads raw XML from private storage.
- Does not write Convex, except optional parser diagnostic logging if needed.

Notes:

- If output can become large, store parsed batches and return references.

#### `ingestBrokerageReportActivity`

Input:

```ts
type IngestBrokerageReportInput = {
  brokerageSyncRunId: string;
  rawReportId: string;
  date: string;
  parseResult: ParseIbkrFlexReportOutput;
};
```

Output:

```ts
type IngestBrokerageReportOutput = {
  tradesStaged: number;
  duplicateTradesSkipped: number;
  positionSnapshotsWritten: number;
  cashSnapshotsWritten: number;
  status: "succeeded" | "partial" | "failed";
  warnings: string[];
};
```

Side effects:

- Calls Convex ingestion service.
- Stages new trades into `inboxTrades`.
- Writes position and cash snapshots.
- Updates brokerage sync run status.

### Market Data Activities

#### `prepareMarketDataRefreshActivity`

Input:

```ts
type PrepareMarketDataRefreshInput = {
  pipelineDateRunId: string;
  ownerId: string;
  date: string;
  force: boolean;
};
```

Output:

```ts
type PrepareMarketDataRefreshOutput = {
  shouldRun: boolean;
  marketDataRunId: string | null;
  skipReason?: string;
};
```

Side effects:

- Reads Convex market-data status for owner/date.
- Creates or reuses a market-data run when needed.

#### `planMarketDataJobsActivity`

Input:

```ts
type PlanMarketDataJobsInput = {
  marketDataRunId: string;
  ownerId: string;
  date: string;
};
```

Output:

```ts
type PlanMarketDataJobsOutput = {
  providerJobs: Array<{
    assetType: "stock" | "crypto";
    symbol: string;
    provider: "twelve_data";
    providerSymbol: string;
    estimatedCredits: number;
  }>;
  trackedPriceMarksWritten: number;
};
```

Side effects:

- Reads Convex valuation universe.
- Writes portfolio-scoped fallback price marks for tracked-without-market-data
  positions.
- Creates or updates a market-data run record.

#### `fetchMarketPriceActivity`

Input:

```ts
type FetchMarketPriceInput = {
  date: string;
  provider: "twelve_data";
  providerSymbol: string;
};
```

Output:

```ts
type FetchMarketPriceOutput =
  | {
      status: "ok";
      close: number;
      date: string;
      provider: "twelve_data";
      providerSymbol: string;
    }
  | {
      status: "missing" | "error";
      date: string;
      provider: "twelve_data";
      providerSymbol: string;
      errorMessage: string;
    };
```

Side effects:

- Calls external market data provider.
- Does not write Convex directly.

#### `writeMarketDataResultsActivity`

Input:

```ts
type WriteMarketDataResultsInput = {
  marketDataRunId: string;
  ownerId: string;
  date: string;
  results: FetchMarketPriceOutput[];
};
```

Output:

```ts
type WriteMarketDataResultsOutput = {
  snapshotsWritten: number;
  symbolsSucceeded: number;
  symbolsFailed: number;
};
```

Side effects:

- Upserts market price snapshots in Convex.
- Updates market-data run counters.

#### `completeMarketDataRunActivity`

Input:

```ts
type CompleteMarketDataRunInput = {
  marketDataRunId: string;
};
```

Output:

```ts
type CompleteMarketDataRunOutput = {
  status: "succeeded" | "partial" | "failed";
};
```

Side effects:

- Marks Convex market-data run complete.

### Reconciliation And Valuation Activities

#### `reconcileBrokerageDateActivity`

Input:

```ts
type ReconcileBrokerageDateInput = {
  pipelineDateRunId: string;
  ownerId: string;
  date: string;
  force: boolean;
};
```

Output:

```ts
type ReconcileBrokerageDateOutput = {
  issuesOpened: number;
  issuesResolved: number;
  pendingInboxTrades: number;
  status: "succeeded" | "partial" | "failed" | "blocked";
};
```

Side effects:

- Reads accepted trades, pending inbox trades, and brokerage snapshots from
  Convex.
- Writes reconciliation issues.
- Updates date-run reconciliation phase status.

Notes:

- First version should compare open position quantities.
- Cash reconciliation should be added after position reconciliation is stable.

#### `computePortfolioValuationsActivity`

Input:

```ts
type ComputePortfolioValuationsInput = {
  pipelineDateRunId: string;
  ownerId: string;
  date: string;
  force: boolean;
};
```

Output:

```ts
type ComputePortfolioValuationsOutput = {
  portfoliosComputed: number;
  priceCoverageStatus: "complete" | "partial" | "missing";
  freshnessStatus:
    | "current"
    | "pending_review"
    | "stale"
    | "mismatched"
    | "unmanaged";
  status: "succeeded" | "partial" | "failed" | "skipped";
};
```

Side effects:

- Calls Convex valuation mutation for owner/date.
- Writes or updates portfolio valuation rows.
- Attaches or computes brokerage freshness status for portfolio review.

Notes:

- Valuation math remains in Convex.
- The activity should pass explicit `date`.

## Convex Tables To Add Or Extend

The implementation plan can refine names, but the pipeline needs durable product
state similar to:

- `portfolioPipelineRuns`
- `portfolioPipelineDateRuns`
- `brokerageConnections`
- `brokerageSyncRuns`
- `brokerageRawReports`
- `brokeragePositionSnapshots`
- `brokerageCashSnapshots`
- `brokerageReconciliationIssues`

Existing tables remain canonical for:

- accepted trades
- inbox trades
- portfolio cash ledger entries
- market data instruments
- market price snapshots
- portfolio price marks
- portfolio daily valuations

## Status Model

Pipeline run status:

```ts
type PipelineRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled";
```

Pipeline date status:

```ts
type PipelineDateStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "skipped"
  | "blocked";
```

Phase status:

```ts
type PipelinePhaseStatus =
  | "not_requested"
  | "queued"
  | "running"
  | "skipped"
  | "succeeded"
  | "partial"
  | "failed"
  | "blocked";
```

Freshness status:

```ts
type BrokerageFreshnessStatus =
  | "current"
  | "pending_review"
  | "stale"
  | "mismatched"
  | "unmanaged";
```

## Idempotency Rules

Every activity that writes Convex must be idempotent.

Required keys:

- Pipeline run: `temporalWorkflowId`
- Pipeline date run: `(pipelineRunId, ownerId, date, mode)`
- Brokerage sync run:
  `(ownerId, connectionId, reportType, date, queryId)`
- Raw brokerage report: `(brokerageSyncRunId, sha256)`
- Inbox trade: `(ownerId, source, externalId)`
- Position snapshot:
  `(ownerId, brokerageSyncRunId, brokerageAccountId, assetType, symbol, date)`
- Market price snapshot: `(provider, providerSymbol, date)`
- Portfolio valuation: `(ownerId, portfolioId, date)`
- Reconciliation issue:
  `(ownerId, date, brokerageAccountId, assetType, symbol, issueType)`

Retries must not duplicate user-visible rows.

## Failure Policy

Retryable:

- IBKR report not ready
- network timeouts
- provider 429s
- provider 5xxs
- worker restarts
- temporary Convex HTTP failures

Terminal:

- invalid IBKR Flex token
- invalid query ID
- unauthorized Convex service token
- malformed report schema that parser cannot safely interpret
- impossible date range
- user lacks permission for requested backfill

Partial success:

- some market prices missing
- some trades staged but parser reports row-level warnings
- brokerage sync succeeds but reconciliation opens issues
- valuation computes with partial price coverage

## Backfill Behavior

Backfill should prefer correctness and observability over speed.

Rules:

- Process only market days unless the user explicitly requests calendar-day
  recomputation.
- Use bounded concurrency for date workflows.
- Allow one date to fail without failing the entire range.
- Store per-date phase status in Convex.
- Support cancellation and leave completed dates intact.
- Allow rerun with `force` flags.

Recommended defaults:

```ts
const defaultBackfillOptions = {
  phases: {
    syncBrokerage: true,
    refreshMarketData: true,
    reconcile: true,
    computeValuations: true,
  },
  skipPolicy: {
    forceBrokerageSync: false,
    forceMarketDataRefresh: false,
    forceReconciliation: false,
    forceValuationCompute: false,
  },
  chunkSizeDays: 20,
  maxConcurrentDateWorkflows: 3,
};
```

## Recompute Behavior

Recompute should be narrower than backfill.

Default recompute options:

```ts
const defaultRecomputeOptions = {
  phases: {
    syncBrokerage: false,
    refreshMarketData: false,
    reconcile: false,
    computeValuations: true,
  },
  skipPolicy: {
    forceBrokerageSync: false,
    forceMarketDataRefresh: false,
    forceReconciliation: false,
    forceValuationCompute: true,
  },
};
```

Use recompute for:

- valuation logic changes
- portfolio cash ledger corrections
- manual trade edits
- market price snapshot repair when snapshots are already fixed

Use backfill for:

- first IBKR historical load
- missing historical market prices
- missing historical brokerage snapshots
- rebuilding source-derived operational state

## Testing Expectations

Unit tests:

- workflow tests with mocked activities for each workflow
- parser tests with sanitized IBKR XML fixtures
- Convex tests for idempotent ingestion and status transitions
- market calendar parity tests if worker calendar logic is duplicated

Failure tests:

- IBKR statement not ready, then ready
- invalid token terminal failure
- partial market data failure
- date workflow failure inside a backfill range
- retry of an already-successful activity does not duplicate Convex rows

Replay tests:

- save representative Temporal histories for daily and backfill workflows
- replay after workflow code changes before deploying

Manual proof:

- run one prior-business-day daily pipeline
- run a short 3-5 day backfill
- run valuation-only recompute over the same range
- verify Convex statuses and portfolio valuation rows after each run

## Open Implementation Decisions

These should be resolved during implementation:

- Whether Activity Flex date overrides are reliable enough for historical IBKR
  backfill, or whether separate saved Flex queries are needed.
- Whether daily market data should still prefetch after market close, followed
  by final valuation after the 1:00 a.m. brokerage pipeline.
- Whether cash reconciliation belongs in the first shipping version or follows
  position reconciliation.
