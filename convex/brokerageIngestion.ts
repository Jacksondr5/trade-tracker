import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import {
  optionalMetadataStringArrayPatchValidator,
  optionalMetadataStringPatchValidator,
  resolveOptionalMetadataStringArrayPatch,
  resolveOptionalMetadataStringPatch,
  validateTokenExpiresAt,
} from "./lib/brokerageConnectionMetadata";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { stageInboxTradesForOwner } from "./imports";
import type { StageInboxTradeInput } from "./imports";
import {
  MAX_IBKR_ACCOUNT_ID_LENGTH,
  MAX_IBKR_EXPECTED_ACCOUNT_IDS,
} from "../shared/brokerage/constants";

const brokerageConnectionStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("needs_setup"),
  v.literal("error"),
);

const publicBrokerageConnectionStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("needs_setup"),
);

const brokerageSyncReportTypeValidator = v.union(
  v.literal("activity"),
  v.literal("trade_confirmation"),
);

const brokerageSyncRunStatusValidator = v.union(
  v.literal("queued"),
  v.literal("requesting"),
  v.literal("waiting_for_statement"),
  v.literal("processing"),
  v.literal("succeeded"),
  v.literal("failed_retryable"),
  v.literal("failed_terminal"),
);

const brokerageReconciliationIssueSeverityValidator = v.union(
  v.literal("info"),
  v.literal("warning"),
  v.literal("error"),
);

const brokerageSyncRunSummaryValidator = v.object({
  _id: v.id("brokerageSyncRuns"),
  completedAt: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  importedTrades: v.number(),
  positionSnapshotCount: v.number(),
  reconciliationIssueCount: v.number(),
  reportDate: v.string(),
  reportType: brokerageSyncReportTypeValidator,
  status: brokerageSyncRunStatusValidator,
  updatedAt: v.number(),
});

function toSyncRunSummary(run: Doc<"brokerageSyncRuns">) {
  return {
    _id: run._id,
    completedAt: run.completedAt,
    errorMessage: run.errorMessage,
    importedTrades: run.importedTrades,
    positionSnapshotCount: run.positionSnapshotCount,
    reconciliationIssueCount: run.reconciliationIssueCount,
    reportDate: run.reportDate,
    reportType: run.reportType,
    status: run.status,
    updatedAt: run.updatedAt,
  };
}

const normalizedTradeValidator = v.object({
  assetType: v.literal("stock"),
  brokerageAccountId: v.string(),
  currency: v.optional(v.string()),
  date: v.number(),
  direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
  externalId: v.string(),
  fees: v.optional(v.number()),
  orderType: v.optional(v.string()),
  price: v.number(),
  quantity: v.number(),
  side: v.union(v.literal("buy"), v.literal("sell")),
  taxes: v.optional(v.number()),
  ticker: v.string(),
});

const positionSnapshotValidator = v.object({
  assetType: v.literal("stock"),
  brokerageAccountId: v.string(),
  currency: v.optional(v.string()),
  marketValue: v.optional(v.number()),
  quantity: v.number(),
  reportDate: v.string(),
  ticker: v.string(),
});

const cashSnapshotValidator = v.object({
  brokerageAccountId: v.string(),
  cash: v.number(),
  currency: v.string(),
  reportDate: v.string(),
  rowKind: v.union(v.literal("base_summary"), v.literal("currency")),
});

const POSITION_EPSILON = 0.00000001;

type ReconciliationDirection = "long" | "short";
type ReconciliationIssueType =
  | "missing_brokerage_position"
  | "missing_local_position"
  | "position_mismatch";

type PositionReconciliationKey =
  `${string}:${"crypto" | "stock"}:${string}:${ReconciliationDirection}`;
type PositionReconciliationIssueKey =
  `${ReconciliationIssueType}|${PositionReconciliationKey}`;

type ReconciledPosition = {
  assetType: "crypto" | "stock";
  brokerageAccountId: string;
  direction: ReconciliationDirection;
  quantity: number;
  ticker: string;
};

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function endOfUtcDate(date: string): number {
  return Date.parse(`${date}T23:59:59.999Z`);
}

function getSignedTradeQuantity(trade: Doc<"trades">): number {
  const openingSide = trade.direction === "long" ? "buy" : "sell";
  return trade.side === openingSide ? trade.quantity : -trade.quantity;
}

function getDirectionFromBrokerageQuantity(
  quantity: number,
): ReconciliationDirection | null {
  if (quantity > POSITION_EPSILON) return "long";
  if (quantity < -POSITION_EPSILON) return "short";
  return null;
}

function positionReconciliationKey(position: {
  assetType: "crypto" | "stock";
  brokerageAccountId: string;
  direction: ReconciliationDirection;
  ticker: string;
}): PositionReconciliationKey {
  return `${position.brokerageAccountId}:${position.assetType}:${position.ticker}:${position.direction}`;
}

