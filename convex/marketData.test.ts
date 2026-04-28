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

  afterEach(async () => {
    await t.finishInProgressScheduledFunctions();
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

  it("blocks createTrade when the symbol cannot be auto-resolved", async () => {
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

    await expect(
      asUser().action(api.trades.createTrade, {
        assetType: "stock",
        date: Date.UTC(2026, 3, 24),
        direction: "long",
        price: 190,
        quantity: 1,
        side: "buy",
        ticker: "  nvda ",
      }),
    ).rejects.toThrow(/Price mapping required for NVDA/);

    const stockInstrument = await asUser().query(
      api.marketData.getInstrumentBySymbol,
      {
        assetType: "stock",
        ticker: "NVDA",
      },
    );
    expect(stockInstrument).toMatchObject({
      provider: "twelve_data",
      resolutionStatus: "needs_review",
      symbol: "NVDA",
    });
  });

  it("inserts a trade when createTrade can auto-resolve the symbol", async () => {
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
                symbol: "NVDA",
              },
            ],
            status: "ok",
          }),
          { status: 200 },
        );
      }),
    );

    const tradeId = await asUser().action(api.trades.createTrade, {
      assetType: "stock",
      date: Date.UTC(2026, 3, 24),
      direction: "long",
      price: 190,
      quantity: 1,
      side: "buy",
      ticker: " nvda ",
    });

    expect(tradeId).toEqual(expect.any(String));

    const instrument = await asUser().query(
      api.marketData.getInstrumentBySymbol,
      {
        assetType: "stock",
        ticker: "NVDA",
      },
    );
    expect(instrument).toMatchObject({
      provider: "twelve_data",
      providerSymbol: "NVDA",
      resolutionStatus: "resolved",
      symbol: "NVDA",
    });
  });

  it("creates needs-review instrument records when imports stage new tickers", async () => {
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

    await t.finishInProgressScheduledFunctions();

    const cryptoInstrument = await asUser().query(
      api.marketData.getInstrumentBySymbol,
      {
        assetType: "crypto",
        ticker: "BTC",
      },
    );
    expect(cryptoInstrument).toMatchObject({
      provider: "twelve_data",
      resolutionStatus: "needs_review",
      symbol: "BTC",
    });
  });

  it("blocks acceptTrade when the symbol cannot be resolved", async () => {
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

    await asUser().mutation(api.imports.importTrades, {
      trades: [
        {
          assetType: "stock",
          date: Date.UTC(2026, 3, 24),
          direction: "long",
          price: 190,
          quantity: 1,
          side: "buy",
          source: "ibkr",
          ticker: "NOPE",
        },
      ],
    });
    await t.finishInProgressScheduledFunctions();

    const inboxTrades = await asUser().query(api.imports.listInboxTrades, {});
    expect(inboxTrades).toHaveLength(1);

    const result = await asUser().action(api.imports.acceptTrade, {
      inboxTradeId: inboxTrades[0]._id,
    });

    expect(result.accepted).toBe(false);
    expect(result.error).toContain("Price mapping required for NOPE");
  });

  it("accepts a trade once the user manually fixes the provider symbol", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/symbol_search")) {
          return new Response(
            JSON.stringify({
              data: [],
              status: "ok",
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            meta: { symbol: "WEIRD.US" },
            status: "ok",
            values: [{ close: "10.25", datetime: "2026-04-24" }],
          }),
          { status: 200 },
        );
      }),
    );

    await asUser().mutation(api.imports.importTrades, {
      trades: [
        {
          assetType: "stock",
          date: Date.UTC(2026, 3, 24),
          direction: "long",
          price: 190,
          quantity: 1,
          side: "buy",
          source: "ibkr",
          ticker: "weird",
        },
      ],
    });
    await t.finishInProgressScheduledFunctions();

    const instrument = await asUser().query(
      api.marketData.getInstrumentBySymbol,
      {
        assetType: "stock",
        ticker: "WEIRD",
      },
    );
    expect(instrument).not.toBeNull();

    await asUser().action(api.marketData.setProviderSymbol, {
      instrumentId: instrument!._id,
      providerSymbol: "WEIRD.US",
    });

    const inboxTrades = await asUser().query(api.imports.listInboxTrades, {});
    const result = await asUser().action(api.imports.acceptTrade, {
      inboxTradeId: inboxTrades[0]._id,
    });
    expect(result.accepted).toBe(true);
  });
});
