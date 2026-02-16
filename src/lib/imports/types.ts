export type ImportProvider = "ibkr" | "kraken";

export type NormalizedExecution = {
  accountRef: string;
  occurredAt: number;
  externalExecutionId: string | null;
  externalOrderId: string | null;
  price: number;
  provider: ImportProvider;
  quantity: number;
  rawPayload: unknown;
  side: "buy" | "sell";
  symbol: string;
};