function reconciliationIssueKey(
  issue: Pick<
    Doc<"brokerageReconciliationIssues">,
    "assetType" | "brokerageAccountId" | "direction" | "ticker"
  >,
): PositionReconciliationKey | null {
  if (
    !issue.assetType ||
    !issue.brokerageAccountId ||
    !issue.direction ||
    !issue.ticker
  ) {
    return null;
  }
  return positionReconciliationKey({
    assetType: issue.assetType,
    brokerageAccountId: issue.brokerageAccountId,
    direction: issue.direction,
    ticker: issue.ticker,
  });
}

function positionReconciliationIssueKey(
  issueType: ReconciliationIssueType,
  positionKey: PositionReconciliationKey,
): PositionReconciliationIssueKey {
  return `${issueType}|${positionKey}`;
}

function getPositionMismatchMessage(args: {
  actualQuantity: number;
  brokerageAccountId: string;
  direction: ReconciliationDirection;
  expectedQuantity: number;
  issueType: ReconciliationIssueType;
  ticker: string;
}): string {
  const label = `${args.brokerageAccountId} ${args.ticker} ${args.direction}`;
  if (args.issueType === "missing_local_position") {
    return `Brokerage reports ${args.actualQuantity} ${label} but no matching local accepted position exists`;
  }
  if (args.issueType === "missing_brokerage_position") {
    return `Local accepted trades expect ${args.expectedQuantity} ${label} but the brokerage snapshot does not include it`;
  }
  return `Brokerage reports ${args.actualQuantity} ${label}; local accepted trades expect ${args.expectedQuantity}`;
}

function syncRunNotFound(): never {
  throw new ConvexError("Brokerage sync run not found");
}

async function getSyncRunWithConnection(
  ctx: MutationCtx | QueryCtx,
  syncRunId: Id<"brokerageSyncRuns">,
) {
  const syncRun = await ctx.db.get(syncRunId);
  if (!syncRun) syncRunNotFound();
  const connection = await ctx.db.get(syncRun.connectionId);
  if (!connection || connection.ownerId !== syncRun.ownerId) {
    throw new ConvexError("Brokerage connection not found");
  }
  return { connection, syncRun };
}

async function upsertPendingImportReviewIssue(
  ctx: MutationCtx,
  args: {
    connectionId: Id<"brokerageConnections">;
    count: number;
    ownerId: string;
    reportDate: string;
    syncRunId: Id<"brokerageSyncRuns">;
  },
): Promise<number> {
  if (args.count === 0) return 0;
  const now = Date.now();
  const existing = await ctx.db
    .query("brokerageReconciliationIssues")
    .withIndex("by_owner_connection_reportDate_issueType_status", (q) =>
      q
        .eq("ownerId", args.ownerId)
        .eq("connectionId", args.connectionId)
        .eq("reportDate", args.reportDate)
        .eq("issueType", "pending_import_review")
        .eq("status", "open"),
    )
    .unique();

  const message = `${args.count} imported IBKR trade${args.count === 1 ? "" : "s"} pending review`;
  if (existing) {
    await ctx.db.patch(existing._id, {
      message,
      syncRunId: args.syncRunId,
      updatedAt: now,
    });
    return 0;
  }

  await ctx.db.insert("brokerageReconciliationIssues", {
    connectionId: args.connectionId,
    createdAt: now,
    issueType: "pending_import_review",
    message,
    ownerId: args.ownerId,
    reportDate: args.reportDate,
    severity: "info",
    status: "open",
    syncRunId: args.syncRunId,
    updatedAt: now,
  });
  return 1;
}

async function getLocalAcceptedPositions(
  ctx: MutationCtx,
  args: {
    ownerId: string;
    reportDate: string;
    source: "ibkr";
  },
): Promise<Map<PositionReconciliationKey, ReconciledPosition>> {
  const positions = new Map<PositionReconciliationKey, ReconciledPosition>();
  const endTimestamp = endOfUtcDate(args.reportDate);

  for await (const trade of ctx.db
    .query("trades")
    .withIndex("by_owner_date", (q) =>
      q.eq("ownerId", args.ownerId).lte("date", endTimestamp),
    )) {
    if (trade.source !== args.source || !trade.brokerageAccountId) {
      continue;
    }

    const ticker = normalizeSymbol(trade.ticker);
    const key = positionReconciliationKey({
      assetType: trade.assetType,
      brokerageAccountId: trade.brokerageAccountId,
      direction: trade.direction,
      ticker,
    });
    const existing =
      positions.get(key) ??
      ({
        assetType: trade.assetType,
        brokerageAccountId: trade.brokerageAccountId,
        direction: trade.direction,
        quantity: 0,
        ticker,
      } satisfies ReconciledPosition);
    existing.quantity += getSignedTradeQuantity(trade);
    positions.set(key, existing);
  }

  for (const [key, position] of positions) {
    if (position.quantity <= POSITION_EPSILON) {
      positions.delete(key);
    }
  }

  return positions;
}

