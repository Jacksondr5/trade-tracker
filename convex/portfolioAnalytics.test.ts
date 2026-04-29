// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
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

describe("portfolio analytics schema", () => {
  const ownerId = "owner-a";
  const now = Date.UTC(2026, 3, 28, 21);

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  async function insertPortfolio(): Promise<Id<"portfolios">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolios", {
        name: "Long-term",
        ownerId,
      });
    });
  }

  async function insertInstrument(): Promise<Id<"marketDataInstruments">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("marketDataInstruments", {
        assetType: "stock",
        createdAt: now,
        lastResolvedAt: now,
        ownerId,
        provider: "twelve_data",
        providerSymbol: "AAPL",
        resolutionStatus: "resolved",
        symbol: "AAPL",
        updatedAt: now,
      });
    });
  }

  it("stores portfolio cash ledger entries with signed amounts", async () => {
    const portfolioId = await insertPortfolio();

    const ledgerEntryId = await t.run(async (ctx) => {
      return await ctx.db.insert("portfolioCashLedgerEntries", {
        amount: 10_000,
        createdAt: now,
        date: Date.UTC(2026, 3, 28),
        entryType: "deposit",
        note: "Initial funding",
        ownerId,
        portfolioId,
        updatedAt: now,
      });
    });

    const ledgerEntry = await t.run(async (ctx) => {
      return await ctx.db.get(ledgerEntryId);
    });

    expect(ledgerEntry).toMatchObject({
      amount: 10_000,
      entryType: "deposit",
      ownerId,
      portfolioId,
    });
  });

  it("stores market data instruments for provider symbol resolution", async () => {
    const instrumentId = await insertInstrument();

    const instrument = await t.run(async (ctx) => {
      return await ctx.db.get(instrumentId);
    });

    expect(instrument).toMatchObject({
      assetType: "stock",
      ownerId,
      provider: "twelve_data",
      providerSymbol: "AAPL",
      resolutionStatus: "resolved",
      symbol: "AAPL",
    });
  });

  it("stores daily market price snapshots", async () => {
    const snapshotId = await t.run(async (ctx) => {
      return await ctx.db.insert("marketPriceSnapshots", {
        close: 202.25,
        date: "2026-04-28",
        fetchedAt: now,
        provider: "twelve_data",
        providerSymbol: "AAPL",
        status: "ok",
      });
    });

    const snapshot = await t.run(async (ctx) => {
      return await ctx.db.get(snapshotId);
    });

    expect(snapshot).toMatchObject({
      close: 202.25,
      date: "2026-04-28",
      provider: "twelve_data",
      providerSymbol: "AAPL",
      status: "ok",
    });
  });

  it("stores daily portfolio valuations with limited derived fields", async () => {
    const portfolioId = await insertPortfolio();

    const valuationId = await t.run(async (ctx) => {
      return await ctx.db.insert("portfolioDailyValuations", {
        cashBalance: 7_500,
        computedAt: now,
        date: "2026-04-28",
        marketValue: 2_500,
        missingSymbols: [],
        ownerId,
        portfolioId,
        priceCoverageStatus: "complete",
        totalEquity: 10_000,
      });
    });

    const valuation = await t.run(async (ctx) => {
      return await ctx.db.get(valuationId);
    });

    expect(valuation).toMatchObject({
      cashBalance: 7_500,
      marketValue: 2_500,
      missingSymbols: [],
      ownerId,
      portfolioId,
      priceCoverageStatus: "complete",
      totalEquity: 10_000,
    });
    expect(valuation).not.toHaveProperty("costBasis");
    expect(valuation).not.toHaveProperty("cumulativeReturn");
    expect(valuation).not.toHaveProperty("netContributions");
  });

  it("stores market data refresh run audit records", async () => {
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("marketDataRefreshRuns", {
        completedAt: now + 1_000,
        ownerId,
        provider: "twelve_data",
        runDate: "2026-04-28",
        startedAt: now,
        status: "completed",
        symbolsFailed: 0,
        symbolsRequested: 2,
        symbolsSucceeded: 2,
      });
    });

    const run = await t.run(async (ctx) => {
      return await ctx.db.get(runId);
    });

    expect(run).toMatchObject({
      ownerId,
      provider: "twelve_data",
      runDate: "2026-04-28",
      status: "completed",
      symbolsFailed: 0,
      symbolsRequested: 2,
      symbolsSucceeded: 2,
    });
  });
});

