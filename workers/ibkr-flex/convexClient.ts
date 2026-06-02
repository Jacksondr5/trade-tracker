import type {
  BeginBrokerageSyncRunInput,
  BeginBrokerageSyncRunOutput,
  CompletePipelineRunInput,
  CompletePipelineRunOutput,
  ComputePortfolioValuationsInput,
  ComputePortfolioValuationsOutput,
  CompleteMarketDataRunInput,
  CompleteMarketDataRunOutput,
  DailyPipelineOwner,
  FinalizePipelineDateInput,
  FinalizePipelineDateOutput,
  DueIbkrConnection,
  MarkBrokerageSyncFailedInput,
  PlanMarketDataJobsInput,
  PlanMarketDataJobsOutput,
  PollAndIngestIbkrFlexStatementOutput,
  PrepareMarketDataRefreshInput,
  PrepareMarketDataRefreshOutput,
  ReconcileBrokerageDateInput,
  ReconcileBrokerageDateOutput,
  RecordIbkrFlexReferenceInput,
  StartPipelineDateRunInput,
  StartPipelineDateRunOutput,
  StartPipelineRunInput,
  StartPipelineRunOutput,
  WriteMarketDataResultsInput,
  WriteMarketDataResultsOutput,
} from "./types";
import type { IbkrFlexWorkerConfig } from "./config";
import type { IbkrFlexParseResult } from "../../shared/brokerage/ibkr-flex/types";

type JsonValue =
  | boolean
  | number
  | string
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export class ConvexServiceClient {
  constructor(private readonly config: IbkrFlexWorkerConfig) {}

  async listDueConnections(): Promise<{
    connections: DueIbkrConnection[];
  }> {
    return await this.post("/internal/brokerage-ingestion/due-connections", {});
  }

  async listDailyPipelineOwners(): Promise<{ owners: DailyPipelineOwner[] }> {
    return await this.post("/internal/portfolio-pipeline/daily-owners", {});
  }

  async startPipelineRun(
    input: StartPipelineRunInput,
  ): Promise<StartPipelineRunOutput> {
    return await this.post("/internal/portfolio-pipeline/start-run", input);
  }

  async completePipelineRun(
    input: CompletePipelineRunInput,
  ): Promise<CompletePipelineRunOutput> {
    return await this.post("/internal/portfolio-pipeline/complete-run", input);
  }

  async startPipelineDateRun(
    input: StartPipelineDateRunInput,
  ): Promise<StartPipelineDateRunOutput> {
    return await this.post(
      "/internal/portfolio-pipeline/start-date-run",
      input,
    );
  }

  async reconcileBrokerageDate(
    input: ReconcileBrokerageDateInput,
  ): Promise<ReconcileBrokerageDateOutput> {
    return await this.post(
      "/internal/portfolio-pipeline/reconcile-date",
      input,
    );
  }

  async computePortfolioValuations(
    input: ComputePortfolioValuationsInput,
  ): Promise<ComputePortfolioValuationsOutput> {
    return await this.post(
      "/internal/portfolio-pipeline/compute-valuations",
      input,
    );
  }

  async finalizePipelineDate(
    input: FinalizePipelineDateInput,
  ): Promise<FinalizePipelineDateOutput> {
    return await this.post(
      "/internal/portfolio-pipeline/finalize-date-run",
      input,
    );
  }

  async beginSyncRun(
    input: BeginBrokerageSyncRunInput,
  ): Promise<BeginBrokerageSyncRunOutput> {
    const result = await this.post<BeginBrokerageSyncRunOutput>(
      "/internal/brokerage-ingestion/begin-sync-run",
      input,
    );
    return result;
  }

  async markRequested(input: RecordIbkrFlexReferenceInput): Promise<void> {
    await this.post("/internal/brokerage-ingestion/mark-requested", {
      referenceCode: input.referenceCode,
      syncRunId: input.syncRunId,
    });
  }

  async markWaiting(syncRunId: string): Promise<void> {
    await this.post("/internal/brokerage-ingestion/mark-waiting", {
      syncRunId,
    });
  }

  async ingestFlexReport(args: {
    parseResult: IbkrFlexParseResult;
    rawXml: string;
    syncRunId: string;
  }): Promise<
    Extract<PollAndIngestIbkrFlexStatementOutput, { status: "ready" }>
  > {
    const result = await this.post<{
      cashSnapshotsWritten: number;
      importedTrades: number;
      positionSnapshotsWritten: number;
      skippedDuplicateTrades: number;
    }>("/internal/brokerage-ingestion/ingest-flex-report", {
      cashSnapshots: args.parseResult.cashSnapshots,
      errors: args.parseResult.errors,
      positionSnapshots: args.parseResult.positionSnapshots,
      rawXml: args.rawXml,
      syncRunId: args.syncRunId,
      trades: args.parseResult.trades,
      warnings: args.parseResult.warnings,
    });
    return { status: "ready", ...result };
  }

  async markSucceeded(syncRunId: string): Promise<void> {
    await this.post("/internal/brokerage-ingestion/mark-succeeded", {
      syncRunId,
    });
  }

  async markFailed(input: MarkBrokerageSyncFailedInput): Promise<void> {
    await this.post("/internal/brokerage-ingestion/mark-failed", input);
  }

  async prepareMarketDataRefresh(
    input: PrepareMarketDataRefreshInput,
  ): Promise<PrepareMarketDataRefreshOutput> {
    return await this.post("/internal/market-data/prepare-refresh", input);
  }

  async planMarketDataJobs(
    input: PlanMarketDataJobsInput,
  ): Promise<PlanMarketDataJobsOutput> {
    return await this.post("/internal/market-data/plan-jobs", input);
  }

  async writeMarketDataResults(
    input: WriteMarketDataResultsInput,
  ): Promise<WriteMarketDataResultsOutput> {
    return await this.post("/internal/market-data/write-results", input);
  }

  async completeMarketDataRun(
    input: CompleteMarketDataRunInput,
  ): Promise<CompleteMarketDataRunOutput> {
    return await this.post("/internal/market-data/complete-run", input);
  }

  private async post<T>(
    path: string,
    body: Record<string, JsonValue | undefined>,
  ): Promise<T> {
    const response = await fetch(
      `${this.config.brokerageIngestionBaseUrl}${path}`,
      {
        body: JSON.stringify(body),
        headers: {
          authorization: `Bearer ${this.config.brokerageIngestionToken}`,
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(
        `Convex brokerage ingestion request failed ${response.status}: ${
          payload.error ?? response.statusText
        }`,
      );
    }
    return payload as T;
  }
}
