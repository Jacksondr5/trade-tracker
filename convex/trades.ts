import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { calculateTradesPL } from "./lib/plCalculation";

// Validator for trade with realized P&L calculation
const tradeWithPLValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("trades"),
  assetType: v.union(v.literal("crypto"), v.literal("stock")),
  campaignId: v.optional(v.id("campaigns")),
  date: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  notes: v.optional(v.string()),
  price: v.number(),
  quantity: v.number(),
  realizedPL: v.union(v.number(), v.null()),
  side: v.union(v.literal("buy"), v.literal("sell")),
  ticker: v.string(),
});

/**
 * Create a new trade record.
 */
export const createTrade = mutation({
  args: {
    assetType: v.union(v.literal("crypto"), v.literal("stock")),
    campaignId: v.optional(v.id("campaigns")),
    date: v.number(),
    direction: v.union(v.literal("long"), v.literal("short")),
    notes: v.optional(v.string()),
    price: v.number(),
    quantity: v.number(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    ticker: v.string(),
  },
  returns: v.id("trades"),
  handler: async (ctx, args) => {
    const {
      assetType,
      campaignId,
      date,
      direction,
      notes,
      price,
      quantity,
      side,
      ticker,
    } = args;

    // Validate campaign exists and is not closed if campaignId is provided
    if (campaignId) {
      const campaign = await ctx.db.get(campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }
      if (campaign.status === "closed") {
        throw new Error("Cannot add trades to a closed campaign");
      }
    }

    const tradeId = await ctx.db.insert("trades", {
      assetType,
      campaignId,
      date,
      direction,
      notes,
      price,
      quantity,
      side,
      ticker,
    });

    return tradeId;
  },
});

/**
 * Update an existing trade record.
 */
export const updateTrade = mutation({
  args: {
    assetType: v.optional(v.union(v.literal("crypto"), v.literal("stock"))),
    campaignId: v.optional(v.id("campaigns")),
    date: v.optional(v.number()),
    direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
    notes: v.optional(v.string()),
    price: v.optional(v.number()),
    quantity: v.optional(v.number()),
    side: v.optional(v.union(v.literal("buy"), v.literal("sell"))),
    ticker: v.optional(v.string()),
    tradeId: v.id("trades"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { tradeId, ...updates } = args;

    const existingTrade = await ctx.db.get(tradeId);
    if (!existingTrade) {
      throw new Error("Trade not found");
    }

    // Validate campaign exists and is not closed if campaignId is being changed
    if (updates.campaignId !== undefined && updates.campaignId !== null) {
      const campaign = await ctx.db.get(updates.campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }
      if (campaign.status === "closed") {
        throw new Error("Cannot add trades to a closed campaign");
      }
    }

    // Build patch object with only defined values
    const patch: Record<string, unknown> = {};
    if (updates.assetType !== undefined) patch.assetType = updates.assetType;
    if (updates.campaignId !== undefined) patch.campaignId = updates.campaignId;
    if (updates.date !== undefined) patch.date = updates.date;
    if (updates.direction !== undefined) patch.direction = updates.direction;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.price !== undefined) patch.price = updates.price;
    if (updates.quantity !== undefined) patch.quantity = updates.quantity;
    if (updates.side !== undefined) patch.side = updates.side;
    if (updates.ticker !== undefined) patch.ticker = updates.ticker;

    await ctx.db.patch(tradeId, patch);

    return null;
  },
});

/**
 * Delete a trade record.
 */
export const deleteTrade = mutation({
  args: {
    tradeId: v.id("trades"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { tradeId } = args;

    const existingTrade = await ctx.db.get(tradeId);
    if (!existingTrade) {
      throw new Error("Trade not found");
    }

    await ctx.db.delete(tradeId);

    return null;
  },
});

/**
 * List all trades sorted by date descending (newest first), with realized P&L.
 */
export const listTrades = query({
  args: {},
  returns: v.array(tradeWithPLValidator),
  handler: async (ctx) => {
    // Fetch all trades - we need all for P&L calculation anyway
    const trades = await ctx.db.query("trades").collect();

    // Calculate P&L using shared helper
    const plMap = calculateTradesPL(trades);

    // Sort by date descending for display and add P&L
    return [...trades]
      .sort((a, b) => b.date - a.date)
      .map((trade) => ({
        ...trade,
        realizedPL: plMap.get(trade._id) ?? null,
      }));
  },
});

/**
 * Get a single trade by ID, with realized P&L.
 */
export const getTrade = query({
  args: {
    tradeId: v.id("trades"),
  },
  returns: v.union(tradeWithPLValidator, v.null()),
  handler: async (ctx, args) => {
    const trade = await ctx.db.get(args.tradeId);
    if (!trade) {
      return null;
    }

    // Calculate P&L (needs all trades for accurate position tracking)
    const allTrades = await ctx.db.query("trades").collect();
    const plMap = calculateTradesPL(allTrades);

    return {
      ...trade,
      realizedPL: plMap.get(trade._id) ?? null,
    };
  },
});

/**
 * Get all trades for a specific campaign, sorted by date descending, with realized P&L.
 */
export const getTradesByCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.array(tradeWithPLValidator),
  handler: async (ctx, args) => {
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();

    // Calculate P&L (needs all trades for accurate position tracking)
    const allTrades = await ctx.db.query("trades").collect();
    const plMap = calculateTradesPL(allTrades);

    // Sort by date descending and add P&L
    return [...trades]
      .sort((a, b) => b.date - a.date)
      .map((trade) => ({
        ...trade,
        realizedPL: plMap.get(trade._id) ?? null,
      }));
  },
});
