import { describe, expect, it } from "vitest";
import {
  MANUAL_IMPORT_HEADERS,
  MANUAL_IMPORT_TEMPLATE_CSV,
  parseManualCSV,
} from "./manual-parser";

describe("parseManualCSV", () => {
  it("maps exact manual fields into normalized trades", () => {
    const csv = [
      MANUAL_IMPORT_HEADERS.join(","),
      "aapl,stock,buy,long,2026-02-20T14:30:00.000Z,200.5,3,manual-1,Account 1,LMT,1.25,0.5",
    ].join("\n");

    const result = parseManualCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      assetType: "stock",
      brokerageAccountId: "Account 1",
      direction: "long",
      externalId: "manual-1",
      fees: 1.25,
      orderType: "LMT",
      price: 200.5,
      quantity: 3,
      side: "buy",
      source: "manual",
      taxes: 0.5,
      ticker: "AAPL",
      validationErrors: [],
      validationWarnings: [],
    });
    expect(result.trades[0].date).toBe(Date.parse("2026-02-20T14:30:00.000Z"));
  });

  it("parses millisecond timestamp dates", () => {
    const csv = [
      MANUAL_IMPORT_HEADERS.join(","),
      "BTC,crypto,buy,long,1771597800000,50000,0.1,manual-2,,,,",
    ].join("\n");

    const result = parseManualCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades[0].date).toBe(1_771_597_800_000);
  });

  it("keeps downloadable template examples parseable", () => {
    const result = parseManualCSV(MANUAL_IMPORT_TEMPLATE_CSV);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(2);
    expect(result.trades.map((trade) => trade.assetType)).toEqual([
      "stock",
      "crypto",
    ]);
    expect(result.trades.map((trade) => trade.side)).toEqual(["buy", "sell"]);
    expect(result.trades.map((trade) => trade.direction)).toEqual([
      "long",
      "long",
    ]);
    expect(result.trades[0].date).toBe(Date.parse("2026-02-20T14:30:00.000Z"));
    expect(result.trades[1].date).toBe(1_771_597_800_000);
  });

  it("reports missing template headers before parsing rows", () => {
    const csv = [
      "ticker,assetType,side,direction,date,price,externalId",
      "AAPL,stock,buy,long,2026-02-20,200,manual-3",
    ].join("\n");

    const result = parseManualCSV(csv);

    expect(result.trades).toEqual([]);
    expect(result.errors).toContain("Missing header: quantity");
    expect(result.errors).toContain("Missing header: taxes");
  });

  it("reports unexpected headers before parsing rows", () => {
    const csv = [
      `${MANUAL_IMPORT_HEADERS.join(",")},notes`,
      "AAPL,stock,buy,long,2026-02-20,200,3,manual-3,,,,,extra",
    ].join("\n");

    const result = parseManualCSV(csv);

    expect(result.trades).toEqual([]);
    expect(result.errors).toContain("Unexpected header: notes");
  });

  it("keeps the dedupe warning when externalId is missing", () => {
    const csv = [
      MANUAL_IMPORT_HEADERS.join(","),
      "AAPL,stock,buy,long,2026-02-20,200,3,,,,,",
    ].join("\n");

    const result = parseManualCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades[0].validationErrors).toEqual([]);
    expect(result.trades[0].validationWarnings).toContain(
      "No externalId provided; dedup cannot be guaranteed.",
    );
  });

  it("adds row-level validation errors for invalid enums and numbers", () => {
    const csv = [
      MANUAL_IMPORT_HEADERS.join(","),
      "AAPL,equity,hold,flat,not-a-date,nope,-3,manual-4,,,,",
    ].join("\n");

    const result = parseManualCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].validationErrors).toEqual(
      expect.arrayContaining([
        'assetType must be "stock" or "crypto"',
        'side must be "buy" or "sell"',
        'direction must be "long" or "short"',
        "date must be an ISO date/datetime or millisecond timestamp",
        "price must be a valid number",
        "Asset type is required",
        "Side is required",
        "Direction is required",
        "Date is required and must be a valid timestamp",
        "Price is required and must be > 0",
        "Quantity is required and must be > 0",
      ]),
    );
  });
});
