type IbkrLogicalFill = {
  assetType?: "stock" | "crypto";
  brokerageAccountId?: string;
  date?: number;
  direction?: "long" | "short";
  price?: number;
  quantity?: number;
  side?: "buy" | "sell";
  source?: "ibkr" | "kraken" | "manual";
  ticker?: string;
};

export type IbkrExternalIdKind = "csv" | "execution" | "order" | "other";

export type IbkrFingerprintExclusionReason =
  | "non_ibkr_source"
  | "non_stock_asset"
  | "missing_brokerage_account"
  | "missing_ticker"
  | "missing_side"
  | "missing_direction"
  | "missing_quantity"
  | "non_finite_quantity"
  | "missing_price"
  | "non_finite_price"
  | "missing_date"
  | "non_finite_date"
  | "midnight_eastern";

export type IbkrLogicalFillFingerprintResult =
  | { exclusionReason: null; fingerprint: string }
  | { exclusionReason: IbkrFingerprintExclusionReason; fingerprint: null };

const easternClockFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/New_York",
});

export function isMidnightEastern(timestamp: number): boolean {
  if (!Number.isFinite(timestamp)) return false;
  const parts = Object.fromEntries(
    easternClockFormatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return (
    (parts.hour === "00" || parts.hour === "24") &&
    parts.minute === "00" &&
    parts.second === "00"
  );
}

/**
 * Identifies the same US-equity fill across the manual IBKR CSV and automated
 * Flex ingestion paths. Both paths normalize to these economic fields but use
 * different external identifiers.
 */
export function ibkrLogicalFillFingerprint(
  trade: IbkrLogicalFill,
): string | null {
  return ibkrLogicalFillFingerprintResult(trade).fingerprint;
}

export function ibkrLogicalFillFingerprintResult(
  trade: IbkrLogicalFill,
): IbkrLogicalFillFingerprintResult {
  const exclusionReason = ((): IbkrFingerprintExclusionReason | undefined => {
    if (trade.source !== "ibkr") return "non_ibkr_source";
    if (trade.assetType !== "stock") return "non_stock_asset";
    if (!trade.brokerageAccountId?.trim()) return "missing_brokerage_account";
    if (!trade.ticker?.trim()) return "missing_ticker";
    if (trade.side === undefined) return "missing_side";
    if (trade.direction === undefined) return "missing_direction";
    if (trade.quantity === undefined) return "missing_quantity";
    if (!Number.isFinite(trade.quantity)) return "non_finite_quantity";
    if (trade.price === undefined) return "missing_price";
    if (!Number.isFinite(trade.price)) return "non_finite_price";
    if (trade.date === undefined) return "missing_date";
    if (!Number.isFinite(trade.date)) return "non_finite_date";
    if (isMidnightEastern(trade.date)) return "midnight_eastern";
    return undefined;
  })();
  if (exclusionReason !== undefined) {
    return { exclusionReason, fingerprint: null };
  }

  return {
    exclusionReason: null,
    fingerprint: JSON.stringify([
      trade.brokerageAccountId!.trim().toUpperCase(),
      trade.ticker!.trim().toUpperCase(),
      trade.side,
      trade.direction,
      trade.quantity,
      trade.price,
      trade.date,
    ]),
  };
}

export function classifyIbkrExternalId(
  externalId: string | undefined,
): IbkrExternalIdKind {
  if (!externalId) return "other";
  if (/^\d+$/.test(externalId)) return "order";
  if (externalId.includes("|")) return "csv";
  if (/^[^.]+(?:\.[^.]+){3}$/.test(externalId)) return "execution";
  return "other";
}
