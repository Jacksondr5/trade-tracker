import { ConvexError, v } from "convex/values";
import {
  assertIbkrEasternTimezoneAvailable,
  parseIbkrEasternTimestamp,
  parseIbkrTimestampAsUtcWallClock,
} from "../shared/brokerage/ibkr-flex/time";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

const MAX_EXECUTIONS = 500;

const correctionRowValidator = v.object({
  correctedTimestamp: v.number(),
  deltaMs: v.number(),
  executionId: v.string(),
  expectedDeltaMs: v.number(),
  matchesExpectedMisparse: v.boolean(),
  rawDateTime: v.string(),
  recordState: v.union(v.literal("accepted"), v.literal("pending_review")),
  storedTimestamp: v.number(),
  ticker: v.string(),
});

const correctionSummaryValidator = v.object({
  acceptedExecutionIdsExcludedByMaximumCreationTime: v.array(v.string()),
  acceptedTradesMatched: v.number(),
  acceptedTradesWritten: v.number(),
  auditToken: v.string(),
  dryRun: v.boolean(),
  earliestCorrectedTimestamp: v.union(v.number(), v.null()),
  earliestStoredTimestamp: v.union(v.number(), v.null()),
  latestCorrectedTimestamp: v.union(v.number(), v.null()),
  latestStoredTimestamp: v.union(v.number(), v.null()),
  maximumCreationTime: v.number(),
  minimumCreationTime: v.number(),
  pendingExecutionIdsExcludedByMaximumCreationTime: v.array(v.string()),
  pendingInboxTradesMatched: v.number(),
  pendingInboxTradesWritten: v.number(),
  requestedExecutions: v.number(),
  rows: v.array(correctionRowValidator),
  safeToExecute: v.boolean(),
});

type CandidateBase = {
  correctedDate: number;
  currentDate: number;
  executionId: string;
  expectedStoredDate: number;
  rawDateTime: string;
  ticker: string;
};

type Candidate =
  | (CandidateBase & {
      id: Id<"inboxTrades">;
      table: "inboxTrades";
    })
  | (CandidateBase & {
      id: Id<"trades">;
      table: "trades";
    });

