import Papa from "papaparse";
import type { ParseResult } from "./types";
import { withParserValidation } from "./validation";
import type { InboxTradeCandidate } from "../../../shared/imports/types";
import { parseIbkrEasternTimestamp } from "../../../shared/brokerage/ibkr-flex/time";

interface IBKRRow {
  "Buy/Sell": string;
  ClientAccountID: string;
  DateTime: string;
  "Open/CloseIndicator": string;
  OrderType: string;
  Quantity: string;
  Symbol: string;
  Taxes: string;
  TradePrice: string;
  TransactionType: string;
}

function parseIBKRDateTime(dt: string): number {
  if (!dt.includes(";")) {
    throw new Error(`Invalid IBKR DateTime format: "${dt}"`);
  }
  const timestamp = parseIbkrEasternTimestamp(dt);
  if (timestamp === undefined) {
    throw new Error(`Invalid IBKR DateTime format: "${dt}"`);
  }
  return timestamp;
}

/**
 * Infer trade direction from Open/Close indicator and Buy/Sell:
 * - O + BUY  = long  (opening a long position)
 * - O + SELL = short (opening a short position)
 * - C + SELL = long  (closing a long position)
 * - C + BUY  = short (closing a short position)
 */
function inferDirection(
  openClose: string,
  buySell: string,
): "long" | "short" | undefined {
  const oc = openClose.trim().toUpperCase();
  const bs = buySell.trim().toUpperCase();
  if (oc === "O" && bs === "BUY") return "long";
  if (oc === "O" && bs === "SELL") return "short";
  if (oc === "C" && bs === "SELL") return "long";
  if (oc === "C" && bs === "BUY") return "short";
  return undefined;
}

export function parseIBKRCSV(csvContent: string): ParseResult {
  const parsed = Papa.parse<IBKRRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = [];
  for (const err of parsed.errors) {
    errors.push(`CSV parse error (row ${err.row}): ${err.message}`);
  }
  const trades: InboxTradeCandidate[] = [];

  for (const row of parsed.data) {
    // Skip repeated header rows (multi-account exports)
    if (row.ClientAccountID === "ClientAccountID") continue;

    // Skip summary rows (no Open/CloseIndicator)
    if (!row["Open/CloseIndicator"]?.trim()) continue;

    // Skip fill-level rows (ExchTrade)
    if (row.TransactionType?.trim() === "ExchTrade") continue;

    // Skip rows without DateTime
    if (!row.DateTime?.trim()) continue;

    try {
      const parsedQuantity = Math.abs(parseFloat(row.Quantity));
      const parsedPrice = parseFloat(row.TradePrice);
      const parsedTaxes = parseFloat(row.Taxes);
      const parsedDate = parseIBKRDateTime(row.DateTime);
      const buySell = row["Buy/Sell"].trim().toUpperCase();
      const side: "buy" | "sell" | undefined =
        buySell === "BUY" ? "buy" : buySell === "SELL" ? "sell" : undefined;
      const direction = inferDirection(
        row["Open/CloseIndicator"],
        row["Buy/Sell"],
      );

      // Composite string for dedup (unique per order)
      const externalId =
        row.ClientAccountID &&
        row.Symbol &&
        row.DateTime &&
        row.TradePrice &&
        row.Quantity
          ? `${row.ClientAccountID}|${row.Symbol}|${row.DateTime}|${row.TradePrice}|${row.Quantity}`
          : undefined;

      const trade = withParserValidation({
        assetType: "stock",
        brokerageAccountId: row.ClientAccountID,
        date: Number.isFinite(parsedDate) ? parsedDate : undefined,
        direction,
        externalId,
        fees: 0,
        orderType: row.OrderType?.trim() || undefined,
        price: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
        quantity: Number.isFinite(parsedQuantity) ? parsedQuantity : undefined,
        side,
        source: "ibkr",
        taxes: Number.isFinite(parsedTaxes) ? parsedTaxes : undefined,
        ticker: row.Symbol.trim().toUpperCase(),
      });
      trades.push(trade);
    } catch (e) {
      errors.push(
        `Failed to parse IBKR row for ${row.Symbol}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { errors, trades };
}
