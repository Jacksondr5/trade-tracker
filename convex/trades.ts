import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

// Type for position tracking during P&L calculation
type PositionTracker = {
  direction: "long" | "short";
  netQuantity: number;
  ticker: string;
  totalEntryCost: number;
  totalEntryQuantity: number;
};

/**
 * Calculate realized P&L for trades based on position average cost at time of trade.
 *
 * P&L logic:
 * - Opening trades (buy+long, sell+short): null P&L
 * - Closing trades on long positions (sell+long): (sell price - avg cost) × quantity
 * - Closing trades on short positions (buy+short): (avg cost - cover price) × quantity
 *
 * Trades must be processed in chronological order to calculate correct average costs.
 */
function calculateTradesWithPL(
  trades: Array<{
    _creationTime: number;
    _id: string;
    assetType: "crypto" | "stock";
    campaignId?: string;
    date: number;
    direction: "long" | "short";
    notes?: string;
    price: number;
    quantity: number;
    side: "buy" | "sell";
    ticker: string;
  }>,
): Array<{
  _creationTime: number;
  _id: string;
  assetType: "crypto" | "stock";
  campaignId?: string;
  date: number;
  direction: "long" | "short";
  notes?: string;
  price: number;
  quantity: number;
  realizedPL: number | null;
  side: "buy" | "sell";
  ticker: string;
}> {
  // Sort trades by date ascending to process in chronological order
  const sortedTrades = [...trades].sort((a, b) => a.date - b.date);

  // Track positions by ticker:direction
  const positionMap = new Map<string, PositionTracker>();

  // Results array with P&L added (will preserve original trade order)
  const tradesPLMap = new Map<string, number | null>();

  for (const trade of sortedTrades) {
    const key = `${trade.ticker}:${trade.direction}`;

    // Initialize position if not exists
    if (!positionMap.has(key)) {
      positionMap.set(key, {
        direction: trade.direction,
        netQuantity: 0,
        ticker: trade.ticker,
        totalEntryCost: 0,
        totalEntryQuantity: 0,
      });
    }

    const position = positionMap.get(key)!;

    // Determine if this is an opening or closing trade
    // Long: buy opens, sell closes
    // Short: sell opens, buy closes
    const isOpening =
      (trade.direction === "long" && trade.side === "buy") ||
      (trade.direction === "short" && trade.side === "sell");

    if (isOpening) {
      // Opening trade - no realized P&L
      position.netQuantity += trade.quantity;
      position.totalEntryCost += trade.price * trade.quantity;
      position.totalEntryQuantity += trade.quantity;
      tradesPLMap.set(trade._id, null);
    } else {
      // Closing trade - calculate realized P&L
      const averageCost =
        position.totalEntryQuantity > 0
          ? position.totalEntryCost / position.totalEntryQuantity
          : 0;

      let realizedPL: number;
      if (trade.direction === "long") {
        // Selling long position: (sell price - avg cost) × quantity
        realizedPL = (trade.price - averageCost) * trade.quantity;
      } else {
        // Covering short position: (avg cost - cover price) × quantity
        realizedPL = (averageCost - trade.price) * trade.quantity;
      }

      position.netQuantity -= trade.quantity;
      tradesPLMap.set(trade._id, realizedPL);
    }
  }

  // Return trades with P&L in original array order
  return trades.map((trade) => ({
    ...trade,
    realizedPL: tradesPLMap.get(trade._id) ?? null,
  }));
}

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
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_date")
      .order("desc")
      .collect();

    // Calculate P&L (needs all trades for accurate position tracking)
    const allTrades = await ctx.db.query("trades").collect();
    const tradesWithPL = calculateTradesWithPL(allTrades);

    // Create lookup map for P&L values
    const plMap = new Map(tradesWithPL.map((t) => [t._id, t.realizedPL]));

    // Return trades in original order (desc by date) with P&L added
    return trades.map((trade) => ({
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
    const tradesWithPL = calculateTradesWithPL(allTrades);

    // Find the P&L for this specific trade
    const tradeWithPL = tradesWithPL.find((t) => t._id === trade._id);

    return {
      ...trade,
      realizedPL: tradeWithPL?.realizedPL ?? null,
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

    // Sort by date descending since we can't use two indexes
    const sortedTrades = trades.sort((a, b) => b.date - a.date);

    // Calculate P&L (needs all trades for accurate position tracking)
    const allTrades = await ctx.db.query("trades").collect();
    const tradesWithPL = calculateTradesWithPL(allTrades);

    // Create lookup map for P&L values
    const plMap = new Map(tradesWithPL.map((t) => [t._id, t.realizedPL]));

    // Return campaign trades with P&L added
    return sortedTrades.map((trade) => ({
      ...trade,
      realizedPL: plMap.get(trade._id) ?? null,
    }));
  },
});
