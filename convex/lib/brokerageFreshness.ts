import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type BrokerageFreshnessStatus =
  | "current"
  | "pending_review"
  | "stale"
  | "mismatched"
  | "unmanaged";

const MISMATCH_ISSUE_TYPES = new Set([
  "position_mismatch",
  "missing_local_position",
  "missing_brokerage_position",
]);

function startOfUtcDate(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function endOfUtcDate(date: string): number {
  return Date.parse(`${date}T23:59:59.999Z`);
}

export async function computeBrokerageFreshnessStatus(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  date: string,
): Promise<BrokerageFreshnessStatus> {
  const activeConnections = await ctx.db
    .query("brokerageConnections")
    .withIndex("by_ownerId_and_source_and_status", (q) =>
      q.eq("ownerId", ownerId).eq("source", "ibkr").eq("status", "active"),
    )
    .collect();

  if (activeConnections.length === 0) {
    return "unmanaged";
  }

  const activeConnectionIds = new Set<Id<"brokerageConnections">>(
    activeConnections.map((connection) => connection._id),
  );
  const activityRunsForDate = await ctx.db
    .query("brokerageSyncRuns")
    .withIndex("by_ownerId_and_reportDate_and_reportType", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("reportDate", date)
        .eq("reportType", "activity"),
    )
    .collect();

  for (const connection of activeConnections) {
    const hasSucceededRun = activityRunsForDate.some(
      (run) =>
        run.connectionId === connection._id && run.status === "succeeded",
    );
    if (!hasSucceededRun) {
      return "stale";
    }
  }

  const startTimestamp = startOfUtcDate(date);
  const endTimestamp = endOfUtcDate(date);
  const pendingInboxTrades = await ctx.db
    .query("inboxTrades")
    .withIndex("by_owner_status", (q) =>
      q.eq("ownerId", ownerId).eq("status", "pending_review"),
    )
    .collect();
  if (
    pendingInboxTrades.some(
      (trade) =>
        trade.source === "ibkr" &&
        trade.date !== undefined &&
        trade.date >= startTimestamp &&
        trade.date <= endTimestamp,
    )
  ) {
    return "pending_review";
  }

  const openIssues = await ctx.db
    .query("brokerageReconciliationIssues")
    .withIndex("by_ownerId_and_status_and_reportDate", (q) =>
      q.eq("ownerId", ownerId).eq("status", "open").eq("reportDate", date),
    )
    .collect();

  const activeConnectionIssues = openIssues.filter((issue) =>
    activeConnectionIds.has(issue.connectionId),
  );

  if (
    activeConnectionIssues.some((issue) =>
      MISMATCH_ISSUE_TYPES.has(issue.issueType),
    )
  ) {
    return "mismatched";
  }

  return "current";
}