describe("portfolio analytics calculations", () => {
  const ownerId = "owner-a";
  const otherOwnerId = "owner-b";
  const now = Date.UTC(2026, 3, 28, 21);

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
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

  async function insertLedgerEntry(args: {
    amount: number;
    date: string;
    portfolioId: Id<"portfolios">;
  }): Promise<Id<"portfolioCashLedgerEntries">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolioCashLedgerEntries", {
        amount: args.amount,
        createdAt: now,
        date: Date.parse(`${args.date}T12:00:00.000Z`),
        entryType: args.amount >= 0 ? "deposit" : "withdrawal",
        ownerId,
        portfolioId: args.portfolioId,
        updatedAt: now,
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
        createdAt: now,
        lastResolvedAt: now,
        ownerId,
        provider: "twelve_data",
        providerSymbol: args.providerSymbol ?? args.symbol,
        resolutionStatus: "resolved",
        symbol: args.symbol,
        updatedAt: now,
      });
    });
  }

  async function insertSnapshot(args: {
    close?: number;
    date: string;
    providerSymbol: string;
    status?: "error" | "missing" | "ok";
  }): Promise<Id<"marketPriceSnapshots">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("marketPriceSnapshots", {
        close: args.close,
        date: args.date,
        errorMessage: args.status === "error" ? "Provider error" : undefined,
        fetchedAt: now,
        provider: "twelve_data",
        providerSymbol: args.providerSymbol,
        status: args.status ?? "ok",
      });
    });
  }

  async function insertTrade(args: {
    assetType?: "crypto" | "stock";
    date?: string;
    fees?: number;
    portfolioId: Id<"portfolios">;
    price: number;
    quantity: number;
    side: "buy" | "sell";
    ticker: string;
  }): Promise<Id<"trades">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("trades", {
        assetType: args.assetType ?? "stock",
        date: Date.parse(`${args.date ?? "2026-04-27"}T15:30:00.000Z`),
        direction: "long",
        fees: args.fees,
        ownerId,
        portfolioId: args.portfolioId,
        price: args.price,
        quantity: args.quantity,
        side: args.side,
        ticker: args.ticker,
      });
    });
  }

  it("computes and upserts a daily valuation from cash, trades, and cached closes", async () => {
    const portfolioId = await insertPortfolio();
    await insertLedgerEntry({
      amount: 10_000,
      date: "2026-04-27",
      portfolioId,
    });
    await insertResolvedInstrument({ symbol: "AAPL" });
    await insertSnapshot({
      close: 125,
      date: "2026-04-28",
      providerSymbol: "AAPL",
    });
    await insertTrade({
      fees: 5,
      portfolioId,
      price: 100,
      quantity: 10,
      side: "buy",
      ticker: "AAPL",
    });

    const valuation = await asUser().mutation(
      api.portfolioAnalytics.computeDailyValuation,
      {
        date: "2026-04-28",
        portfolioId,
      },
    );

    expect(valuation).toMatchObject({
      cashBalance: 8_995,
      marketValue: 1_250,
      missingSymbols: [],
      priceCoverageStatus: "complete",
      totalEquity: 10_245,
    });

    await insertTrade({
      date: "2026-04-28",
      portfolioId,
      price: 110,
      quantity: 2,
      side: "sell",
      ticker: "AAPL",
    });

    const recomputed = await asUser().mutation(
      api.portfolioAnalytics.computeDailyValuation,
      {
        date: "2026-04-28",
        portfolioId,
      },
    );
    const rows = await asUser().query(api.portfolioAnalytics.listEquitySeries, {
      endDate: "2026-04-28",
      portfolioId,
      startDate: "2026-04-28",
    });

    expect(recomputed).toMatchObject({
      cashBalance: 9_215,
      marketValue: 1_000,
      totalEquity: 10_215,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(valuation._id);
  });

  it("reports partial price coverage and missing symbols", async () => {
    const portfolioId = await insertPortfolio();
    await insertLedgerEntry({
      amount: 20_000,
      date: "2026-04-27",
      portfolioId,
    });
    await insertResolvedInstrument({ symbol: "AAPL" });
    await insertResolvedInstrument({ symbol: "MSFT" });
    await insertSnapshot({
      close: 125,
      date: "2026-04-28",
      providerSymbol: "AAPL",
    });
    await insertSnapshot({
      date: "2026-04-28",
      providerSymbol: "MSFT",
      status: "missing",
    });
    await insertTrade({
      portfolioId,
      price: 100,
      quantity: 10,
      side: "buy",
      ticker: "AAPL",
    });
    await insertTrade({
      portfolioId,
      price: 200,
      quantity: 5,
      side: "buy",
      ticker: "MSFT",
    });

    const valuation = await asUser().mutation(
      api.portfolioAnalytics.computeDailyValuation,
      {
        date: "2026-04-28",
        portfolioId,
      },
    );

    expect(valuation).toMatchObject({
      marketValue: 1_250,
      missingSymbols: ["MSFT"],
      priceCoverageStatus: "partial",
      totalEquity: 19_250,
    });
  });

  it("computes timeframe return per period and excludes deposits", async () => {
    const portfolioId = await insertPortfolio();
    await insertLedgerEntry({
      amount: 10_000,
      date: "2026-04-27",
      portfolioId,
    });
    await asUser().mutation(api.portfolioAnalytics.computeDailyValuation, {
      date: "2026-04-27",
      portfolioId,
    });

    await insertLedgerEntry({
      amount: 5_000,
      date: "2026-04-28",
      portfolioId,
    });
    await asUser().mutation(api.portfolioAnalytics.computeDailyValuation, {
      date: "2026-04-28",
      portfolioId,
    });

    const result = await asUser().query(
      api.portfolioAnalytics.getTimeframeReturn,
      {
        endDate: "2026-04-28",
        portfolioId,
        startDate: "2026-04-27",
      },
    );

    expect(result).toEqual({
      endingEquity: 15_000,
      netExternalCashFlow: 5_000,
      returnPercent: 0,
      startingEquity: 10_000,
    });
  });

  it("does not expose another owner's valuation series", async () => {
    const portfolioId = await t.run(async (ctx) => {
      const otherPortfolioId = await ctx.db.insert("portfolios", {
        name: "Other",
        ownerId: otherOwnerId,
      });
      await ctx.db.insert("portfolioDailyValuations", {
        cashBalance: 100,
        computedAt: now,
        date: "2026-04-28",
        marketValue: 0,
        missingSymbols: [],
        ownerId: otherOwnerId,
        portfolioId: otherPortfolioId,
        priceCoverageStatus: "complete",
        totalEquity: 100,
      });
      return otherPortfolioId;
    });

    const rows = await asUser().query(api.portfolioAnalytics.listEquitySeries, {
      endDate: "2026-04-28",
      portfolioId,
      startDate: "2026-04-28",
    });

    expect(rows).toEqual([]);
  });
});
