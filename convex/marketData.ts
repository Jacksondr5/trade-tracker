import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import {
  ensureMarketDataInstrumentReviewRecord,
  getMarketDataInstrumentBySymbol,
  normalizeMarketDataSymbol,
  type MarketDataAssetType,
} from "./lib/marketDataInstruments";

const MARKET_DATA_PROVIDER = "twelve_data";
const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const TWELVE_DATA_TIMEOUT_MS = 8_000;
const PORTFOLIO_TRADE_SCAN_PAGE_SIZE = 256;
const HISTORICAL_PRICE_OUTPUT_SIZE = 5_000;
const HISTORICAL_PRICE_BATCH_SIZE = 2_000;
const POSITION_EPSILON = 0.00000001;
const BENCHMARK_INSTRUMENTS: Array<{
  assetType: MarketDataAssetType;
  symbol: string;
}> = [{ assetType: "stock", symbol: "SPY" }];

const assetTypeValidator = v.union(v.literal("crypto"), v.literal("stock"));

const marketDataInstrumentValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("marketDataInstruments"),
  assetType: assetTypeValidator,
  createdAt: v.number(),
  lastError: v.optional(v.string()),
  lastResolvedAt: v.optional(v.number()),
  ownerId: v.string(),
  provider: v.literal("twelve_data"),
  providerSymbol: v.optional(v.string()),
  resolutionStatus: v.union(
    v.literal("resolved"),
    v.literal("needs_review"),
    v.literal("ignored"),
  ),
  symbol: v.string(),
  updatedAt: v.number(),
});

const resolutionResultValidator = v.object({
  instrument: marketDataInstrumentValidator,
  status: v.union(
    v.literal("resolved"),
    v.literal("needs_review"),
    v.literal("ignored"),
  ),
});

type TwelveDataSymbolSearchRow = {
  country?: string;
  currency?: string;
  exchange?: string;
  instrument_name?: string;
  instrument_type?: string;
  mic_code?: string;
  symbol?: string;
};

type TwelveDataSymbolSearchResponse = {
  code?: number;
  data?: TwelveDataSymbolSearchRow[];
  message?: string;
  status?: string;
};

type TwelveDataTimeSeriesResponse = {
  code?: number;
  message?: string;
  meta?: {
    exchange?: string;
    symbol?: string;
    type?: string;
  };
  status?: string;
  values?: Array<{
    close?: string;
    datetime?: string;
  }>;
};

type ResolutionResult = {
  instrument: Doc<"marketDataInstruments">;
  status: "ignored" | "needs_review" | "resolved";
};

type DailyCloseResult = {
  close: number;
  date: string;
  provider: typeof MARKET_DATA_PROVIDER;
  providerSymbol: string;
};

type HistoricalCloseResult = DailyCloseResult;

type PriceSnapshotWrite = {
  close?: number;
  date: string;
  errorMessage?: string;
  provider: typeof MARKET_DATA_PROVIDER;
  providerSymbol: string;
  status: "error" | "missing" | "ok";
};

type HistoricalBackfillCandidate = {
  assetType: MarketDataAssetType;
  sourceTradeIds: Id<"trades">[];
  symbol: string;
};

type HistoricalBackfillUniverse = {
  candidates: HistoricalBackfillCandidate[];
  startDate: string | null;
};

type HistoricalBackfillFailedSymbol = {
  assetType: MarketDataAssetType;
  errorMessage: string;
  sourceTradeIds: Id<"trades">[];
  symbol: string;
};

class DailyCloseMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyCloseMissingError";
  }
}

function requireTwelveDataApiKey(): string {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) {
    throw new ConvexError("Twelve Data API key is not configured");
  }
  return apiKey;
}

