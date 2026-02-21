import type {
  InboxTradeCandidate,
  InboxTradeValidationResult,
} from "./types";

export function validateInboxTradeCandidate(
  trade: InboxTradeCandidate,
  options?: { includeExisting?: boolean },
): InboxTradeValidationResult {
  const includeExisting = options?.includeExisting ?? true;
  const validationErrors = includeExisting ? [...(trade.validationErrors ?? [])] : [];
  const validationWarnings = includeExisting
    ? [...(trade.validationWarnings ?? [])]
    : [];

  const normalizedTicker = trade.ticker?.trim().toUpperCase() || undefined;

  if (!normalizedTicker) validationErrors.push("Ticker is required");
  if (!trade.assetType) validationErrors.push("Asset type is required");
  if (!trade.side) validationErrors.push("Side is required");
  if (!trade.direction) validationErrors.push("Direction is required");

  if (trade.date === undefined || !Number.isFinite(trade.date)) {
    validationErrors.push("Date is required and must be a valid timestamp");
  }
  if (trade.price === undefined || !Number.isFinite(trade.price) || trade.price <= 0) {
    validationErrors.push("Price is required and must be > 0");
  }
  if (
    trade.quantity === undefined ||
    !Number.isFinite(trade.quantity) ||
    trade.quantity <= 0
  ) {
    validationErrors.push("Quantity is required and must be > 0");
  }
  if (!trade.externalId) {
    validationWarnings.push("No externalId provided; dedup cannot be guaranteed.");
  }

  return {
    normalizedTicker,
    validationErrors,
    validationWarnings,
  };
}
