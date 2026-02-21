/**
 * Shared P&L calculation logic for trades.
 *
 * This module exports utilities for calculating realized P&L based on
 * position average cost at the time of each trade.
 */

// Type for position tracking during P&L calculation
export type PositionTracker = {
  direction: "long" | "short";
  netQuantity: number;
  ticker: string;
  totalEntryCost: number;
  totalEntryQuantity: number;
};

// Trade type for P&L calculation
export type TradeForPL = {
  _creationTime: number;
  _id: string;
  assetType: "crypto" | "stock";
  date: number;
  direction: "long" | "short";
  notes?: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  ticker: string;
  tradePlanId?: string;
};

/**
 * Calculate realized P&L for each trade in the input array.
 *
 * P&L logic:
 * - Opening trades (buy+long, sell+short): null P&L
 * - Closing trades on long positions (sell+long): (sell price - avg cost) × quantity
 * - Closing trades on short positions (buy+short): (avg cost - cover price) × quantity
 *
 * Trades are sorted chronologically internally to calculate correct average costs.
 *
 * @param trades - Array of trades to calculate P&L for
 * @returns Map of trade ID to realized P&L (null for opening trades)
 */
export function calculateTradesPL(
  trades: TradeForPL[],
): Map<string, number | null> {
  // Sort trades by date ascending to process in chronological order
  const sortedTrades = [...trades].sort((a, b) => a.date - b.date);

  // Track positions by ticker:direction
  const positionMap = new Map<string, PositionTracker>();

  // Results map with P&L values
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

      // Adjust cost basis after closing: reduce by the closed quantity's share of cost
      // This ensures future average cost calculations remain accurate
      const closedQty = trade.quantity;
      position.totalEntryCost = Math.max(
        0,
        position.totalEntryCost - averageCost * closedQty,
      );
      position.totalEntryQuantity = Math.max(
        0,
        position.totalEntryQuantity - closedQty,
      );

      // Reset cost to 0 if quantity is fully closed to avoid floating point artifacts
      if (position.totalEntryQuantity === 0) {
        position.totalEntryCost = 0;
      }

      position.netQuantity -= trade.quantity;
      tradesPLMap.set(trade._id, realizedPL);
    }
  }

  return tradesPLMap;
}
