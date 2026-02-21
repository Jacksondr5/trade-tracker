import { describe, expect, it } from "vitest";
import { parseKrakenCSV } from "./kraken-parser";

describe("parseKrakenCSV", () => {
  it("filters non-equity rows and aggregates fills by ordertxid", () => {
    const csv = [
      "aclass,cost,fee,ordertxid,ordertype,pair,time,type,vol",
      "equity_pair,20,0.2,order-1,limit,WAB/USD,2026-02-20 09:45:00,buy,2",
      "equity_pair,15,0.1,order-1,limit,WAB/USD,2026-02-20 09:30:00,buy,1",
      "equity_pair,40,0.3,order-2,market,MSFT/USD,2026-02-20 10:00:00,sell,4",
      "forex,99,1.0,forex-1,market,USDC/USD,2026-02-20 08:00:00,buy,100",
    ].join("\n");

    const result = parseKrakenCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(2);

    const order1 = result.trades.find((t) => t.externalId === "order-1");
    expect(order1).toBeDefined();
    expect(order1).toMatchObject({
      ticker: "WAB",
      side: "buy",
      direction: "long",
      assetType: "stock",
      source: "kraken",
      quantity: 3,
      price: 35 / 3,
      orderType: "limit",
    });
    expect(order1?.fees).toBeCloseTo(0.3);
    expect(order1?.date).toBe(new Date("2026-02-20T09:30:00Z").getTime());

    const order2 = result.trades.find((t) => t.externalId === "order-2");
    expect(order2).toBeDefined();
    expect(order2).toMatchObject({
      ticker: "MSFT",
      side: "sell",
      direction: "long",
      assetType: "stock",
      source: "kraken",
      quantity: 4,
      price: 10,
      fees: 0.3,
      orderType: "market",
    });
    expect(order2?.validationErrors).toEqual([]);
    expect(order2?.validationWarnings).toEqual([]);
  });

  it("uses ordertxid as externalId and omits rows without ordertxid", () => {
    const csv = [
      "aclass,cost,fee,ordertxid,ordertype,pair,time,type,vol",
      "equity_pair,10,0.1,,limit,ABCD/USD,2026-02-20 09:00:00,buy,1",
      "equity_pair,20,0.2,order-3,limit,ABCD/USD,2026-02-20 09:01:00,buy,2",
    ].join("\n");

    const result = parseKrakenCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].externalId).toBe("order-3");
  });

  it("sets taxes to zero for Kraken trades per MVP mapping", () => {
    const csv = [
      "aclass,cost,fee,ordertxid,ordertype,pair,time,type,vol",
      "equity_pair,10,0.1,order-4,market,SHOP/USD,2026-02-20 09:00:00,buy,1",
    ].join("\n");

    const result = parseKrakenCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].taxes).toBe(0);
  });

  it("adds parser validation errors when side cannot be inferred", () => {
    const csv = [
      "aclass,cost,fee,ordertxid,ordertype,pair,time,type,vol",
      "equity_pair,10,0.1,order-5,market,SHOP/USD,2026-02-20 09:00:00,hold,1",
    ].join("\n");

    const result = parseKrakenCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].side).toBeUndefined();
    expect(result.trades[0].validationErrors).toContain("Side is required");
  });
});
