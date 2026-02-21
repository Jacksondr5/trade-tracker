export type BrokerageSource = "ibkr" | "kraken";

export interface InboxTradeCandidate {
  assetType?: "stock" | "crypto";
  brokerageAccountId?: string;
  date?: number;
  direction?: "long" | "short";
  externalId?: string;
  fees?: number;
  notes?: string;
  orderType?: string;
  price?: number;
  quantity?: number;
  side?: "buy" | "sell";
  source: BrokerageSource;
  taxes?: number;
  ticker?: string;
  validationErrors?: string[];
  validationWarnings?: string[];
}

export interface InboxTradeValidationResult {
  normalizedTicker?: string;
  validationErrors: string[];
  validationWarnings: string[];
}
