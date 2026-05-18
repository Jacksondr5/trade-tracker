export type IbkrFlexTrade = {
  assetType: "stock";
  brokerageAccountId: string;
  currency?: string;
  date: number;
  direction?: "long" | "short";
  executionId?: string;
  externalId: string;
  fees?: number;
  orderType?: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  taxes?: number;
  ticker: string;
};

export type IbkrFlexPositionSnapshot = {
  assetType: "stock";
  brokerageAccountId: string;
  currency?: string;
  marketValue?: number;
  quantity: number;
  reportDate: string;
  ticker: string;
};

export type IbkrFlexCashSnapshot = {
  brokerageAccountId: string;
  cash: number;
  currency: string;
  reportDate: string;
};

export type IbkrFlexParseResult = {
  cashSnapshots: IbkrFlexCashSnapshot[];
  errors: string[];
  positionSnapshots: IbkrFlexPositionSnapshot[];
  trades: IbkrFlexTrade[];
  warnings: string[];
};
