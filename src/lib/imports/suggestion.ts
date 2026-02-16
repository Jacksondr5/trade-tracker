export function isSideDirectionConsistent(
  side: "buy" | "sell",
  direction: "long" | "short"
): boolean {
  return (
    (direction === "long" && side === "buy") ||
    (direction === "short" && side === "sell")
  );
}

export function pickTradePlanSuggestion({
  execution,
  tradePlans,
}: {
  execution: { side: "buy" | "sell"; symbol: string };
  tradePlans: Array<{
    _id: string;
    direction: "long" | "short";
    instrumentSymbol: string;
  }>;
}): {
  reason: "none" | "symbol_and_side_match";
  suggestedTradePlanId: string | null;
} {
  const normalizedSymbol = execution.symbol.trim().toUpperCase();
  const match = tradePlans.find(
    (tradePlan) =>
      tradePlan.instrumentSymbol.trim().toUpperCase() === normalizedSymbol &&
      isSideDirectionConsistent(execution.side, tradePlan.direction)
  );

  if (!match) {
    return { reason: "none", suggestedTradePlanId: null };
  }

  return {
    reason: "symbol_and_side_match",
    suggestedTradePlanId: match._id,
  };
}
