export interface TradePlanMatch {
  id: string;
  instrumentSymbol: string;
}

export function findMatchingTradePlans(
  ticker: string | undefined,
  openPlans: TradePlanMatch[],
): TradePlanMatch[] {
  if (!ticker) return [];

  const normalizedTicker = ticker.toUpperCase();
  return openPlans.filter(
    (p) => p.instrumentSymbol.toUpperCase() === normalizedTicker,
  );
}

/**
 * Returns the trade plan ID if exactly one open plan matches the ticker.
 * Returns undefined if zero or multiple plans match.
 */
export function findAutoMatchTradePlanId(
  ticker: string | undefined,
  openPlans: TradePlanMatch[],
): string | undefined {
  const matches = findMatchingTradePlans(ticker, openPlans);
  return matches.length === 1 ? matches[0].id : undefined;
}
