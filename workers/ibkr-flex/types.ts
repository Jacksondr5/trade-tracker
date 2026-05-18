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
