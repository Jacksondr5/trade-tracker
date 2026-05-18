export const DEFAULT_TEMPORAL_NAMESPACE = "trade-tracker";
export const DEFAULT_TEMPORAL_TASK_QUEUE = "trade-tracker-portfolio-pipeline";

export type BrokerageSyncReportType = "activity" | "trade_confirmation";

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
