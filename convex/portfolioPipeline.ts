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

async function countPages<T>(args: {
  fetchPage: (cursor: string | null) => Promise<{
    continueCursor: string;
    isDone: boolean;
    page: T[];
  }>;
}): Promise<number> {
  let total = 0;
  let cursor: string | null = null;
  do {
    const page = await args.fetchPage(cursor);
    total += page.page.length;
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor !== null);
  return total;
}

export const listDailyOwners = internalQuery({
  args: {},
  returns: v.array(v.object({ ownerId: v.string() })),
  handler: async (ctx) => {
    const ownerIds = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await ctx.db
        .query("brokerageConnections")
        .withIndex("by_source_and_status", (q) =>
          q.eq("source", "ibkr").eq("status", "active"),
        )
        .paginate({ cursor, numItems: 100 });
      for (const connection of page.page) {
        if (connection.queryId) {
          ownerIds.add(connection.ownerId);
        }
      }
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor !== null);
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
    if (args.startDate > args.endDate) {
      throw new ConvexError("startDate must be on or before endDate");
    }
    const existing = await ctx.db
      .query("portfolioPipelineRuns")
      .withIndex("by_temporalWorkflowId", (q) =>
        q.eq("temporalWorkflowId", args.temporalWorkflowId),
      )
      .first();
    if (existing) {
      if (
        existing.mode !== args.mode ||
        existing.ownerId !== args.ownerId ||
        existing.requestedByOwnerId !== args.requestedByOwnerId ||
        existing.startDate !== args.startDate ||
        existing.endDate !== args.endDate
      ) {
        throw new ConvexError(
          "Temporal workflow id is already associated with a different pipeline run",
        );
      }
      return { pipelineRunId: existing._id, status: "reused" as const };
    }

    const now = Date.now();
    const pipelineRunId = await ctx.db.insert("portfolioPipelineRuns", {
      mode: args.mode,
      ownerId: args.ownerId,
      endDate: args.endDate,
      requestedAt: now,
      requestedByOwnerId: args.requestedByOwnerId,
      startDate: args.startDate,
      startedAt: now,
      status: "running",
      temporalWorkflowId: args.temporalWorkflowId,
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
    const existingByWorkflow = await ctx.db
      .query("portfolioPipelineDateRuns")
      .withIndex("by_temporalWorkflowId", (q) =>
        q.eq("temporalWorkflowId", args.temporalWorkflowId),
      )
      .first();
    if (existingByWorkflow) {
      if (
        existingByWorkflow.ownerId !== args.ownerId ||
        existingByWorkflow.date !== args.date ||
        existingByWorkflow.mode !== args.mode ||
        existingByWorkflow.pipelineRunId !== args.pipelineRunId
      ) {
        throw new ConvexError(
          "Temporal workflow id is already associated with a different pipeline date run",
        );
      }
      return {
        pipelineDateRunId: existingByWorkflow._id,
        status: "reused" as const,
      };
    }

    const existing = await ctx.db
      .query("portfolioPipelineDateRuns")
      .withIndex("by_pipelineRunId_and_ownerId_and_date_and_mode", (q) =>
        q
          .eq("pipelineRunId", args.pipelineRunId)
          .eq("ownerId", args.ownerId)
          .eq("date", args.date)
          .eq("mode", args.mode),
      )
      .first();
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
      temporalWorkflowId: args.temporalWorkflowId,
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
    const openIssues = await countPages({
      fetchPage: async (cursor) =>
        await ctx.db
          .query("brokerageReconciliationIssues")
          .withIndex("by_ownerId_and_status_and_reportDate", (q) =>
            q
              .eq("ownerId", args.ownerId)
              .eq("status", "open")
              .eq("reportDate", args.date),
          )
          .paginate({ cursor, numItems: 256 }),
    });
    const pendingInboxTrades = await countPages({
      fetchPage: async (cursor) =>
        await ctx.db
          .query("inboxTrades")
          .withIndex("by_owner_status", (q) =>
            q.eq("ownerId", args.ownerId).eq("status", "pending_review"),
          )
          .paginate({ cursor, numItems: 256 }),
    });
    const status: "partial" | "succeeded" =
      openIssues > 0 || pendingInboxTrades > 0
        ? "partial"
        : "succeeded";
    return {
      issuesOpened: openIssues,
      issuesResolved: 0,
      pendingInboxTrades,
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
