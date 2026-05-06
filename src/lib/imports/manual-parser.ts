import Papa from "papaparse";
import type { InboxTradeCandidate } from "../../../shared/imports/types";
import type { ParseResult } from "./types";
import { withParserValidation } from "./validation";

export const MANUAL_IMPORT_HEADERS = [
  "ticker",
  "assetType",
  "side",
  "direction",
  "date",
  "price",
  "quantity",
  "externalId",
  "brokerageAccountId",
  "orderType",
  "fees",
  "taxes",
] as const;

const MANUAL_IMPORT_EXAMPLE_ROWS = [
  [
    "AAPL",
    "stock",
    "buy",
    "long",
    "2026-02-20T14:30:00.000Z",
    "200.50",
    "3",
    "manual-aapl-20260220-main",
    "Main Account",
    "LMT",
    "1.25",
    "0.50",
  ],
  [
    "BTC",
    "crypto",
    "sell",
    "long",
    "1771597800000",
    "50000",
    "0.1",
    "manual-btc-20260222-crypto",
    "Crypto Account",
    "MKT",
    "2.00",
    "0",
  ],
] as const;

export const MANUAL_IMPORT_TEMPLATE_CSV = [
  MANUAL_IMPORT_HEADERS.join(","),
  ...MANUAL_IMPORT_EXAMPLE_ROWS.map((row) => row.join(",")),
].join("\n");

type ManualImportHeader = (typeof MANUAL_IMPORT_HEADERS)[number];
type ManualRow = Record<ManualImportHeader, string | undefined>;

function parseOptionalString(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function parseNumberField(
  value: string | undefined,
  fieldName: ManualImportHeader,
  validationErrors: string[],
): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    validationErrors.push(`${fieldName} must be a valid number`);
    return undefined;
  }

  return parsed;
}

function parseDateField(
  value: string | undefined,
  validationErrors: string[],
): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    const timestamp = Number(normalized);
    if (Number.isFinite(timestamp)) return timestamp;
  }

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    validationErrors.push(
      "date must be an ISO date/datetime or millisecond timestamp",
    );
    return undefined;
  }

  return parsed;
}

function parseAssetType(
  value: string | undefined,
  validationErrors: string[],
): "stock" | "crypto" | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "stock" || normalized === "crypto") return normalized;

  validationErrors.push('assetType must be "stock" or "crypto"');
  return undefined;
}

function parseSide(
  value: string | undefined,
  validationErrors: string[],
): "buy" | "sell" | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "buy" || normalized === "sell") return normalized;

  validationErrors.push('side must be "buy" or "sell"');
  return undefined;
}

function parseDirection(
  value: string | undefined,
  validationErrors: string[],
): "long" | "short" | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "long" || normalized === "short") return normalized;

  validationErrors.push('direction must be "long" or "short"');
  return undefined;
}

function validateHeaders(fields: string[] | undefined): string[] {
  const expectedHeaders = new Set<string>(MANUAL_IMPORT_HEADERS);
  const actualHeaders = new Set(fields ?? []);
  const errors: string[] = [];

  for (const header of MANUAL_IMPORT_HEADERS) {
    if (!actualHeaders.has(header)) {
      errors.push(`Missing header: ${header}`);
    }
  }

  for (const header of actualHeaders) {
    if (!expectedHeaders.has(header)) {
      errors.push(`Unexpected header: ${header}`);
    }
  }

  return errors;
}

export function parseManualCSV(csvContent: string): ParseResult {
  const parsed = Papa.parse<ManualRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().replace(/^\uFEFF/, ""),
  });

  const errors: string[] = [];
  for (const err of parsed.errors) {
    errors.push(`CSV parse error (row ${err.row}): ${err.message}`);
  }
  errors.push(...validateHeaders(parsed.meta.fields));

  const trades: InboxTradeCandidate[] = [];
  if (
    errors.some(
      (error) =>
        error.startsWith("Missing header:") ||
        error.startsWith("Unexpected header:"),
    )
  ) {
    return { errors, trades };
  }

  for (const [index, row] of parsed.data.entries()) {
    const validationErrors: string[] = [];

    const trade = withParserValidation({
      assetType: parseAssetType(row.assetType, validationErrors),
      brokerageAccountId: parseOptionalString(row.brokerageAccountId),
      date: parseDateField(row.date, validationErrors),
      direction: parseDirection(row.direction, validationErrors),
      externalId: parseOptionalString(row.externalId),
      fees: parseNumberField(row.fees, "fees", validationErrors),
      orderType: parseOptionalString(row.orderType),
      price: parseNumberField(row.price, "price", validationErrors),
      quantity: parseNumberField(row.quantity, "quantity", validationErrors),
      side: parseSide(row.side, validationErrors),
      source: "manual",
      taxes: parseNumberField(row.taxes, "taxes", validationErrors),
      ticker: parseOptionalString(row.ticker),
      validationErrors,
    });

    if (validationErrors.length > 0) {
      trade.validationWarnings = [
        ...(trade.validationWarnings ?? []),
        `Manual CSV row ${index + 2} has parser validation errors.`,
      ];
    }

    trades.push(trade);
  }

  return { errors, trades };
}
