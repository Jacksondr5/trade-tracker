import type { Doc, Id } from "../../../convex/_generated/dataModel";

export type InboxTrade = Doc<"inboxTrades">;

export interface OpenTradePlanOption {
  _id: Id<"tradePlans">;
  instrumentSymbol: string;
  name: string;
}
