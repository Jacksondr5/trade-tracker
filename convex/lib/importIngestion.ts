export function buildExecutionIdentity(input: {
  accountRef: string;
  occurredAt: number;
  price: number;
  provider: "ibkr" | "kraken";
  quantity: number;
  side: "buy" | "sell";
  symbol: string;
  externalExecutionId: string | null;
}): { kind: "hash" | "native"; value: string } {
  if (input.externalExecutionId) {
    return { kind: "native", value: input.externalExecutionId };
  }

  const normalizedSymbol = input.symbol.trim().toUpperCase();
  return {
    kind: "hash",
    value: `${input.provider}|${input.accountRef}|${normalizedSymbol}|${input.side}|${input.quantity}|${input.price}|${input.occurredAt}`,
  };
}
