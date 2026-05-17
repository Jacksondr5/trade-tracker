import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { stageInboxTradesForOwner } from "./imports";
import type { StageInboxTradeInput } from "./imports";

const brokerageConnectionStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("needs_setup"),
  v.literal("error"),
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

const normalizedTradeValidator = v.object({
  assetType: v.literal("stock"),
  brokerageAccountId: v.string(),
  currency: v.optional(v.string()),
  date: v.number(),
  direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
  executionId: v.optional(v.string()),
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
});

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function syncRunNotFound(): never {
  throw new ConvexError("Brokerage sync run not found");
}

async function getSyncRunWithConnection(
  ctx: MutationCtx,
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

export const upsertIbkrConnection = mutation({
  args: {
    accountId: v.optional(v.string()),
    label: v.optional(v.string()),
    queryId: v.optional(v.string()),
    status: v.optional(brokerageConnectionStatusValidator),
    tokenExpiresAt: v.optional(v.number()),
    tokenLabel: v.optional(v.string()),
  },
  returns: v.id("brokerageConnections"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("brokerageConnections")
      .withIndex("by_ownerId_and_source", (q) =>
        q.eq("ownerId", ownerId).eq("source", "ibkr"),
      )
      .first();

    const status = args.status ?? (args.queryId ? "active" : "needs_setup");
    if (existing) {
      await ctx.db.patch(existing._id, {
        accountId: args.accountId,
        connectionError: undefined,
        label: args.label,
        queryId: args.queryId,
        status,
        tokenExpiresAt: args.tokenExpiresAt,
        tokenLabel: args.tokenLabel,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("brokerageConnections", {
      accountId: args.accountId,
      createdAt: now,
      label: args.label,
      ownerId,
      queryId: args.queryId,
      source: "ibkr",
      status,
      tokenExpiresAt: args.tokenExpiresAt,
      tokenLabel: args.tokenLabel,
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
        accountId: v.optional(v.string()),
        label: v.optional(v.string()),
        lastFailedSyncAt: v.optional(v.number()),
        lastSuccessfulSyncAt: v.optional(v.number()),
        queryId: v.optional(v.string()),
        source: v.literal("ibkr"),
        status: brokerageConnectionStatusValidator,
        updatedAt: v.number(),
      }),
    ),
    latestSyncRuns: v.array(
      v.object({
        _id: v.id("brokerageSyncRuns"),
        completedAt: v.optional(v.number()),
        reportDate: v.string(),
        reportType: brokerageSyncReportTypeValidator,
        status: brokerageSyncRunStatusValidator,
        updatedAt: v.number(),
      }),
    ),
    openIssueCount: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const connections = await ctx.db
      .query("brokerageConnections")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(25);
    const latestSyncRuns = await ctx.db
      .query("brokerageSyncRuns")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(10);
    const openIssues = await ctx.db
      .query("brokerageReconciliationIssues")
      .withIndex("by_ownerId_and_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "open"),
      )
      .take(101);

    return {
      connections: connections.map((connection) => ({
        _id: connection._id,
        accountId: connection.accountId,
        label: connection.label,
        lastFailedSyncAt: connection.lastFailedSyncAt,
        lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
        queryId: connection.queryId,
        source: connection.source,
        status: connection.status,
        updatedAt: connection.updatedAt,
      })),
      latestSyncRuns: latestSyncRuns.map((run) => ({
        _id: run._id,
        completedAt: run.completedAt,
        reportDate: run.reportDate,
        reportType: run.reportType,
        status: run.status,
        updatedAt: run.updatedAt,
      })),
      openIssueCount: openIssues.length,
    };
  },
});

export const listDueConnections = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("brokerageConnections"),
      ownerId: v.string(),
      queryId: v.string(),
      source: v.literal("ibkr"),
    }),
  ),
  handler: async (ctx) => {
    const connections = await ctx.db
      .query("brokerageConnections")
      .withIndex("by_source_and_status", (q) =>
        q.eq("source", "ibkr").eq("status", "active"),
      )
      .take(100);
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
    queryId: v.optional(v.string()),
    reportDate: v.string(),
    reportType: brokerageSyncReportTypeValidator,
  },
  returns: v.object({
    created: v.boolean(),
    syncRunId: v.id("brokerageSyncRuns"),
  }),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) throw new ConvexError("Brokerage connection not found");
    if (connection.status !== "active") {
      throw new ConvexError("Brokerage connection is not active");
    }
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
    if (existing) return { created: false, syncRunId: existing._id };

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
      source: connection.source,
      startedAt: now,
      status: "queued",
      updatedAt: now,
    });
    return { created: true, syncRunId };
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
    if (syncRun.rawReportId) return syncRun.rawReportId;

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

    const newIssueCount = await upsertPendingImportReviewIssue(ctx, {
      connectionId: connection._id,
      count: importResult.imported,
      ownerId: syncRun.ownerId,
      reportDate: syncRun.reportDate,
      syncRunId: syncRun._id,
    });

    await ctx.db.patch(syncRun._id, {
      importedTrades: (syncRun.importedTrades ?? 0) + importResult.imported,
      positionSnapshotCount:
        (syncRun.positionSnapshotCount ?? 0) + args.positionSnapshots.length,
      reconciliationIssueCount:
        (syncRun.reconciliationIssueCount ?? 0) + newIssueCount,
      skippedDuplicateTrades:
        (syncRun.skippedDuplicateTrades ?? 0) + importResult.skippedDuplicates,
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
      status: "active",
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
      status: args.failureType === "terminal" ? "error" : connection.status,
      updatedAt: now,
    });
    return null;
  },
});
