import { query } from "./_generated/server";
import { v } from "convex/values";

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
    const trades = await ctx.db.query("trades").collect();

    // Group trades by ticker and direction
    // Key format: "ticker:direction"
    const positionMap = new Map<
      string,
      {
        direction: "long" | "short";
        entries: Array<{ price: number; quantity: number }>;
        netQuantity: number;
        ticker: string;
        totalEntryCost: number;
        totalEntryQuantity: number;
      }
    >();

    for (const trade of trades) {
      const key = `${trade.ticker}:${trade.direction}`;

      if (!positionMap.has(key)) {
        positionMap.set(key, {
          direction: trade.direction,
          entries: [],
          netQuantity: 0,
          ticker: trade.ticker,
          totalEntryCost: 0,
          totalEntryQuantity: 0,
        });
      }

      const position = positionMap.get(key)!;

      // Determine if this trade opens or closes the position
      // Long: buy opens, sell closes
      // Short: sell opens, buy closes
      const isOpening =
        (trade.direction === "long" && trade.side === "buy") ||
        (trade.direction === "short" && trade.side === "sell");

      if (isOpening) {
        // Opening trade - add to position and track for average cost
        position.netQuantity += trade.quantity;
        position.totalEntryCost += trade.price * trade.quantity;
        position.totalEntryQuantity += trade.quantity;
        position.entries.push({ price: trade.price, quantity: trade.quantity });
      } else {
        // Closing trade - reduce position
        position.netQuantity -= trade.quantity;
      }
    }

    // Convert to array and filter out zero-quantity positions
    const positions: Array<{
      averageCost: number;
      direction: "long" | "short";
      quantity: number;
      ticker: string;
    }> = [];

    for (const position of positionMap.values()) {
      // Only include positions with non-zero quantity
      if (position.netQuantity > 0) {
        // Calculate weighted average cost from entry trades
        const averageCost =
          position.totalEntryQuantity > 0
            ? position.totalEntryCost / position.totalEntryQuantity
            : 0;

        positions.push({
          averageCost,
          direction: position.direction,
          quantity: position.netQuantity,
          ticker: position.ticker,
        });
      }
    }

    // Sort by ticker for consistent ordering
    positions.sort((a, b) => a.ticker.localeCompare(b.ticker));

    return positions;
  },
});