function auditHash(
  candidates: Candidate[],
  creationTimeBounds: { maximum: number; minimum: number },
  cutoffExclusions: { accepted: string[]; pending: string[] },
): string {
  let hash = 2_166_136_261;
  const input = [
    `creation-time-bounds:${creationTimeBounds.minimum}:${creationTimeBounds.maximum}`,
    `accepted-cutoff-exclusions:${cutoffExclusions.accepted.join(",")}`,
    `pending-cutoff-exclusions:${cutoffExclusions.pending.join(",")}`,
    ...candidates
      .map((candidate) =>
        [
          candidate.table,
          candidate.id,
          candidate.currentDate,
          candidate.executionId,
          candidate.rawDateTime,
        ].join(":"),
      )
      .sort(),
  ].join("|");
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `ibkr-timestamp-v2:${candidates.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function range(values: number[]): {
  earliest: number | null;
  latest: number | null;
} {
  if (values.length === 0) return { earliest: null, latest: null };
  return {
    earliest: Math.min(...values),
    latest: Math.max(...values),
  };
}

function parseSourceTimestamp(executionId: string, rawDateTime: string) {
  const correctedDate = parseIbkrEasternTimestamp(rawDateTime);
  const expectedStoredDate = parseIbkrTimestampAsUtcWallClock(rawDateTime);
  if (correctedDate === undefined || expectedStoredDate === undefined) {
    throw new ConvexError(
      `IBKR timestamp correction refused: ${executionId} has an invalid raw dateTime`,
    );
  }
  return { correctedDate, expectedStoredDate };
}

/**
 * One-off, approval-gated correction for timestamps parsed as UTC by the Flex
 * ingestion path. Each target is identified by an ibExecID and its authoritative
 * raw Flex dateTime; accepted CSV history is intentionally outside this set.
 */
export const correctIbkrTradeTimestamps = internalMutation({
  args: {
    dryRun: v.boolean(),
    executions: v.array(
      v.object({ executionId: v.string(), rawDateTime: v.string() }),
    ),
    expectedAuditToken: v.optional(v.string()),
    maximumCreationTime: v.number(),
    minimumCreationTime: v.number(),
  },
  returns: correctionSummaryValidator,
  handler: async (ctx, args) => {
    assertIbkrEasternTimezoneAvailable();

    const executionMap = new Map(
      args.executions.map((entry) => [entry.executionId, entry.rawDateTime]),
    );
    if (
      executionMap.size === 0 ||
      executionMap.size !== args.executions.length ||
      executionMap.size > MAX_EXECUTIONS
    ) {
      throw new ConvexError(
        `IBKR timestamp correction refused: executions must contain 1-${MAX_EXECUTIONS} unique execution ids`,
      );
    }
    if (
      !Number.isFinite(args.minimumCreationTime) ||
      !Number.isFinite(args.maximumCreationTime) ||
      args.minimumCreationTime >= args.maximumCreationTime
    ) {
      throw new ConvexError(
        "IBKR timestamp correction refused: creation-time bounds must be finite and increasing",
      );
    }

    const [
      acceptedMatches,
      pendingMatches,
      acceptedPostCutoffMatches,
      pendingPostCutoffMatches,
    ] = await Promise.all([
      // Do not add the minimum bound here: matching pre-floor rows must be
      // fetched so the checks below fail loudly. The maximum is intentionally
      // excluded and made diagnosable by the post-cutoff queries and one-to-one guard.
      Promise.all(
        args.executions.map(({ executionId }) =>
          ctx.db
            .query("trades")
            .withIndex("by_source_externalId", (query) =>
              query
                .eq("source", "ibkr")
                .eq("externalId", executionId)
                .lt("_creationTime", args.maximumCreationTime),
            )
            .take(2),
        ),
      ),
      Promise.all(
        args.executions.map(({ executionId }) =>
          ctx.db
            .query("inboxTrades")
            .withIndex("by_source_externalId", (query) =>
              query
                .eq("source", "ibkr")
                .eq("externalId", executionId)
                .lt("_creationTime", args.maximumCreationTime),
            )
            .take(2),
        ),
      ),
      Promise.all(
        args.executions.map(({ executionId }) =>
          ctx.db
            .query("trades")
            .withIndex("by_source_externalId", (query) =>
              query
                .eq("source", "ibkr")
                .eq("externalId", executionId)
                .gte("_creationTime", args.maximumCreationTime),
            )
            .take(1),
        ),
      ),
      Promise.all(
        args.executions.map(({ executionId }) =>
          ctx.db
            .query("inboxTrades")
            .withIndex("by_source_externalId", (query) =>
              query
                .eq("source", "ibkr")
                .eq("externalId", executionId)
                .gte("_creationTime", args.maximumCreationTime),
            )
            .take(1),
        ),
      ),
    ]);
    const acceptedRows = acceptedMatches.flat();
    const pendingRows = pendingMatches.flat();
    const acceptedCutoffExclusions = args.executions
      .filter((_, index) => acceptedPostCutoffMatches[index]!.length > 0)
      .map(({ executionId }) => executionId)
      .sort();
    const pendingCutoffExclusions = args.executions
      .filter((_, index) => pendingPostCutoffMatches[index]!.length > 0)
      .map(({ executionId }) => executionId)
      .sort();

    const candidates: Candidate[] = [];
    for (const trade of acceptedRows) {
      if (trade.source !== "ibkr" || trade.externalId === undefined) continue;
      const rawDateTime = executionMap.get(trade.externalId);
      if (rawDateTime === undefined) continue;
      if (trade._creationTime >= args.maximumCreationTime) continue;
      if (trade._creationTime < args.minimumCreationTime) {
        throw new ConvexError(
          `IBKR timestamp correction refused: accepted trade ${trade._id} predates the first successful Flex sync`,
        );
      }
      candidates.push({
        ...parseSourceTimestamp(trade.externalId, rawDateTime),
        currentDate: trade.date,
        executionId: trade.externalId,
        id: trade._id,
        rawDateTime,
        table: "trades",
        ticker: trade.ticker,
      });
    }

    for (const trade of pendingRows) {
      if (trade.source !== "ibkr" || trade.externalId === undefined) continue;
      const rawDateTime = executionMap.get(trade.externalId);
      if (rawDateTime === undefined) continue;
      if (trade._creationTime >= args.maximumCreationTime) continue;
      if (trade._creationTime < args.minimumCreationTime) {
        throw new ConvexError(
          `IBKR timestamp correction refused: inbox trade ${trade._id} predates the first successful Flex sync`,
        );
      }
      if (trade.date === undefined || trade.ticker === undefined) {
        throw new ConvexError(
          `IBKR timestamp correction refused: inbox trade ${trade._id} lacks a date or ticker`,
        );
      }
      candidates.push({
        ...parseSourceTimestamp(trade.externalId, rawDateTime),
        currentDate: trade.date,
        executionId: trade.externalId,
        id: trade._id,
        rawDateTime,
        table: "inboxTrades",
        ticker: trade.ticker,
      });
    }

    const matchedIds = new Set(
      candidates.map((candidate) => candidate.executionId),
    );
    if (
      matchedIds.size !== candidates.length ||
      matchedIds.size !== executionMap.size
    ) {
      const cutoffContext =
        acceptedCutoffExclusions.length > 0 ||
        pendingCutoffExclusions.length > 0
          ? `; maximumCreationTime excluded ${acceptedCutoffExclusions.length} accepted and ${pendingCutoffExclusions.length} pending execution ids`
          : "";
      throw new ConvexError(
        `IBKR timestamp correction refused: supplied executions did not match stored records one-to-one${cutoffContext}`,
      );
    }

    const safeToExecute = candidates.every(
      (candidate) => candidate.currentDate === candidate.expectedStoredDate,
    );
    const auditToken = auditHash(
      candidates,
      {
        maximum: args.maximumCreationTime,
        minimum: args.minimumCreationTime,
      },
      {
        accepted: acceptedCutoffExclusions,
        pending: pendingCutoffExclusions,
      },
    );
    if (!args.dryRun && !safeToExecute) {
      throw new ConvexError(
        "IBKR timestamp correction refused: a stored timestamp does not match the raw report's expected UTC misparse",
      );
    }
    if (!args.dryRun && args.expectedAuditToken !== auditToken) {
      throw new ConvexError(
        "IBKR timestamp correction refused: expectedAuditToken does not match the current dry-run candidates",
      );
    }

    if (!args.dryRun) {
      for (const candidate of candidates) {
        await ctx.db.patch(candidate.id, { date: candidate.correctedDate });
      }
    }

    const storedRange = range(
      candidates.map((candidate) => candidate.currentDate),
    );
    const correctedRange = range(
      candidates.map((candidate) => candidate.correctedDate),
    );
    return {
      acceptedExecutionIdsExcludedByMaximumCreationTime:
        acceptedCutoffExclusions,
      acceptedTradesMatched: candidates.filter(
        (candidate) => candidate.table === "trades",
      ).length,
      acceptedTradesWritten: args.dryRun
        ? 0
        : candidates.filter((candidate) => candidate.table === "trades").length,
      auditToken,
      dryRun: args.dryRun,
      earliestCorrectedTimestamp: correctedRange.earliest,
      earliestStoredTimestamp: storedRange.earliest,
      latestCorrectedTimestamp: correctedRange.latest,
      latestStoredTimestamp: storedRange.latest,
      maximumCreationTime: args.maximumCreationTime,
      minimumCreationTime: args.minimumCreationTime,
      pendingExecutionIdsExcludedByMaximumCreationTime: pendingCutoffExclusions,
      pendingInboxTradesMatched: candidates.filter(
        (candidate) => candidate.table === "inboxTrades",
      ).length,
      pendingInboxTradesWritten: args.dryRun
        ? 0
        : candidates.filter((candidate) => candidate.table === "inboxTrades")
            .length,
      requestedExecutions: executionMap.size,
      rows: candidates
        .map((candidate) => ({
          correctedTimestamp: candidate.correctedDate,
          deltaMs: candidate.correctedDate - candidate.currentDate,
          executionId: candidate.executionId,
          expectedDeltaMs:
            candidate.correctedDate - candidate.expectedStoredDate,
          matchesExpectedMisparse:
            candidate.currentDate === candidate.expectedStoredDate,
          rawDateTime: candidate.rawDateTime,
          recordState:
            candidate.table === "trades"
              ? ("accepted" as const)
              : ("pending_review" as const),
          storedTimestamp: candidate.currentDate,
          ticker: candidate.ticker,
        }))
        .sort((a, b) => a.executionId.localeCompare(b.executionId)),
      safeToExecute,
    };
  },
});
