import { describe, expect, it } from "vitest";
import {
  NO_PORTFOLIO_FILTER_VALUE,
  buildTradeAccountKey,
  normalizeTradesAccountParam,
  normalizeTradesPortfolioParam,
  normalizeTradesTickerParam,
  parseTradeAccountKey,
  parseTradesQueryState,
} from "./filters";

describe("trade filter helpers", () => {
  it("normalizes optional URL params", () => {
    expect(normalizeTradesTickerParam("  aapl ")).toBe("aapl");
    expect(normalizeTradesPortfolioParam("  portfolio-123 ")).toBe(
      "portfolio-123",
    );
    expect(normalizeTradesPortfolioParam("   ")).toBeNull();
    expect(normalizeTradesPortfolioParam(NO_PORTFOLIO_FILTER_VALUE)).toBe(
      NO_PORTFOLIO_FILTER_VALUE,
    );
  });

  it("parses and normalizes account keys", () => {
    expect(parseTradeAccountKey(" ibkr|U123456 ")).toEqual({
      accountId: "U123456",
      source: "ibkr",
    });
    expect(buildTradeAccountKey({ accountId: "account-1", source: "kraken" })).toBe(
      "kraken|account-1",
    );
    expect(normalizeTradesAccountParam(" kraken|default ")).toBe(
      "kraken|default",
    );
  });

  it("rejects invalid account keys", () => {
    expect(parseTradeAccountKey("")).toBeNull();
    expect(parseTradeAccountKey("ibkr")).toBeNull();
    expect(parseTradeAccountKey("manual|acct")).toBeNull();
    expect(parseTradeAccountKey("ibkr|   ")).toBeNull();
    expect(normalizeTradesAccountParam("manual|acct")).toBeNull();
  });

  it("builds listTradesPage query args from URL params", () => {
    const result = parseTradesQueryState({
      account: "ibkr|U123456",
      cursor: "  opaque-cursor  ",
      endDate: "2026-03-09",
      pageSize: "50",
      portfolio: "none",
      startDate: "2026-03-01",
      ticker: "  nvda ",
    });

    expect(result).toMatchObject({
      accountId: "U123456",
      accountSource: "ibkr",
      paginationOpts: {
        cursor: "opaque-cursor",
        numItems: 50,
      },
      portfolioId: undefined,
      ticker: "nvda",
      withoutPortfolio: true,
    });
    expect(result.startDate).toBe(new Date(2026, 2, 1, 0, 0, 0, 0).getTime());
    expect(result.endDate).toBe(
      new Date(2026, 2, 9, 23, 59, 59, 999).getTime(),
    );
  });

  it("ignores malformed account params and invalid page sizes", () => {
    const result = parseTradesQueryState({
      account: "broken",
      pageSize: "999",
      portfolio: "portfolio-1",
    });

    expect(result).toMatchObject({
      accountId: undefined,
      accountSource: undefined,
      paginationOpts: {
        cursor: null,
        numItems: 25,
      },
      portfolioId: "portfolio-1",
      withoutPortfolio: undefined,
    });
  });
});
