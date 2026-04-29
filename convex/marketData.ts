import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
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
const HISTORICAL_PRICE_OUTPUT_SIZE = 5_000;
const TRADE_SCAN_PAGE_SIZE = 256;
const MAX_SOURCE_TRADE_CONTEXT_IDS = 100;
const MARKET_DATA_WORKER_CREDIT_BUDGET = 8;
const MARKET_DATA_JOB_LEASE_MS = 90_000;
const POSITION_EPSILON = 0.00000001;
const BENCHMARK_INSTRUMENTS: Array<{
  assetType: MarketDataAssetType;
  symbol: string;
}> = [{ assetType: "stock", symbol: "SPY" }];

const assetTypeValidator = v.union(v.literal("crypto"), v.literal("stock"));
const marketDataFetchJobKindValidator = v.union(
  v.literal("daily_snapshot"),
  v.literal("historical_backfill"),
);
const marketDataFetchJobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("leased"),
  v.literal("completed"),
  v.literal("failed"),
);

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

const marketDataFetchJobValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("marketDataFetchJobs"),
  assetType: assetTypeValidator,
  attempts: v.number(),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
  date: v.optional(v.string()),
  endDate: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  estimatedCredits: v.number(),
  kind: marketDataFetchJobKindValidator,
  leasedAt: v.optional(v.number()),
  leaseExpiresAt: v.optional(v.number()),
  ownerId: v.string(),
  provider: v.literal("twelve_data"),
  providerSymbol: v.optional(v.string()),
  runId: v.id("marketDataRefreshRuns"),
  sourceTradeIds: v.array(v.id("trades")),
  startDate: v.optional(v.string()),
  status: marketDataFetchJobStatusValidator,
  symbol: v.string(),
  updatedAt: v.number(),
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
  sourceTradeCount: number;
  sourceTradeIds: Id<"trades">[];
  symbol: string;
};

type MarketDataFetchJobInput = {
  assetType: MarketDataAssetType;
  date?: string;
  endDate?: string;
  estimatedCredits: number;
  kind: "daily_snapshot" | "historical_backfill";
  providerSymbol?: string;
  sourceTradeIds: Id<"trades">[];
  startDate?: string;
  symbol: string;
};

type HistoricalBackfillUniverse = {
  candidates: HistoricalBackfillCandidate[];
  startDate: string | null;
};

type HistoricalBackfillEnqueueResult = {
  endDate: string;
  jobsQueued: number;
  runId: Id<"marketDataRefreshRuns"> | null;
  startDate: string | null;
  symbolsRequested: number;
};

type PositionScanTrade = {
  assetType: MarketDataAssetType;
  direction: "long" | "short";
  ownerId: string;
  portfolioId?: Id<"portfolios">;
  quantity: number;
  side: "buy" | "sell";
  ticker: string;
};

type PortfolioValuationUniversePage = {
  continueCursor: string;
  isDone: boolean;
  page: PositionScanTrade[];
};

