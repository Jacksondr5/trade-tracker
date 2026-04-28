// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
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
    const instrumentId = await insertInstrument();

    const snapshotId = await t.run(async (ctx) => {
      return await ctx.db.insert("marketPriceSnapshots", {
        close: 202.25,
        date: "2026-04-28",
        fetchedAt: now,
        instrumentId,
        ownerId,
        status: "ok",
      });
    });

    const snapshot = await t.run(async (ctx) => {
      return await ctx.db.get(snapshotId);
    });

    expect(snapshot).toMatchObject({
      close: 202.25,
      date: "2026-04-28",
      instrumentId,
      ownerId,
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
