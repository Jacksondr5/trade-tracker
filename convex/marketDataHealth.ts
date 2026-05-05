import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, mutation, query, type ActionCtx } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";

const MARKET_DATA_PROVIDER = "twelve_data";
const RECENT_RUNS_DEFAULT_LIMIT = 30;
const RECENT_RUNS_MAX_LIMIT = 100;
const FETCH_JOBS_DEFAULT_LIMIT = 100;
const FETCH_JOBS_MAX_LIMIT = 500;
const COVERAGE_DEFAULT_DAYS = 30;
const COVERAGE_MAX_DAYS = 180;
const COVERAGE_PORTFOLIO_LIMIT = 25;
const STUCK_LEASE_GRACE_MS = 0;

const refreshRunStatusValidator = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("partial"),
);

const fetchJobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("leased"),
  v.literal("completed"),
  v.literal("failed"),
);

const fetchJobKindValidator = v.union(
  v.literal("daily_snapshot"),
  v.literal("historical_backfill"),
);

const assetTypeValidator = v.union(v.literal("crypto"), v.literal("stock"));

const refreshRunRowValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("marketDataRefreshRuns"),
  completedAt: v.union(v.number(), v.null()),
  errorMessage: v.union(v.string(), v.null()),
  isBackfill: v.boolean(),
  ownerId: v.string(),
  provider: v.literal("twelve_data"),
  runDate: v.string(),
  startedAt: v.number(),
  status: refreshRunStatusValidator,
  symbolsFailed: v.number(),
  symbolsRequested: v.number(),
  symbolsSucceeded: v.number(),
});

const fetchJobRowValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("marketDataFetchJobs"),
  assetType: assetTypeValidator,
  attempts: v.number(),
  completedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  date: v.union(v.string(), v.null()),
  endDate: v.union(v.string(), v.null()),
  errorMessage: v.union(v.string(), v.null()),
  estimatedCredits: v.number(),
  isStuck: v.boolean(),
  kind: fetchJobKindValidator,
  leasedAt: v.union(v.number(), v.null()),
  leaseExpiresAt: v.union(v.number(), v.null()),
  ownerId: v.string(),
  provider: v.literal("twelve_data"),
  providerSymbol: v.union(v.string(), v.null()),
  runId: v.id("marketDataRefreshRuns"),
  sourceTradeIds: v.array(v.id("trades")),
  startDate: v.union(v.string(), v.null()),
  status: fetchJobStatusValidator,
  symbol: v.string(),
  updatedAt: v.number(),
});

const inFlightCountersValidator = v.object({
  failedTotal: v.number(),
  leased: v.number(),
  pending: v.number(),
  stuckLeases: v.number(),
});

const portfolioCoverageDayValidator = v.object({
  date: v.string(),
  missingSymbols: v.array(v.string()),
  status: v.union(
    v.literal("complete"),
    v.literal("partial"),
    v.literal("missing"),
  ),
});

const portfolioCoverageRowValidator = v.object({
  portfolioId: v.id("portfolios"),
  portfolioName: v.string(),
  rows: v.array(portfolioCoverageDayValidator),
});

function isBackfillRunDate(runDate: string): boolean {
  return runDate.includes(":");
}

function toRunRow(run: Doc<"marketDataRefreshRuns">) {
  return {
    _creationTime: run._creationTime,
    _id: run._id,
    completedAt: run.completedAt ?? null,
    errorMessage: run.errorMessage ?? null,
    isBackfill: isBackfillRunDate(run.runDate),
    ownerId: run.ownerId,
    provider: run.provider,
    runDate: run.runDate,
    startedAt: run.startedAt,
    status: run.status,
    symbolsFailed: run.symbolsFailed,
    symbolsRequested: run.symbolsRequested,
    symbolsSucceeded: run.symbolsSucceeded,
  };
}

function toJobRow(job: Doc<"marketDataFetchJobs">, now: number) {
  const isStuck =
    job.status === "leased" &&
    job.leaseExpiresAt !== undefined &&
    job.leaseExpiresAt + STUCK_LEASE_GRACE_MS < now;
  return {
    _creationTime: job._creationTime,
    _id: job._id,
    assetType: job.assetType,
    attempts: job.attempts,
    completedAt: job.completedAt ?? null,
    createdAt: job.createdAt,
    date: job.date ?? null,
    endDate: job.endDate ?? null,
    errorMessage: job.errorMessage ?? null,
    estimatedCredits: job.estimatedCredits,
    isStuck,
    kind: job.kind,
    leasedAt: job.leasedAt ?? null,
    leaseExpiresAt: job.leaseExpiresAt ?? null,
    ownerId: job.ownerId,
    provider: job.provider,
    providerSymbol: job.providerSymbol ?? null,
    runId: job.runId,
    sourceTradeIds: job.sourceTradeIds,
    startDate: job.startDate ?? null,
    status: job.status,
    symbol: job.symbol,
    updatedAt: job.updatedAt,
  };
}

