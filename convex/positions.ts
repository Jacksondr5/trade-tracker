import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";
import { deriveOpenPositions } from "./lib/openPositions";

// Validator for position returned from getPositions query
const positionValidator = v.object({
  averageCost: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  quantity: v.number(),
  ticker: v.string(),
});

/**
 * Calculate current positions by aggregating all trades by ticker.
 *
 * Position logic:
 * - For long positions: buys add to position, sells reduce position
 * - For short positions: sells add to position, buys (covers) reduce position
 * - Average cost is the weighted average of entry prices
 *
 * Returns only tickers with non-zero net quantity.
 */
export const getPositions = query({
  args: {},
  returns: v.array(positionValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    return deriveOpenPositions(trades).map((position) => ({
      averageCost: position.averageCost,
      direction: position.direction,
      quantity: position.quantity,
      ticker: position.ticker,
    }));
  },
});