async function getBrokerageSnapshotPositions(
  ctx: MutationCtx,
  syncRunId: Id<"brokerageSyncRuns">,
): Promise<Map<PositionReconciliationKey, ReconciledPosition>> {
  const positions = new Map<PositionReconciliationKey, ReconciledPosition>();

  for await (const snapshot of ctx.db
    .query("brokeragePositionSnapshots")
    .withIndex("by_syncRunId", (q) => q.eq("syncRunId", syncRunId))) {
    const direction = getDirectionFromBrokerageQuantity(snapshot.quantity);
    if (direction === null) continue;

    const ticker = normalizeSymbol(snapshot.ticker);
    const key = positionReconciliationKey({
      assetType: snapshot.assetType,
      brokerageAccountId: snapshot.brokerageAccountId,
      direction,
      ticker,
    });
    const existing =
      positions.get(key) ??
      ({
        assetType: snapshot.assetType,
        brokerageAccountId: snapshot.brokerageAccountId,
        direction,
        quantity: 0,
        ticker,
      } satisfies ReconciledPosition);
    existing.quantity += Math.abs(snapshot.quantity);
    positions.set(key, existing);
  }

  return positions;
}

async function upsertPositionReconciliationIssue(
  ctx: MutationCtx,
  args: {
    actualQuantity: number;
    connectionId: Id<"brokerageConnections">;
    expectedQuantity: number;
    issueType: ReconciliationIssueType;
    ownerId: string;
    position: Omit<ReconciledPosition, "quantity">;
    reportDate: string;
    syncRunId: Id<"brokerageSyncRuns">;
    existing: Doc<"brokerageReconciliationIssues"> | undefined;
  },
): Promise<{
  created: boolean;
  issueId: Id<"brokerageReconciliationIssues">;
}> {
  const now = Date.now();
  const message = getPositionMismatchMessage({
    actualQuantity: args.actualQuantity,
    brokerageAccountId: args.position.brokerageAccountId,
    direction: args.position.direction,
    expectedQuantity: args.expectedQuantity,
    issueType: args.issueType,
    ticker: args.position.ticker,
  });

  const fields = {
    actualQuantity: args.actualQuantity,
    assetType: args.position.assetType,
    brokerageAccountId: args.position.brokerageAccountId,
    direction: args.position.direction,
    expectedQuantity: args.expectedQuantity,
    message,
    reportDate: args.reportDate,
    syncRunId: args.syncRunId,
    ticker: args.position.ticker,
    updatedAt: now,
  };

  if (args.existing) {
    await ctx.db.patch(args.existing._id, fields);
    return { created: false, issueId: args.existing._id };
  }

  const issueId = await ctx.db.insert("brokerageReconciliationIssues", {
    ...fields,
    connectionId: args.connectionId,
    createdAt: now,
    issueType: args.issueType,
    ownerId: args.ownerId,
    severity: "warning",
    status: "open",
  });
  return { created: true, issueId };
}

async function reconcilePositionsForSyncRun(
  ctx: MutationCtx,
  args: {
    connectionId: Id<"brokerageConnections">;
    ownerId: string;
    reportDate: string;
    source: "ibkr";
    syncRunId: Id<"brokerageSyncRuns">;
  },
): Promise<{ openIssueCount: number }> {
  const localPositions = await getLocalAcceptedPositions(ctx, args);
  const brokeragePositions = await getBrokerageSnapshotPositions(
    ctx,
    args.syncRunId,
  );
  const openIssues: Doc<"brokerageReconciliationIssues">[] = [];
  for await (const issue of ctx.db
    .query("brokerageReconciliationIssues")
    .withIndex("by_ownerId_and_connectionId_and_status", (q) =>
      q
        .eq("ownerId", args.ownerId)
        .eq("connectionId", args.connectionId)
        .eq("status", "open"),
    )) {
    openIssues.push(issue);
  }
  const positionOpenIssues = openIssues.filter(
    (
      issue,
    ): issue is Doc<"brokerageReconciliationIssues"> & {
      issueType: ReconciliationIssueType;
    } =>
      issue.issueType === "position_mismatch" ||
      issue.issueType === "missing_local_position" ||
      issue.issueType === "missing_brokerage_position",
  );
  const existingIssueByKey = new Map<
    PositionReconciliationIssueKey,
    Doc<"brokerageReconciliationIssues">
  >();
  for (const issue of positionOpenIssues) {
    const key = reconciliationIssueKey(issue);
    if (key === null) continue;
    const issueKey = positionReconciliationIssueKey(issue.issueType, key);
    if (!existingIssueByKey.has(issueKey)) {
      existingIssueByKey.set(issueKey, issue);
    }
  }
  const activeIssueIds = new Set<Id<"brokerageReconciliationIssues">>();
  let openIssueCount = 0;

  const allKeys = new Set<PositionReconciliationKey>([
    ...localPositions.keys(),
    ...brokeragePositions.keys(),
  ]);

  for (const key of allKeys) {
    const local = localPositions.get(key);
    const brokerage = brokeragePositions.get(key);
    const position = brokerage ?? local;
    if (!position) continue;

    const expectedQuantity = local?.quantity ?? 0;
    const actualQuantity = brokerage?.quantity ?? 0;
    const delta = Math.abs(expectedQuantity - actualQuantity);
    if (delta <= POSITION_EPSILON) {
      continue;
    }

    const issueType: ReconciliationIssueType =
      local === undefined
        ? "missing_local_position"
        : brokerage === undefined
          ? "missing_brokerage_position"
          : "position_mismatch";

    const issueKey = positionReconciliationIssueKey(issueType, key);
    const upserted = await upsertPositionReconciliationIssue(ctx, {
      actualQuantity,
      connectionId: args.connectionId,
      existing: existingIssueByKey.get(issueKey),
      expectedQuantity,
      issueType,
      ownerId: args.ownerId,
      position,
      reportDate: args.reportDate,
      syncRunId: args.syncRunId,
    });
    activeIssueIds.add(upserted.issueId);
    if (upserted.created) openIssueCount += 1;
  }

  const now = Date.now();
  for (const issue of positionOpenIssues) {
    if (!activeIssueIds.has(issue._id)) {
      await ctx.db.patch(issue._id, {
        resolvedAt: now,
        status: "resolved",
        syncRunId: args.syncRunId,
        updatedAt: now,
      });
    }
  }

  return { openIssueCount };
}

