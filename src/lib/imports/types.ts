export type BrokerageSource = "ibkr" | "kraken";

export interface NormalizedTrade {
  assetType: "stock" | "crypto";
  brokerageAccountId?: string;
  date: number;
  direction: "long" | "short";
  externalId: string;
  fees?: number;
  orderType?: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  source: BrokerageSource;
  taxes?: number;
  ticker: string;
}

export interface ParseResult {
  errors: string[];
  trades: NormalizedTrade[];
}
