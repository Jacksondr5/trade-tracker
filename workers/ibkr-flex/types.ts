export const DEFAULT_TEMPORAL_NAMESPACE = "trade-tracker";
export const DEFAULT_TEMPORAL_TASK_QUEUE = "trade-tracker-portfolio-pipeline";

export type BrokerageSyncReportType = "activity" | "trade_confirmation";
export type PortfolioPipelineMode = "daily" | "backfill" | "recompute";
export type PortfolioPipelineStatus =
  | "cancelled"
  | "failed"
  | "partial"
  | "queued"
  | "running"
  | "succeeded";
export type PortfolioPipelineDateStatus =
  | "failed"
  | "partial"
  | "queued"
  | "running"
  | "skipped"
  | "succeeded";
export type PortfolioPipelinePhaseStatus =
  | "blocked"
  | "failed"
  | "not_requested"
  | "partial"
  | "skipped"
  | "succeeded";
export type BrokerageFreshnessStatus =
  | "current"
  | "mismatched"
  | "pending_review"
  | "stale"
  | "unmanaged";

export type PipelinePhaseSelection = {
  computeValuations: boolean;
  reconcile: boolean;
  refreshMarketData: boolean;
  syncBrokerage: boolean;
};

export type PipelineSkipPolicy = {
  forceBrokerageSync: boolean;
  forceMarketDataRefresh: boolean;
  forceReconciliation: boolean;
  forceValuationCompute: boolean;
};

export type IbkrFlexBrokerageSyncWorkflowInput = {
  connectionId: string;
  reportDate: string;
  queryId?: string;
  reportType?: BrokerageSyncReportType;
  maxPollAttempts?: number;
  initialPollIntervalMs?: number;
  maxPollIntervalMs?: number;
};

export type IbkrFlexBrokerageSyncWorkflowOutput = {
  attempts: number;
  importedTrades: number;
  positionSnapshotsWritten: number;
  cashSnapshotsWritten: number;
  skippedDuplicateTrades: number;
  status: "succeeded" | "timed_out" | "failed_retryable" | "failed_terminal";
  syncRunId: string;
};

export type DailyIbkrFlexBrokerageSyncWorkflowInput = {
  ownerId?: string;
  reportDate?: string;
  scheduleId?: string;
  timezone?: "America/New_York";
};

export type DailyIbkrFlexBrokerageSyncWorkflowOutput = {
  connectionsPlanned: number;
  reportDate: string;
  runsFailed: number;
  runsSucceeded: number;
  status: "succeeded" | "partial" | "failed";
};

export type DueIbkrConnection = {
  _id: string;
  ownerId: string;
  queryId: string;
};

export type DailyPipelineOwner = {
  ownerId: string;
};

export type DailyPortfolioPipelineWorkflowInput = {
  mode?: "daily";
  scheduleId?: string;
  timezone?: "America/New_York";
};

export type DailyPortfolioPipelineWorkflowOutput = {
  ownerRunsFailed: number;
  ownerRunsStarted: number;
  ownerRunsSucceeded: number;
  pipelineDate: string;
  pipelineRunId: string;
  status: "failed" | "partial" | "succeeded";
};

export type PortfolioDateWorkflowInput = {
  date: string;
  mode: PortfolioPipelineMode;
  ownerId: string;
  phases?: PipelinePhaseSelection;
  pipelineRunId: string;
  skipPolicy?: PipelineSkipPolicy;
};

export type PortfolioDateWorkflowOutput = {
  brokerageStatus: PortfolioPipelinePhaseStatus;
  date: string;
  finalStatus: "failed" | "partial" | "skipped" | "succeeded";
  marketDataStatus: PortfolioPipelinePhaseStatus;
  pipelineDateRunId: string;
  reconciliationStatus: PortfolioPipelinePhaseStatus;
  valuationStatus: PortfolioPipelinePhaseStatus;
};

export type StartPipelineRunInput = {
  endDate: string;
  mode: PortfolioPipelineMode;
  ownerId: string;
  requestedByOwnerId?: string;
  startDate: string;
  temporalWorkflowId: string;
};

export type StartPipelineRunOutput = {
  pipelineRunId: string;
  status: "created" | "reused";
};

export type CompletePipelineRunInput = {
  aggregate: {
    datesFailed: number;
    datesPartial: number;
    datesSkipped: number;
    datesSucceeded: number;
  };
  pipelineRunId: string;
};

export type CompletePipelineRunOutput = {
  status: PortfolioPipelineStatus;
};

export type StartPipelineDateRunInput = {
  date: string;
  mode: PortfolioPipelineMode;
  ownerId: string;
  pipelineRunId: string;
  temporalWorkflowId: string;
};

export type StartPipelineDateRunOutput = {
  pipelineDateRunId: string;
  status: "created" | "reused";
};

export type ReconcileBrokerageDateInput = {
  date: string;
  force: boolean;
  ownerId: string;
  pipelineDateRunId: string;
};