export const upsertIbkrConnection = mutation({
  args: {
    expectedAccountIds: v.optional(optionalMetadataStringArrayPatchValidator),
    label: v.optional(optionalMetadataStringPatchValidator),
    queryId: v.optional(v.string()),
    status: v.optional(publicBrokerageConnectionStatusValidator),
    tokenExpiresAt: v.optional(v.number()),
  },
  returns: v.id("brokerageConnections"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const now = Date.now();
    const tokenExpiresAt =
      args.tokenExpiresAt === undefined
        ? undefined
        : validateTokenExpiresAt(args.tokenExpiresAt);
    const existing = await ctx.db
      .query("brokerageConnections")
      .withIndex("by_ownerId_and_source", (q) =>
        q.eq("ownerId", ownerId).eq("source", "ibkr"),
      )
      .first();

    if (existing) {
      const nextQueryId = args.queryId ?? existing.queryId;
      const status = args.status ?? (nextQueryId ? "active" : "needs_setup");
      await ctx.db.patch(existing._id, {
        ...(args.expectedAccountIds === undefined
          ? {}
          : {
              expectedAccountIds: resolveOptionalMetadataStringArrayPatch({
                fieldName: "Expected account IDs",
                itemName: "account ID",
                maxItemLength: MAX_IBKR_ACCOUNT_ID_LENGTH,
                maxItems: MAX_IBKR_EXPECTED_ACCOUNT_IDS,
                patch: args.expectedAccountIds,
              }),
            }),
        connectionError: undefined,
        ...(args.label === undefined
          ? {}
          : {
              label: resolveOptionalMetadataStringPatch({
                fieldName: "Label",
                maxLength: 80,
                patch: args.label,
              }),
            }),
        queryId: nextQueryId,
        status,
        tokenExpiresAt: tokenExpiresAt ?? existing.tokenExpiresAt,
        updatedAt: now,
      });
      return existing._id;
    }

    const status = args.status ?? (args.queryId ? "active" : "needs_setup");
    return await ctx.db.insert("brokerageConnections", {
      expectedAccountIds:
        args.expectedAccountIds === undefined
          ? undefined
          : resolveOptionalMetadataStringArrayPatch({
              fieldName: "Expected account IDs",
              itemName: "account ID",
              maxItemLength: MAX_IBKR_ACCOUNT_ID_LENGTH,
              maxItems: MAX_IBKR_EXPECTED_ACCOUNT_IDS,
              patch: args.expectedAccountIds,
            }),
      createdAt: now,
      label:
        args.label === undefined
          ? undefined
          : resolveOptionalMetadataStringPatch({
              fieldName: "Label",
              maxLength: 80,
              patch: args.label,
            }),
      ownerId,
      queryId: args.queryId,
      source: "ibkr",
      status,
      tokenExpiresAt,
      updatedAt: now,
    });
  },
});

