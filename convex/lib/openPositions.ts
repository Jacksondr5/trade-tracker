import type { Doc } from "../_generated/dataModel";

type PositionTrade = Pick<
  Doc<"trades">,
  "direction" | "price" | "quantity" | "side" | "ticker"
>;

export type PositionEpisodeState<T extends PositionTrade> = {
  isPlausible: boolean;
  netQuantity: number;
  openingTrade: T | null;
};

export function getPositionQuantityDelta(trade: PositionTrade): number {
  const isOpening =
    (trade.direction === "long" && trade.side === "buy") ||
    (trade.direction === "short" && trade.side === "sell");
  return isOpening ? trade.quantity : -trade.quantity;
}

/**
 * Computes the current flat-to-flat position episode. This is the same episode
 * concept planned for Phase 3, calculated on demand without persisting an ID.
 */
export function derivePositionEpisodeState<T extends PositionTrade>(
  trades: T[],
): PositionEpisodeState<T> {
  let isPlausible = true;
  let netQuantity = 0;
  let openingTrade: T | null = null;

  for (const trade of trades) {
    const delta = getPositionQuantityDelta(trade);
    if (netQuantity === 0 && delta > 0) openingTrade = trade;
    netQuantity += delta;
    if (netQuantity < -Number.EPSILON) isPlausible = false;
    if (Math.abs(netQuantity) <= Number.EPSILON) {
      netQuantity = 0;
      openingTrade = null;
    }
  }
  return { isPlausible, netQuantity, openingTrade };
}

export type OpenPosition = {
  averageCost: number;
  direction: "long" | "short";
  quantity: number;
  ticker: string;
};

/**
 * Aggregate accepted executions into current ticker-and-direction exposure.
 * Trade-plan linkage is intentionally not part of the accepted-trade model.
 */
export function deriveOpenPositions(trades: PositionTrade[]): OpenPosition[] {
  const positions = new Map<
    string,
    {
      direction: "long" | "short";
      netQuantity: number;
      ticker: string;
      totalEntryCost: number;
      totalEntryQuantity: number;
    }
  >();

  for (const trade of trades) {
    const key = `${trade.ticker}:${trade.direction}`;
    const position = positions.get(key) ?? {
      direction: trade.direction,
      netQuantity: 0,
      ticker: trade.ticker,
      totalEntryCost: 0,
      totalEntryQuantity: 0,
    };
    const quantityDelta = getPositionQuantityDelta(trade);
    position.netQuantity += quantityDelta;
    if (quantityDelta > 0) {
      position.totalEntryCost += trade.price * trade.quantity;
      position.totalEntryQuantity += trade.quantity;
    }
    positions.set(key, position);
  }

  return [...positions.values()]
    .filter((position) => position.netQuantity > 0)
    .map((position) => ({
      averageCost:
        position.totalEntryQuantity > 0
          ? position.totalEntryCost / position.totalEntryQuantity
          : 0,
      direction: position.direction,
      quantity: position.netQuantity,
      ticker: position.ticker,
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}
