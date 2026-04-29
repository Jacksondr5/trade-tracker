// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.unstubAllGlobals();
    delete process.env.TWELVE_DATA_API_KEY;
  });

  function asUser() {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  async function insertPortfolio(): Promise<Id<"portfolios">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolios", {
        name: "Long-term",
        ownerId,
      });
    });
  }

  async function insertResolvedInstrument(args: {
    assetType?: "crypto" | "stock";
    providerSymbol?: string;
    symbol: string;
  }): Promise<Id<"marketDataInstruments">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("marketDataInstruments", {
        assetType: args.assetType ?? "stock",
        createdAt: Date.UTC(2026, 3, 24),
        lastResolvedAt: Date.UTC(2026, 3, 24),
        ownerId,
        provider: "twelve_data",
        providerSymbol: args.providerSymbol ?? args.symbol,
        resolutionStatus: "resolved",
        symbol: args.symbol,
        updatedAt: Date.UTC(2026, 3, 24),
      });
    });
  }

  async function insertTrade(args: {
    assetType?: "crypto" | "stock";
    date?: number;
    portfolioId?: Id<"portfolios">;
    quantity?: number;
    side?: "buy" | "sell";
    ticker: string;
  }): Promise<Id<"trades">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("trades", {
        assetType: args.assetType ?? "stock",
        date: args.date ?? Date.UTC(2026, 3, 24),
        direction: "long",
        ownerId,
        portfolioId: args.portfolioId,
        price: 100,
        quantity: args.quantity ?? 1,
        side: args.side ?? "buy",
        ticker: args.ticker,
      });
    });
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

  it("refreshes daily snapshots for resolved instruments used by open portfolio positions", async () => {
    const portfolioId = await insertPortfolio();
    await insertResolvedInstrument({
      symbol: "AAPL",
    });
    await insertResolvedInstrument({
      symbol: "MSFT",
    });
    await insertResolvedInstrument({ symbol: "TSLA" });
    await insertTrade({ portfolioId, ticker: "AAPL" });
    await insertTrade({ portfolioId, ticker: "MSFT" });
    await insertTrade({ ticker: "TSLA" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const symbol = new URL(url).searchParams.get("symbol");
        if (symbol === "MSFT") {
          return new Response(JSON.stringify({ status: "ok", values: [] }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            status: "ok",
            values: [{ close: "202.25", datetime: "2026-04-24" }],
          }),
          { status: 200 },
        );
      }),
    );

    const result = await t.action(
      internal.marketData.refreshDailyPriceSnapshots,
      {
        date: "2026-04-24",
      },
    );
    const workerResult = await t.action(
      internal.marketData.processMarketDataFetchJobs,
      {
        budgetCredits: 8,
      },
    );

    const snapshots = await t.run(async (ctx) => {
      const rows = await ctx.db.query("marketPriceSnapshots").collect();
      return rows.filter((row) => row.date === "2026-04-24");
    });
    const run = await t.run(async (ctx) => {
      const rows = await ctx.db.query("marketDataRefreshRuns").collect();
      return (
        rows.find(
          (row) => row.ownerId === ownerId && row.runDate === "2026-04-24",
        ) ?? null
      );
    });
    const jobs = await t.run(async (ctx) => {
      return await ctx.db.query("marketDataFetchJobs").collect();
    });

    expect(result).toMatchObject({
      jobsQueued: 2,
      ownersProcessed: 1,
      runDate: "2026-04-24",
      symbolsRequested: 2,
    });
    expect(workerResult).toMatchObject({
      creditsUsed: 2,
      jobsFailed: 1,
      jobsProcessed: 2,
      jobsSucceeded: 1,
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          close: 202.25,
          provider: "twelve_data",
          providerSymbol: "AAPL",
          status: "ok",
        }),
        expect.objectContaining({
          errorMessage: expect.stringContaining("No daily close returned"),
          provider: "twelve_data",
          providerSymbol: "MSFT",
          status: "missing",
        }),
      ]),
    );
    expect(snapshots).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerSymbol: "TSLA",
        }),
      ]),
    );
    expect(run).toMatchObject({
      completedAt: expect.any(Number),
      provider: "twelve_data",
      status: "partial",
      symbolsFailed: 1,
      symbolsRequested: 2,
      symbolsSucceeded: 1,
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      providerSymbol: "MSFT",
      status: "failed",
      symbol: "MSFT",
    });
  });

  it("includes open positions older than the most recent trades in refresh universe", async () => {
    const portfolioId = await insertPortfolio();
    await insertResolvedInstrument({
      symbol: "AAPL",
    });
    await insertTrade({ portfolioId, ticker: "AAPL" });

    for (let index = 0; index < 1_005; index += 1) {
      const side = index % 2 === 0 ? "buy" : "sell";
      await insertTrade({
        portfolioId,
        quantity: 1,
        side,
        ticker: "TSLA",
      });
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const symbol = new URL(url).searchParams.get("symbol");
        if (symbol !== "AAPL") {
          return new Response(JSON.stringify({ status: "ok", values: [] }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            status: "ok",
            values: [{ close: "215.75", datetime: "2026-04-24" }],
          }),
          { status: 200 },
        );
      }),
    );

    const result = await t.action(
      internal.marketData.refreshDailyPriceSnapshots,
      {
        date: "2026-04-24",
      },
    );
    await t.action(internal.marketData.processMarketDataFetchJobs, {
      budgetCredits: 8,
    });

    const snapshots = await t.run(async (ctx) => {
      const rows = await ctx.db.query("marketPriceSnapshots").collect();
      return rows.filter(
        (row) =>
          row.providerSymbol === "AAPL" && row.date === "2026-04-24",
      );
    });

    expect(result).toMatchObject({
      jobsQueued: 1,
      ownersProcessed: 1,
      symbolsRequested: 1,
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      close: 215.75,
      status: "ok",
    });
  });

  it("upserts existing daily snapshots during refresh", async () => {
    const portfolioId = await insertPortfolio();
    await insertResolvedInstrument({ symbol: "AAPL" });
    await insertTrade({ portfolioId, ticker: "AAPL" });
    await t.run(async (ctx) => {
      await ctx.db.insert("marketPriceSnapshots", {
        close: 190,
        date: "2026-04-24",
        fetchedAt: Date.UTC(2026, 3, 24),
        provider: "twelve_data",
        providerSymbol: "AAPL",
        status: "ok",
      });
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            status: "ok",
            values: [{ close: "205.50", datetime: "2026-04-24" }],
          }),
          { status: 200 },
        );
      }),
    );

    await t.action(internal.marketData.refreshDailyPriceSnapshots, {
      date: "2026-04-24",
    });
    await t.action(internal.marketData.processMarketDataFetchJobs, {
      budgetCredits: 8,
    });

    const snapshots = await t.run(async (ctx) => {
      const rows = await ctx.db.query("marketPriceSnapshots").collect();
      return rows.filter(
        (row) =>
          row.providerSymbol === "AAPL" && row.date === "2026-04-24",
      );
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      close: 205.5,
      status: "ok",
    });
  });

  it("backfills historical snapshots for portfolio trades and benchmark instruments idempotently", async () => {
    const portfolioId = await insertPortfolio();
    await insertTrade({
      date: Date.UTC(2026, 3, 22),
      portfolioId,
      ticker: "AAPL",
    });

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
        const symbol = parsed.searchParams.get("symbol");

        if (parsed.pathname.endsWith("/symbol_search")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  country: "United States",
                  currency: "USD",
                  exchange: "NASDAQ",
                  instrument_type:
                    symbol === "SPY" ? "ETF" : "Common Stock",
                  symbol,
                },
              ],
              status: "ok",
            }),
            { status: 200 },
          );
        }

        const baseClose = symbol === "SPY" ? 500 : 200;
        return new Response(
          JSON.stringify({
            status: "ok",
            values: [
              { close: `${baseClose + 2}`, datetime: "2026-04-24" },
              { close: `${baseClose + 1}`, datetime: "2026-04-23" },
              { close: `${baseClose}`, datetime: "2026-04-22" },
            ],
          }),
          { status: 200 },
        );
      }),
    );

    const firstRun = await asUser().action(
      api.marketData.backfillHistoricalPriceSnapshots,
      {
        endDate: "2026-04-24",
      },
    );
    const firstWorkerRun = await t.action(
      internal.marketData.processMarketDataFetchJobs,
      {
        budgetCredits: 8,
      },
    );
    const secondRun = await asUser().action(
      api.marketData.backfillHistoricalPriceSnapshots,
      {
        endDate: "2026-04-24",
      },
    );
    const secondWorkerRun = await t.action(
      internal.marketData.processMarketDataFetchJobs,
      {
        budgetCredits: 8,
      },
    );

    const snapshots = await t.run(async (ctx) => {
      return await ctx.db.query("marketPriceSnapshots").collect();
    });
    const runs = await t.run(async (ctx) => {
      return await ctx.db.query("marketDataRefreshRuns").collect();
    });

    expect(firstRun).toMatchObject({
      endDate: "2026-04-24",
      jobsQueued: 2,
      startDate: "2026-04-22",
      symbolsRequested: 2,
    });
    expect(firstWorkerRun).toMatchObject({
      creditsUsed: 4,
      jobsFailed: 0,
      jobsProcessed: 2,
      jobsSucceeded: 2,
    });
    expect(secondRun).toMatchObject({
      jobsQueued: 2,
      symbolsRequested: 2,
    });
    expect(secondWorkerRun).toMatchObject({
      creditsUsed: 2,
      jobsFailed: 0,
      jobsProcessed: 2,
      jobsSucceeded: 2,
    });
    expect(snapshots).toHaveLength(6);
    expect(snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          close: 202,
          date: "2026-04-24",
          status: "ok",
        }),
        expect.objectContaining({
          close: 501,
          date: "2026-04-23",
          status: "ok",
        }),
      ]),
    );
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({
      provider: "twelve_data",
      status: "completed",
      symbolsFailed: 0,
      symbolsRequested: 2,
      symbolsSucceeded: 2,
    });
  });

  it("records failed historical backfill symbols for follow-up", async () => {
    const portfolioId = await insertPortfolio();
    const tradeId = await insertTrade({
      date: Date.UTC(2026, 3, 22),
      portfolioId,
      ticker: "NOPE",
    });

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
        const symbol = parsed.searchParams.get("symbol");

        if (parsed.pathname.endsWith("/symbol_search")) {
          return new Response(
            JSON.stringify({
              data:
                symbol === "SPY"
                  ? [
                      {
                        country: "United States",
                        currency: "USD",
                        exchange: "NYSE",
                        instrument_type: "ETF",
                        symbol: "SPY",
                      },
                    ]
                  : [],
              status: "ok",
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            status: "ok",
            values: [
              { close: "503.25", datetime: "2026-04-24" },
              { close: "501.00", datetime: "2026-04-22" },
            ],
          }),
          { status: 200 },
        );
      }),
    );

    const result = await asUser().action(
      api.marketData.backfillHistoricalPriceSnapshots,
      {
        endDate: "2026-04-24",
      },
    );
    const workerResult = await t.action(
      internal.marketData.processMarketDataFetchJobs,
      {
        budgetCredits: 8,
      },
    );

    const nopeInstrument = await asUser().query(
      api.marketData.getInstrumentBySymbol,
      {
        assetType: "stock",
        ticker: "NOPE",
      },
    );
    const snapshots = await t.run(async (ctx) => {
      return await ctx.db.query("marketPriceSnapshots").collect();
    });
    const runs = await t.run(async (ctx) => {
      return await ctx.db.query("marketDataRefreshRuns").collect();
    });
    const jobs = await t.run(async (ctx) => {
      return await ctx.db.query("marketDataFetchJobs").collect();
    });

    expect(result).toMatchObject({
      jobsQueued: 2,
      symbolsRequested: 2,
    });
    expect(workerResult).toMatchObject({
      creditsUsed: 4,
      jobsFailed: 1,
      jobsProcessed: 2,
      jobsSucceeded: 1,
    });
    expect(jobs.find((job) => job.symbol === "NOPE")).toMatchObject({
      errorMessage: expect.stringContaining(tradeId),
      sourceTradeIds: [tradeId],
      status: "failed",
      symbol: "NOPE",
    });
    expect(jobs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "completed",
        }),
      ]),
    );
    expect(jobs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: "SPY",
        }),
      ]),
    );
    expect(nopeInstrument).toMatchObject({
      lastError: expect.stringContaining("No Twelve Data symbol match found"),
      resolutionStatus: "needs_review",
      symbol: "NOPE",
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({
      close: 503.25,
      status: "ok",
    });
    expect(runs[0]).toMatchObject({
      errorMessage: expect.stringContaining("NOPE"),
      status: "partial",
      symbolsFailed: 1,
      symbolsRequested: 2,
      symbolsSucceeded: 1,
    });
    expect(runs[0]?.errorMessage).toContain(tradeId);
  });

  it("does not require Twelve Data API key when no jobs are queued", async () => {
    delete process.env.TWELVE_DATA_API_KEY;

    const workerResult = await t.action(
      internal.marketData.processMarketDataFetchJobs,
      {
        budgetCredits: 8,
      },
    );

    expect(workerResult).toEqual({
      budgetCredits: 8,
      creditsUsed: 0,
      jobsFailed: 0,
      jobsProcessed: 0,
      jobsSucceeded: 0,
    });
  });

  it("lists owned instruments with needs_review prioritized first", async () => {
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("marketDataInstruments", {
        assetType: "stock",
        createdAt: now,
        ownerId,
        provider: "twelve_data",
        providerSymbol: "AAPL",
        resolutionStatus: "resolved",
        symbol: "AAPL",
        updatedAt: now,
      });
      await ctx.db.insert("marketDataInstruments", {
        assetType: "stock",
        createdAt: now,
        lastError: "No symbol match",
        ownerId,
        provider: "twelve_data",
        resolutionStatus: "needs_review",
        symbol: "WEIRD",
        updatedAt: now,
      });
      await ctx.db.insert("marketDataInstruments", {
        assetType: "crypto",
        createdAt: now,
        ownerId,
        provider: "twelve_data",
        resolutionStatus: "ignored",
        symbol: "OBSCURE",
        updatedAt: now,
      });
      // Different owner - must not appear.
      await ctx.db.insert("marketDataInstruments", {
        assetType: "stock",
        createdAt: now,
        ownerId: "owner-b",
        provider: "twelve_data",
        providerSymbol: "MSFT",
        resolutionStatus: "resolved",
        symbol: "MSFT",
        updatedAt: now,
      });
    });

    const all = await asUser().query(api.marketData.listInstruments, {});
    expect(all.map((row) => row.symbol)).toEqual(["WEIRD", "AAPL", "OBSCURE"]);
    expect(all.every((row) => row.ownerId === ownerId)).toBe(true);

    const review = await asUser().query(api.marketData.listInstruments, {
      status: "needs_review",
    });
    expect(review).toHaveLength(1);
    expect(review[0]?.symbol).toBe("WEIRD");
  });

  it("keeps needs_review instruments in the limited list even with many resolved rows", async () => {
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 520; index += 1) {
        await ctx.db.insert("marketDataInstruments", {
          assetType: "stock",
          createdAt: now,
          ownerId,
          provider: "twelve_data",
          providerSymbol: `A${index}`,
          resolutionStatus: "resolved",
          symbol: `A${index}`,
          updatedAt: now,
        });
      }
      await ctx.db.insert("marketDataInstruments", {
        assetType: "stock",
        createdAt: now,
        lastError: "No symbol match",
        ownerId,
        provider: "twelve_data",
        resolutionStatus: "needs_review",
        symbol: "ZZZREVIEW",
        updatedAt: now,
      });
    });

    const all = await asUser().query(api.marketData.listInstruments, {});
    expect(all).toHaveLength(500);
    expect(all[0]?.resolutionStatus).toBe("needs_review");
    expect(all[0]?.symbol).toBe("ZZZREVIEW");
  });

  it("marks an owned instrument ignored and clears any review error", async () => {
    const instrumentId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("marketDataInstruments", {
        assetType: "stock",
        createdAt: now,
        lastError: "No symbol match",
        ownerId,
        provider: "twelve_data",
        resolutionStatus: "needs_review",
        symbol: "WEIRD",
        updatedAt: now,
      });
    });

    const updated = await asUser().mutation(
      api.marketData.setInstrumentIgnored,
      { instrumentId },
    );

    expect(updated.resolutionStatus).toBe("ignored");
    expect(updated.lastError).toBeUndefined();

    const stored = await t.run(async (ctx) => ctx.db.get(instrumentId));
    expect(stored?.resolutionStatus).toBe("ignored");
    expect(stored?.lastError).toBeUndefined();
  });

  it("rejects ignoring an instrument owned by another user", async () => {
    const instrumentId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("marketDataInstruments", {
        assetType: "stock",
        createdAt: now,
        ownerId: "owner-b",
        provider: "twelve_data",
        providerSymbol: "MSFT",
        resolutionStatus: "resolved",
        symbol: "MSFT",
        updatedAt: now,
      });
    });

    await expect(
      asUser().mutation(api.marketData.setInstrumentIgnored, {
        instrumentId,
      }),
    ).rejects.toThrow(/not found/);

    const stored = await t.run(async (ctx) => ctx.db.get(instrumentId));
    expect(stored?.resolutionStatus).toBe("resolved");
  });
});