type HistoricalBackfillUniversePage = {
  continueCursor: string;
  isDone: boolean;
  page: Array<{
    _id: Id<"trades">;
    assetType: MarketDataAssetType;
    date: number;
    ownerId: string;
    portfolioId?: Id<"portfolios">;
    ticker: string;
  }>;
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

function getSignedPositionQuantity(trade: PositionScanTrade): number {
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

async function fetchDailyCloseForProviderSymbol(args: {
  apiKey: string;
  date?: string;
  providerSymbol: string;
}): Promise<DailyCloseResult> {
  const params: Record<string, string> = {
    apikey: args.apiKey,
    interval: "1day",
    outputsize: "1",
    symbol: args.providerSymbol,
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
      `No daily close returned for ${args.providerSymbol}`,
    );
  }

  return {
    close,
    date: value.datetime,
    provider: MARKET_DATA_PROVIDER,
    providerSymbol: args.providerSymbol,
  };
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

  return await fetchDailyCloseForProviderSymbol({
    apiKey: args.apiKey,
    date: args.date,
    providerSymbol: args.instrument.providerSymbol,
  });
}

async function fetchHistoricalDailyClosesForProviderSymbol(args: {
  apiKey: string;
  endDate: string;
  providerSymbol: string;
  startDate: string;
}): Promise<HistoricalCloseResult[]> {
  const result = await fetchTwelveDataJson<TwelveDataTimeSeriesResponse>({
    context: "historical time series",
    url: buildTwelveDataUrl("time_series", {
      apikey: args.apiKey,
      end_date: args.endDate,
      interval: "1day",
      outputsize: String(HISTORICAL_PRICE_OUTPUT_SIZE),
      start_date: args.startDate,
      symbol: args.providerSymbol,
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
        providerSymbol: args.providerSymbol,
      })) ?? [];

  if (closes.length === 0) {
    throw new DailyCloseMissingError(
      `No historical daily closes returned for ${args.providerSymbol}`,
    );
  }

  const oldestCoveredDate = closes.reduce(
    (oldest, close) => (close.date < oldest ? close.date : oldest),
    closes[0].date,
  );
  const startDateDay = new Date(`${args.startDate}T00:00:00Z`).getUTCDay();
  const startDateIsWeekend = startDateDay === 0 || startDateDay === 6;
  const hasCoveredDateOnOrBeforeStart = closes.some(
    (close) => close.date <= args.startDate,
  );
  const isTruncated =
    oldestCoveredDate > args.startDate &&
    !startDateIsWeekend &&
    !hasCoveredDateOnOrBeforeStart;
  if (isTruncated) {
    throw new DailyCloseMissingError(
      `Historical daily closes are truncated for ${args.providerSymbol}: earliest returned date ${oldestCoveredDate} is after requested start date ${args.startDate}`,
    );
  }

  return closes.sort((a, b) => b.date.localeCompare(a.date));
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
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    page: v.array(
      v.object({
        assetType: assetTypeValidator,
        direction: v.union(v.literal("long"), v.literal("short")),
        ownerId: v.string(),
        portfolioId: v.optional(v.id("portfolios")),
        quantity: v.number(),
        side: v.union(v.literal("buy"), v.literal("sell")),
        ticker: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("trades")
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      page: page.page.map((trade) => ({
        assetType: trade.assetType,
        direction: trade.direction,
        ownerId: trade.ownerId,
        portfolioId: trade.portfolioId,
        quantity: trade.quantity,
        side: trade.side,
        ticker: trade.ticker,
      })),
    };
  },
});

export const getPortfolioValuationUniversePaged = internalAction({
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
    let done = false;
    while (!done) {
      const page: PortfolioValuationUniversePage = await ctx.runQuery(
        internal.marketData.getPortfolioValuationUniverse,
        {
          paginationOpts: { cursor, numItems: TRADE_SCAN_PAGE_SIZE },
        },
      );
      cursor = page.continueCursor;
      done = page.isDone;

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

      const instrument: Doc<"marketDataInstruments"> | null =
        await ctx.runQuery(internal.marketData.getInstrumentBySymbolInternal, {
          assetType: position.assetType,
          ownerId: position.ownerId,
          ticker: position.symbol,
        });
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
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    page: v.array(
      v.object({
        _id: v.id("trades"),
        assetType: assetTypeValidator,
        date: v.number(),
        ownerId: v.string(),
        portfolioId: v.optional(v.id("portfolios")),
        ticker: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("trades")
      .withIndex("by_owner_date", (q) => q.eq("ownerId", args.ownerId))
      .order("asc")
      .paginate(args.paginationOpts);

    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      page: page.page.map((trade) => ({
        _id: trade._id,
        assetType: trade.assetType,
        date: trade.date,
        ownerId: trade.ownerId,
        portfolioId: trade.portfolioId,
        ticker: trade.ticker,
      })),
    };
  },
});

export const getHistoricalBackfillUniversePaged = internalAction({
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
    let done = false;
    while (!done) {
      const page: HistoricalBackfillUniversePage = await ctx.runQuery(
        internal.marketData.getHistoricalBackfillUniverse,
        {
          ownerId: args.ownerId,
          paginationOpts: { cursor, numItems: TRADE_SCAN_PAGE_SIZE },
        },
      );
      cursor = page.continueCursor;
      done = page.isDone;

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
            sourceTradeCount: 1,
            sourceTradeIds: [trade._id],
            symbol,
          });
        } else {
          existingCandidate.sourceTradeCount += 1;
          if (
            existingCandidate.sourceTradeIds.length <
            MAX_SOURCE_TRADE_CONTEXT_IDS
          ) {
            existingCandidate.sourceTradeIds.push(trade._id);
          }
        }
      }
    }

    if (earliestTradeDate !== null) {
      for (const benchmark of BENCHMARK_INSTRUMENTS) {
        const key = `${benchmark.assetType}:${benchmark.symbol}`;
        if (!candidateByKey.has(key)) {
          candidateByKey.set(key, {
            assetType: benchmark.assetType,
            sourceTradeCount: 0,
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

export const enqueueMarketDataFetchJobs = internalMutation({
  args: {
    jobs: v.array(
      v.object({
        assetType: assetTypeValidator,
        date: v.optional(v.string()),
        endDate: v.optional(v.string()),
        estimatedCredits: v.number(),
        kind: marketDataFetchJobKindValidator,
        providerSymbol: v.optional(v.string()),
        sourceTradeIds: v.array(v.id("trades")),
        startDate: v.optional(v.string()),
        symbol: v.string(),
      }),
    ),
    ownerId: v.string(),
    runId: v.id("marketDataRefreshRuns"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const job of args.jobs) {
      await ctx.db.insert("marketDataFetchJobs", {
        assetType: job.assetType,
        attempts: 0,
        createdAt: now,
        date: job.date,
        endDate: job.endDate,
        estimatedCredits: job.estimatedCredits,
        kind: job.kind,
        ownerId: args.ownerId,
        provider: MARKET_DATA_PROVIDER,
        providerSymbol: job.providerSymbol,
        runId: args.runId,
        sourceTradeIds: job.sourceTradeIds,
        startDate: job.startDate,
        status: "pending",
        symbol: job.symbol,
        updatedAt: now,
      });
    }
    return args.jobs.length;
  },
});

export const leaseMarketDataFetchJobs = internalMutation({
  args: {
    budgetCredits: v.number(),
  },
  returns: v.array(marketDataFetchJobValidator),
  handler: async (ctx, args) => {
    const now = Date.now();
    const candidateLimit = Math.max(Math.ceil(args.budgetCredits), 1) * 4;
    const expiredLeases = await ctx.db
      .query("marketDataFetchJobs")
      .withIndex("by_status_and_leaseExpiresAt", (q) =>
        q.eq("status", "leased").lt("leaseExpiresAt", now),
      )
      .order("asc")
      .take(candidateLimit);
    const pendingJobs = await ctx.db
      .query("marketDataFetchJobs")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(candidateLimit);
    const candidates = [...expiredLeases, ...pendingJobs];

    const leasedJobs: Doc<"marketDataFetchJobs">[] = [];
    let leasedCredits = 0;
    const leasedIds = new Set<Id<"marketDataFetchJobs">>();
    for (const job of candidates) {
      if (leasedIds.has(job._id)) {
        continue;
      }
      if (leasedCredits + job.estimatedCredits > args.budgetCredits) {
        continue;
      }
      await ctx.db.patch(job._id, {
        attempts: job.attempts + 1,
        leasedAt: now,
        leaseExpiresAt: now + MARKET_DATA_JOB_LEASE_MS,
        status: "leased",
        updatedAt: now,
      });
      const leasedJob = await ctx.db.get(job._id);
      if (leasedJob !== null) {
        leasedJobs.push(leasedJob);
        leasedCredits += job.estimatedCredits;
        leasedIds.add(job._id);
      }
    }

    return leasedJobs;
  },
});

export const completeMarketDataFetchJob = internalMutation({
  args: {
    errorMessage: v.optional(v.string()),
    expectedAttempt: v.number(),
    jobId: v.id("marketDataFetchJobs"),
    resultStatus: v.union(v.literal("succeeded"), v.literal("failed")),
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
    const now = Date.now();
    const job = await ctx.db.get(args.jobId);
    if (job === null) {
      return null;
    }
    const leaseExpiresAt = job.leaseExpiresAt;
    if (
      job.status !== "leased" ||
      job.attempts !== args.expectedAttempt ||
      leaseExpiresAt === undefined ||
      leaseExpiresAt <= now
    ) {
      return null;
    }

    await upsertMarketPriceSnapshots(ctx, args.snapshots, now);
    await ctx.db.patch(job._id, {
      completedAt: now,
      errorMessage: args.errorMessage,
      status: args.resultStatus === "succeeded" ? "completed" : "failed",
      updatedAt: now,
    });

    const run = await ctx.db.get(job.runId);
    if (run !== null) {
      const symbolsSucceeded =
        run.symbolsSucceeded + (args.resultStatus === "succeeded" ? 1 : 0);
      const symbolsFailed =
        run.symbolsFailed + (args.resultStatus === "failed" ? 1 : 0);
      const isRunComplete =
        symbolsSucceeded + symbolsFailed >= run.symbolsRequested;

      await ctx.db.patch(job.runId, {
        completedAt: isRunComplete ? now : run.completedAt,
        errorMessage:
          args.errorMessage !== undefined
            ? run.errorMessage === undefined
              ? args.errorMessage
              : `${run.errorMessage}; ${args.errorMessage}`
            : run.errorMessage,
        status: isRunComplete
          ? symbolsFailed === 0
            ? "completed"
            : symbolsSucceeded === 0
              ? "failed"
              : "partial"
          : run.status,
        symbolsFailed,
        symbolsSucceeded,
      });
    }

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
    jobsQueued: v.number(),
    ownersProcessed: v.number(),
    runDate: v.string(),
    symbolsRequested: v.number(),
  }),
  handler: async (ctx, args) => {
    const runDate = args.date ?? getEasternDateString(Date.now());
    const ownerUniverses: Array<{
      instruments: Doc<"marketDataInstruments">[];
      ownerId: string;
    }> = await ctx.runAction(
      internal.marketData.getPortfolioValuationUniversePaged,
      {},
    );

    let jobsQueued = 0;
    let symbolsRequested = 0;

    for (const ownerUniverse of ownerUniverses) {
      const runId = await ctx.runMutation(
        internal.marketData.startMarketDataRefreshRun,
        {
          ownerId: ownerUniverse.ownerId,
          runDate,
          symbolsRequested: ownerUniverse.instruments.length,
        },
      );

      const jobs: MarketDataFetchJobInput[] = ownerUniverse.instruments.map(
        (instrument) => ({
          assetType: instrument.assetType,
          date: runDate,
          estimatedCredits: 1,
          kind: "daily_snapshot",
          providerSymbol: instrument.providerSymbol,
          sourceTradeIds: [],
          symbol: instrument.symbol,
        }),
      );
      jobsQueued += await ctx.runMutation(
        internal.marketData.enqueueMarketDataFetchJobs,
        {
          jobs,
          ownerId: ownerUniverse.ownerId,
          runId,
        },
      );
      symbolsRequested += ownerUniverse.instruments.length;
    }

    return {
      jobsQueued,
      ownersProcessed: ownerUniverses.length,
      runDate,
      symbolsRequested,
    };
  },
});

export const processMarketDataFetchJobs = internalAction({
  args: {
    budgetCredits: v.optional(v.number()),
  },
  returns: v.object({
    budgetCredits: v.number(),
    creditsUsed: v.number(),
    jobsFailed: v.number(),
    jobsProcessed: v.number(),
    jobsSucceeded: v.number(),
  }),
  handler: async (ctx, args) => {
    const budgetCredits = args.budgetCredits ?? MARKET_DATA_WORKER_CREDIT_BUDGET;
    const jobs: Doc<"marketDataFetchJobs">[] = await ctx.runMutation(
      internal.marketData.leaseMarketDataFetchJobs,
      {
        budgetCredits,
      },
    );
    if (jobs.length === 0) {
      return {
        budgetCredits,
        creditsUsed: 0,
        jobsFailed: 0,
        jobsProcessed: 0,
        jobsSucceeded: 0,
      };
    }

    const apiKey = requireTwelveDataApiKey();
    let jobsSucceeded = 0;
    let jobsFailed = 0;

    for (const job of jobs) {
      try {
        if (job.kind === "daily_snapshot") {
          if (!job.providerSymbol) {
            throw new ConvexError(
              `Market data instrument ${job.symbol} is not resolved`,
            );
          }
          const close = await fetchDailyCloseForProviderSymbol({
            apiKey,
            date: job.date,
            providerSymbol: job.providerSymbol,
          });
          await ctx.runMutation(internal.marketData.completeMarketDataFetchJob, {
            expectedAttempt: job.attempts,
            jobId: job._id,
            resultStatus: "succeeded",
            snapshots: [
              {
                close: close.close,
                date: close.date,
                provider: close.provider,
                providerSymbol: close.providerSymbol,
                status: "ok",
              },
            ],
          });
          jobsSucceeded += 1;
          continue;
        }

        if (!job.startDate || !job.endDate) {
          throw new ConvexError("Historical backfill job is missing date range");
        }
        let providerSymbol = job.providerSymbol;
        if (!providerSymbol) {
          const resolution = await resolveProviderSymbol({
            apiKey,
            assetType: job.assetType,
            symbol: job.symbol,
          });
          if ("error" in resolution) {
            await ctx.runMutation(internal.marketData.storeResolutionResult, {
              assetType: job.assetType,
              lastError: resolution.error,
              ownerId: job.ownerId,
              resolutionStatus: "needs_review",
              ticker: job.symbol,
            });
            throw new ConvexError(resolution.error);
          }
          providerSymbol = resolution.providerSymbol;
          await ctx.runMutation(internal.marketData.storeResolutionResult, {
            assetType: job.assetType,
            ownerId: job.ownerId,
            providerSymbol,
            resolutionStatus: "resolved",
            ticker: job.symbol,
          });
        }

        const closes = await fetchHistoricalDailyClosesForProviderSymbol({
          apiKey,
          endDate: job.endDate,
          providerSymbol,
          startDate: job.startDate,
        });
        await ctx.runMutation(internal.marketData.completeMarketDataFetchJob, {
          expectedAttempt: job.attempts,
          jobId: job._id,
          resultStatus: "succeeded",
          snapshots: closes.map((close) => ({
            close: close.close,
            date: close.date,
            provider: close.provider,
            providerSymbol: close.providerSymbol,
            status: "ok" as const,
          })),
        });
        jobsSucceeded += 1;
      } catch (error) {
        const errorMessage =
          job.kind === "historical_backfill"
            ? `${getErrorMessage(error)}${formatSourceTradeContext(job.sourceTradeIds)}`
            : getErrorMessage(error);
        const snapshots: PriceSnapshotWrite[] =
          job.kind === "daily_snapshot" && job.date !== undefined
            ? [
                {
                  date: job.date,
                  errorMessage,
                  provider: MARKET_DATA_PROVIDER,
                  providerSymbol: job.providerSymbol ?? job.symbol,
                  status:
                    error instanceof DailyCloseMissingError
                      ? "missing"
                      : "error",
                },
              ]
            : [];
        await ctx.runMutation(internal.marketData.completeMarketDataFetchJob, {
          errorMessage,
          expectedAttempt: job.attempts,
          jobId: job._id,
          resultStatus: "failed",
          snapshots,
        });
        jobsFailed += 1;
      }
    }

    return {
      budgetCredits,
      creditsUsed: jobs.reduce((total, job) => total + job.estimatedCredits, 0),
      jobsFailed,
      jobsProcessed: jobs.length,
      jobsSucceeded,
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
    jobsQueued: v.number(),
    runId: v.union(v.id("marketDataRefreshRuns"), v.null()),
    startDate: v.union(v.string(), v.null()),
    symbolsRequested: v.number(),
  }),
  handler: async (ctx, args): Promise<HistoricalBackfillEnqueueResult> => {
    const ownerId = await requireUser(ctx);
    const endDate = args.endDate ?? getEasternDateString(Date.now());
    assertIsoDateStringInEastern(endDate, "endDate");
    const universe: HistoricalBackfillUniverse = await ctx.runAction(
      internal.marketData.getHistoricalBackfillUniversePaged,
      { ownerId },
    );
    const startDate = args.startDate ?? universe.startDate;

    if (startDate === null || universe.candidates.length === 0) {
      return {
        endDate,
        jobsQueued: 0,
        runId: null,
        startDate,
        symbolsRequested: 0,
      };
    }
    assertIsoDateStringInEastern(startDate, "startDate");
    if (startDate > endDate) {
      throw new ConvexError("startDate must be on or before endDate");
    }

    const runId: Id<"marketDataRefreshRuns"> = await ctx.runMutation(
      internal.marketData.startMarketDataRefreshRun,
      {
        ownerId,
        runDate: `${startDate}:${endDate}`,
        symbolsRequested: universe.candidates.length,
      },
    );

    const jobs: MarketDataFetchJobInput[] = [];
    for (const candidate of universe.candidates) {
      const existing: Doc<"marketDataInstruments"> | null =
        await ctx.runQuery(internal.marketData.getInstrumentBySymbolInternal, {
          assetType: candidate.assetType,
          ownerId,
          ticker: candidate.symbol,
        });
      const providerSymbol =
        existing?.resolutionStatus === "resolved"
          ? existing.providerSymbol
          : undefined;
      jobs.push({
        assetType: candidate.assetType,
        endDate,
        estimatedCredits: providerSymbol ? 1 : 2,
        kind: "historical_backfill",
        providerSymbol,
        sourceTradeIds: candidate.sourceTradeIds.slice(
          0,
          MAX_SOURCE_TRADE_CONTEXT_IDS,
        ),
        startDate,
        symbol: candidate.symbol,
      });
    }

    const jobsQueued: number = await ctx.runMutation(
      internal.marketData.enqueueMarketDataFetchJobs,
      {
        jobs,
        ownerId,
        runId,
      },
    );

    return {
      endDate,
      jobsQueued,
      runId,
      startDate,
      symbolsRequested: universe.candidates.length,
    };
  },
});
