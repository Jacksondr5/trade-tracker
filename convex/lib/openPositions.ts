import type { Doc } from "../_generated/dataModel";

type PositionTrade = Pick<
  Doc<"trades">,
  | "_creationTime"
  | "date"
  | "direction"
  | "price"
  | "quantity"
  | "side"
  | "ticker"
>;

const POSITION_QUANTITY_DECIMAL_PLACES = 12;
export const MAX_DERIVED_POSITION_TRADES = 5_000;

function normalizePositionQuantity(quantity: number): number {
  const normalized = Number(quantity.toFixed(POSITION_QUANTITY_DECIMAL_PLACES));
  return Object.is(normalized, -0) ? 0 : normalized;
}

export type PositionEpisodeState<T extends PositionTrade> = {
  isPlausible: boolean;
  netQuantity: number;
  openingTrade: T | null;
  orderedTrades: T[];
};

export function getPositionQuantityDelta(trade: PositionTrade): number {
  const isOpening =
    (trade.direction === "long" && trade.side === "buy") ||
    (trade.direction === "short" && trade.side === "sell");
  return normalizePositionQuantity(
    isOpening ? trade.quantity : -trade.quantity,
  );
}

function comparePositionTrades(left: PositionTrade, right: PositionTrade) {
  return left.date - right.date || left._creationTime - right._creationTime;
}

/**
 * Computes the current flat-to-flat position episode. This is the same episode
 * concept planned for Phase 3, calculated on demand without persisting an ID.
 */
export function derivePositionEpisodeState<T extends PositionTrade>(
  trades: T[],
): PositionEpisodeState<T> {
  const orderedTrades = [...trades].sort(comparePositionTrades);
  let isPlausible = true;
  let netQuantity = 0;
  let openingTrade: T | null = null;

  for (const trade of orderedTrades) {
    const delta = getPositionQuantityDelta(trade);
    if (netQuantity === 0 && delta > 0) openingTrade = trade;
    netQuantity = normalizePositionQuantity(netQuantity + delta);
    if (netQuantity < 0) isPlausible = false;
    if (netQuantity === 0) {
      netQuantity = 0;
      openingTrade = null;
    }
  }
  return { isPlausible, netQuantity, openingTrade, orderedTrades };
}

export function deriveInstrumentPositionEpisodes<T extends PositionTrade>(
  trades: T[],
): Map<string, PositionEpisodeState<T>> {
  const tradesByInstrument = new Map<string, T[]>();
  for (const trade of trades) {
    const key = `${trade.ticker.toUpperCase()}:${trade.direction}`;
    const instrumentTrades = tradesByInstrument.get(key) ?? [];
    instrumentTrades.push(trade);
    tradesByInstrument.set(key, instrumentTrades);
  }
  return new Map(
    [...tradesByInstrument].map(([key, instrumentTrades]) => [
      key,
      derivePositionEpisodeState(instrumentTrades),
    ]),
  );
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
  return [...deriveInstrumentPositionEpisodes(trades).values()]
    .filter(
      (position) =>
        position.isPlausible &&
        position.netQuantity > 0 &&
        position.openingTrade !== null,
    )
    .map((position) => {
      const openingIndex = position.orderedTrades.indexOf(
        position.openingTrade!,
      );
      const openEpisode = position.orderedTrades.slice(openingIndex);
      const entryTrades = openEpisode.filter(
        (trade) => getPositionQuantityDelta(trade) > 0,
      );
      const totalEntryQuantity = entryTrades.reduce(
        (total, trade) => total + trade.quantity,
        0,
      );
      const totalEntryCost = entryTrades.reduce(
        (total, trade) => total + trade.price * trade.quantity,
        0,
      );
      return {
        averageCost:
          totalEntryQuantity > 0 ? totalEntryCost / totalEntryQuantity : 0,
        direction: position.openingTrade!.direction,
        quantity: position.netQuantity,
        ticker: position.openingTrade!.ticker,
      };
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}