export const getCurrentRunSummary = query({
  args: {},
  returns: v.object({
    counters: inFlightCountersValidator,
    latestRun: v.union(refreshRunRowValidator, v.null()),
    serverNow: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const now = Date.now();

    const latestRun = await ctx.db
      .query("marketDataRefreshRuns")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .first();

    // Bound the counter scans so an unexpectedly large backlog cannot blow up
    // the query. The UI only needs accurate counts up to a useful threshold;
    // anything past that is "lots of work pending" and we surface it as such.
    const COUNTER_TAKE_LIMIT = 1_000;
    const pendingJobs = await ctx.db
      .query("marketDataFetchJobs")
      .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
        q.eq("ownerId", ownerId).eq("status", "pending"),
      )
      .order("desc")
      .take(COUNTER_TAKE_LIMIT);
    const leasedJobs = await ctx.db
      .query("marketDataFetchJobs")
      .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
        q.eq("ownerId", ownerId).eq("status", "leased"),
      )
      .order("desc")
      .take(COUNTER_TAKE_LIMIT);
    const failedJobs = await ctx.db
      .query("marketDataFetchJobs")
      .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
        q.eq("ownerId", ownerId).eq("status", "failed"),
      )
      .order("desc")
      .take(COUNTER_TAKE_LIMIT);

    const stuckLeases = leasedJobs.filter(
      (job) =>
        job.leaseExpiresAt !== undefined &&
        job.leaseExpiresAt + STUCK_LEASE_GRACE_MS < now,
    ).length;

    return {
      counters: {
        failedTotal: failedJobs.length,
        leased: leasedJobs.length,
        pending: pendingJobs.length,
        stuckLeases,
      },
      latestRun: latestRun === null ? null : toRunRow(latestRun),
      serverNow: now,
    };
  },
});

export const getFailedFetchJobCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const failedJobs = await ctx.db
      .query("marketDataFetchJobs")
      .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
        q.eq("ownerId", ownerId).eq("status", "failed"),
      )
      .order("desc")
      .take(1_000);

    return failedJobs.length;
  },
});

export const listRecentRefreshRuns = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(refreshRunRowValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const limit = Math.min(
      Math.max(args.limit ?? RECENT_RUNS_DEFAULT_LIMIT, 1),
      RECENT_RUNS_MAX_LIMIT,
    );

    const runs = await ctx.db
      .query("marketDataRefreshRuns")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(limit);

    return runs.map(toRunRow);
  },
});

export const listFetchJobs = query({
  args: {
    limit: v.optional(v.number()),
    runId: v.optional(v.id("marketDataRefreshRuns")),
    status: v.optional(
      v.union(v.literal("pending"), v.literal("leased"), v.literal("failed")),
    ),
  },
  returns: v.array(fetchJobRowValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const limit = Math.min(
      Math.max(args.limit ?? FETCH_JOBS_DEFAULT_LIMIT, 1),
      FETCH_JOBS_MAX_LIMIT,
    );
    const status = args.status ?? "failed";
    const now = Date.now();

    let jobs: Doc<"marketDataFetchJobs">[] = [];

    if (args.runId !== undefined) {
      const run = await ctx.db.get(args.runId);
      if (run === null || run.ownerId !== ownerId) {
        return [];
      }
      jobs = await ctx.db
        .query("marketDataFetchJobs")
        .withIndex("by_runId_and_status_and_updatedAt", (q) =>
          q.eq("runId", args.runId!).eq("status", status),
        )
        .order("desc")
        .take(limit);
    } else {
      jobs = await ctx.db
        .query("marketDataFetchJobs")
        .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
          q.eq("ownerId", ownerId).eq("status", status),
        )
        .order("desc")
        .take(limit);
    }

    return jobs.map((job) => toJobRow(job, now));
  },
});