export type ReconcileBrokerageDateOutput = {
  issuesOpened: number;
  issuesResolved: number;
  pendingInboxTrades: number;
  status: "blocked" | "failed" | "partial" | "succeeded";
};

export type ComputePortfolioValuationsInput = {
  date: string;
  force: boolean;
  ownerId: string;
  pipelineDateRunId: string;
};

export type ComputePortfolioValuationsOutput = {
  freshnessStatus: BrokerageFreshnessStatus;
  portfoliosComputed: number;
  priceCoverageStatus: "complete" | "missing" | "partial";
  status: "failed" | "partial" | "skipped" | "succeeded";
};

export type FinalizePipelineDateInput = {
  brokerageStatus: PortfolioPipelinePhaseStatus;
  errorMessage?: string;
  marketDataStatus: PortfolioPipelinePhaseStatus;
  pipelineDateRunId: string;
  reconciliationStatus: PortfolioPipelinePhaseStatus;
  valuationStatus: PortfolioPipelinePhaseStatus;
};

export type FinalizePipelineDateOutput = {
  finalStatus: "failed" | "partial" | "skipped" | "succeeded";
  freshnessStatus: BrokerageFreshnessStatus;
};

export type BeginBrokerageSyncRunInput = {
  connectionId: string;
  queryId?: string;
  reportDate: string;
  reportType: BrokerageSyncReportType;
};

export type BeginBrokerageSyncRunOutput = {
  created: boolean;
  queryId?: string;
  syncRunId: string;
};

export type SendIbkrFlexRequestInput = {
  queryId: string;
  reportDate: string;
  reportType: BrokerageSyncReportType;
  syncRunId: string;
};

export type SendIbkrFlexRequestOutput = {
  referenceCode: string;
};

export type RecordIbkrFlexReferenceInput = {
  referenceCode: string;
  syncRunId: string;
};

export type PollAndIngestIbkrFlexStatementInput = {
  referenceCode: string;
  syncRunId: string;
};

export type PollAndIngestIbkrFlexStatementOutput =
  | { message?: string; status: "not_ready" }
  | {
      cashSnapshotsWritten: number;
      importedTrades: number;
      positionSnapshotsWritten: number;
      skippedDuplicateTrades: number;
      status: "ready";
    }
  | { errorCode?: string; errorMessage: string; status: "terminal_error" };

export type MarkBrokerageSyncFailedInput = {
  errorMessage: string;
  failureType: "retryable" | "terminal";
  syncRunId: string;
};

export type MarketDataProvider = "twelve_data";

export type MarketDataAssetType = "crypto" | "stock";

export type MarketDataDateWorkflowInput = {
  budgetCredits?: number;
  date: string;
  force?: boolean;
  ownerId: string;
  pipelineDateRunId?: string;
  pipelineRunId?: string;
};

export type MarketDataDateWorkflowOutput = {
  marketDataRunId: string | null;
  status: "skipped" | "succeeded" | "partial" | "failed";
  symbolsFailed: number;
  symbolsRequested: number;
  symbolsSucceeded: number;
  trackedPriceMarksWritten: number;
};

export type PrepareMarketDataRefreshInput = {
  date: string;
  force: boolean;
  ownerId: string;
  pipelineDateRunId?: string;
};

export type PrepareMarketDataRefreshOutput = {
  marketDataRunId: string | null;
  shouldRun: boolean;
  skipReason?: string;
};

export type PlanMarketDataJobsInput = {
  date: string;
  marketDataRunId: string;
  ownerId: string;
};

export type MarketDataProviderJob = {
  assetType: MarketDataAssetType;
  estimatedCredits: number;
  provider: MarketDataProvider;
  providerSymbol: string;
  symbol: string;
};

export type PlanMarketDataJobsOutput = {
  providerJobs: MarketDataProviderJob[];
  trackedPriceMarksWritten: number;
};

export type FetchMarketPriceInput = {
  date: string;
  provider: MarketDataProvider;
  providerSymbol: string;
};

export type FetchMarketPriceOutput =
  | {
      close: number;
      date: string;
      provider: MarketDataProvider;
      providerSymbol: string;
      status: "ok";
    }
  | {
      date: string;
      errorMessage: string;
      provider: MarketDataProvider;
      providerSymbol: string;
      status: "error" | "missing";
    };

export type WriteMarketDataResultsInput = {
  date: string;
  marketDataRunId: string;
  ownerId: string;
  results: FetchMarketPriceOutput[];
};

export type WriteMarketDataResultsOutput = {
  processedResults: Array<{
    provider: MarketDataProvider;
    providerSymbol: string;
    status: "error" | "missing" | "ok";
  }>;
  snapshotsWritten: number;
  symbolsFailed: number;
  symbolsSucceeded: number;
};

export type CompleteMarketDataRunInput = {
  marketDataRunId: string;
  ownerId: string;
  symbolsFailed: number;
  symbolsSucceeded: number;
};

export type CompleteMarketDataRunOutput = {
  status: "failed" | "partial" | "succeeded";
};
