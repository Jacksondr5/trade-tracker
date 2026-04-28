// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

describe("market data instruments", () => {
  const ownerId = "owner-a";

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
    process.env.TWELVE_DATA_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TWELVE_DATA_API_KEY;
  });

  function asUser() {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  it("resolves a stock ticker to a Twelve Data provider symbol", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: [
              {
                country: "United States",
                currency: "USD",
                exchange: "NASDAQ",
                instrument_type: "Common Stock",
                symbol: "AAPL",
              },
            ],
            status: "ok",
          }),
          { status: 200 },
        );
      }),
    );

    const result = await asUser().action(api.marketData.resolveInstrument, {
      assetType: "stock",
      ticker: " aapl ",
    });

    expect(result.status).toBe("resolved");
    expect(result.instrument).toMatchObject({
      assetType: "stock",
      provider: "twelve_data",
      providerSymbol: "AAPL",
      resolutionStatus: "resolved",
      symbol: "AAPL",
    });
    expect(result.instrument.lastError).toBeUndefined();
    expect(result.instrument.lastResolvedAt).toEqual(expect.any(Number));
  });

  it("stores useful review state when crypto resolution fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: [],
            status: "ok",
          }),
          { status: 200 },
        );
      }),
    );

    const result = await asUser().action(api.marketData.resolveInstrument, {
      assetType: "crypto",
      ticker: "NOPE",
    });

    expect(result.status).toBe("needs_review");
    expect(result.instrument).toMatchObject({
      assetType: "crypto",
      provider: "twelve_data",
      resolutionStatus: "needs_review",
      symbol: "NOPE",
    });
    expect(result.instrument.lastError).toContain(
      "No Twelve Data symbol match found",
    );
  });

  it("fetches a daily close for a resolved instrument", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: [
              {
                country: "United States",
                currency: "USD",
                exchange: "NASDAQ",
                instrument_type: "Common Stock",
                symbol: "MSFT",
              },
            ],
            status: "ok",
          }),
          { status: 200 },
        );
      }),
    );

    const resolution = await asUser().action(api.marketData.resolveInstrument, {
      assetType: "stock",
      ticker: "MSFT",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            meta: { symbol: "MSFT" },
            status: "ok",
            values: [{ close: "427.50", datetime: "2026-04-24" }],
          }),
          { status: 200 },
        );
      }),
    );

    const close = await asUser().action(api.marketData.fetchDailyClose, {
      date: "2026-04-24",
      instrumentId: resolution.instrument._id,
    });

    expect(close).toEqual({
      close: 427.5,
      date: "2026-04-24",
      provider: "twelve_data",
      providerSymbol: "MSFT",
    });
  });

  it("creates needs-review instrument records when new trade tickers appear", async () => {
    await asUser().mutation(api.trades.createTrade, {
      assetType: "stock",
      date: Date.UTC(2026, 3, 24),
      direction: "long",
      price: 190,
      quantity: 1,
      side: "buy",
      ticker: "  nvda ",
    });

    await asUser().mutation(api.imports.importTrades, {
      trades: [
        {
          assetType: "crypto",
          date: Date.UTC(2026, 3, 24),
          direction: "long",
          price: 65000,
          quantity: 0.1,
          side: "buy",
          source: "kraken",
          ticker: "btc",
        },
      ],
    });

    const stockInstrument = await asUser().query(
      api.marketData.getInstrumentBySymbol,
      {
        assetType: "stock",
        ticker: "NVDA",
      },
    );
    const cryptoInstrument = await asUser().query(
      api.marketData.getInstrumentBySymbol,
      {
        assetType: "crypto",
        ticker: "BTC",
      },
    );

    expect(stockInstrument).toMatchObject({
      provider: "twelve_data",
      resolutionStatus: "needs_review",
      symbol: "NVDA",
    });
    expect(cryptoInstrument).toMatchObject({
      provider: "twelve_data",
      resolutionStatus: "needs_review",
      symbol: "BTC",
    });
  });
});
