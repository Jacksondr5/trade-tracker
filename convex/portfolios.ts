import { mutation, query, type QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";
import { tradeValidator } from "./lib/tradeValidator";
import type { Doc, Id } from "./_generated/dataModel";

const MARKET_DATA_PROVIDER = "twelve_data";
const POSITION_EPSILON = 0.00000001;

const portfolioValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("portfolios"),
  name: v.string(),
  ownerId: v.string(),
});

function validatePortfolioName(name: string): string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new ConvexError("Portfolio name is required");
  }
  if (trimmedName.length > 120) {
    throw new ConvexError("Portfolio name must be 120 characters or fewer");
  }
  return trimmedName;
}

export const createPortfolio = mutation({
  args: {
    name: v.string(),
  },
  returns: v.id("portfolios"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    return await ctx.db.insert("portfolios", {
      name: validatePortfolioName(args.name),
      ownerId,
    });
  },
});

export const listPortfolios = query({
  args: {},
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("portfolios"),
      name: v.string(),
      ownerId: v.string(),
      tradeCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const portfolios = await ctx.db
      .query("portfolios")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();

    const ownerTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    const tradeCountByPortfolioId = new Map<Id<"portfolios">, number>();
    for (const trade of ownerTrades) {
      if (!trade.portfolioId) continue;
      tradeCountByPortfolioId.set(
        trade.portfolioId,
        (tradeCountByPortfolioId.get(trade.portfolioId) ?? 0) + 1,
      );
    }

    return portfolios.map((portfolio) => ({
      ...portfolio,
      tradeCount: tradeCountByPortfolioId.get(portfolio._id) ?? 0,
    }));
  },
});

export const updatePortfolio = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    assertOwner(portfolio, ownerId, "Portfolio not found");

    await ctx.db.patch(args.portfolioId, {
      name: validatePortfolioName(args.name),
    });
    return null;
  },
});

export const deletePortfolio = mutation({
  args: {
    portfolioId: v.id("portfolios"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    assertOwner(portfolio, ownerId, "Portfolio not found");

    // Unlink all trades with this portfolioId
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_owner_portfolioId", (q) =>
        q.eq("ownerId", ownerId).eq("portfolioId", args.portfolioId),
      )
      .collect();

    for (const trade of trades) {
      await ctx.db.patch(trade._id, { portfolioId: undefined });
    }

    const inboxTrades = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_portfolioId", (q) =>
        q.eq("ownerId", ownerId).eq("portfolioId", args.portfolioId),
      )
      .collect();

    for (const inboxTrade of inboxTrades) {
      await ctx.db.patch(inboxTrade._id, { portfolioId: undefined });
    }

    await ctx.db.delete(args.portfolioId);
    return null;
  },
});

const campaignValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("campaigns"),
  name: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("closed"),
    v.literal("planning"),
  ),
  tradeCount: v.number(),
});

