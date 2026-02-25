import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { calculateTradesPL } from "./lib/plCalculation";
import { assertOwner, requireUser } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

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

export const getPortfolio = query({
  args: {
    portfolioId: v.id("portfolios"),
  },
  returns: v.union(portfolioValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    if (!portfolio || portfolio.ownerId !== ownerId) {
      return null;
    }
    return portfolio;
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

const tradeWithPLValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("trades"),
  assetType: v.union(v.literal("crypto"), v.literal("stock")),
  brokerageAccountId: v.optional(v.string()),
  date: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  externalId: v.optional(v.string()),
  fees: v.optional(v.number()),
  notes: v.optional(v.string()),
  orderType: v.optional(v.string()),
  ownerId: v.string(),
  portfolioId: v.optional(v.id("portfolios")),
  price: v.number(),
  quantity: v.number(),
  realizedPL: v.union(v.number(), v.null()),
  side: v.union(v.literal("buy"), v.literal("sell")),
  source: v.optional(
    v.union(v.literal("manual"), v.literal("ibkr"), v.literal("kraken")),
  ),
  taxes: v.optional(v.number()),
  ticker: v.string(),
  tradePlanId: v.optional(v.id("tradePlans")),
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
      trades: v.array(tradeWithPLValidator),
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

    // Calculate P&L — need all owner trades for accurate position tracking
    const allTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const plMap = calculateTradesPL(allTrades);

    const tradesWithPL = [...portfolioTrades]
      .sort((a, b) => b.date - a.date)
      .map((trade) => ({
        ...trade,
        realizedPL: plMap.get(trade._id) ?? null,
      }));

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
      trades: tradesWithPL,
    };
  },
});
