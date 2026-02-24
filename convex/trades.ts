import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { calculateTradesPL } from "./lib/plCalculation";
import { assertOwner, requireUser } from "./lib/auth";

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

export const createTrade = mutation({
  args: {
    assetType: v.union(v.literal("crypto"), v.literal("stock")),
    date: v.number(),
    direction: v.union(v.literal("long"), v.literal("short")),
    notes: v.optional(v.string()),
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

    return await ctx.db.insert("trades", {
      assetType: args.assetType,
      date: args.date,
      direction: args.direction,
      notes: args.notes,
      ownerId,
      price: args.price,
      quantity: args.quantity,
      side: args.side,
      source: "manual",
      ticker: args.ticker,
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

    const patch: Record<string, unknown> = {};
    if (updates.assetType !== undefined) patch.assetType = updates.assetType;
    if (updates.date !== undefined) patch.date = updates.date;
    if (updates.direction !== undefined) patch.direction = updates.direction;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.price !== undefined) patch.price = updates.price;
    if (updates.quantity !== undefined) patch.quantity = updates.quantity;
    if (updates.side !== undefined) patch.side = updates.side;
    if (updates.ticker !== undefined) patch.ticker = updates.ticker;
    if (updates.tradePlanId !== undefined) {
      patch.tradePlanId = updates.tradePlanId === null ? undefined : updates.tradePlanId;
    }
    patch.ownerId = ownerId;

    await ctx.db.patch(tradeId, patch);

    return null;
  },
});

export const listTrades = query({
  args: {},
  returns: v.array(tradeWithPLValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const plMap = calculateTradesPL(trades);

    return [...trades]
      .sort((a, b) => b.date - a.date)
      .map((trade) => ({
        ...trade,
        realizedPL: plMap.get(trade._id) ?? null,
      }));
  },
});

const SERVER_TRADES_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const SERVER_DEFAULT_TRADES_PAGE_SIZE = 25;

const paginatedTradesValidator = v.object({
  currentPage: v.number(),
  hasNextPage: v.boolean(),
  hasPrevPage: v.boolean(),
  items: v.array(tradeWithPLValidator),
  pageSize: v.number(),
  totalCount: v.number(),
  totalPages: v.number(),
});

export const listTradesPage = query({
  args: {
    endDate: v.optional(v.number()),
    page: v.number(),
    pageSize: v.number(),
    startDate: v.optional(v.number()),
  },
  returns: paginatedTradesValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    // TODO: listTradesPage currently loads all owner trades to preserve accurate
    // chronological realized P&L from calculateTradesPL. Revisit with a write-time
    // precomputed/cumulative P&L model to avoid full-collection reads at scale.
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const plMap = calculateTradesPL(trades);

    const filteredTrades = trades.filter((trade) => {
      if (args.startDate !== undefined && trade.date < args.startDate) return false;
      if (args.endDate !== undefined && trade.date > args.endDate) return false;
      return true;
    });

    const sortedTrades = filteredTrades
      .sort((a, b) => b.date - a.date)
      .map((trade) => ({
        ...trade,
        realizedPL: plMap.get(trade._id) ?? null,
      }));

    const normalizedPageSize = SERVER_TRADES_PAGE_SIZE_OPTIONS.includes(
      args.pageSize as (typeof SERVER_TRADES_PAGE_SIZE_OPTIONS)[number],
    )
      ? args.pageSize
      : SERVER_DEFAULT_TRADES_PAGE_SIZE;
    const requestedPage = Math.max(1, Math.floor(args.page));
    const totalCount = sortedTrades.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / normalizedPageSize));
    const currentPage = Math.min(requestedPage, totalPages);
    const startIndex = (currentPage - 1) * normalizedPageSize;

    return {
      currentPage,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
      items: sortedTrades.slice(startIndex, startIndex + normalizedPageSize),
      pageSize: normalizedPageSize,
      totalCount,
      totalPages,
    };
  },
});