function buildTwelveDataUrl(
  path: "symbol_search" | "time_series",
  params: Record<string, string>,
): string {
  const url = new URL(`${TWELVE_DATA_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
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

async function fetchTwelveDataJson<T>(args: {
  context: string;
  url: string;
}): Promise<{ payload: T } | { error: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    TWELVE_DATA_TIMEOUT_MS,
  );

  try {
    const response = await fetch(args.url, { signal: controller.signal });
    if (!response.ok) {
      return {
        error: `Twelve Data ${args.context} failed: HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as T;
    return { payload };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        error: `Twelve Data ${args.context} failed: request timed out after ${TWELVE_DATA_TIMEOUT_MS}ms`,
      };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Twelve Data ${args.context} failed: ${message}` };
  } finally {
    clearTimeout(timeoutId);
  }
}

function scoreSymbolCandidate(
  row: TwelveDataSymbolSearchRow,
  assetType: MarketDataAssetType,
  symbol: string,
): number {
  const providerSymbol = row.symbol?.toUpperCase();
  if (!providerSymbol) {
    return -1;
  }

  const compactProviderSymbol = providerSymbol.replace(/[^A-Z0-9]/g, "");
  const compactSymbol = symbol.replace(/[^A-Z0-9]/g, "");
  const hasStockSymbolMatch = providerSymbol === symbol;
  const hasCryptoSymbolMatch =
    providerSymbol === symbol ||
    compactProviderSymbol === compactSymbol ||
    providerSymbol === `${symbol}/USD` ||
    providerSymbol.startsWith(`${symbol}/`) ||
    compactProviderSymbol === `${compactSymbol}USD`;

  if (assetType === "stock" && !hasStockSymbolMatch) {
    return -1;
  }
  if (assetType === "crypto" && !hasCryptoSymbolMatch) {
    return -1;
  }

  const instrumentType = row.instrument_type?.toLowerCase() ?? "";
  const country = row.country?.toLowerCase() ?? "";
  let score = 0;

  if (assetType === "stock") {
    if (providerSymbol === symbol) score += 100;
    if (instrumentType.includes("common stock")) score += 30;
    if (instrumentType.includes("etf")) score += 15;
    if (country === "united states" || country === "us") score += 10;
    if (row.exchange === "NASDAQ" || row.exchange === "NYSE") score += 5;
    return score;
  }

  if (instrumentType.includes("digital currency")) score += 40;
  if (providerSymbol === symbol) score += 100;
  if (compactProviderSymbol === compactSymbol) score += 95;
  if (providerSymbol === `${symbol}/USD`) score += 90;
  if (providerSymbol.startsWith(`${symbol}/`)) score += 70;
  if (compactProviderSymbol === `${compactSymbol}USD`) score += 80;
  if (row.currency === "USD") score += 10;
  return score;
}

function selectBestSymbolCandidate(
  rows: TwelveDataSymbolSearchRow[],
  assetType: MarketDataAssetType,
  symbol: string,
): TwelveDataSymbolSearchRow | null {
  const sorted = rows
    .map((row) => ({
      row,
      score: scoreSymbolCandidate(row, assetType, symbol),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return sorted[0]?.row ?? null;
}

async function resolveProviderSymbol(args: {
  apiKey: string;
  assetType: MarketDataAssetType;
  symbol: string;
}): Promise<{ providerSymbol: string } | { error: string }> {
  const result = await fetchTwelveDataJson<TwelveDataSymbolSearchResponse>({
    context: "symbol search",
    url: buildTwelveDataUrl("symbol_search", {
      apikey: args.apiKey,
      symbol: args.symbol,
    }),
  });
  if ("error" in result) {
    return { error: result.error };
  }

  const payload = result.payload;
  const providerError = getTwelveDataError(payload);
  if (providerError !== null) {
    return { error: `Twelve Data symbol search failed: ${providerError}` };
  }

  const candidate = selectBestSymbolCandidate(
    payload.data ?? [],
    args.assetType,
    args.symbol,
  );

  if (!candidate?.symbol) {
    return {
      error: `No Twelve Data symbol match found for ${args.assetType} ${args.symbol}`,
    };
  }

  return { providerSymbol: candidate.symbol };
}

function getEasternDateString(now: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/New_York",
    year: "numeric",
  }).formatToParts(new Date(now));
  const partByType = new Map(parts.map((part) => [part.type, part.value]));
  return `${partByType.get("year")}-${partByType.get("month")}-${partByType.get("day")}`;
}

function getUtcDateString(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getSignedPositionQuantity(trade: Doc<"trades">): number {
  const openingSide = trade.direction === "long" ? "buy" : "sell";
  return trade.side === openingSide ? trade.quantity : -trade.quantity;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown market data refresh error";
}

function formatSourceTradeContext(sourceTradeIds: Id<"trades">[]): string {
  if (sourceTradeIds.length === 0) {
    return "";
  }
  return ` Source trade IDs: ${sourceTradeIds.join(", ")}`;
}

function assertIsoDateStringInEastern(
  value: string,
  paramName: "endDate" | "startDate",
): void {
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDatePattern.test(value)) {
    throw new ConvexError(`${paramName} must use YYYY-MM-DD format`);
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0);
  const parsedDate = new Date(utcNoon);
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/New_York",
    year: "numeric",
  }).formatToParts(parsedDate);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));
  const canonical = `${partByType.get("year")}-${partByType.get("month")}-${partByType.get("day")}`;

  if (canonical !== value) {
    throw new ConvexError(
      `${paramName} must be a valid calendar date in YYYY-MM-DD format`,
    );
  }
}

function formatFailedSymbolsForRun(
  failedSymbols: HistoricalBackfillFailedSymbol[],
): string {
  return failedSymbols
    .map(
      (failed) =>
        `${failed.symbol}${formatSourceTradeContext(failed.sourceTradeIds)}`,
    )
    .join(", ");
}

async function upsertMarketPriceSnapshots(
  ctx: MutationCtx,
  snapshots: PriceSnapshotWrite[],
  fetchedAt: number,
): Promise<void> {
  for (const snapshot of snapshots) {
    const existing = await ctx.db
      .query("marketPriceSnapshots")
      .withIndex("by_provider_and_providerSymbol_and_date", (q) =>
        q
          .eq("provider", snapshot.provider)
          .eq("providerSymbol", snapshot.providerSymbol)
          .eq("date", snapshot.date),
      )
      .unique();

    const snapshotDoc = {
      ...(snapshot.close !== undefined ? { close: snapshot.close } : {}),
      date: snapshot.date,
      ...(snapshot.errorMessage !== undefined
        ? { errorMessage: snapshot.errorMessage }
        : {}),
      fetchedAt,
      provider: snapshot.provider,
      providerSymbol: snapshot.providerSymbol,
      status: snapshot.status,
    };

    if (existing === null) {
      await ctx.db.insert("marketPriceSnapshots", snapshotDoc);
    } else {
      await ctx.db.replace(existing._id, snapshotDoc);
    }
  }
}

async function fetchDailyCloseForInstrument(args: {
  apiKey: string;
  date?: string;
  instrument: Doc<"marketDataInstruments">;
}): Promise<DailyCloseResult> {
  if (
    args.instrument.resolutionStatus !== "resolved" ||
    !args.instrument.providerSymbol
  ) {
    throw new ConvexError("Market data instrument is not resolved");
  }

  const params: Record<string, string> = {
    apikey: args.apiKey,
    interval: "1day",
    outputsize: "1",
    symbol: args.instrument.providerSymbol,
  };
  if (args.date) {
    params.end_date = args.date;
    params.start_date = args.date;
  }

  const result = await fetchTwelveDataJson<TwelveDataTimeSeriesResponse>({
    context: "time series",
    url: buildTwelveDataUrl("time_series", params),
  });
  if ("error" in result) {
    throw new ConvexError(result.error);
  }

  const payload = result.payload;
  const providerError = getTwelveDataError(payload);
  if (providerError !== null) {
    throw new ConvexError(`Twelve Data time series failed: ${providerError}`);
  }

  const value = payload.values?.[0];
  const close = Number(value?.close);
  if (!value?.datetime || !Number.isFinite(close)) {
    throw new DailyCloseMissingError(
      `No daily close returned for ${args.instrument.providerSymbol}`,
    );
  }

  return {
    close,
    date: value.datetime,
    provider: MARKET_DATA_PROVIDER,
    providerSymbol: args.instrument.providerSymbol,
  };
}

async function fetchHistoricalDailyClosesForInstrument(args: {
  apiKey: string;
  endDate: string;
  instrument: Doc<"marketDataInstruments">;
  startDate: string;
}): Promise<HistoricalCloseResult[]> {
  if (
    args.instrument.resolutionStatus !== "resolved" ||
    !args.instrument.providerSymbol
  ) {
    throw new ConvexError("Market data instrument is not resolved");
  }
  const providerSymbol = args.instrument.providerSymbol;
  const closeByDate = new Map<string, HistoricalCloseResult>();
  let oldestCoveredDate: string | null = null;
  let requestEndDate = args.endDate;

  while (oldestCoveredDate === null || oldestCoveredDate > args.startDate) {
    const result = await fetchTwelveDataJson<TwelveDataTimeSeriesResponse>({
      context: "historical time series",
      url: buildTwelveDataUrl("time_series", {
        apikey: args.apiKey,
        end_date: requestEndDate,
        interval: "1day",
        outputsize: String(HISTORICAL_PRICE_OUTPUT_SIZE),
        start_date: args.startDate,
        symbol: providerSymbol,
      }),
    });
    if ("error" in result) {
      throw new ConvexError(result.error);
    }

    const payload = result.payload;
    const providerError = getTwelveDataError(payload);
    if (providerError !== null) {
      throw new ConvexError(
        `Twelve Data historical time series failed: ${providerError}`,
      );
    }

    const closes =
      payload.values
        ?.map((value) => ({
          close: Number(value.close),
          date: value.datetime,
        }))
        .filter(
          (value): value is { close: number; date: string } =>
            typeof value.date === "string" && Number.isFinite(value.close),
        )
        .map((value) => ({
          close: value.close,
          date: value.date,
          provider: MARKET_DATA_PROVIDER as typeof MARKET_DATA_PROVIDER,
          providerSymbol,
        })) ?? [];

    if (closes.length === 0) {
      break;
    }

    let windowEarliestDate = closes[0].date;
    for (const close of closes) {
      closeByDate.set(close.date, close);
      if (close.date < windowEarliestDate) {
        windowEarliestDate = close.date;
      }
    }

    if (oldestCoveredDate !== null && windowEarliestDate >= oldestCoveredDate) {
      break;
    }

    oldestCoveredDate = windowEarliestDate;
    if (oldestCoveredDate <= args.startDate) {
      break;
    }

    const previousDay = new Date(`${oldestCoveredDate}T00:00:00Z`);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    requestEndDate = previousDay.toISOString().slice(0, 10);
  }

  if (closeByDate.size === 0) {
    throw new DailyCloseMissingError(
      `No historical daily closes returned for ${providerSymbol}`,
    );
  }

  const startDateDay = new Date(`${args.startDate}T00:00:00Z`).getUTCDay();
  const startDateIsWeekend = startDateDay === 0 || startDateDay === 6;
  const hasCoveredDateOnOrAfterStart = [...closeByDate.keys()].some(
    (date) => date >= args.startDate,
  );
  const isTruncated =
    oldestCoveredDate === null ||
    (oldestCoveredDate > args.startDate &&
      !startDateIsWeekend &&
      !hasCoveredDateOnOrAfterStart);
  if (isTruncated) {
    throw new DailyCloseMissingError(
      `Historical daily closes are truncated for ${providerSymbol}: earliest returned date ${oldestCoveredDate ?? "none"} is after requested start date ${args.startDate}`,
    );
  }

  return [...closeByDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export const getInstrumentBySymbol = query({
  args: {
    assetType: assetTypeValidator,
    ticker: v.string(),
  },
  returns: v.union(marketDataInstrumentValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    return await getMarketDataInstrumentBySymbol(
      ctx,
      ownerId,
      args.assetType,
      args.ticker,
    );
  },
});

export const getInstrumentById = internalQuery({
  args: {
    instrumentId: v.id("marketDataInstruments"),
    ownerId: v.string(),
  },
  returns: v.union(marketDataInstrumentValidator, v.null()),
  handler: async (ctx, args) => {
    const instrument = await ctx.db.get(args.instrumentId);
    if (instrument === null || instrument.ownerId !== args.ownerId) {
      return null;
    }
    return instrument;
  },
});

export const getInstrumentBySymbolInternal = internalQuery({
  args: {
    assetType: assetTypeValidator,
    ownerId: v.string(),
    ticker: v.string(),
  },
  returns: v.union(marketDataInstrumentValidator, v.null()),
  handler: async (ctx, args) => {
    return await getMarketDataInstrumentBySymbol(
      ctx,
      args.ownerId,
      args.assetType,
      args.ticker,
    );
  },
});

export const ensureNeedsReviewInstrument = internalMutation({
  args: {
    assetType: assetTypeValidator,
    lastError: v.optional(v.string()),
    ownerId: v.string(),
    ticker: v.string(),
  },
  returns: v.union(marketDataInstrumentValidator, v.null()),
  handler: async (ctx, args) => {
    return await ensureMarketDataInstrumentReviewRecord(
      ctx,
      args.ownerId,
      args.assetType,
      args.ticker,
      args.lastError,
    );
  },
});

export const getPortfolioValuationUniverse = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      instruments: v.array(marketDataInstrumentValidator),
      ownerId: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const positionQuantities = new Map<
      string,
      {
        assetType: MarketDataAssetType;
        ownerId: string;
        quantity: number;
        symbol: string;
      }
    >();

    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page = await ctx.db
        .query("trades")
        .order("desc")
        .paginate({
          cursor,
          numItems: PORTFOLIO_TRADE_SCAN_PAGE_SIZE,
        });
      cursor = page.continueCursor;
      isDone = page.isDone;

      for (const trade of page.page) {
        if (trade.portfolioId === undefined) {
          continue;
        }

        const symbol = normalizeMarketDataSymbol(trade.ticker);
        if (!symbol) {
          continue;
        }

        const key = `${trade.ownerId}:${trade.assetType}:${symbol}`;
        const current = positionQuantities.get(key);
        positionQuantities.set(key, {
          assetType: trade.assetType,
          ownerId: trade.ownerId,
          quantity: (current?.quantity ?? 0) + getSignedPositionQuantity(trade),
          symbol,
        });
      }
    }

    const instrumentsByOwner = new Map<
      string,
      Map<Doc<"marketDataInstruments">["_id"], Doc<"marketDataInstruments">>
    >();

    for (const position of positionQuantities.values()) {
      if (Math.abs(position.quantity) <= POSITION_EPSILON) {
        continue;
      }

      const instrument = await getMarketDataInstrumentBySymbol(
        ctx,
        position.ownerId,
        position.assetType,
        position.symbol,
      );
      if (
        instrument === null ||
        instrument.resolutionStatus !== "resolved" ||
        !instrument.providerSymbol
      ) {
        continue;
      }

      const ownerInstruments =
        instrumentsByOwner.get(position.ownerId) ??
        new Map<
          Doc<"marketDataInstruments">["_id"],
          Doc<"marketDataInstruments">
        >();
      ownerInstruments.set(instrument._id, instrument);
      instrumentsByOwner.set(position.ownerId, ownerInstruments);
    }

    return [...instrumentsByOwner.entries()].map(([ownerId, instruments]) => ({
      instruments: [...instruments.values()].sort((a, b) =>
        a.symbol.localeCompare(b.symbol),
      ),
      ownerId,
    }));
  },
});

export const getHistoricalBackfillUniverse = internalQuery({
  args: {
    ownerId: v.string(),
  },
  returns: v.object({
    candidates: v.array(
      v.object({
        assetType: assetTypeValidator,
        sourceTradeIds: v.array(v.id("trades")),
        symbol: v.string(),
      }),
    ),
    startDate: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<HistoricalBackfillUniverse> => {
    const candidateByKey = new Map<string, HistoricalBackfillCandidate>();
    let earliestTradeDate: number | null = null;

    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page = await ctx.db
        .query("trades")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", args.ownerId))
        .order("asc")
        .paginate({
          cursor,
          numItems: PORTFOLIO_TRADE_SCAN_PAGE_SIZE,
        });
      cursor = page.continueCursor;
      isDone = page.isDone;

      for (const trade of page.page) {
        if (trade.portfolioId === undefined) {
          continue;
        }

        const symbol = normalizeMarketDataSymbol(trade.ticker);
        if (!symbol) {
          continue;
        }

        earliestTradeDate =
          earliestTradeDate === null
            ? trade.date
            : Math.min(earliestTradeDate, trade.date);
        const candidateKey = `${trade.assetType}:${symbol}`;
        const existingCandidate = candidateByKey.get(candidateKey);
        if (existingCandidate === undefined) {
          candidateByKey.set(candidateKey, {
            assetType: trade.assetType,
            sourceTradeIds: [trade._id],
            symbol,
          });
        } else {
          existingCandidate.sourceTradeIds.push(trade._id);
        }
      }
    }

    if (earliestTradeDate !== null) {
      for (const benchmark of BENCHMARK_INSTRUMENTS) {
        const key = `${benchmark.assetType}:${benchmark.symbol}`;
        if (!candidateByKey.has(key)) {
          candidateByKey.set(key, {
            assetType: benchmark.assetType,
            sourceTradeIds: [],
            symbol: benchmark.symbol,
          });
        }
      }
    }

    return {
      candidates: [...candidateByKey.values()].sort((a, b) =>
        a.symbol.localeCompare(b.symbol),
      ),
      startDate:
        earliestTradeDate === null ? null : getUtcDateString(earliestTradeDate),
    };
  },
});

export const startMarketDataRefreshRun = internalMutation({
  args: {
    ownerId: v.string(),
    runDate: v.string(),
    symbolsRequested: v.number(),
  },
  returns: v.id("marketDataRefreshRuns"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("marketDataRefreshRuns", {
      ownerId: args.ownerId,
      provider: MARKET_DATA_PROVIDER,
      runDate: args.runDate,
      startedAt: Date.now(),
      status: "running",
      symbolsFailed: 0,
      symbolsRequested: args.symbolsRequested,
      symbolsSucceeded: 0,
    });
  },
});

export const completeMarketDataRefreshRun = internalMutation({
  args: {
    errorMessage: v.optional(v.string()),
    runId: v.id("marketDataRefreshRuns"),
    snapshots: v.array(
      v.object({
        close: v.optional(v.number()),
        date: v.string(),
        errorMessage: v.optional(v.string()),
        provider: v.literal("twelve_data"),
        providerSymbol: v.string(),
        status: v.union(
          v.literal("ok"),
          v.literal("missing"),
          v.literal("error"),
        ),
      }),
    ),
    symbolsFailed: v.number(),
    symbolsSucceeded: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fetchedAt = Date.now();
    await upsertMarketPriceSnapshots(ctx, args.snapshots, fetchedAt);

    await ctx.db.patch(args.runId, {
      completedAt: fetchedAt,
      errorMessage: args.errorMessage,
      status:
        args.symbolsFailed === 0
          ? "completed"
          : args.symbolsSucceeded === 0
            ? "failed"
            : "partial",
      symbolsFailed: args.symbolsFailed,
      symbolsSucceeded: args.symbolsSucceeded,
    });

    return null;
  },
});

export const appendMarketDataRefreshRunSnapshots = internalMutation({
  args: {
    snapshots: v.array(
      v.object({
        close: v.optional(v.number()),
        date: v.string(),
        errorMessage: v.optional(v.string()),
        provider: v.literal("twelve_data"),
        providerSymbol: v.string(),
        status: v.union(
          v.literal("ok"),
          v.literal("missing"),
          v.literal("error"),
        ),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fetchedAt = Date.now();
    await upsertMarketPriceSnapshots(ctx, args.snapshots, fetchedAt);

    return null;
  },
});

export const storeResolutionResult = internalMutation({
  args: {
    assetType: assetTypeValidator,
    lastError: v.optional(v.string()),
    ownerId: v.string(),
    providerSymbol: v.optional(v.string()),
    resolutionStatus: v.union(v.literal("resolved"), v.literal("needs_review")),
    ticker: v.string(),
  },
  returns: marketDataInstrumentValidator,
  handler: async (ctx, args): Promise<Doc<"marketDataInstruments">> => {
    const symbol = normalizeMarketDataSymbol(args.ticker);
    if (!symbol) {
      throw new ConvexError("Ticker is required");
    }
    if (args.resolutionStatus === "resolved" && !args.providerSymbol) {
      throw new ConvexError(
        "Provider symbol is required for resolved instruments",
      );
    }

    const now = Date.now();
    const existing = await getMarketDataInstrumentBySymbol(
      ctx,
      args.ownerId,
      args.assetType,
      symbol,
    );
    const patch = {
      lastError:
        args.resolutionStatus === "needs_review" ? args.lastError : undefined,
      lastResolvedAt:
        args.resolutionStatus === "resolved" ? now : existing?.lastResolvedAt,
      providerSymbol:
        args.resolutionStatus === "resolved" ? args.providerSymbol : undefined,
      resolutionStatus: args.resolutionStatus,
      updatedAt: now,
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, patch);
      const updated = await ctx.db.get(existing._id);
      if (updated === null) {
        throw new ConvexError("Market data instrument not found after update");
      }
      return updated;
    }

    const instrumentId = await ctx.db.insert("marketDataInstruments", {
      assetType: args.assetType,
      createdAt: now,
      lastError: patch.lastError,
      lastResolvedAt: patch.lastResolvedAt,
      ownerId: args.ownerId,
      provider: MARKET_DATA_PROVIDER,
      providerSymbol: patch.providerSymbol,
      resolutionStatus: args.resolutionStatus,
      symbol,
      updatedAt: now,
    });
    const inserted = await ctx.db.get(instrumentId);
    if (inserted === null) {
      throw new ConvexError("Market data instrument not found after insert");
    }
    return inserted;
  },
});

export async function resolveInstrumentForOwner(
  ctx: ActionCtx,
  ownerId: string,
  args: { assetType: MarketDataAssetType; ticker: string },
): Promise<ResolutionResult> {
  const symbol = normalizeMarketDataSymbol(args.ticker);
  if (!symbol) {
    throw new ConvexError("Ticker is required");
  }

  const existing: Doc<"marketDataInstruments"> | null = await ctx.runQuery(
    internal.marketData.getInstrumentBySymbolInternal,
    {
      assetType: args.assetType,
      ownerId,
      ticker: symbol,
    },
  );
  if (
    existing !== null &&
    (existing.resolutionStatus === "resolved" ||
      existing.resolutionStatus === "ignored")
  ) {
    return {
      instrument: existing,
      status: existing.resolutionStatus,
    };
  }

  const resolution = await resolveProviderSymbol({
    apiKey: requireTwelveDataApiKey(),
    assetType: args.assetType,
    symbol,
  });

  const instrument: Doc<"marketDataInstruments"> = await ctx.runMutation(
    internal.marketData.storeResolutionResult,
    "providerSymbol" in resolution
      ? {
          assetType: args.assetType,
          ownerId,
          providerSymbol: resolution.providerSymbol,
          resolutionStatus: "resolved",
          ticker: symbol,
        }
      : {
          assetType: args.assetType,
          lastError: resolution.error,
          ownerId,
          resolutionStatus: "needs_review",
          ticker: symbol,
        },
  );

  return {
    instrument,
    status: instrument.resolutionStatus,
  };
}

export const resolveInstrument = action({
  args: {
    assetType: assetTypeValidator,
    ticker: v.string(),
  },
  returns: resolutionResultValidator,
  handler: async (ctx, args): Promise<ResolutionResult> => {
    const ownerId = await requireUser(ctx);
    return await resolveInstrumentForOwner(ctx, ownerId, args);
  },
});

export const resolveInstrumentInternal = internalAction({
  args: {
    assetType: assetTypeValidator,
    ownerId: v.string(),
    ticker: v.string(),
  },
  returns: resolutionResultValidator,
  handler: async (ctx, args): Promise<ResolutionResult> => {
    return await resolveInstrumentForOwner(ctx, args.ownerId, {
      assetType: args.assetType,
      ticker: args.ticker,
    });
  },
});

export const setProviderSymbol = action({
  args: {
    instrumentId: v.id("marketDataInstruments"),
    providerSymbol: v.string(),
  },
  returns: marketDataInstrumentValidator,
  handler: async (ctx, args): Promise<Doc<"marketDataInstruments">> => {
    const ownerId = await requireUser(ctx);
    const existing: Doc<"marketDataInstruments"> = assertOwner(
      await ctx.runQuery(internal.marketData.getInstrumentById, {
        instrumentId: args.instrumentId,
        ownerId,
      }),
      ownerId,
      "Market data instrument not found",
    );
    const trimmedProviderSymbol = args.providerSymbol.trim();
    if (!trimmedProviderSymbol) {
      throw new ConvexError("Provider symbol is required");
    }

    const validation = await fetchTwelveDataJson<TwelveDataTimeSeriesResponse>({
      context: "time series",
      url: buildTwelveDataUrl("time_series", {
        apikey: requireTwelveDataApiKey(),
        interval: "1day",
        outputsize: "1",
        symbol: trimmedProviderSymbol,
      }),
    });
    if ("error" in validation) {
      throw new ConvexError(validation.error);
    }
    const providerError = getTwelveDataError(validation.payload);
    if (providerError !== null) {
      const now = Date.now();
      await ctx.runMutation(internal.marketData.setProviderSymbolInternal, {
        instrumentId: existing._id,
        lastError: `Twelve Data time series failed: ${providerError}`,
        lastResolvedAt: existing.lastResolvedAt,
        providerSymbol: existing.providerSymbol,
        resolutionStatus: "needs_review",
        updatedAt: now,
      });
      throw new ConvexError(
        `Provider symbol ${trimmedProviderSymbol} could not be validated: ${providerError}`,
      );
    }

    const now = Date.now();
    await ctx.runMutation(internal.marketData.setProviderSymbolInternal, {
      instrumentId: existing._id,
      lastError: undefined,
      lastResolvedAt: now,
      providerSymbol: trimmedProviderSymbol,
      resolutionStatus: "resolved",
      updatedAt: now,
    });

    return assertOwner(
      await ctx.runQuery(internal.marketData.getInstrumentById, {
        instrumentId: existing._id,
        ownerId,
      }),
      ownerId,
      "Market data instrument not found after update",
    );
  },
});

export const setProviderSymbolInternal = internalMutation({
  args: {
    instrumentId: v.id("marketDataInstruments"),
    lastError: v.optional(v.string()),
    lastResolvedAt: v.optional(v.number()),
    providerSymbol: v.optional(v.string()),
    resolutionStatus: v.union(
      v.literal("resolved"),
      v.literal("needs_review"),
      v.literal("ignored"),
    ),
    updatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.instrumentId, {
      lastError: args.lastError,
      lastResolvedAt: args.lastResolvedAt,
      providerSymbol: args.providerSymbol,
      resolutionStatus: args.resolutionStatus,
      updatedAt: args.updatedAt,
    });
    return null;
  },
});

export const fetchDailyClose = action({
  args: {
    date: v.optional(v.string()),
    instrumentId: v.id("marketDataInstruments"),
  },
  returns: v.object({
    close: v.number(),
    date: v.string(),
    provider: v.literal("twelve_data"),
    providerSymbol: v.string(),
  }),
  handler: async (ctx, args): Promise<DailyCloseResult> => {
    const ownerId = await requireUser(ctx);
    const instrument: Doc<"marketDataInstruments"> | null = await ctx.runQuery(
      internal.marketData.getInstrumentById,
      {
        instrumentId: args.instrumentId,
        ownerId,
      },
    );
    const ownedInstrument: Doc<"marketDataInstruments"> = assertOwner(
      instrument,
      ownerId,
      "Market data instrument not found",
    );

    return await fetchDailyCloseForInstrument({
      apiKey: requireTwelveDataApiKey(),
      date: args.date,
      instrument: ownedInstrument,
    });
  },
});

export const refreshDailyPriceSnapshots = internalAction({
  args: {
    date: v.optional(v.string()),
  },
  returns: v.object({
    ownersProcessed: v.number(),
    runDate: v.string(),
    symbolsFailed: v.number(),
    symbolsRequested: v.number(),
    symbolsSucceeded: v.number(),
  }),
  handler: async (ctx, args) => {
    const runDate = args.date ?? getEasternDateString(Date.now());
    const ownerUniverses: Array<{
      instruments: Doc<"marketDataInstruments">[];
      ownerId: string;
    }> = await ctx.runQuery(
      internal.marketData.getPortfolioValuationUniverse,
      {},
    );

    let symbolsRequested = 0;
    let symbolsSucceeded = 0;
    let symbolsFailed = 0;

    for (const ownerUniverse of ownerUniverses) {
      const runId = await ctx.runMutation(
        internal.marketData.startMarketDataRefreshRun,
        {
          ownerId: ownerUniverse.ownerId,
          runDate,
          symbolsRequested: ownerUniverse.instruments.length,
        },
      );

      const snapshots: PriceSnapshotWrite[] = [];

      for (const instrument of ownerUniverse.instruments) {
        try {
          const close = await fetchDailyCloseForInstrument({
            apiKey: requireTwelveDataApiKey(),
            date: runDate,
            instrument,
          });
          snapshots.push({
            close: close.close,
            date: close.date,
            provider: close.provider,
            providerSymbol: close.providerSymbol,
            status: "ok",
          });
          symbolsSucceeded += 1;
        } catch (error) {
          const isMissing = error instanceof DailyCloseMissingError;
          snapshots.push({
            date: runDate,
            errorMessage: getErrorMessage(error),
            provider: MARKET_DATA_PROVIDER,
            providerSymbol: instrument.providerSymbol ?? instrument.symbol,
            status: isMissing ? "missing" : "error",
          });
          symbolsFailed += 1;
        }
      }

      symbolsRequested += ownerUniverse.instruments.length;
      await ctx.runMutation(internal.marketData.completeMarketDataRefreshRun, {
        runId,
        snapshots,
        symbolsFailed: snapshots.filter((snapshot) => snapshot.status !== "ok")
          .length,
        symbolsSucceeded: snapshots.filter(
          (snapshot) => snapshot.status === "ok",
        ).length,
      });
    }

    return {
      ownersProcessed: ownerUniverses.length,
      runDate,
      symbolsFailed,
      symbolsRequested,
      symbolsSucceeded,
    };
  },
});

export const backfillHistoricalPriceSnapshots = action({
  args: {
    endDate: v.optional(v.string()),
    startDate: v.optional(v.string()),
  },
  returns: v.object({
    endDate: v.string(),
    failedSymbols: v.array(
      v.object({
        assetType: assetTypeValidator,
        errorMessage: v.string(),
        sourceTradeIds: v.array(v.id("trades")),
        symbol: v.string(),
      }),
    ),
    snapshotsWritten: v.number(),
    startDate: v.union(v.string(), v.null()),
    symbolsFailed: v.number(),
    symbolsRequested: v.number(),
    symbolsSucceeded: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const endDate = args.endDate ?? getEasternDateString(Date.now());
    assertIsoDateStringInEastern(endDate, "endDate");
    const universe: HistoricalBackfillUniverse = await ctx.runQuery(
      internal.marketData.getHistoricalBackfillUniverse,
      { ownerId },
    );
    const startDate = args.startDate ?? universe.startDate;

    if (startDate === null || universe.candidates.length === 0) {
      return {
        endDate,
        failedSymbols: [],
        snapshotsWritten: 0,
        startDate,
        symbolsFailed: 0,
        symbolsRequested: 0,
        symbolsSucceeded: 0,
      };
    }
    assertIsoDateStringInEastern(startDate, "startDate");
    if (startDate > endDate) {
      throw new ConvexError("startDate must be on or before endDate");
    }

    const runId = await ctx.runMutation(
      internal.marketData.startMarketDataRefreshRun,
      {
        ownerId,
        runDate: `${startDate}:${endDate}`,
        symbolsRequested: universe.candidates.length,
      },
    );

    const failedSymbols: HistoricalBackfillFailedSymbol[] = [];
    const snapshotBatch: PriceSnapshotWrite[] = [];
    let snapshotsWritten = 0;
    let symbolsSucceeded = 0;
    let runCompleted = false;

    const flushSnapshotBatch = async () => {
      if (snapshotBatch.length === 0) {
        return;
      }
      await ctx.runMutation(internal.marketData.appendMarketDataRefreshRunSnapshots, {
        snapshots: snapshotBatch,
      });
      snapshotsWritten += snapshotBatch.length;
      snapshotBatch.length = 0;
    };

    try {
      for (const candidate of universe.candidates) {
        try {
          const resolution = await resolveInstrumentForOwner(ctx, ownerId, {
            assetType: candidate.assetType,
            ticker: candidate.symbol,
          });
          if (
            resolution.status !== "resolved" ||
            !resolution.instrument.providerSymbol
          ) {
            const errorMessage =
              resolution.instrument.lastError ??
              `Market data instrument ${candidate.symbol} is not resolved`;
            failedSymbols.push({
              assetType: candidate.assetType,
              errorMessage: `${errorMessage}${formatSourceTradeContext(candidate.sourceTradeIds)}`,
              sourceTradeIds: candidate.sourceTradeIds,
              symbol: candidate.symbol,
            });
            continue;
          }

          const closes = await fetchHistoricalDailyClosesForInstrument({
            apiKey: requireTwelveDataApiKey(),
            endDate,
            instrument: resolution.instrument,
            startDate,
          });
          for (const close of closes) {
            snapshotBatch.push({
              close: close.close,
              date: close.date,
              provider: close.provider,
              providerSymbol: close.providerSymbol,
              status: "ok",
            });
            if (snapshotBatch.length >= HISTORICAL_PRICE_BATCH_SIZE) {
              await flushSnapshotBatch();
            }
          }
          symbolsSucceeded += 1;
        } catch (error) {
          failedSymbols.push({
            assetType: candidate.assetType,
            errorMessage: `${getErrorMessage(error)}${formatSourceTradeContext(candidate.sourceTradeIds)}`,
            sourceTradeIds: candidate.sourceTradeIds,
            symbol: candidate.symbol,
          });
        }
      }

      await flushSnapshotBatch();
      await ctx.runMutation(internal.marketData.completeMarketDataRefreshRun, {
        errorMessage:
          failedSymbols.length > 0
            ? `Historical backfill failed for ${formatFailedSymbolsForRun(failedSymbols)}`
            : undefined,
        runId,
        snapshots: [],
        symbolsFailed: failedSymbols.length,
        symbolsSucceeded,
      });
      runCompleted = true;
    } catch (error) {
      if (!runCompleted) {
        const fatalMessage = getErrorMessage(error);
        const failedSymbolsMessage = formatFailedSymbolsForRun(failedSymbols);
        await ctx.runMutation(internal.marketData.completeMarketDataRefreshRun, {
          errorMessage:
            failedSymbolsMessage.length > 0
              ? `Historical backfill aborted: ${fatalMessage}. Failed symbols: ${failedSymbolsMessage}`
              : `Historical backfill aborted: ${fatalMessage}`,
          runId,
          snapshots: [],
          symbolsFailed: failedSymbols.length,
          symbolsSucceeded,
        });
      }
      throw error;
    }

    return {
      endDate,
      failedSymbols,
      snapshotsWritten,
      startDate,
      symbolsFailed: failedSymbols.length,
      symbolsRequested: universe.candidates.length,
      symbolsSucceeded,
    };
  },
});