export const pauseBrokerageConnection = mutation({
  args: { connectionId: v.id("brokerageConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const connection = assertOwner(
      await ctx.db.get(args.connectionId),
      ownerId,
      "Brokerage connection not found",
    );
    await ctx.db.patch(connection._id, {
      status: "paused",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getBrokerageIngestionStatus = query({
  args: {},
  returns: v.object({
    connections: v.array(
      v.object({
        _id: v.id("brokerageConnections"),
        connectionError: v.optional(v.string()),
        expectedAccountIds: v.optional(v.array(v.string())),
        label: v.optional(v.string()),
        lastFailedSyncAt: v.optional(v.number()),
        lastSuccessfulSyncAt: v.optional(v.number()),
        queryId: v.optional(v.string()),
        source: v.literal("ibkr"),
        status: brokerageConnectionStatusValidator,
        tokenConfigured: v.boolean(),
        tokenExpiresAt: v.optional(v.number()),
        updatedAt: v.number(),
      }),
    ),
    latestFailedSync: v.union(v.null(), brokerageSyncRunSummaryValidator),
    latestSuccessfulSync: v.union(v.null(), brokerageSyncRunSummaryValidator),
    latestSyncRuns: v.array(brokerageSyncRunSummaryValidator),
    hasMoreOpenIssues: v.boolean(),
    hasMorePendingImportedTrades: v.boolean(),
    openIssueCount: v.number(),
    openIssues: v.array(
      v.object({
        _id: v.id("brokerageReconciliationIssues"),
        actualQuantity: v.optional(v.number()),
        expectedQuantity: v.optional(v.number()),
        message: v.string(),
        reportDate: v.string(),
        severity: brokerageReconciliationIssueSeverityValidator,
        ticker: v.optional(v.string()),
        updatedAt: v.number(),
      }),
    ),
    pendingImportedTradeCount: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const [
      connections,
      latestSyncRuns,
      openIssues,
      pendingImportedTrades,
      successfulRuns,
      retryableFailedRuns,
      terminalFailedRuns,
    ] = await Promise.all([
      ctx.db
        .query("brokerageConnections")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
        .take(25),
      ctx.db
        .query("brokerageSyncRuns")
        .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
        .order("desc")
        .take(10),
      ctx.db
        .query("brokerageReconciliationIssues")
        .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
          q.eq("ownerId", ownerId).eq("status", "open"),
        )
        .order("desc")
        .take(101),
      ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_source_status", (q) =>
          q
            .eq("ownerId", ownerId)
            .eq("source", "ibkr")
            .eq("status", "pending_review"),
        )
        .take(101),
      ctx.db
        .query("brokerageSyncRuns")
        .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
          q.eq("ownerId", ownerId).eq("status", "succeeded"),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("brokerageSyncRuns")
        .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
          q.eq("ownerId", ownerId).eq("status", "failed_retryable"),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("brokerageSyncRuns")
        .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
          q.eq("ownerId", ownerId).eq("status", "failed_terminal"),
        )
        .order("desc")
        .first(),
    ]);
    const latestSuccessfulSync = successfulRuns;
    const latestFailedSync =
      retryableFailedRuns === null ||
      (terminalFailedRuns !== null &&
        terminalFailedRuns.updatedAt > retryableFailedRuns.updatedAt)
        ? terminalFailedRuns
        : retryableFailedRuns;
    const reviewableIssues = openIssues.slice(0, 10);
    const connectionSecrets = await Promise.all(
      connections.map((connection) =>
        ctx.db
          .query("brokerageConnectionSecrets")
          .withIndex("by_connectionId", (query) =>
            query.eq("connectionId", connection._id),
          )
          .unique(),
      ),
    );
    const configuredConnectionIds = new Set(
      connectionSecrets
        .filter((secret) => secret !== null)
        .map((secret) => secret.connectionId),
    );

    return {
      connections: connections.map((connection) => ({
        _id: connection._id,
        connectionError: connection.connectionError,
        expectedAccountIds: connection.expectedAccountIds,
        label: connection.label,
        lastFailedSyncAt: connection.lastFailedSyncAt,
        lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
        queryId: connection.queryId,
        source: connection.source,
        status: connection.status,
        tokenConfigured: configuredConnectionIds.has(connection._id),
        tokenExpiresAt: connection.tokenExpiresAt,
        updatedAt: connection.updatedAt,
      })),
      latestFailedSync: latestFailedSync
        ? toSyncRunSummary(latestFailedSync)
        : null,
      latestSuccessfulSync: latestSuccessfulSync
        ? toSyncRunSummary(latestSuccessfulSync)
        : null,
      latestSyncRuns: latestSyncRuns.map(toSyncRunSummary),
      hasMoreOpenIssues: openIssues.length > 100,
      hasMorePendingImportedTrades: pendingImportedTrades.length > 100,
      openIssueCount: Math.min(openIssues.length, 100),
      openIssues: reviewableIssues.map((issue) => ({
        _id: issue._id,
        actualQuantity: issue.actualQuantity,
        expectedQuantity: issue.expectedQuantity,
        message: issue.message,
        reportDate: issue.reportDate,
        severity: issue.severity,
        ticker: issue.ticker,
        updatedAt: issue.updatedAt,
      })),
      pendingImportedTradeCount: Math.min(pendingImportedTrades.length, 100),
    };
  },
});

export const listDueConnections = internalQuery({
  args: { includeError: v.optional(v.boolean()) },
  returns: v.array(
    v.object({
      _id: v.id("brokerageConnections"),
      ownerId: v.string(),
      queryId: v.string(),
      source: v.literal("ibkr"),
    }),
  ),
  handler: async (ctx, args) => {
    const activeConnections = await ctx.db
      .query("brokerageConnections")
      .withIndex("by_source_and_status", (q) =>
        q.eq("source", "ibkr").eq("status", "active"),
      )
      .take(100);
    const errorConnections = args.includeError
      ? await ctx.db
          .query("brokerageConnections")
          .withIndex("by_source_and_status", (q) =>
            q.eq("source", "ibkr").eq("status", "error"),
          )
          .take(100)
      : [];
    const connections = [...activeConnections, ...errorConnections];
    return connections.flatMap((connection) =>
      connection.queryId
        ? [
            {
              _id: connection._id,
              ownerId: connection.ownerId,
              queryId: connection.queryId,
              source: connection.source,
            },
          ]
        : [],
    );
  },
});

export const beginSyncRunForConnection = internalMutation({
  args: {
    connectionId: v.id("brokerageConnections"),
    force: v.optional(v.boolean()),
    queryId: v.optional(v.string()),
    reportDate: v.string(),
    reportType: brokerageSyncReportTypeValidator,
  },
  returns: v.object({
    created: v.boolean(),
    ownerId: v.string(),
    previousRawReportId: v.optional(v.id("brokerageRawReports")),
    queryId: v.string(),
    syncRunId: v.id("brokerageSyncRuns"),
  }),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) throw new ConvexError("Brokerage connection not found");
    const queryId = args.queryId ?? connection.queryId;
    if (!queryId) throw new ConvexError("IBKR query ID is required");

    const existing = await ctx.db
      .query("brokerageSyncRuns")
      .withIndex(
        "by_connectionId_and_reportType_and_reportDate_and_queryId",
        (q) =>
          q
            .eq("connectionId", connection._id)
            .eq("reportType", args.reportType)
            .eq("reportDate", args.reportDate)
            .eq("queryId", queryId),
      )
      .unique();
    // A terminal workflow has released ownership of this keyed run, so it can
    // be requeued atomically. Non-terminal runs remain join-only: reclaiming
    // one without canceling its workflow could issue a duplicate Flex request.
    const canRequeueTerminalRun =
      existing?.status === "failed_retryable" ||
      existing?.status === "failed_terminal" ||
      (args.force === true && existing?.status === "succeeded");
    const canRecoverConnectionError =
      args.force === true &&
      connection.status === "error" &&
      (canRequeueTerminalRun || existing === null);
    if (
      canRequeueTerminalRun &&
      (connection.status === "active" || canRecoverConnectionError)
    ) {
      const now = Date.now();
      const previousRawReportId = existing.rawReportId;
      await ctx.db.patch(existing._id, {
        completedAt: undefined,
        errorMessage: undefined,
        importedTrades: 0,
        positionSnapshotCount: 0,
        rawReportId: undefined,
        reconciliationIssueCount: 0,
        referenceCode: undefined,
        requestedAt: now,
        skippedDuplicateTrades: 0,
        skippedLogicalDuplicateTrades: 0,
        startedAt: now,
        status: "queued",
        updatedAt: now,
      });
      await ctx.db.patch(connection._id, {
        connectionError: undefined,
        ...(canRecoverConnectionError ? { status: "active" as const } : {}),
        updatedAt: now,
      });
      return {
        created: true,
        ownerId: connection.ownerId,
        previousRawReportId,
        queryId,
        syncRunId: existing._id,
      };
    }
    if (canRecoverConnectionError) {
      const now = Date.now();
      await ctx.db.patch(connection._id, {
        connectionError: undefined,
        status: "active",
        updatedAt: now,
      });
    } else if (connection.status !== "active") {
      throw new ConvexError("Brokerage connection is not active");
    }
    if (existing) {
      return {
        created: false,
        ownerId: connection.ownerId,
        queryId,
        syncRunId: existing._id,
      };
    }

    const now = Date.now();
    const syncRunId = await ctx.db.insert("brokerageSyncRuns", {
      connectionId: connection._id,
      importedTrades: 0,
      ownerId: connection.ownerId,
      positionSnapshotCount: 0,
      queryId,
      reconciliationIssueCount: 0,
      reportDate: args.reportDate,
      reportType: args.reportType,
      requestedAt: now,
      skippedDuplicateTrades: 0,
      skippedLogicalDuplicateTrades: 0,
      source: connection.source,
      startedAt: now,
      status: "queued",
      updatedAt: now,
    });
    return { created: true, ownerId: connection.ownerId, queryId, syncRunId };
  },
});

export const markSyncRunRequested = internalMutation({
  args: {
    referenceCode: v.string(),
    syncRunId: v.id("brokerageSyncRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSyncRunWithConnection(ctx, args.syncRunId);
    await ctx.db.patch(args.syncRunId, {
      referenceCode: args.referenceCode,
      status: "requesting",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markSyncRunWaiting = internalMutation({
  args: { syncRunId: v.id("brokerageSyncRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSyncRunWithConnection(ctx, args.syncRunId);
    await ctx.db.patch(args.syncRunId, {
      status: "waiting_for_statement",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const storeRawReportReference = internalMutation({
  args: {
    byteLength: v.number(),
    contentHash: v.string(),
    storageId: v.id("_storage"),
    syncRunId: v.id("brokerageSyncRuns"),
  },
  returns: v.id("brokerageRawReports"),
  handler: async (ctx, args) => {
    const { connection, syncRun } = await getSyncRunWithConnection(
      ctx,
      args.syncRunId,
    );
    if (syncRun.rawReportId) {
      // A duplicate ingestion attempt may upload a second blob before checking
      // idempotency; delete the new blob to avoid orphaned storage files.
      await ctx.storage.delete(args.storageId);
      return syncRun.rawReportId;
    }

    const rawReportId = await ctx.db.insert("brokerageRawReports", {
      byteLength: args.byteLength,
      connectionId: connection._id,
      contentHash: args.contentHash,
      createdAt: Date.now(),
      ownerId: syncRun.ownerId,
      reportDate: syncRun.reportDate,
      reportType: syncRun.reportType,
      source: syncRun.source,
      storageId: args.storageId,
      syncRunId: syncRun._id,
    });
    await ctx.db.patch(syncRun._id, {
      rawReportId,
      status: "processing",
      updatedAt: Date.now(),
    });
    return rawReportId;
  },
});

export const getRawReportForSyncRun = internalQuery({
  args: {
    rawReportId: v.id("brokerageRawReports"),
    syncRunId: v.id("brokerageSyncRuns"),
  },
  returns: v.union(v.null(), v.object({ contentHash: v.string() })),
  handler: async (ctx, args) => {
    const { syncRun } = await getSyncRunWithConnection(ctx, args.syncRunId);
    const rawReport = await ctx.db.get(args.rawReportId);
    if (!rawReport || rawReport.syncRunId !== syncRun._id) return null;
    return { contentHash: rawReport.contentHash };
  },
});

export const reuseRawReportReference = internalMutation({
  args: {
    rawReportId: v.id("brokerageRawReports"),
    syncRunId: v.id("brokerageSyncRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { syncRun } = await getSyncRunWithConnection(ctx, args.syncRunId);
    if (syncRun.rawReportId && syncRun.rawReportId !== args.rawReportId) {
      throw new ConvexError("Brokerage raw report changed during reuse");
    }
    const rawReport = await ctx.db.get(args.rawReportId);
    if (!rawReport || rawReport.syncRunId !== syncRun._id) {
      throw new ConvexError("Brokerage raw report not found");
    }
    await ctx.db.patch(syncRun._id, {
      rawReportId: rawReport._id,
      status: "processing",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const rollbackRawReportReference = internalMutation({
  args: {
    rawReportId: v.id("brokerageRawReports"),
    storageId: v.id("_storage"),
    syncRunId: v.id("brokerageSyncRuns"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { syncRun } = await getSyncRunWithConnection(ctx, args.syncRunId);
    if (syncRun.rawReportId !== args.rawReportId) return false;

    const rawReport = await ctx.db.get(args.rawReportId);
    if (!rawReport || rawReport.syncRunId !== syncRun._id) return false;
    if (rawReport.storageId !== args.storageId) return false;

    await ctx.db.delete(rawReport._id);
    await ctx.db.patch(syncRun._id, {
      rawReportId: undefined,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const ingestParsedFlexReport = internalMutation({
  args: {
    cashSnapshots: v.array(cashSnapshotValidator),
    errors: v.optional(v.array(v.string())),
    positionSnapshots: v.array(positionSnapshotValidator),
    syncRunId: v.id("brokerageSyncRuns"),
    trades: v.array(normalizedTradeValidator),
    warnings: v.optional(v.array(v.string())),
  },
  returns: v.object({
    cashSnapshotsWritten: v.number(),
    importedTrades: v.number(),
    positionSnapshotsWritten: v.number(),
    skippedDuplicateTrades: v.number(),
  }),
  handler: async (ctx, args) => {
    const { connection, syncRun } = await getSyncRunWithConnection(
      ctx,
      args.syncRunId,
    );
    const now = Date.now();

    const trades: StageInboxTradeInput[] = args.trades.map((trade) => ({
      assetType: "stock",
      brokerageAccountId: trade.brokerageAccountId,
      date: trade.date,
      direction: trade.direction,
      externalId: trade.externalId,
      fees: trade.fees,
      orderType: trade.orderType,
      price: trade.price,
      quantity: trade.quantity,
      side: trade.side,
      source: "ibkr",
      taxes: trade.taxes,
      ticker: trade.ticker,
      validationErrors: args.errors,
      validationWarnings: args.warnings,
    }));
    const importResult = await stageInboxTradesForOwner(
      ctx,
      syncRun.ownerId,
      trades,
    );

    let positionSnapshotsWritten = 0;
    for (const snapshot of args.positionSnapshots) {
      const ticker = normalizeSymbol(snapshot.ticker);
      const existing = await ctx.db
        .query("brokeragePositionSnapshots")
        .withIndex(
          "by_syncRunId_and_account_and_assetType_and_ticker_and_reportDate",
          (q) =>
            q
              .eq("syncRunId", syncRun._id)
              .eq("brokerageAccountId", snapshot.brokerageAccountId)
              .eq("assetType", snapshot.assetType)
              .eq("ticker", ticker)
              .eq("reportDate", snapshot.reportDate),
        )
        .unique();
      const fields = {
        assetType: snapshot.assetType,
        brokerageAccountId: snapshot.brokerageAccountId,
        connectionId: connection._id,
        currency: snapshot.currency,
        marketValue: snapshot.marketValue,
        ownerId: syncRun.ownerId,
        quantity: snapshot.quantity,
        reportDate: snapshot.reportDate,
        syncRunId: syncRun._id,
        ticker,
      };
      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("brokeragePositionSnapshots", {
          ...fields,
          createdAt: now,
        });
        positionSnapshotsWritten++;
      }
    }

    let cashSnapshotsWritten = 0;
    for (const snapshot of args.cashSnapshots) {
      const currency = snapshot.currency.trim().toUpperCase();
      const existing = await ctx.db
        .query("brokerageCashSnapshots")
        .withIndex(
          "by_syncRunId_and_account_and_currency_and_reportDate",
          (q) =>
            q
              .eq("syncRunId", syncRun._id)
              .eq("brokerageAccountId", snapshot.brokerageAccountId)
              .eq("currency", currency)
              .eq("reportDate", snapshot.reportDate),
        )
        .unique();
      const fields = {
        brokerageAccountId: snapshot.brokerageAccountId,
        cash: snapshot.cash,
        connectionId: connection._id,
        currency,
        ownerId: syncRun.ownerId,
        reportDate: snapshot.reportDate,
        rowKind: snapshot.rowKind,
        syncRunId: syncRun._id,
      };
      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("brokerageCashSnapshots", {
          ...fields,
          createdAt: now,
        });
        cashSnapshotsWritten++;
      }
    }

    const positionReconciliation = await reconcilePositionsForSyncRun(ctx, {
      connectionId: connection._id,
      ownerId: syncRun.ownerId,
      reportDate: syncRun.reportDate,
      source: syncRun.source,
      syncRunId: syncRun._id,
    });
    const newPendingImportIssueCount = await upsertPendingImportReviewIssue(
      ctx,
      {
        connectionId: connection._id,
        count: importResult.imported,
        ownerId: syncRun.ownerId,
        reportDate: syncRun.reportDate,
        syncRunId: syncRun._id,
      },
    );

    await ctx.db.patch(syncRun._id, {
      importedTrades: (syncRun.importedTrades ?? 0) + importResult.imported,
      positionSnapshotCount:
        (syncRun.positionSnapshotCount ?? 0) + positionSnapshotsWritten,
      reconciliationIssueCount:
        (syncRun.reconciliationIssueCount ?? 0) +
        positionReconciliation.openIssueCount +
        newPendingImportIssueCount,
      skippedDuplicateTrades: Math.max(
        syncRun.skippedDuplicateTrades ?? 0,
        importResult.skippedDuplicates,
      ),
      skippedLogicalDuplicateTrades: Math.max(
        syncRun.skippedLogicalDuplicateTrades ?? 0,
        importResult.skippedLogicalDuplicates,
      ),
      status: "processing",
      updatedAt: now,
    });

    return {
      cashSnapshotsWritten,
      importedTrades: importResult.imported,
      positionSnapshotsWritten,
      skippedDuplicateTrades: importResult.skippedDuplicates,
    };
  },
});

export const markSyncRunSucceeded = internalMutation({
  args: { syncRunId: v.id("brokerageSyncRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { connection, syncRun } = await getSyncRunWithConnection(
      ctx,
      args.syncRunId,
    );
    const now = Date.now();
    await ctx.db.patch(syncRun._id, {
      completedAt: now,
      status: "succeeded",
      updatedAt: now,
    });
    await ctx.db.patch(connection._id, {
      connectionError: undefined,
      lastSuccessfulSyncAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const markSyncRunFailed = internalMutation({
  args: {
    errorMessage: v.string(),
    failureType: v.union(v.literal("retryable"), v.literal("terminal")),
    syncRunId: v.id("brokerageSyncRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { connection, syncRun } = await getSyncRunWithConnection(
      ctx,
      args.syncRunId,
    );
    const now = Date.now();
    await ctx.db.patch(syncRun._id, {
      completedAt: now,
      errorMessage: args.errorMessage,
      status:
        args.failureType === "retryable"
          ? "failed_retryable"
          : "failed_terminal",
      updatedAt: now,
    });
    await ctx.db.patch(connection._id, {
      connectionError: args.errorMessage,
      lastFailedSyncAt: now,
      updatedAt: now,
    });
    return null;
  },
});
