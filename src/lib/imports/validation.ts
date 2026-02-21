import { InboxTradeCandidate } from "../../../shared/imports/types";
import { validateInboxTradeCandidate } from "../../../shared/imports/validation";

export function withParserValidation(
  trade: InboxTradeCandidate,
): InboxTradeCandidate {
  const validation = validateInboxTradeCandidate(trade);

  return {
    ...trade,
    ticker: validation.normalizedTicker,
    validationErrors: validation.validationErrors,
    validationWarnings: validation.validationWarnings,
  };
}
