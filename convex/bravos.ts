import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const bravosConnectionStatusValidator = v.union(
  v.literal("not_connected"),
  v.literal("connected"),
  v.literal("needs_reconnect"),
);

const bravosReviewStateValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("needs_attention"),
  v.literal("approved"),
  v.literal("dismissed"),
  v.literal("failed"),
);

const bravosSyncRunKindValidator = v.union(
  v.literal("direct_post_fetch"),
  v.literal("listing_scan"),
  v.literal("scheduled_scan"),
);

const bravosClassificationValidator = v.union(
  v.literal("initiate"),
  v.literal("follow_up"),
  v.literal("unknown"),
);

const bravosFollowUpFieldValidator = v.union(
  v.literal("entryConditions"),
  v.literal("exitConditions"),
  v.literal("instrumentNotes"),
  v.literal("rationale"),
  v.literal("targetConditions"),
);

const bravosProposedActionValidator = v.union(
  v.object({
    kind: v.literal("create_trade_plan"),
    entryConditions: v.optional(v.string()),
    exitConditions: v.optional(v.string()),
    instrumentNotes: v.optional(v.string()),
    instrumentSymbol: v.string(),
    instrumentType: v.optional(v.string()),
    name: v.string(),
    rationale: v.optional(v.string()),
    targetConditions: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("apply_follow_up"),
    fieldUpdates: v.array(
      v.object({
        field: bravosFollowUpFieldValidator,
        text: v.string(),
      }),
    ),
    noteContent: v.optional(v.string()),
    targetTradePlanId: v.optional(v.id("tradePlans")),
  }),
  v.object({
    kind: v.literal("note_only"),
    content: v.string(),
    targetTradePlanId: v.optional(v.id("tradePlans")),
  }),
  v.object({
    kind: v.literal("unknown"),
    reason: v.optional(v.string()),
  }),
);

type BravosProposedAction = Doc<"bravosReviewItems">["proposedAction"];
type FollowUpField =
  Extract<BravosProposedAction, { kind: "apply_follow_up" }>["fieldUpdates"][number]["field"];

const mutableFollowUpFields = new Set<FollowUpField>([
  "entryConditions",
  "exitConditions",
  "instrumentNotes",
  "rationale",
  "targetConditions",
]);

function normalizeBravosSourceUrl(url: string): string {
  const parsed = new URL(url.trim());
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.startsWith("utm_") ||
      ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(normalizedKey)
    ) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.searchParams.sort();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

function buildBravosSourceIdentity(args: {
  sourceUrl: string;
}): string {
  return normalizeBravosSourceUrl(args.sourceUrl);
}

function assertWorkerSecret(secret: string) {
  const expected = process.env.BRAVOS_WORKER_SECRET;
  if (!expected || secret !== expected) {
    throw new ConvexError("Unauthorized worker request");
  }
}

async function getConnectionByOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
) {
  return await ctx.db
    .query("bravosConnections")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .unique();
}

