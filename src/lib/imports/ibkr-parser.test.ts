import { describe, expect, it } from "vitest";
import { parseIBKRCSV } from "./ibkr-parser";

describe("parseIBKRCSV", () => {
  it("maps documented IBKR fields into normalized trades", () => {
    const csv = [
      "ClientAccountID,Symbol,Buy/Sell,Open/CloseIndicator,TradePrice,Quantity,DateTime,Taxes,OrderType,TransactionType",
      "U18731407,AAPL,BUY,O,200.5,-3,20260220;093000,1.25,LMT,",
    ].join("\n");

    const result = parseIBKRCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(1);

    const trade = result.trades[0];
    expect(trade).toMatchObject({
      ticker: "AAPL",
      assetType: "stock",
      side: "buy",
      direction: "long",
      price: 200.5,
      quantity: 3,
      source: "ibkr",
      fees: 0,
      taxes: 1.25,
      orderType: "LMT",
      brokerageAccountId: "U18731407",
    });
    expect(trade.validationErrors).toEqual([]);
    expect(trade.validationWarnings).toEqual([]);

    expect(trade.date).toBe(new Date(2026, 1, 20, 9, 30, 0).getTime());
  });

  it("applies direction inference matrix from Open/CloseIndicator + Buy/Sell", () => {
    const csv = [
      "ClientAccountID,Symbol,Buy/Sell,Open/CloseIndicator,TradePrice,Quantity,DateTime,Taxes,OrderType,TransactionType",
      "U1,TSLA,BUY,O,100,1,20260220;101500,0,MKT,",
      "U1,TSLA,SELL,O,100,1,20260220;101501,0,MKT,",
      "U1,TSLA,SELL,C,100,1,20260220;101502,0,MKT,",
      "U1,TSLA,BUY,C,100,1,20260220;101503,0,MKT,",
    ].join("\n");

    const result = parseIBKRCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades.map((t) => t.direction)).toEqual([
      "long",
      "short",
      "long",
      "short",
    ]);
  });

  it("skips known non-order rows from IBKR exports", () => {
    const csv = [
      "ClientAccountID,Symbol,Buy/Sell,Open/CloseIndicator,TradePrice,Quantity,DateTime,Taxes,OrderType,TransactionType",
      "ClientAccountID,Symbol,Buy/Sell,Open/CloseIndicator,TradePrice,Quantity,DateTime,Taxes,OrderType,TransactionType",
      "U1,MSFT,BUY,,100,1,20260220;101500,0,LMT,",
      "U1,MSFT,BUY,O,100,1,,0,LMT,",
      "U1,MSFT,BUY,O,100,1,20260220;101500,0,LMT,ExchTrade",
      "U1,MSFT,BUY,O,100,1,20260220;101500,0,LMT,",
    ].join("\n");

    const result = parseIBKRCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].ticker).toBe("MSFT");
  });

  it("builds externalId from the documented composite components", () => {
    const csv = [
      "ClientAccountID,Symbol,Buy/Sell,Open/CloseIndicator,TradePrice,Quantity,DateTime,Taxes,OrderType,TransactionType",
      "U1,NVDA,SELL,C,555.1,-2,20260220;150501,0,MKT,",
    ].join("\n");

    const result = parseIBKRCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].externalId).toContain("U1");
    expect(result.trades[0].externalId).toContain("NVDA");
    expect(result.trades[0].externalId).toContain("20260220;150501");
    expect(result.trades[0].externalId).toContain("555.1");
    expect(result.trades[0].externalId).toContain("-2");
  });

  it("adds parser validation errors when side/direction cannot be inferred", () => {
    const csv = [
      "ClientAccountID,Symbol,Buy/Sell,Open/CloseIndicator,TradePrice,Quantity,DateTime,Taxes,OrderType,TransactionType",
      "U1,NVDA,HOLD,X,555.1,-2,20260220;150501,0,MKT,",
    ].join("\n");

    const result = parseIBKRCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].side).toBeUndefined();
    expect(result.trades[0].direction).toBeUndefined();
    expect(result.trades[0].validationErrors).toContain("Side is required");
    expect(result.trades[0].validationErrors).toContain("Direction is required");
  });
});