export const getPortfolioDetail = query({
  args: {
    portfolioId: v.id("portfolios"),
  },
  returns: v.union(
    v.object({
      campaigns: v.array(campaignValidator),
      portfolio: portfolioValidator,
      trades: v.array(tradeValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    if (!portfolio || portfolio.ownerId !== ownerId) {
      return null;
    }

    // Get all trades with this portfolioId
    const portfolioTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner_portfolioId", (q) =>
        q.eq("ownerId", ownerId).eq("portfolioId", args.portfolioId),
      )
      .collect();
    const sortedTrades = [...portfolioTrades].sort((a, b) => b.date - a.date);

    // Derive campaigns: trades -> trade plans -> campaigns, counting trades per campaign.
    const tradePlanToCampaign = new Map<Id<"tradePlans">, Id<"campaigns"> | null>();
    const campaignTradeCounts = new Map<Id<"campaigns">, number>();
    for (const trade of portfolioTrades) {
      if (!trade.tradePlanId) continue;

      if (!tradePlanToCampaign.has(trade.tradePlanId)) {
        const tradePlan = await ctx.db.get(trade.tradePlanId);
        tradePlanToCampaign.set(trade.tradePlanId, tradePlan?.campaignId ?? null);
      }

      const campaignId = tradePlanToCampaign.get(trade.tradePlanId);
      if (campaignId) {
        campaignTradeCounts.set(
          campaignId,
          (campaignTradeCounts.get(campaignId) ?? 0) + 1,
        );
      }
    }

    const campaigns = [];
    for (const [campaignId, tradeCount] of campaignTradeCounts) {
      const campaign = await ctx.db.get(campaignId);
      if (campaign && campaign.ownerId === ownerId) {
        campaigns.push({
          _creationTime: campaign._creationTime,
          _id: campaign._id,
          name: campaign.name,
          status: campaign.status,
          tradeCount,
        });
      }
    }

    return {
      campaigns,
      portfolio,
      trades: sortedTrades,
    };
  },
});

export const getRecentTrades = query({
  args: {
    limit: v.number(),
    portfolioId: v.id("portfolios"),
  },
  returns: v.union(v.array(tradeValidator), v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    if (!portfolio || portfolio.ownerId !== ownerId) {
      return null;
    }

    const portfolioTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner_portfolioId_date", (q) =>
        q.eq("ownerId", ownerId).eq("portfolioId", args.portfolioId),
      )
      .order("desc")
      .take(Math.max(0, Math.floor(args.limit)));

    return portfolioTrades;
  },
});

// ---------------------------------------------------------------------------
// Portfolio overview (analytics-focused detail page)
// ---------------------------------------------------------------------------

const priceCoverageStatusValidator = v.union(
  v.literal("complete"),
  v.literal("partial"),
  v.literal("missing"),
);

const overviewValuationValidator = v.object({
  cashBalance: v.number(),
  computedAt: v.number(),
  date: v.string(),
  marketValue: v.number(),
  missingSymbols: v.array(v.string()),
  priceCoverageStatus: priceCoverageStatusValidator,
  totalEquity: v.number(),
});

const positionPriceStatusValidator = v.union(
  v.literal("ok"),
  v.literal("needs_mapping"),
  v.literal("awaiting_snapshot"),
  v.literal("no_valuation"),
);

const overviewPositionValidator = v.object({
  assetType: v.union(v.literal("crypto"), v.literal("stock")),
  direction: v.union(v.literal("long"), v.literal("short")),
  hasPrice: v.boolean(),
  marketValue: v.union(v.number(), v.null()),
  priceStatus: positionPriceStatusValidator,
  quantity: v.number(),
  ticker: v.string(),
});

const overviewCampaignExposureValidator = v.object({
  _id: v.id("campaigns"),
  awaitingSnapshotSymbols: v.array(v.string()),
  exposureValue: v.union(v.number(), v.null()),
  name: v.string(),
  needsMappingSymbols: v.array(v.string()),
  openPositionCount: v.number(),
  sharePercent: v.union(v.number(), v.null()),
  status: v.union(
    v.literal("active"),
    v.literal("closed"),
    v.literal("planning"),
  ),
  tickers: v.array(v.string()),
  tradeCount: v.number(),
});

type PositionKey = `${"crypto" | "stock"}:${string}:${"long" | "short"}`;

type AggregatedPosition = {
  assetType: "crypto" | "stock";
  campaignQuantities: Map<Id<"campaigns">, number>;
  direction: "long" | "short";
  quantity: number;
  ticker: string;
  tradeCount: number;
};

function getSignedPositionQuantity(trade: Doc<"trades">): number {
  const openingSide = trade.direction === "long" ? "buy" : "sell";
  return trade.side === openingSide ? trade.quantity : -trade.quantity;
}

type PriceLookup =
  | { close: number; reason: "ok" }
  | { close: null; reason: "needs_mapping" | "awaiting_snapshot" };

async function getCloseForPosition(
  ctx: QueryCtx,
  ownerId: string,
  position: { assetType: "crypto" | "stock"; ticker: string },
  date: string,
): Promise<PriceLookup> {
  const instrument = await ctx.db
    .query("marketDataInstruments")
    .withIndex("by_ownerId_and_assetType_and_symbol", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("assetType", position.assetType)
        .eq("symbol", position.ticker),
    )
    .unique();

  if (
    !instrument ||
    instrument.resolutionStatus !== "resolved" ||
    !instrument.providerSymbol
  ) {
    return { close: null, reason: "needs_mapping" };
  }

  const snapshot = await ctx.db
    .query("marketPriceSnapshots")
    .withIndex("by_provider_and_providerSymbol_and_date", (q) =>
      q
        .eq("provider", MARKET_DATA_PROVIDER)
        .eq("providerSymbol", instrument.providerSymbol!)
        .eq("date", date),
    )
    .unique();

  if (snapshot?.status === "ok" && snapshot.close !== undefined) {
    return { close: snapshot.close, reason: "ok" };
  }

  return { close: null, reason: "awaiting_snapshot" };
}

export const getPortfolioOverview = query({
  args: {
    portfolioId: v.id("portfolios"),
  },
  returns: v.union(
    v.object({
      asOfDate: v.union(v.string(), v.null()),
      awaitingSnapshotSymbols: v.array(v.string()),
      campaignExposure: v.array(overviewCampaignExposureValidator),
      hasOpenPositions: v.boolean(),
      latestValuation: v.union(overviewValuationValidator, v.null()),
      missingSymbols: v.array(v.string()),
      needsMappingSymbols: v.array(v.string()),
      openPositions: v.array(overviewPositionValidator),
      portfolio: portfolioValidator,
      tradeCount: v.number(),
      uncoveredCampaignTradeCount: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    if (!portfolio || portfolio.ownerId !== ownerId) {
      return null;
    }

    const trades = await ctx.db
      .query("trades")
      .withIndex("by_owner_portfolioId", (q) =>
        q.eq("ownerId", ownerId).eq("portfolioId", args.portfolioId),
      )
      .collect();

    // Most recent valuation row (if any)
    const latestValuationRow = await ctx.db
      .query("portfolioDailyValuations")
      .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
        q.eq("ownerId", ownerId).eq("portfolioId", args.portfolioId),
      )
      .order("desc")
      .first();

    const asOfDate = latestValuationRow?.date ?? null;

    // Aggregate open positions and link them through trade plans -> campaigns.
    const tradePlanToCampaign = new Map<
      Id<"tradePlans">,
      Id<"campaigns"> | null
    >();
    const positions = new Map<PositionKey, AggregatedPosition>();

    for (const trade of trades) {
      const key: PositionKey = `${trade.assetType}:${trade.ticker}:${trade.direction}`;
      const existing =
        positions.get(key) ??
        ({
          assetType: trade.assetType,
          campaignQuantities: new Map<Id<"campaigns">, number>(),
          direction: trade.direction,
          quantity: 0,
          ticker: trade.ticker,
          tradeCount: 0,
        } satisfies AggregatedPosition);
      const signedQuantity = getSignedPositionQuantity(trade);
      existing.quantity += signedQuantity;
      existing.tradeCount += 1;

      if (trade.tradePlanId) {
        if (!tradePlanToCampaign.has(trade.tradePlanId)) {
          const tradePlan = await ctx.db.get(trade.tradePlanId);
          tradePlanToCampaign.set(
            trade.tradePlanId,
            tradePlan?.campaignId ?? null,
          );
        }
        const campaignId = tradePlanToCampaign.get(trade.tradePlanId);
        if (campaignId) {
          existing.campaignQuantities.set(
            campaignId,
            (existing.campaignQuantities.get(campaignId) ?? 0) + signedQuantity,
          );
        }
      }

      positions.set(key, existing);
    }

    const openPositions = [...positions.values()].filter(
      (position) => Math.abs(position.quantity) > POSITION_EPSILON,
    );

    // Resolve current price per open position. We use the latest valuation
    // date so the page reflects what the materialized rows already show.
    type PositionPriceStatus =
      | "ok"
      | "needs_mapping"
      | "awaiting_snapshot"
      | "no_valuation";
    const overviewPositions: Array<{
      assetType: "crypto" | "stock";
      campaignQuantities: Map<Id<"campaigns">, number>;
      close: number | null;
      direction: "long" | "short";
      hasPrice: boolean;
      marketValue: number | null;
      priceStatus: PositionPriceStatus;
      quantity: number;
      ticker: string;
    }> = [];
    const missingSymbols = new Set<string>();
    const needsMappingSymbols = new Set<string>();
    const awaitingSnapshotSymbols = new Set<string>();
    let totalMarketValue = 0;
    let totalGrossMarketValue = 0;

    for (const position of openPositions) {
      const lookup: PriceLookup = asOfDate
        ? await getCloseForPosition(
            ctx,
            ownerId,
            { assetType: position.assetType, ticker: position.ticker },
            asOfDate,
          )
        : { close: null, reason: "needs_mapping" };
      const close = lookup.close;
      const priceStatus: PositionPriceStatus =
        asOfDate === null ? "no_valuation" : lookup.reason;
      const positionValue =
        close === null
          ? null
          : (position.direction === "short" ? -1 : 1) *
            position.quantity *
            close;
      if (asOfDate !== null && positionValue === null) {
        missingSymbols.add(position.ticker);
        if (priceStatus === "needs_mapping") {
          needsMappingSymbols.add(position.ticker);
        } else if (priceStatus === "awaiting_snapshot") {
          awaitingSnapshotSymbols.add(position.ticker);
        }
      } else if (positionValue !== null) {
        totalMarketValue += positionValue;
        totalGrossMarketValue += Math.abs(positionValue);
      }
      overviewPositions.push({
        assetType: position.assetType,
        campaignQuantities: position.campaignQuantities,
        close,
        direction: position.direction,
        hasPrice: positionValue !== null,
        marketValue: positionValue,
        priceStatus,
        quantity: position.quantity,
        ticker: position.ticker,
      });
    }

    const sortedPositions = overviewPositions
      .slice()
      .sort((a, b) => {
        const aValue = Math.abs(a.marketValue ?? 0);
        const bValue = Math.abs(b.marketValue ?? 0);
        if (aValue !== bValue) return bValue - aValue;
        return a.ticker.localeCompare(b.ticker);
      });

    // Campaign exposure rollup.
    type ExposureBucket = {
      awaitingSnapshotSymbols: Set<string>;
      campaign: Doc<"campaigns">;
      exposure: number;
      hasUnpricedSlice: boolean;
      needsMappingSymbols: Set<string>;
      openPositionCount: number;
      tickers: Set<string>;
      tradeCount: number;
    };
    const exposureByCampaign = new Map<Id<"campaigns">, ExposureBucket>();
    let uncoveredCampaignTradeCount = 0;

    for (const trade of trades) {
      if (!trade.tradePlanId) continue;
      const campaignId = tradePlanToCampaign.get(trade.tradePlanId) ?? null;
      if (!campaignId) continue;

      let bucket = exposureByCampaign.get(campaignId);
      if (!bucket) {
        const campaign = await ctx.db.get(campaignId);
        if (!campaign || campaign.ownerId !== ownerId) {
          continue;
        }
        bucket = {
          awaitingSnapshotSymbols: new Set<string>(),
          campaign,
          exposure: 0,
          hasUnpricedSlice: false,
          needsMappingSymbols: new Set<string>(),
          openPositionCount: 0,
          tickers: new Set<string>(),
          tradeCount: 0,
        };
        exposureByCampaign.set(campaignId, bucket);
      }
      bucket.tradeCount += 1;
    }

    for (const position of overviewPositions) {
      for (const [campaignId, campaignQuantity] of position.campaignQuantities) {
        if (Math.abs(campaignQuantity) <= POSITION_EPSILON) {
          continue;
        }
        const bucket = exposureByCampaign.get(campaignId);
        if (!bucket) continue;
        bucket.openPositionCount += 1;
        bucket.tickers.add(position.ticker);
        if (position.marketValue === null) {
          bucket.hasUnpricedSlice = true;
          if (position.priceStatus === "needs_mapping") {
            bucket.needsMappingSymbols.add(position.ticker);
          } else if (position.priceStatus === "awaiting_snapshot") {
            bucket.awaitingSnapshotSymbols.add(position.ticker);
          }
        } else {
          const campaignPositionValue =
            (position.direction === "short" ? -1 : 1) *
            campaignQuantity *
            position.close!;
          bucket.exposure += Math.abs(campaignPositionValue);
        }
      }
    }

    // Trades whose campaigns we couldn't link (e.g. trade plan has no campaign).
    for (const trade of trades) {
      if (!trade.tradePlanId) {
        uncoveredCampaignTradeCount += 1;
        continue;
      }
      const campaignId = tradePlanToCampaign.get(trade.tradePlanId) ?? null;
      if (!campaignId || !exposureByCampaign.has(campaignId)) {
        uncoveredCampaignTradeCount += 1;
      }
    }

    const denominator =
      totalGrossMarketValue !== 0
        ? totalGrossMarketValue
        : latestValuationRow !== null && latestValuationRow.marketValue !== 0
          ? Math.abs(latestValuationRow.marketValue)
          : 0;

    const campaignExposure = [...exposureByCampaign.values()]
      .map((bucket) => ({
        _id: bucket.campaign._id,
        awaitingSnapshotSymbols: [...bucket.awaitingSnapshotSymbols].sort(
          (a, b) => a.localeCompare(b),
        ),
        exposureValue: bucket.hasUnpricedSlice ? null : bucket.exposure,
        name: bucket.campaign.name,
        needsMappingSymbols: [...bucket.needsMappingSymbols].sort((a, b) =>
          a.localeCompare(b),
        ),
        openPositionCount: bucket.openPositionCount,
        sharePercent:
          bucket.hasUnpricedSlice || denominator === 0
            ? null
            : bucket.exposure / denominator,
        status: bucket.campaign.status,
        tickers: [...bucket.tickers].sort((a, b) => a.localeCompare(b)),
        tradeCount: bucket.tradeCount,
      }))
      .sort((a, b) => {
        const aShare = a.sharePercent ?? -1;
        const bShare = b.sharePercent ?? -1;
        if (aShare !== bShare) return bShare - aShare;
        return a.name.localeCompare(b.name);
      });

    const latestValuation = latestValuationRow
      ? {
          cashBalance: latestValuationRow.cashBalance,
          computedAt: latestValuationRow.computedAt,
          date: latestValuationRow.date,
          marketValue: latestValuationRow.marketValue,
          missingSymbols: latestValuationRow.missingSymbols,
          priceCoverageStatus: latestValuationRow.priceCoverageStatus,
          totalEquity: latestValuationRow.totalEquity,
        }
      : null;

    return {
      asOfDate,
      awaitingSnapshotSymbols: [...awaitingSnapshotSymbols].sort((a, b) =>
        a.localeCompare(b),
      ),
      campaignExposure,
      hasOpenPositions: overviewPositions.length > 0,
      latestValuation,
      missingSymbols: [...missingSymbols].sort((a, b) => a.localeCompare(b)),
      needsMappingSymbols: [...needsMappingSymbols].sort((a, b) =>
        a.localeCompare(b),
      ),
      openPositions: sortedPositions.map((position) => ({
        assetType: position.assetType,
        direction: position.direction,
        hasPrice: position.hasPrice,
        marketValue: position.marketValue,
        priceStatus: position.priceStatus,
        quantity: position.quantity,
        ticker: position.ticker,
      })),
      portfolio,
      tradeCount: trades.length,
      uncoveredCampaignTradeCount,
    };
  },
});
