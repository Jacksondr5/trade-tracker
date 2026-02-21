import type { InboxTradeCandidate } from "../../../shared/imports/types";

export interface ParseResult {
  errors: string[];
  trades: InboxTradeCandidate[];
}
