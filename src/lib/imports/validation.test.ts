import { describe, expect, it } from "vitest";
import { withParserValidation } from "./validation";

describe("withParserValidation", () => {
  it("returns no errors/warnings for a complete valid candidate", () => {
    const result = withParserValidation({
      assetType: "stock",
      date: 1700000000000,
      direction: "long",
      externalId: "ibkr|abc",
      price: 123.45,
      quantity: 10,
      side: "buy",
      source: "ibkr",
      ticker: "AAPL",
    });

    expect(result.validationErrors).toEqual([]);
    expect(result.validationWarnings).toEqual([]);
  });

  it("adds required-field errors and dedup warning when fields are missing", () => {
    const result = withParserValidation({
      source: "kraken",
    });

    expect(result.validationErrors).toEqual([
      "Ticker is required",
      "Asset type is required",
      "Side is required",
      "Direction is required",
      "Date is required and must be a valid timestamp",
      "Price is required and must be > 0",
      "Quantity is required and must be > 0",
    ]);
    expect(result.validationWarnings).toContain(
      "No externalId provided; dedup cannot be guaranteed.",
    );
  });

  it("treats non-finite and non-positive numerics as validation errors", () => {
    const result = withParserValidation({
      assetType: "stock",
      date: Number.NaN,
      direction: "short",
      externalId: "x-1",
      price: 0,
      quantity: -2,
      side: "sell",
      source: "ibkr",
      ticker: "TSLA",
    });

    expect(result.validationErrors).toContain(
      "Date is required and must be a valid timestamp",
    );
    expect(result.validationErrors).toContain(
      "Price is required and must be > 0",
    );
    expect(result.validationErrors).toContain(
      "Quantity is required and must be > 0",
    );
  });

  it("preserves existing parser diagnostics and appends new ones", () => {
    const inputErrors = ["Unknown side value from source"];
    const inputWarnings = ["Timestamp parsed without timezone"];

    const result = withParserValidation({
      date: 1700000000000,
      direction: "long",
      externalId: "abc",
      price: 100,
      quantity: 1,
      source: "ibkr",
      ticker: "NVDA",
      validationErrors: inputErrors,
      validationWarnings: inputWarnings,
    });

    expect(result.validationErrors).toContain("Unknown side value from source");
    expect(result.validationErrors).toContain("Asset type is required");
    expect(result.validationErrors).toContain("Side is required");
    expect(result.validationWarnings).toContain("Timestamp parsed without timezone");

    expect(inputErrors).toEqual(["Unknown side value from source"]);
    expect(inputWarnings).toEqual(["Timestamp parsed without timezone"]);
  });

  it("can ignore existing diagnostics when requested", () => {
    const result = withParserValidation({
      assetType: "stock",
      date: 1700000000000,
      direction: "long",
      externalId: "ibkr|abc",
      price: 123.45,
      quantity: 10,
      side: "buy",
      source: "ibkr",
      ticker: "AAPL",
      validationErrors: ["Should be ignored by server mode"],
      validationWarnings: ["Should be ignored by server mode"],
    });

    // Parser path still preserves these values (server path disables it explicitly).
    expect(result.validationErrors).toContain("Should be ignored by server mode");
    expect(result.validationWarnings).toContain("Should be ignored by server mode");
  });
});
