import type { Doc } from "../_generated/dataModel";

type PositionTrade = Pick<
  Doc<"trades">,
  "direction" | "price" | "quantity" | "side" | "ticker" | "tradePlanId"
>;

export type OpenPosition = {
  averageCost: number;
  direction: "long" | "short";
  hasTradePlan: boolean;
  quantity: number;
  ticker: string;
};

/**
 * Aggregate accepted executions into current ticker-and-direction exposure.
 * Consumers choose how to present the retained plan-link signal.
 */
export function deriveOpenPositions(trades: PositionTrade[]): OpenPosition[] {
  const positions = new Map<
    string,
    {
      direction: "long" | "short";
      hasTradePlan: boolean;
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
      hasTradePlan: false,
      netQuantity: 0,
      ticker: trade.ticker,
      totalEntryCost: 0,
      totalEntryQuantity: 0,
    };
    const isOpening =
      (trade.direction === "long" && trade.side === "buy") ||
      (trade.direction === "short" && trade.side === "sell");
    if (isOpening) {
      position.netQuantity += trade.quantity;
      position.totalEntryCost += trade.price * trade.quantity;
      position.totalEntryQuantity += trade.quantity;
      position.hasTradePlan ||= trade.tradePlanId !== undefined;
    } else {
      position.netQuantity -= trade.quantity;
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
      hasTradePlan: position.hasTradePlan,
      quantity: position.netQuantity,
      ticker: position.ticker,
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}
