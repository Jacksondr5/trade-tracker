import type { Doc, Id } from "~/convex/_generated/dataModel";

export type InboxTrade = Doc<"inboxTrades">;

export interface OpenTradePlanOption {
  _id: Id<"tradePlans">;
  instrumentSymbol: string;
  name: string;
}

export type InboxTradePriceMapping =
  | { state: "missing" }
  | {
      state: "needs_review";
      instrumentId: Id<"marketDataInstruments">;
      lastError?: string;
    }
  | {
      state: "resolved";
      instrumentId: Id<"marketDataInstruments">;
      providerSymbol: string;
    }
  | { state: "ignored"; instrumentId: Id<"marketDataInstruments"> };
