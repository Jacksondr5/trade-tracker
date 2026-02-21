import Papa from "papaparse";
import type { NormalizedTrade, ParseResult } from "./types";

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

  const trades: NormalizedTrade[] = [];

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
        const time = new Date(fill.time.replace(" ", "T")).getTime();

        totalCost += cost;
        totalVol += vol;
        totalFee += fee;
        if (time < earliestTime) earliestTime = time;
        pair = fill.pair;
        type = fill.type;
        ordertype = fill.ordertype;
      }

      const avgPrice = totalVol > 0 ? totalCost / totalVol : 0;
      const ticker = pair.split("/")[0].toUpperCase();
      const side: "buy" | "sell" =
        type.trim().toLowerCase() === "buy" ? "buy" : "sell";

      trades.push({
        assetType: "stock",
        date: earliestTime,
        direction: "long",
        externalId: orderId,
        fees: totalFee || undefined,
        orderType: ordertype?.trim() || undefined,
        price: avgPrice,
        quantity: totalVol,
        side,
        source: "kraken",
        taxes: undefined,
        ticker,
      });
    } catch (e) {
      errors.push(
        `Failed to parse Kraken order ${orderId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { errors, trades };
}
