import Papa from "papaparse";
import type { ParseResult } from "./types";
import type { InboxTradeCandidate } from "../../../shared/imports/types";
import { withParserValidation } from "./validation";

interface KrakenRow {
  aclass: string;
  cost: string;
  fee: string;
  ordertxid: string;
  ordertype: string;
  pair: string;
  time: string;
  type: string;
  vol: string;
}

export function parseKrakenCSV(csvContent: string): ParseResult {
  const parsed = Papa.parse<KrakenRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = [];

  // Group fills by ordertxid
  const orderMap = new Map<string, KrakenRow[]>();

  for (const row of parsed.data) {
    // Filter non-equity rows (e.g., USDC/USD forex)
    if (row.aclass !== "equity_pair") continue;

    const orderId = row.ordertxid?.trim();
    if (!orderId) continue;

    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, []);
    }
    orderMap.get(orderId)!.push(row);
  }

  const trades: InboxTradeCandidate[] = [];

  for (const [orderId, fills] of orderMap) {
    try {
      let totalCost = 0;
      let totalVol = 0;
      let totalFee = 0;
      let earliestTime = Infinity;
      let pair = "";
      let type = "";
      let ordertype = "";

      for (const fill of fills) {
        const cost = parseFloat(fill.cost);
        const vol = parseFloat(fill.vol);
        const fee = parseFloat(fill.fee);
        const time = new Date(fill.time.replace(" ", "T") + "Z").getTime();

        if (Number.isFinite(cost)) totalCost += cost;
        if (Number.isFinite(vol)) totalVol += vol;
        if (Number.isFinite(fee)) totalFee += fee;
        if (Number.isFinite(time) && time < earliestTime) earliestTime = time;
        pair = fill.pair;
        type = fill.type;
        ordertype = fill.ordertype;
      }

      const avgPrice = totalVol > 0 ? totalCost / totalVol : undefined;
      const ticker = pair.includes("/")
        ? pair.split("/")[0].toUpperCase()
        : undefined;
      const normalizedType = type.trim().toLowerCase();
      const side: "buy" | "sell" | undefined =
        normalizedType === "buy"
          ? "buy"
          : normalizedType === "sell"
            ? "sell"
            : undefined;

      const trade = withParserValidation({
        assetType: "crypto",
        date: Number.isFinite(earliestTime) ? earliestTime : undefined,
        direction: "long",
        externalId: orderId,
        fees: totalFee || undefined,
        orderType: ordertype?.trim() || undefined,
        price: avgPrice,
        quantity: totalVol,
        side,
        source: "kraken",
        taxes: 0,
        ticker,
      });
      trades.push(trade);
    } catch (e) {
      errors.push(
        `Failed to parse Kraken order ${orderId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { errors, trades };
}
