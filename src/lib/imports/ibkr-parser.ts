import Papa from "papaparse";
import type { NormalizedTrade, ParseResult } from "./types";

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
  const [datePart, timePart] = dt.split(";");
  const year = parseInt(datePart.slice(0, 4));
  const month = parseInt(datePart.slice(4, 6)) - 1;
  const day = parseInt(datePart.slice(6, 8));
  const hour = parseInt(timePart.slice(0, 2));
  const minute = parseInt(timePart.slice(2, 4));
  const second = parseInt(timePart.slice(4, 6));
  return new Date(year, month, day, hour, minute, second).getTime();
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
): "long" | "short" {
  const oc = openClose.trim().toUpperCase();
  const bs = buySell.trim().toUpperCase();
  if (oc === "O" && bs === "BUY") return "long";
  if (oc === "O" && bs === "SELL") return "short";
  if (oc === "C" && bs === "SELL") return "long";
  if (oc === "C" && bs === "BUY") return "short";
  return "long";
}

export function parseIBKRCSV(csvContent: string): ParseResult {
  const parsed = Papa.parse<IBKRRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = [];
  const trades: NormalizedTrade[] = [];

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
      const quantity = Math.abs(parseFloat(row.Quantity));
      const price = parseFloat(row.TradePrice);
      const taxes = parseFloat(row.Taxes) || 0;
      const date = parseIBKRDateTime(row.DateTime);
      const buySell = row["Buy/Sell"].trim().toUpperCase();
      const side: "buy" | "sell" = buySell === "BUY" ? "buy" : "sell";
      const direction = inferDirection(
        row["Open/CloseIndicator"],
        row["Buy/Sell"],
      );

      // Composite string for dedup (unique per order)
      const externalId = `${row.ClientAccountID}|${row.Symbol}|${row.DateTime}|${row.TradePrice}|${row.Quantity}`;

      trades.push({
        assetType: "stock",
        brokerageAccountId: row.ClientAccountID,
        date,
        direction,
        externalId,
        fees: 0,
        orderType: row.OrderType?.trim() || undefined,
        price,
        quantity,
        side,
        source: "ibkr",
        taxes: taxes || undefined,
        ticker: row.Symbol.trim().toUpperCase(),
      });
    } catch (e) {
      errors.push(
        `Failed to parse IBKR row for ${row.Symbol}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { errors, trades };
}
