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

const ownerId = "owner-a";
const otherOwnerId = "owner-b";
const now = Date.UTC(2026, 4, 1, 21);

describe("market data health", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  function asOwner(token = ownerId) {
    return t.withIdentity({ tokenIdentifier: token });
  }

  async function insertPortfolio(args: {
    name?: string;
    owner?: string;
  } = {}): Promise<Id<"portfolios">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolios", {
        name: args.name ?? "Long-term",
        ownerId: args.owner ?? ownerId,
      });
    });
  }

  async function insertRun(args: {
    completedAt?: number;
    errorMessage?: string;
    owner?: string;
    runDate?: string;
    startedAt?: number;
    status?: "running" | "completed" | "failed" | "partial";
    symbolsFailed?: number;
    symbolsRequested?: number;
    symbolsSucceeded?: number;
  }): Promise<Id<"marketDataRefreshRuns">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("marketDataRefreshRuns", {
        completedAt: args.completedAt,
        errorMessage: args.errorMessage,
        ownerId: args.owner ?? ownerId,
        provider: "twelve_data",
        runDate: args.runDate ?? "2026-05-01",
        startedAt: args.startedAt ?? now,
        status: args.status ?? "running",
        symbolsFailed: args.symbolsFailed ?? 0,
        symbolsRequested: args.symbolsRequested ?? 1,
        symbolsSucceeded: args.symbolsSucceeded ?? 0,
      });
    });
  }

  async function insertJob(args: {
    completedAt?: number;
    date?: string;
    errorMessage?: string;
    leasedAt?: number;
    leaseExpiresAt?: number;
    owner?: string;
    providerSymbol?: string;
    runId: Id<"marketDataRefreshRuns">;
    status: "pending" | "leased" | "failed";
    symbol?: string;
    updatedAt?: number;
  }): Promise<Id<"marketDataFetchJobs">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("marketDataFetchJobs", {
        assetType: "stock",
        attempts: 0,
        completedAt: args.completedAt,
        createdAt: args.updatedAt ?? now,
        date: args.date ?? "2026-05-01",
        errorMessage: args.errorMessage,
        estimatedCredits: 1,
        kind: "daily_snapshot",
        leasedAt: args.leasedAt,
        leaseExpiresAt: args.leaseExpiresAt,
        ownerId: args.owner ?? ownerId,
        provider: "twelve_data",
        providerSymbol: args.providerSymbol,
        runId: args.runId,
        sourceTradeIds: [],
        status: args.status,
        symbol: args.symbol ?? "AAPL",
        updatedAt: args.updatedAt ?? now,
      });
    });
  }

  async function insertValuation(args: {
    date: string;
    missingSymbols?: string[];
    portfolioId: Id<"portfolios">;
    status?: "complete" | "partial" | "missing";
  }) {
    await t.run(async (ctx) => {
      await ctx.db.insert("portfolioDailyValuations", {
        cashBalance: 1_000,
        computedAt: now,
        date: args.date,
        marketValue: 1_000,
        missingSymbols: args.missingSymbols ?? [],
        ownerId,
        portfolioId: args.portfolioId,
        priceCoverageStatus: args.status ?? "complete",
        totalEquity: 2_000,
      });
    });
  }

  describe("getCurrentRunSummary", () => {
    it("returns null and zero counters when nothing has run yet", async () => {
      const summary = await asOwner().query(
        api.marketDataHealth.getCurrentRunSummary,
        {},
      );
      expect(summary.latestRun).toBeNull();
      expect(summary.counters).toEqual({
        failedTotal: 0,
        leased: 0,
        pending: 0,
        stuckLeases: 0,
      });
    });

    it("returns the most recent run and per-status job counters", async () => {
      // Lease expiry is compared against the real Date.now() the query runs
      // against, so anchor the relative offsets on that to keep the test
      // deterministic across calendar dates.
      const realNow = Date.now();
      const olderRun = await insertRun({
        runDate: "2026-04-30",
        startedAt: now - 86_400_000,
        status: "completed",
        symbolsRequested: 2,
        symbolsSucceeded: 2,
      });
      const newerRun = await insertRun({
        runDate: "2026-05-01",
        status: "running",
        symbolsRequested: 3,
      });
      await insertJob({ runId: newerRun, status: "pending" });
      await insertJob({
        runId: newerRun,
        status: "leased",
        leasedAt: realNow - 1_000,
        leaseExpiresAt: realNow + 5 * 60_000,
      });
      await insertJob({
        runId: newerRun,
        status: "leased",
        leasedAt: realNow - 5 * 60_000,
        leaseExpiresAt: realNow - 60_000,
      });
      await insertJob({
        runId: olderRun,
        status: "failed",
        completedAt: now - 86_000_000,
        errorMessage: "boom",
      });

      const summary = await asOwner().query(
        api.marketDataHealth.getCurrentRunSummary,
        {},
      );

      expect(summary.latestRun?._id).toEqual(newerRun);
      expect(summary.latestRun).toMatchObject({
        isBackfill: false,
        runDate: "2026-05-01",
        status: "running",
      });
      expect(summary.counters).toEqual({
        failedTotal: 1,
        leased: 2,
        pending: 1,
        stuckLeases: 1,
      });
    });

    it("ignores runs and jobs that belong to a different owner", async () => {
      await insertRun({ owner: otherOwnerId, runDate: "2026-05-01" });
      const otherRun = await insertRun({
        owner: otherOwnerId,
        runDate: "2026-05-01",
      });
      await insertJob({
        owner: otherOwnerId,
        runId: otherRun,
        status: "failed",
      });

      const summary = await asOwner().query(
        api.marketDataHealth.getCurrentRunSummary,
        {},
      );
      expect(summary.latestRun).toBeNull();
      expect(summary.counters.failedTotal).toBe(0);
    });

    it("flags backfill-style runDates", async () => {
      await insertRun({ runDate: "2026-04-01:2026-05-01", status: "completed" });
      const summary = await asOwner().query(
        api.marketDataHealth.getCurrentRunSummary,
        {},
      );
      expect(summary.latestRun?.isBackfill).toBe(true);
    });
  });

  describe("listRecentRefreshRuns", () => {
    it("returns runs newest-first and respects the limit", async () => {
      await insertRun({ runDate: "2026-04-29", startedAt: now - 2_000 });
      await insertRun({ runDate: "2026-04-30", startedAt: now - 1_000 });
      await insertRun({ runDate: "2026-05-01", startedAt: now });

      const runs = await asOwner().query(
        api.marketDataHealth.listRecentRefreshRuns,
        { limit: 2 },
      );
      expect(runs.map((row) => row.runDate)).toEqual([
        "2026-05-01",
        "2026-04-30",
      ]);
    });

    it("is owner-scoped", async () => {
      await insertRun({ owner: otherOwnerId, runDate: "2026-05-01" });
      const runs = await asOwner().query(
        api.marketDataHealth.listRecentRefreshRuns,
        {},
      );
      expect(runs).toHaveLength(0);
    });
  });

  describe("listFetchJobs", () => {
    it("defaults to failed jobs across runs", async () => {
      const run = await insertRun({});
      await insertJob({ runId: run, status: "pending", symbol: "AAPL" });
      await insertJob({
        completedAt: now,
        errorMessage: "boom",
        runId: run,
        status: "failed",
        symbol: "TSLA",
        updatedAt: now,
      });
      await insertJob({
        completedAt: now - 1_000,
        errorMessage: "older",
        runId: run,
        status: "failed",
        symbol: "MSFT",
        updatedAt: now - 1_000,
      });

      const jobs = await asOwner().query(
        api.marketDataHealth.listFetchJobs,
        {},
      );
      expect(jobs.map((job) => job.symbol)).toEqual(["TSLA", "MSFT"]);
      expect(jobs[0]).toMatchObject({
        errorMessage: "boom",
        status: "failed",
      });
    });

    it("filters to a specific run when runId is provided", async () => {
      const runA = await insertRun({ runDate: "2026-04-30" });
      const runB = await insertRun({ runDate: "2026-05-01" });
      await insertJob({
        completedAt: now,
        errorMessage: "a",
        runId: runA,
        status: "failed",
        symbol: "ONLYA",
        updatedAt: now,
      });
      await insertJob({
        completedAt: now,
        errorMessage: "b",
        runId: runB,
        status: "failed",
        symbol: "ONLYB",
        updatedAt: now + 1,
      });

      const jobs = await asOwner().query(
        api.marketDataHealth.listFetchJobs,
        { runId: runA },
      );
      expect(jobs.map((job) => job.symbol)).toEqual(["ONLYA"]);
    });

    it("returns empty when runId belongs to another owner", async () => {
      const run = await insertRun({ owner: otherOwnerId });
      await insertJob({
        owner: otherOwnerId,
        runId: run,
        status: "failed",
      });
      const jobs = await asOwner().query(
        api.marketDataHealth.listFetchJobs,
        { runId: run },
      );
      expect(jobs).toEqual([]);
    });

    it("flags leased jobs whose lease has expired as stuck", async () => {
      const realNow = Date.now();
      const run = await insertRun({});
      await insertJob({
        leasedAt: realNow - 5 * 60_000,
        leaseExpiresAt: realNow - 60_000,
        runId: run,
        status: "leased",
      });

      const jobs = await asOwner().query(api.marketDataHealth.listFetchJobs, {
        status: "leased",
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].isStuck).toBe(true);
    });
  });

  describe("listValuationCoverageForOwner", () => {
    it("returns rows per portfolio in oldest-first order", async () => {
      const portfolioA = await insertPortfolio({ name: "Aaa" });
      const portfolioB = await insertPortfolio({ name: "Bbb" });
      await insertValuation({
        date: "2026-04-29",
        portfolioId: portfolioA,
        status: "complete",
      });
      await insertValuation({
        date: "2026-04-30",
        portfolioId: portfolioA,
        status: "partial",
        missingSymbols: ["TSLA"],
      });
      await insertValuation({
        date: "2026-05-01",
        portfolioId: portfolioA,
        status: "missing",
        missingSymbols: ["TSLA", "AAPL"],
      });
      await insertValuation({
        date: "2026-05-01",
        portfolioId: portfolioB,
        status: "complete",
      });

      const coverage = await asOwner().query(
        api.marketDataHealth.listValuationCoverageForOwner,
        {},
      );

      expect(coverage.map((row) => row.portfolioName)).toEqual(["Aaa", "Bbb"]);
      expect(coverage[0].rows.map((row) => row.date)).toEqual([
        "2026-04-29",
        "2026-04-30",
        "2026-05-01",
      ]);
      expect(coverage[0].rows[2]).toEqual({
        date: "2026-05-01",
        missingSymbols: ["TSLA", "AAPL"],
        status: "missing",
      });
      expect(coverage[1].rows).toHaveLength(1);
    });

    it("does not leak other owners' portfolios", async () => {
      await insertPortfolio({ name: "Mine" });
      const otherPortfolioId = await t.run(async (ctx) => {
        return await ctx.db.insert("portfolios", {
          name: "Theirs",
          ownerId: otherOwnerId,
        });
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("portfolioDailyValuations", {
          cashBalance: 1,
          computedAt: now,
          date: "2026-05-01",
          marketValue: 1,
          missingSymbols: [],
          ownerId: otherOwnerId,
          portfolioId: otherPortfolioId,
          priceCoverageStatus: "complete",
          totalEquity: 2,
        });
      });

      const coverage = await asOwner().query(
        api.marketDataHealth.listValuationCoverageForOwner,
        {},
      );
      expect(coverage.map((row) => row.portfolioName)).toEqual(["Mine"]);
    });
  });

  describe("requeueFetchJob", () => {
    it("flips a failed job back to pending and decrements the run failure count", async () => {
      const run = await insertRun({
        completedAt: now,
        status: "failed",
        symbolsFailed: 1,
        symbolsRequested: 1,
      });
      const jobId = await insertJob({
        completedAt: now,
        errorMessage: "boom",
        runId: run,
        status: "failed",
      });

      const result = await asOwner().mutation(
        api.marketDataHealth.requeueFetchJob,
        { jobId },
      );
      expect(result).toEqual({ jobId, runId: run });

      const updatedJob = await t.run(async (ctx) => {
        return await ctx.db.get(jobId);
      });
      expect(updatedJob).toMatchObject({
        attempts: 0,
        status: "pending",
      });
      expect(updatedJob?.completedAt).toBeUndefined();
      expect(updatedJob?.errorMessage).toBeUndefined();

      const updatedRun = await t.run(async (ctx) => {
        return await ctx.db.get(run);
      });
      expect(updatedRun).toMatchObject({
        status: "running",
        symbolsFailed: 0,
      });
      expect(updatedRun?.completedAt).toBeUndefined();
    });

    it("rejects re-queueing a job that is not failed", async () => {
      const run = await insertRun({});
      const jobId = await insertJob({ runId: run, status: "pending" });
      await expect(
        asOwner().mutation(api.marketDataHealth.requeueFetchJob, { jobId }),
      ).rejects.toThrow(/Only failed/);
    });

    it("rejects re-queueing another owner's job", async () => {
      const run = await insertRun({ owner: otherOwnerId });
      const jobId = await insertJob({
        completedAt: now,
        errorMessage: "boom",
        owner: otherOwnerId,
        runId: run,
        status: "failed",
      });
      await expect(
        asOwner().mutation(api.marketDataHealth.requeueFetchJob, { jobId }),
      ).rejects.toThrow(/not found/);
    });
  });
});
