import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { computeBrokerageFreshnessStatus } from "./lib/brokerageFreshness";

const pipelineModeValidator = v.union(
  v.literal("daily"),
  v.literal("backfill"),
  v.literal("recompute"),
);

const phaseStatusValidator = v.union(
  v.literal("not_requested"),
  v.literal("skipped"),
  v.literal("succeeded"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("blocked"),
);

function assertIsoDate(value: string, name: "date" | "endDate" | "startDate") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConvexError(`${name} must use YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ConvexError(`${name} must be a valid calendar date`);
  }
}

function dateRunStatus(args: {
  brokerageStatus: PhaseStatus;
  marketDataStatus: PhaseStatus;
  reconciliationStatus: PhaseStatus;
  valuationStatus: PhaseStatus;
}): "failed" | "partial" | "skipped" | "succeeded" {
  const statuses = [
    args.brokerageStatus,
    args.marketDataStatus,
    args.reconciliationStatus,
    args.valuationStatus,
  ].filter((status) => status !== "not_requested");
  if (
    statuses.length === 0 ||
    statuses.every((status) => status === "skipped")
  ) {
    return "skipped";
  }
  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }
  if (statuses.some((status) => status === "partial" || status === "blocked")) {
    return "partial";
  }
  return "succeeded";
}

type PhaseStatus =
  | "blocked"
  | "failed"
  | "not_requested"
  | "partial"
  | "skipped"
  | "succeeded";

type ComputeValuationsResult = {
  continueCursor: string | null;
  date: string;
  isDone: boolean;
  ownerId: string;
  portfoliosComputed: number;
};

export const listDailyOwners = internalQuery({
  args: {},
  returns: v.array(v.object({ ownerId: v.string() })),
  handler: async (ctx) => {
    const connections = await ctx.db
      .query("brokerageConnections")
      .withIndex("by_source_and_status", (q) =>
        q.eq("source", "ibkr").eq("status", "active"),
      )
      .take(100);
    const ownerIds = new Set<string>();
    for (const connection of connections) {
      if (connection.queryId) {
        ownerIds.add(connection.ownerId);
      }
    }
    return [...ownerIds].sort().map((ownerId) => ({ ownerId }));
  },
});

export const startRun = internalMutation({
  args: {
    endDate: v.string(),
    mode: pipelineModeValidator,
    ownerId: v.string(),
    requestedByOwnerId: v.optional(v.string()),
    startDate: v.string(),
    temporalWorkflowId: v.string(),
  },
  returns: v.object({
    pipelineRunId: v.id("portfolioPipelineRuns"),
    status: v.union(v.literal("created"), v.literal("reused")),
  }),
  handler: async (ctx, args) => {
    assertIsoDate(args.startDate, "startDate");
    assertIsoDate(args.endDate, "endDate");
    const now = Date.now();
    const pipelineRunId = await ctx.db.insert("portfolioPipelineRuns", {
      mode: args.mode,
      ownerId: args.ownerId,
      requestedAt: now,
      requestedByOwnerId: args.requestedByOwnerId,
      startedAt: now,
      status: "running",
      updatedAt: now,
    });
    return { pipelineRunId, status: "created" as const };
  },
});

export const completeRun = internalMutation({
  args: {
    aggregate: v.object({
      datesFailed: v.number(),
      datesPartial: v.number(),
      datesSkipped: v.number(),
      datesSucceeded: v.number(),
    }),
    pipelineRunId: v.id("portfolioPipelineRuns"),
  },
  returns: v.object({
    status: v.union(
      v.literal("failed"),
      v.literal("partial"),
      v.literal("succeeded"),
    ),
  }),
  handler: async (ctx, args) => {
    const total =
      args.aggregate.datesFailed +
      args.aggregate.datesPartial +
      args.aggregate.datesSkipped +
      args.aggregate.datesSucceeded;
    const status: "failed" | "partial" | "succeeded" =
      args.aggregate.datesFailed > 0 && args.aggregate.datesSucceeded === 0
        ? "failed"
        : args.aggregate.datesFailed > 0 ||
            args.aggregate.datesPartial > 0 ||
            (total > 0 && args.aggregate.datesSkipped === total)
          ? "partial"
          : "succeeded";
    await ctx.db.patch(args.pipelineRunId, {
      completedAt: Date.now(),
      status,
      updatedAt: Date.now(),
    });
    return { status };
  },
});

export const startDateRun = internalMutation({
  args: {
    date: v.string(),
    mode: pipelineModeValidator,
    ownerId: v.string(),
    pipelineRunId: v.id("portfolioPipelineRuns"),
    temporalWorkflowId: v.string(),
  },
  returns: v.object({
    pipelineDateRunId: v.id("portfolioPipelineDateRuns"),
    status: v.union(v.literal("created"), v.literal("reused")),
  }),
  handler: async (ctx, args) => {
    assertIsoDate(args.date, "date");
    const byRunMatches = await ctx.db
      .query("portfolioPipelineDateRuns")
      .withIndex("by_pipelineRunId", (q) =>
        q.eq("pipelineRunId", args.pipelineRunId),
      )
      .collect();
    const existing =
      byRunMatches.find(
        (run) =>
          run.ownerId === args.ownerId &&
          run.date === args.date &&
          run.mode === args.mode,
      ) ?? null;
    if (existing)
      return { pipelineDateRunId: existing._id, status: "reused" as const };

    const now = Date.now();
    const pipelineDateRunId = await ctx.db.insert("portfolioPipelineDateRuns", {
      date: args.date,
      mode: args.mode,
      ownerId: args.ownerId,
      pipelineRunId: args.pipelineRunId,
      startedAt: now,
      status: "running",
      updatedAt: now,
    });
    return { pipelineDateRunId, status: "created" as const };
  },
});

export const summarizeReconciliation = internalQuery({
  args: {
    date: v.string(),
    force: v.boolean(),
    ownerId: v.string(),
    pipelineDateRunId: v.id("portfolioPipelineDateRuns"),
  },
  returns: v.object({
    issuesOpened: v.number(),
    issuesResolved: v.number(),
    pendingInboxTrades: v.number(),
    status: v.union(
      v.literal("blocked"),
      v.literal("failed"),
      v.literal("partial"),
      v.literal("succeeded"),
    ),
  }),
  handler: async (ctx, args) => {
    assertIsoDate(args.date, "date");
    const openIssues = await ctx.db
      .query("brokerageReconciliationIssues")
      .withIndex("by_ownerId_and_status_and_reportDate", (q) =>
        q
          .eq("ownerId", args.ownerId)
          .eq("status", "open")
          .eq("reportDate", args.date),
      )
      .collect();
    const pendingInboxTrades = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", args.ownerId).eq("status", "pending_review"),
      )
      .collect();
    const status: "partial" | "succeeded" =
      openIssues.length > 0 || pendingInboxTrades.length > 0
        ? "partial"
        : "succeeded";
    return {
      issuesOpened: openIssues.length,
      issuesResolved: 0,
      pendingInboxTrades: pendingInboxTrades.length,
      status,
    };
  },
});

export const computeValuations = internalMutation({
  args: {
    date: v.string(),
    force: v.boolean(),
    ownerId: v.string(),
    pipelineDateRunId: v.id("portfolioPipelineDateRuns"),
  },
  returns: v.object({
    freshnessStatus: v.union(
      v.literal("current"),
      v.literal("pending_review"),
      v.literal("stale"),
      v.literal("mismatched"),
      v.literal("unmanaged"),
    ),
    portfoliosComputed: v.number(),
    priceCoverageStatus: v.union(
      v.literal("complete"),
      v.literal("missing"),
      v.literal("partial"),
    ),
    status: v.union(
      v.literal("failed"),
      v.literal("partial"),
      v.literal("skipped"),
      v.literal("succeeded"),
    ),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    freshnessStatus:
      | "current"
      | "mismatched"
      | "pending_review"
      | "stale"
      | "unmanaged";
    portfoliosComputed: number;
    priceCoverageStatus: "complete" | "missing" | "partial";
    status: "failed" | "partial" | "skipped" | "succeeded";
  }> => {
    assertIsoDate(args.date, "date");
    const result: ComputeValuationsResult = await ctx.runMutation(
      internal.portfolioAnalytics.computeDailyValuationsForOwner,
      {
        date: args.date,
        ownerId: args.ownerId,
      },
    );
    const freshnessStatus = await computeBrokerageFreshnessStatus(
      ctx,
      args.ownerId,
      args.date,
    );
    return {
      freshnessStatus,
      portfoliosComputed: result.portfoliosComputed,
      priceCoverageStatus: "complete" as const,
      status: "succeeded" as const,
    };
  },
});

export const finalizeDateRun = internalMutation({
  args: {
    brokerageStatus: phaseStatusValidator,
    errorMessage: v.optional(v.string()),
    marketDataStatus: phaseStatusValidator,
    pipelineDateRunId: v.id("portfolioPipelineDateRuns"),
    reconciliationStatus: phaseStatusValidator,
    valuationStatus: phaseStatusValidator,
  },
  returns: v.object({
    finalStatus: v.union(
      v.literal("failed"),
      v.literal("partial"),
      v.literal("skipped"),
      v.literal("succeeded"),
    ),
    freshnessStatus: v.union(
      v.literal("current"),
      v.literal("pending_review"),
      v.literal("stale"),
      v.literal("mismatched"),
      v.literal("unmanaged"),
    ),
  }),
  handler: async (ctx, args) => {
    const dateRun = await ctx.db.get(args.pipelineDateRunId);
    if (!dateRun)
      throw new ConvexError("Portfolio pipeline date run not found");
    const finalStatus = dateRunStatus(args);
    const freshnessStatus = await computeBrokerageFreshnessStatus(
      ctx,
      dateRun.ownerId,
      dateRun.date,
    );
    await ctx.db.patch(args.pipelineDateRunId, {
      completedAt: Date.now(),
      errorMessage: args.errorMessage,
      status: finalStatus,
      updatedAt: Date.now(),
    });
    return { finalStatus, freshnessStatus };
  },
});
