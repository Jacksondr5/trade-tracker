export interface TradePlanMatch {
  id: string;
  instrumentSymbol: string;
}

/**
 * Returns the trade plan ID if exactly one open plan matches the ticker.
 * Returns undefined if zero or multiple plans match.
 */
export function findAutoMatchTradePlanId(
  ticker: string | undefined,
  openPlans: TradePlanMatch[],
): string | undefined {
  if (!ticker) return undefined;

  const normalizedTicker = ticker.toUpperCase();
  const matches = openPlans.filter(
    (p) => p.instrumentSymbol.toUpperCase() === normalizedTicker,
  );

  return matches.length === 1 ? matches[0].id : undefined;
}
