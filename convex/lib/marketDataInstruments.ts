import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type MarketDataAssetType = "crypto" | "stock";
export type MarketDataResolutionStatus =
  | "ignored"
  | "needs_review"
  | "resolved";

const MARKET_DATA_PROVIDER = "twelve_data";

export function normalizeMarketDataSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export async function getMarketDataInstrumentBySymbol(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  assetType: MarketDataAssetType,
  symbol: string,
): Promise<Doc<"marketDataInstruments"> | null> {
  const normalizedSymbol = normalizeMarketDataSymbol(symbol);
  if (!normalizedSymbol) {
    return null;
  }

  return await ctx.db
    .query("marketDataInstruments")
    .withIndex("by_ownerId_and_assetType_and_symbol", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("assetType", assetType)
        .eq("symbol", normalizedSymbol),
    )
    .unique();
}

export async function ensureMarketDataInstrumentReviewRecord(
  ctx: MutationCtx,
  ownerId: string,
  assetType: MarketDataAssetType,
  symbol: string,
  lastError = "Provider symbol has not been resolved yet.",
): Promise<Doc<"marketDataInstruments"> | null> {
  const normalizedSymbol = normalizeMarketDataSymbol(symbol);
  if (!normalizedSymbol) {
    return null;
  }

  const existing = await getMarketDataInstrumentBySymbol(
    ctx,
    ownerId,
    assetType,
    normalizedSymbol,
  );

  if (existing !== null) {
    return existing;
  }

  const now = Date.now();
  const instrumentId = await ctx.db.insert("marketDataInstruments", {
    assetType,
    createdAt: now,
    lastError,
    ownerId,
    provider: MARKET_DATA_PROVIDER,
    resolutionStatus: "needs_review",
    symbol: normalizedSymbol,
    updatedAt: now,
  });

  return await ctx.db.get(instrumentId);
}
