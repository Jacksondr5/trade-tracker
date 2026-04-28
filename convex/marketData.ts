import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
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

function scoreSymbolCandidate(
  row: TwelveDataSymbolSearchRow,
  assetType: MarketDataAssetType,
  symbol: string,
): number {
  const providerSymbol = row.symbol?.toUpperCase();
  if (!providerSymbol) {
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

  const compactProviderSymbol = providerSymbol.replace(/[^A-Z0-9]/g, "");
  const compactSymbol = symbol.replace(/[^A-Z0-9]/g, "");
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
  const response = await fetch(
    buildTwelveDataUrl("symbol_search", {
      apikey: args.apiKey,
      symbol: args.symbol,
    }),
  );

  if (!response.ok) {
    return {
      error: `Twelve Data symbol search failed with HTTP ${response.status}`,
    };
  }

  const payload = (await response.json()) as TwelveDataSymbolSearchResponse;
  const providerError = getTwelveDataError(payload);
  if (providerError !== null) {
    return { error: providerError };
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

export const storeResolutionResult = internalMutation({
  args: {
    assetType: assetTypeValidator,
    lastError: v.optional(v.string()),
    ownerId: v.string(),
    providerSymbol: v.optional(v.string()),
    resolutionStatus: v.union(
      v.literal("resolved"),
      v.literal("needs_review"),
    ),
    ticker: v.string(),
  },
  returns: marketDataInstrumentValidator,
  handler: async (ctx, args): Promise<Doc<"marketDataInstruments">> => {
    const symbol = normalizeMarketDataSymbol(args.ticker);
    if (!symbol) {
      throw new ConvexError("Ticker is required");
    }
    if (args.resolutionStatus === "resolved" && !args.providerSymbol) {
      throw new ConvexError("Provider symbol is required for resolved instruments");
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
        args.resolutionStatus === "resolved"
          ? args.providerSymbol
          : existing?.providerSymbol,
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

export const resolveInstrument = action({
  args: {
    assetType: assetTypeValidator,
    ticker: v.string(),
  },
  returns: resolutionResultValidator,
  handler: async (ctx, args): Promise<ResolutionResult> => {
    const ownerId = await requireUser(ctx);
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

    if (
      ownedInstrument.resolutionStatus !== "resolved" ||
      !ownedInstrument.providerSymbol
    ) {
      throw new ConvexError("Market data instrument is not resolved");
    }

    const params: Record<string, string> = {
      apikey: requireTwelveDataApiKey(),
      interval: "1day",
      outputsize: "1",
      symbol: ownedInstrument.providerSymbol,
    };
    if (args.date) {
      params.end_date = args.date;
      params.start_date = args.date;
    }

    const response = await fetch(buildTwelveDataUrl("time_series", params));
    if (!response.ok) {
      throw new ConvexError(
        `Twelve Data time series failed with HTTP ${response.status}`,
      );
    }

    const payload = (await response.json()) as TwelveDataTimeSeriesResponse;
    const providerError = getTwelveDataError(payload);
    if (providerError !== null) {
      throw new ConvexError(providerError);
    }

    const value = payload.values?.[0];
    const close = Number(value?.close);
    if (!value?.datetime || !Number.isFinite(close)) {
      throw new ConvexError(
        `No daily close returned for ${ownedInstrument.providerSymbol}`,
      );
    }

    return {
      close,
      date: value.datetime,
      provider: MARKET_DATA_PROVIDER,
      providerSymbol: ownedInstrument.providerSymbol,
    };
  },
});
