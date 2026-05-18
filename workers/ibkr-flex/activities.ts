import { parseIbkrFlexActivityXml } from "../../shared/brokerage/ibkr-flex/parser";
import type { IbkrFlexWorkerConfig } from "./config";
import { ConvexServiceClient } from "./convexClient";
import { IbkrFlexClient } from "./ibkrClient";
import type {
  BeginBrokerageSyncRunInput,
  BeginBrokerageSyncRunOutput,
  DueIbkrConnection,
  MarkBrokerageSyncFailedInput,
  PollAndIngestIbkrFlexStatementInput,
  PollAndIngestIbkrFlexStatementOutput,
  RecordIbkrFlexReferenceInput,
  SendIbkrFlexRequestInput,
  SendIbkrFlexRequestOutput,
} from "./types";

export function createIbkrFlexActivities(config: IbkrFlexWorkerConfig) {
  const convex = new ConvexServiceClient(config);
  const ibkr = new IbkrFlexClient(config);

  return {
    async listDueIbkrConnections(): Promise<DueIbkrConnection[]> {
      const result = await convex.listDueConnections();
      return result.connections;
    },

    async resolvePriorBusinessDate(): Promise<string> {
      const date = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/New_York",
        year: "numeric",
      }).formatToParts(date);
      const part = (type: string) =>
        Number(parts.find((item) => item.type === type)?.value);
      const year = part("year");
      const month = part("month");
      const day = part("day");
      const prior = new Date(Date.UTC(year, month - 1, day - 1));
      while (prior.getUTCDay() === 0 || prior.getUTCDay() === 6) {
        prior.setUTCDate(prior.getUTCDate() - 1);
      }
      return prior.toISOString().slice(0, 10);
    },

    async beginBrokerageSyncRun(
      input: BeginBrokerageSyncRunInput,
    ): Promise<BeginBrokerageSyncRunOutput> {
      return await convex.beginSyncRun(input);
    },

    async sendIbkrFlexRequest(
      input: SendIbkrFlexRequestInput,
    ): Promise<SendIbkrFlexRequestOutput> {
      return await ibkr.sendRequest({
        queryId: input.queryId,
        reportDate: input.reportDate,
      });
    },

    async recordIbkrFlexReference(
      input: RecordIbkrFlexReferenceInput,
    ): Promise<void> {
      await convex.markRequested(input);
    },

    async markBrokerageSyncWaiting(syncRunId: string): Promise<void> {
      await convex.markWaiting(syncRunId);
    },

    async pollAndIngestIbkrFlexStatement(
      input: PollAndIngestIbkrFlexStatementInput,
    ): Promise<PollAndIngestIbkrFlexStatementOutput> {
      const statement = await ibkr.getStatement(input.referenceCode);
      if (statement.status !== "ready") return statement;

      const parseResult = parseIbkrFlexActivityXml(statement.rawXml);
      return await convex.ingestFlexReport({
        parseResult,
        rawXml: statement.rawXml,
        syncRunId: input.syncRunId,
      });
    },

    async markBrokerageSyncSucceeded(syncRunId: string): Promise<void> {
      await convex.markSucceeded(syncRunId);
    },

    async markBrokerageSyncFailed(
      input: MarkBrokerageSyncFailedInput,
    ): Promise<void> {
      await convex.markFailed(input);
    },
  };
}

export type IbkrFlexActivities = ReturnType<typeof createIbkrFlexActivities>;
