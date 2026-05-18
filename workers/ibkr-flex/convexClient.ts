import type {
  BeginBrokerageSyncRunInput,
  BeginBrokerageSyncRunOutput,
  DueIbkrConnection,
  MarkBrokerageSyncFailedInput,
  PollAndIngestIbkrFlexStatementOutput,
  RecordIbkrFlexReferenceInput,
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