export const listValuationCoverageForOwner = query({
  args: {
    days: v.optional(v.number()),
  },
  returns: v.array(portfolioCoverageRowValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const days = Math.min(
      Math.max(args.days ?? COVERAGE_DEFAULT_DAYS, 1),
      COVERAGE_MAX_DAYS,
    );

    const portfolios = await ctx.db
      .query("portfolios")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(COVERAGE_PORTFOLIO_LIMIT);

    const sortedPortfolios = [...portfolios].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const result: Array<{
      portfolioId: Id<"portfolios">;
      portfolioName: string;
      rows: Array<{
        date: string;
        missingSymbols: string[];
        status: "complete" | "partial" | "missing";
      }>;
    }> = [];
    for (const portfolio of sortedPortfolios) {
      const valuations = await ctx.db
        .query("portfolioDailyValuations")
        .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
          q.eq("ownerId", ownerId).eq("portfolioId", portfolio._id),
        )
        .order("desc")
        .take(days);

      result.push({
        portfolioId: portfolio._id,
        portfolioName: portfolio.name,
        rows: valuations
          .map((row) => ({
            date: row.date,
            missingSymbols: row.missingSymbols,
            status: row.priceCoverageStatus,
          }))
          // The index returns rows newest-first; the chart wants oldest-first
          // so the rightmost cell is the most recent day.
          .reverse(),
      });
    }

    return result;
  },
});

export const requeueFetchJob = mutation({
  args: {
    jobId: v.id("marketDataFetchJobs"),
  },
  returns: v.object({
    jobId: v.id("marketDataFetchJobs"),
    runId: v.id("marketDataRefreshRuns"),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const job = assertOwner(
      await ctx.db.get(args.jobId),
      ownerId,
      "Market data fetch job not found",
    );

    if (job.status !== "failed") {
      throw new ConvexError(
        "Only failed market data fetch jobs can be re-queued",
      );
    }

    const now = Date.now();
    await ctx.db.patch(job._id, {
      attempts: 0,
      completedAt: undefined,
      errorMessage: undefined,
      leasedAt: undefined,
      leaseExpiresAt: undefined,
      status: "pending",
      updatedAt: now,
    });

    // Decrement the parent run's failed counter and reopen it if it was
    // marked failed/partial. Without this the run row stays terminal even
    // after the user resolves the underlying failure.
    const run = await ctx.db.get(job.runId);
    if (run !== null && run.ownerId === ownerId) {
      const symbolsFailed = Math.max(0, run.symbolsFailed - 1);
      const isComplete =
        run.symbolsSucceeded + symbolsFailed >= run.symbolsRequested;
      await ctx.db.patch(run._id, {
        completedAt: isComplete ? run.completedAt : undefined,
        status: isComplete ? run.status : "running",
        symbolsFailed,
      });
    }

    return { jobId: job._id, runId: job.runId };
  },
});

type DailyRefreshResult = {
  jobsQueued: number;
  ownersProcessed: number;
  runDate: string;
  symbolsRequested: number;
};

type WorkerTickResult = {
  budgetCredits: number;
  creditsUsed: number;
  jobsFailed: number;
  jobsProcessed: number;
  jobsSucceeded: number;
};

function parseMarketDataHealthOperatorIds(): string[] {
  const raw = process.env.MARKET_DATA_HEALTH_OPERATOR_IDS;
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function requireMarketDataHealthOperator(
  ctx: ActionCtx,
): Promise<string> {
  const ownerId = await requireUser(ctx);
  const allowedOperatorIds = parseMarketDataHealthOperatorIds();
  if (!allowedOperatorIds.includes(ownerId)) {
    throw new ConvexError(
      "Forbidden: market data health controls require operator access",
    );
  }
  return ownerId;
}

export const triggerDailyRefresh = action({
  args: {},
  returns: v.object({
    jobsQueued: v.number(),
    ownersProcessed: v.number(),
    runDate: v.string(),
    symbolsRequested: v.number(),
  }),
  handler: async (ctx: ActionCtx): Promise<DailyRefreshResult> => {
    await requireMarketDataHealthOperator(ctx);
    return await ctx.runAction(
      internal.marketData.refreshDailyPriceSnapshots,
      {},
    );
  },
});

export const runWorkerTick = action({
  args: {
    budgetCredits: v.optional(v.number()),
  },
  returns: v.object({
    budgetCredits: v.number(),
    creditsUsed: v.number(),
    jobsFailed: v.number(),
    jobsProcessed: v.number(),
    jobsSucceeded: v.number(),
  }),
  handler: async (ctx: ActionCtx, args): Promise<WorkerTickResult> => {
    await requireMarketDataHealthOperator(ctx);
    return await ctx.runAction(internal.marketData.processMarketDataFetchJobs, {
      budgetCredits: args.budgetCredits,
    });
  },
});

// Re-export the provider constant so tests can detect a stable identifier
// without depending on the internal marketData module.
export const PROVIDER = MARKET_DATA_PROVIDER;
