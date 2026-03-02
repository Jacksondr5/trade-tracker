import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";
import { tradeValidator } from "./lib/tradeValidator";
import { paginationOptsValidator } from "convex/server";

function normalizeTicker(ticker: string): string {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) {
    throw new ConvexError("Ticker is required");
  }
  return normalizedTicker;
}


export const createTrade = mutation({
  args: {
    assetType: v.union(v.literal("crypto"), v.literal("stock")),
    date: v.number(),
    direction: v.union(v.literal("long"), v.literal("short")),
    notes: v.optional(v.string()),
    portfolioId: v.optional(v.id("portfolios")),
    price: v.number(),
    quantity: v.number(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    ticker: v.string(),
    tradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: v.id("trades"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);

    if (args.tradePlanId) {
      const tradePlan = await ctx.db.get(args.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }

    if (args.portfolioId) {
      const portfolio = await ctx.db.get(args.portfolioId);
      assertOwner(portfolio, ownerId, "Portfolio not found");
    }

    return await ctx.db.insert("trades", {
      assetType: args.assetType,
      date: args.date,
      direction: args.direction,
      notes: args.notes,
      ownerId,
      portfolioId: args.portfolioId,
      price: args.price,
      quantity: args.quantity,
      side: args.side,
      source: "manual",
      ticker: normalizeTicker(args.ticker),
      tradePlanId: args.tradePlanId,
    });
  },
});

export const updateTrade = mutation({
  args: {
    assetType: v.optional(v.union(v.literal("crypto"), v.literal("stock"))),
    date: v.optional(v.number()),
    direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
    notes: v.optional(v.string()),
    portfolioId: v.optional(v.union(v.id("portfolios"), v.null())),
    price: v.optional(v.number()),
    quantity: v.optional(v.number()),
    side: v.optional(v.union(v.literal("buy"), v.literal("sell"))),
    ticker: v.optional(v.string()),
    tradeId: v.id("trades"),
    tradePlanId: v.optional(v.union(v.id("tradePlans"), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { tradeId, ...updates } = args;

    const existingTrade = await ctx.db.get(tradeId);
    assertOwner(existingTrade, ownerId, "Trade not found");

    if (updates.tradePlanId !== undefined && updates.tradePlanId !== null) {
      const tradePlan = await ctx.db.get(updates.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }

    if (updates.portfolioId !== undefined && updates.portfolioId !== null) {
      const portfolio = await ctx.db.get(updates.portfolioId);
      assertOwner(portfolio, ownerId, "Portfolio not found");
    }

    const patch: Record<string, unknown> = {};
    if (updates.assetType !== undefined) patch.assetType = updates.assetType;
    if (updates.date !== undefined) patch.date = updates.date;
    if (updates.direction !== undefined) patch.direction = updates.direction;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.portfolioId !== undefined) {
      patch.portfolioId =
        updates.portfolioId === null ? undefined : updates.portfolioId;
    }
    if (updates.price !== undefined) patch.price = updates.price;
    if (updates.quantity !== undefined) patch.quantity = updates.quantity;
    if (updates.side !== undefined) patch.side = updates.side;
    if (updates.ticker !== undefined)
      patch.ticker = normalizeTicker(updates.ticker);
    if (updates.tradePlanId !== undefined) {
      patch.tradePlanId =
        updates.tradePlanId === null ? undefined : updates.tradePlanId;
    }
    patch.ownerId = ownerId;

    await ctx.db.patch(tradeId, patch);

    return null;
  },
});

export const listTrades = query({
  args: {},
  returns: v.array(tradeValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    return [...trades].sort((a, b) => b.date - a.date);
  },
});

const paginatedTradesValidator = v.object({
  continueCursor: v.string(),
  isDone: v.boolean(),
  page: v.array(tradeValidator),
  pageStatus: v.optional(v.union(v.string(), v.null())),
  splitCursor: v.optional(v.union(v.string(), v.null())),
});

export const listTradesPage = query({
  args: {
    endDate: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
    startDate: v.optional(v.number()),
  },
  returns: paginatedTradesValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { endDate, paginationOpts, startDate } = args;
    const queryByDate = ctx.db.query("trades");

    if (startDate !== undefined && endDate !== undefined) {
      return await queryByDate
        .withIndex("by_owner_date", (q) =>
          q.eq("ownerId", ownerId).gte("date", startDate).lte("date", endDate),
        )
        .order("desc")
        .paginate(paginationOpts);
    }

    if (startDate !== undefined) {
      return await queryByDate
        .withIndex("by_owner_date", (q) =>
          q.eq("ownerId", ownerId).gte("date", startDate),
        )
        .order("desc")
        .paginate(paginationOpts);
    }

    if (endDate !== undefined) {
      return await queryByDate
        .withIndex("by_owner_date", (q) =>
          q.eq("ownerId", ownerId).lte("date", endDate),
        )
        .order("desc")
        .paginate(paginationOpts);
    }

    return await queryByDate
      .withIndex("by_owner_date", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .paginate(paginationOpts);
  },
});
