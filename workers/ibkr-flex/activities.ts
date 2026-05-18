import { parseIbkrFlexActivityXml } from "../../shared/brokerage/ibkr-flex/parser";
import type { IbkrFlexWorkerConfig } from "./config";
import { ConvexServiceClient } from "./convexClient";
import { IbkrFlexClient } from "./ibkrClient";
import type {
  BeginBrokerageSyncRunInput,
  BeginBrokerageSyncRunOutput,
  DueIbkrConnection,
  MarkBrokerageSyncFailedInput,
  PlanMarketDataJobsInput,
  PlanMarketDataJobsOutput,
  PollAndIngestIbkrFlexStatementInput,
  PollAndIngestIbkrFlexStatementOutput,
  PrepareMarketDataRefreshInput,
  PrepareMarketDataRefreshOutput,
  RecordIbkrFlexReferenceInput,
  SendIbkrFlexRequestInput,
  SendIbkrFlexRequestOutput,
  FetchMarketPriceInput,
  FetchMarketPriceOutput,
  WriteMarketDataResultsInput,
  WriteMarketDataResultsOutput,
  CompleteMarketDataRunInput,
  CompleteMarketDataRunOutput,
} from "./types";

const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const TWELVE_DATA_TIMEOUT_MS = 8_000;

type TwelveDataEndOfDayResponse = {
  close?: string;
  code?: number;
  datetime?: string;
  message?: string;
  status?: string;
  symbol?: string;
};

class DailyCloseMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyCloseMissingError";
  }
}

function requireTwelveDataApiKey(config: IbkrFlexWorkerConfig): string {
  const apiKey = config.twelveDataApiKey?.trim();
  if (!apiKey) {
    throw new Error("Twelve Data API key is not configured");
  }
  return apiKey;
}

function getTwelveDataError(payload: {
  code?: number;
  message?: string;
  status?: string;
}): string | null {
  if (payload.status === "error" || payload.code !== undefined) {
    return payload.message ?? "Twelve Data returned an error";
  }
  return null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown market data error";
}

async function fetchTwelveDataEndOfDay(args: {
  apiKey: string;
  date: string;
  providerSymbol: string;
}): Promise<FetchMarketPriceOutput> {
  const url = new URL(`${TWELVE_DATA_BASE_URL}/eod`);
  url.searchParams.set("apikey", args.apiKey);
  url.searchParams.set("date", args.date);
  url.searchParams.set("symbol", args.providerSymbol);

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    TWELVE_DATA_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `Twelve Data end of day price failed: HTTP ${response.status}`,
      );
    }

    const payload = (await response.json()) as TwelveDataEndOfDayResponse;
    const providerError = getTwelveDataError(payload);
    if (providerError !== null) {
      throw new Error(`Twelve Data end of day price failed: ${providerError}`);
    }

    const close = Number(payload.close);
    if (!payload.datetime || !Number.isFinite(close)) {
      throw new DailyCloseMissingError(
        `No daily close returned for ${args.providerSymbol}`,
      );
    }

    return {
      close,
      date: payload.datetime,
      provider: "twelve_data",
      providerSymbol: args.providerSymbol,
      status: "ok",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error && error.name === "AbortError"
        ? `Twelve Data end of day price failed: request timed out after ${TWELVE_DATA_TIMEOUT_MS}ms`
        : getErrorMessage(error);
    return {
      date: args.date,
      errorMessage,
      provider: "twelve_data",
      providerSymbol: args.providerSymbol,
      status: error instanceof DailyCloseMissingError ? "missing" : "error",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

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

    async prepareMarketDataRefresh(
      input: PrepareMarketDataRefreshInput,
    ): Promise<PrepareMarketDataRefreshOutput> {
      return await convex.prepareMarketDataRefresh(input);
    },

    async planMarketDataJobs(
      input: PlanMarketDataJobsInput,
    ): Promise<PlanMarketDataJobsOutput> {
      return await convex.planMarketDataJobs(input);
    },

    async fetchMarketPrice(
      input: FetchMarketPriceInput,
    ): Promise<FetchMarketPriceOutput> {
      if (input.provider !== "twelve_data") {
        return {
          date: input.date,
          errorMessage: `Unsupported market data provider: ${input.provider}`,
          provider: input.provider,
          providerSymbol: input.providerSymbol,
          status: "error",
        };
      }
      return await fetchTwelveDataEndOfDay({
        apiKey: requireTwelveDataApiKey(config),
        date: input.date,
        providerSymbol: input.providerSymbol,
      });
    },

    async writeMarketDataResults(
      input: WriteMarketDataResultsInput,
    ): Promise<WriteMarketDataResultsOutput> {
      return await convex.writeMarketDataResults(input);
    },

    async completeMarketDataRun(
      input: CompleteMarketDataRunInput,
    ): Promise<CompleteMarketDataRunOutput> {
      return await convex.completeMarketDataRun(input);
    },
  };
}

export type IbkrFlexActivities = ReturnType<typeof createIbkrFlexActivities>;