async function ensureConnection(ctx: MutationCtx, ownerId: string) {
  const existing = await getConnectionByOwner(ctx, ownerId);
  const now = Date.now();
  if (existing) {
    return existing;
  }

  const connectionId = await ctx.db.insert("bravosConnections", {
    ownerId,
    status: "not_connected",
    updatedAt: now,
  });
  return await ctx.db.get(connectionId);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function appendDatedValue(
  currentValue: string | undefined,
  date: string,
  text: string,
) {
  const appendedValue = `[${date}] ${text.trim()}`;
  return currentValue ? `${currentValue}\n${appendedValue}` : appendedValue;
}

function noteDateFromSourcePostDate(
  sourcePostDate: string | undefined,
  fallback: number,
) {
  if (!sourcePostDate) {
    return fallback;
  }

  const parsed = Date.parse(sourcePostDate);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function createBravosListingScanRun(args: {
  connectionId?: Id<"bravosConnections">;
  ctx: MutationCtx;
  kind: "listing_scan" | "scheduled_scan";
  listingUrl: string;
  ownerId: string;
}) {
  const syncRunId = await args.ctx.db.insert("bravosSyncRuns", {
    connectionId: args.connectionId,
    kind: args.kind,
    ownerId: args.ownerId,
    requestedAt: Date.now(),
    requestedSourceUrl: normalizeBravosSourceUrl(args.listingUrl),
    status: "queued",
  });
  if (process.env.BRAVOS_DISABLE_DISPATCH_FOR_TESTS !== "1") {
    await args.ctx.scheduler.runAfter(0, internal.bravos.dispatchSyncRun, {
      syncRunId,
    });
  }
  return syncRunId;
}

export const getBravosConnection = query({
  args: {},
  returns: v.union(
    v.object({
      _creationTime: v.number(),
      _id: v.id("bravosConnections"),
      browserbaseContextId: v.optional(v.string()),
      connectionError: v.optional(v.string()),
      lastFailedSyncAt: v.optional(v.number()),
      lastLiveViewUrl: v.optional(v.string()),
      lastSuccessfulSyncAt: v.optional(v.number()),
      listingUrl: v.optional(v.string()),
      ownerId: v.string(),
      reconnectReason: v.optional(v.string()),
      status: bravosConnectionStatusValidator,
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    return await getConnectionByOwner(ctx, ownerId);
  },
});

export const listBravosReviewItems = query({
  args: {
    paginationOpts: paginationOptsValidator,
    state: v.optional(bravosReviewStateValidator),
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    page: v.array(v.any()),
    pageStatus: v.optional(v.union(v.string(), v.null())),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const queryBuilder =
      args.state === undefined
        ? ctx.db
            .query("bravosReviewItems")
            .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
        : ctx.db
            .query("bravosReviewItems")
            .withIndex("by_ownerId_and_reviewState", (q) =>
              q.eq("ownerId", ownerId).eq("reviewState", args.state!),
            );
    return await queryBuilder.order("desc").paginate(args.paginationOpts);
  },
});

export const getBravosReviewItem = query({
  args: { reviewItemId: v.id("bravosReviewItems") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    return assertOwner(
      await ctx.db.get(args.reviewItemId),
      ownerId,
      "Bravos review item not found",
    );
  },
});

export const getBravosReviewSummary = query({
  args: {},
  returns: v.object({
    needsAttentionCount: v.number(),
    pendingCount: v.number(),
    readyCount: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const items = await ctx.db
      .query("bravosReviewItems")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(200);
    return {
      needsAttentionCount: items.filter(
        (item) => item.reviewState === "needs_attention",
      ).length,
      pendingCount: items.filter(
        (item) =>
          item.reviewState === "pending" || item.reviewState === "processing",
      ).length,
      readyCount: items.filter((item) => item.reviewState === "ready").length,
    };
  },
});

export const listRecentBravosSyncRuns = query({
  args: {},
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("bravosSyncRuns"),
      completedAt: v.optional(v.number()),
      connectionId: v.optional(v.id("bravosConnections")),
      error: v.optional(v.string()),
      kind: bravosSyncRunKindValidator,
      ownerId: v.string(),
      requestedAt: v.number(),
      requestedSourceUrl: v.optional(v.string()),
      startedAt: v.optional(v.number()),
      status: v.union(
        v.literal("queued"),
        v.literal("processing"),
        v.literal("done"),
        v.literal("error"),
      ),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    return await ctx.db
      .query("bravosSyncRuns")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(8);
  },
});

export const saveBravosListingUrl = mutation({
  args: { listingUrl: v.string() },
  returns: v.id("bravosConnections"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const url = normalizeBravosSourceUrl(args.listingUrl);
    const existing = await getConnectionByOwner(ctx, ownerId);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        listingUrl: url,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("bravosConnections", {
      listingUrl: url,
      ownerId,
      status: "not_connected",
      updatedAt: now,
    });
  },
});

export const saveBravosBrowserbaseSession = mutation({
  args: {
    browserbaseContextId: v.string(),
    liveViewUrl: v.optional(v.string()),
  },
  returns: v.id("bravosConnections"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const existing = await getConnectionByOwner(ctx, ownerId);
    const patch = {
      browserbaseContextId: args.browserbaseContextId,
      connectionError: undefined,
      lastLiveViewUrl: args.liveViewUrl,
      status: "connected" as const,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("bravosConnections", {
      ...patch,
      ownerId,
    });
  },
});

export const markBravosConnectionNeedsReconnect = mutation({
  args: { reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const connection = await ensureConnection(ctx, ownerId);
    if (!connection) {
      throw new ConvexError("Unable to create Bravos connection");
    }
    await ctx.db.patch(connection._id, {
      lastFailedSyncAt: Date.now(),
      reconnectReason: args.reason,
      status: "needs_reconnect",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const requestSpecificBravosPostFetch = mutation({
  args: { sourceUrl: v.string() },
  returns: v.id("bravosSyncRuns"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const connection = await ensureConnection(ctx, ownerId);
    const syncRunId = await ctx.db.insert("bravosSyncRuns", {
      connectionId: connection?._id,
      kind: "direct_post_fetch",
      ownerId,
      requestedAt: Date.now(),
      requestedSourceUrl: normalizeBravosSourceUrl(args.sourceUrl),
      status: "queued",
    });
    await ctx.scheduler.runAfter(0, internal.bravos.dispatchSyncRun, {
      syncRunId,
    });
    return syncRunId;
  },
});

export const requestBravosListingScan = mutation({
  args: { listingUrl: v.optional(v.string()) },
  returns: v.id("bravosSyncRuns"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const connection = await ensureConnection(ctx, ownerId);
    if (!connection) {
      throw new ConvexError("Unable to create Bravos connection");
    }
    const listingUrl = normalizeOptionalString(args.listingUrl) ??
      connection.listingUrl;
    if (!listingUrl) {
      throw new ConvexError("Bravos listing URL is required before scanning");
    }
    const normalizedListingUrl = normalizeBravosSourceUrl(listingUrl);
    if (connection.listingUrl !== normalizedListingUrl) {
      await ctx.db.patch(connection._id, {
        listingUrl: normalizedListingUrl,
        updatedAt: Date.now(),
      });
    }
    return await createBravosListingScanRun({
      connectionId: connection._id,
      ctx,
      kind: "listing_scan",
      listingUrl: normalizedListingUrl,
      ownerId,
    });
  },
});

export const requestScheduledBravosListingScans = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (process.env.BRAVOS_SCHEDULED_SCANS_ENABLED !== "true") {
      return null;
    }

    const connections = await ctx.db.query("bravosConnections").collect();
    for (const connection of connections) {
      if (!connection.listingUrl || connection.status !== "connected") {
        continue;
      }
      await createBravosListingScanRun({
        connectionId: connection._id,
        ctx,
        kind: "scheduled_scan",
        listingUrl: connection.listingUrl,
        ownerId: connection.ownerId,
      });
    }
    return null;
  },
});

export const dismissBravosReviewItem = mutation({
  args: { reviewItemId: v.id("bravosReviewItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const item = assertOwner(
      await ctx.db.get(args.reviewItemId),
      ownerId,
      "Bravos review item not found",
    );
    if (item.reviewState === "approved") {
      throw new ConvexError("Approved Bravos review items cannot be dismissed");
    }
    if (item.reviewState === "dismissed") {
      return null;
    }
    await ctx.db.patch(args.reviewItemId, {
      dismissedAt: Date.now(),
      reviewState: "dismissed",
    });
    return null;
  },
});

export const approveBravosReviewItem = mutation({
  args: {
    reviewItemId: v.id("bravosReviewItems"),
    selectedTradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: v.object({
    noteId: v.union(v.id("notes"), v.null()),
    tradePlanId: v.union(v.id("tradePlans"), v.null()),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const item = assertOwner(
      await ctx.db.get(args.reviewItemId),
      ownerId,
      "Bravos review item not found",
    );

    if (item.reviewState === "approved") {
      return {
        noteId: item.appliedNoteId ?? null,
        tradePlanId: item.appliedTradePlanId ?? null,
      };
    }
    if (item.reviewState !== "ready" && item.reviewState !== "needs_attention") {
      throw new ConvexError(`Cannot approve item in state: ${item.reviewState}`);
    }

    const action = item.proposedAction;
    const now = Date.now();
    const importedNoteDate = noteDateFromSourcePostDate(item.sourcePostDate, now);
    let tradePlanId: Id<"tradePlans"> | null = null;
    let noteId: Id<"notes"> | null = null;

    if (action.kind === "create_trade_plan") {
      tradePlanId = await ctx.db.insert("tradePlans", {
        entryConditions: normalizeOptionalString(action.entryConditions),
        exitConditions: normalizeOptionalString(action.exitConditions),
        instrumentNotes: normalizeOptionalString(action.instrumentNotes),
        instrumentSymbol: action.instrumentSymbol.trim().toUpperCase(),
        instrumentType: normalizeOptionalString(action.instrumentType),
        name: action.name.trim(),
        ownerId,
        rationale: normalizeOptionalString(action.rationale),
        sourceUrl: item.sourceUrl,
        status: "active",
        targetConditions: normalizeOptionalString(action.targetConditions),
      });
      noteId = await ctx.db.insert("notes", {
        chartUrls: item.imageUrls.length > 0 ? item.imageUrls : undefined,
        content: `Imported from Bravos: ${item.sourceUrl}`,
        noteDate: importedNoteDate,
        ownerId,
        tradePlanId,
      });
    } else if (action.kind === "apply_follow_up") {
      tradePlanId =
        args.selectedTradePlanId ??
        action.targetTradePlanId ??
        item.suggestedTradePlanId ??
        null;
      if (!tradePlanId) {
        throw new ConvexError("Follow-up approval requires a trade plan");
      }
      if (!item.sourcePostDate) {
        throw new ConvexError(
          "Follow-up approval requires the Bravos source post date",
        );
      }
      const tradePlan = assertOwner(
        await ctx.db.get(tradePlanId),
        ownerId,
        "Trade plan not found",
      );
      const patch: Partial<Doc<"tradePlans">> = {};
      for (const update of action.fieldUpdates) {
        if (!mutableFollowUpFields.has(update.field)) {
          continue;
        }
        patch[update.field] = appendDatedValue(
          tradePlan[update.field],
          item.sourcePostDate,
          update.text,
        );
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(tradePlanId, patch);
      }
      const noteContent =
        action.noteContent?.trim() || `Bravos follow-up: ${item.sourceUrl}`;
      noteId = await ctx.db.insert("notes", {
        chartUrls: item.imageUrls.length > 0 ? item.imageUrls : undefined,
        content: noteContent,
        noteDate: importedNoteDate,
        ownerId,
        tradePlanId,
      });
    } else if (action.kind === "note_only") {
      tradePlanId =
        args.selectedTradePlanId ??
        action.targetTradePlanId ??
        item.suggestedTradePlanId ??
        null;
      if (tradePlanId) {
        assertOwner(await ctx.db.get(tradePlanId), ownerId, "Trade plan not found");
      }
      noteId = await ctx.db.insert("notes", {
        chartUrls: item.imageUrls.length > 0 ? item.imageUrls : undefined,
        content: action.content,
        noteDate: importedNoteDate,
        ownerId,
        tradePlanId: tradePlanId ?? undefined,
      });
    } else {
      throw new ConvexError("Unknown Bravos proposal cannot be approved");
    }

    await ctx.db.patch(args.reviewItemId, {
      approvedAction: action,
      approvedAt: now,
      appliedNoteId: noteId ?? undefined,
      appliedTradePlanId: tradePlanId ?? undefined,
      reviewState: "approved",
    });
    return { noteId, tradePlanId };
  },
});

export const dispatchSyncRun = internalAction({
  args: { syncRunId: v.id("bravosSyncRuns") },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const workerUrl = process.env.BRAVOS_WORKER_URL;
    const workerSecret = process.env.BRAVOS_WORKER_SECRET;
    const missingEnvVars = [
      workerUrl ? null : "BRAVOS_WORKER_URL",
      workerSecret ? null : "BRAVOS_WORKER_SECRET",
    ].filter((name): name is string => name !== null);

    if (
      missingEnvVars.length > 0 ||
      typeof workerUrl !== "string" ||
      typeof workerSecret !== "string"
    ) {
      const message = `Bravos worker environment is missing ${missingEnvVars.join(
        " and ",
      )}`;
      await _ctx.runMutation(internal.bravos.markRunDispatchError, {
        error: message,
        syncRunId: args.syncRunId,
      });
      throw new ConvexError(message);
    }
    const configuredWorkerUrl = workerUrl;
    const configuredWorkerSecret = workerSecret;

    let response: Response;
    try {
      response = await fetch(configuredWorkerUrl, {
        body: JSON.stringify({ syncRunId: args.syncRunId }),
        headers: {
          Authorization: `Bearer ${configuredWorkerSecret}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Bravos worker dispatch failed";
      await _ctx.runMutation(internal.bravos.markRunDispatchError, {
        error: message,
        syncRunId: args.syncRunId,
      });
      throw new ConvexError(message);
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      const message = responseBody
        ? `Bravos worker dispatch failed: ${response.status} ${responseBody.slice(
            0,
            1000,
          )}`
        : `Bravos worker dispatch failed: ${response.status}`;
      await _ctx.runMutation(internal.bravos.markRunDispatchError, {
        error: message,
        syncRunId: args.syncRunId,
      });
      throw new ConvexError(message);
    }
    return null;
  },
});

export const markRunDispatchError = internalMutation({
  args: {
    error: v.string(),
    syncRunId: v.id("bravosSyncRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.syncRunId);
    if (!run) {
      return null;
    }

    await ctx.db.patch(args.syncRunId, {
      completedAt: Date.now(),
      error: args.error,
      status: "error",
    });

    const connection = await getConnectionByOwner(ctx, run.ownerId);
    if (connection) {
      await ctx.db.patch(connection._id, {
        connectionError: args.error,
        lastFailedSyncAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});

export const retryBravosSyncRun = mutation({
  args: { syncRunId: v.id("bravosSyncRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const run = assertOwner(
      await ctx.db.get(args.syncRunId),
      ownerId,
      "Bravos sync run not found",
    );

    if (run.status === "done") {
      throw new ConvexError("Completed Bravos sync runs cannot be retried");
    }

    await ctx.db.patch(args.syncRunId, {
      completedAt: undefined,
      error: undefined,
      startedAt: undefined,
      status: "queued",
    });
    await ctx.scheduler.runAfter(0, internal.bravos.dispatchSyncRun, {
      syncRunId: args.syncRunId,
    });

    return null;
  },
});

export const loadRunForWorker = mutation({
  args: {
    syncRunId: v.id("bravosSyncRuns"),
    workerSecret: v.string(),
  },
  returns: v.union(
    v.object({
      connection: v.union(v.any(), v.null()),
      run: v.any(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    assertWorkerSecret(args.workerSecret);
    const run = await ctx.db.get(args.syncRunId);
    if (!run) {
      return null;
    }
    const connection = run.connectionId
      ? await ctx.db.get(run.connectionId)
      : await getConnectionByOwner(ctx, run.ownerId);
    return { connection, run };
  },
});

export const filterUnseenListingPostsForWorker = mutation({
  args: {
    posts: v.array(
      v.object({
        sourcePublishedAt: v.optional(v.number()),
        sourceUrl: v.string(),
      }),
    ),
    syncRunId: v.id("bravosSyncRuns"),
    workerSecret: v.string(),
  },
  returns: v.array(
    v.object({
      sourcePublishedAt: v.optional(v.number()),
      sourceUrl: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    assertWorkerSecret(args.workerSecret);
    const run = await ctx.db.get(args.syncRunId);
    if (!run) {
      throw new ConvexError("Bravos sync run not found");
    }

    const unseen = [];
    for (const post of args.posts) {
      const sourceUrl = normalizeBravosSourceUrl(post.sourceUrl);
      const canonicalSourceIdentity = buildBravosSourceIdentity({
        sourceUrl,
      });
      const existing = await ctx.db
        .query("bravosReviewItems")
        .withIndex("by_ownerId_and_canonicalSourceIdentity", (q) =>
          q
            .eq("ownerId", run.ownerId)
            .eq("canonicalSourceIdentity", canonicalSourceIdentity),
        )
        .unique();
      if (!existing) {
        unseen.push({
          sourcePublishedAt: post.sourcePublishedAt,
          sourceUrl,
        });
      }
    }

    return unseen;
  },
});

export const markRunProcessingForWorker = mutation({
  args: {
    syncRunId: v.id("bravosSyncRuns"),
    workerSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertWorkerSecret(args.workerSecret);
    await ctx.db.patch(args.syncRunId, {
      startedAt: Date.now(),
      status: "processing",
    });
    return null;
  },
});

export const markRunDoneForWorker = mutation({
  args: {
    syncRunId: v.id("bravosSyncRuns"),
    workerSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertWorkerSecret(args.workerSecret);
    const run = await ctx.db.get(args.syncRunId);
    if (!run) {
      return null;
    }
    await ctx.db.patch(args.syncRunId, {
      completedAt: Date.now(),
      status: "done",
    });
    const connection = await getConnectionByOwner(ctx, run.ownerId);
    if (connection) {
      await ctx.db.patch(connection._id, {
        lastSuccessfulSyncAt: Date.now(),
        status:
          connection.status === "needs_reconnect"
            ? "connected"
            : connection.status,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const markRunErrorForWorker = mutation({
  args: {
    error: v.string(),
    markConnectionNeedsReconnect: v.optional(v.boolean()),
    syncRunId: v.id("bravosSyncRuns"),
    workerSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertWorkerSecret(args.workerSecret);
    const run = await ctx.db.get(args.syncRunId);
    if (!run) {
      return null;
    }
    await ctx.db.patch(args.syncRunId, {
      completedAt: Date.now(),
      error: args.error,
      status: "error",
    });
    const connection = await getConnectionByOwner(ctx, run.ownerId);
    if (connection) {
      await ctx.db.patch(connection._id, {
        connectionError: args.error,
        lastFailedSyncAt: Date.now(),
        reconnectReason: args.markConnectionNeedsReconnect
          ? args.error
          : connection.reconnectReason,
        status: args.markConnectionNeedsReconnect
          ? "needs_reconnect"
          : connection.status,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const upsertConnectionForWorker = mutation({
  args: {
    browserbaseContextId: v.optional(v.string()),
    liveViewUrl: v.optional(v.string()),
    ownerId: v.string(),
    status: bravosConnectionStatusValidator,
    workerSecret: v.string(),
  },
  returns: v.id("bravosConnections"),
  handler: async (ctx, args) => {
    assertWorkerSecret(args.workerSecret);
    const existing = await getConnectionByOwner(ctx, args.ownerId);
    const patch = {
      browserbaseContextId: args.browserbaseContextId,
      lastLiveViewUrl: args.liveViewUrl,
      status: args.status,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("bravosConnections", {
      ...patch,
      ownerId: args.ownerId,
    });
  },
});

export const upsertReviewItemForWorker = mutation({
  args: {
    aiOutput: v.optional(v.string()),
    classification: bravosClassificationValidator,
    fetchSource: bravosSyncRunKindValidator,
    imageUrls: v.array(v.string()),
    listingUrl: v.optional(v.string()),
    proposedAction: bravosProposedActionValidator,
    rawText: v.string(),
    sourcePostDate: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    sourcePublishedAt: v.optional(v.number()),
    sourceUrl: v.string(),
    suggestedTradePlanReason: v.optional(v.string()),
    syncRunId: v.id("bravosSyncRuns"),
    workerSecret: v.string(),
  },
  returns: v.id("bravosReviewItems"),
  handler: async (ctx, args) => {
    assertWorkerSecret(args.workerSecret);
    const run = await ctx.db.get(args.syncRunId);
    if (!run) {
      throw new ConvexError("Bravos sync run not found");
    }
    const now = Date.now();
    const sourceUrl = normalizeBravosSourceUrl(args.sourceUrl);
    const canonicalSourceIdentity = buildBravosSourceIdentity({
      sourceUrl,
    });
    const suggestedTradePlanId =
      args.proposedAction.kind === "apply_follow_up"
        ? args.proposedAction.targetTradePlanId
        : args.proposedAction.kind === "note_only"
          ? args.proposedAction.targetTradePlanId
          : undefined;
    const reviewState: Doc<"bravosReviewItems">["reviewState"] =
      args.proposedAction.kind === "apply_follow_up" && !args.sourcePostDate
        ? "needs_attention"
        : "ready";
    const existing = await ctx.db
      .query("bravosReviewItems")
      .withIndex("by_ownerId_and_canonicalSourceIdentity", (q) =>
        q
          .eq("ownerId", run.ownerId)
          .eq("canonicalSourceIdentity", canonicalSourceIdentity),
      )
      .unique();

    const fields = {
      canonicalSourceIdentity,
      aiOutput: args.aiOutput,
      classification: args.classification,
      fetchSource: args.fetchSource,
      imageUrls: args.imageUrls,
      lastFetchedAt: now,
      lastProcessedAt: now,
      listingUrl: args.listingUrl,
      processingError: undefined,
      proposedAction: args.proposedAction,
      rawText: args.rawText,
      reviewState,
      sourcePostDate: args.sourcePostDate,
      sourceTitle: args.sourceTitle,
      sourcePublishedAt: args.sourcePublishedAt,
      sourceUrl,
      suggestedTradePlanId,
      suggestedTradePlanReason: args.suggestedTradePlanReason,
      syncRunId: args.syncRunId,
    };

    if (existing) {
      if (existing.reviewState === "approved") {
        return existing._id;
      }
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("bravosReviewItems", {
      ...fields,
      fetchedAt: now,
      ownerId: run.ownerId,
    });
  },
});
