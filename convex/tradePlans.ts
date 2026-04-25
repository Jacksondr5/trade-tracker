import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";
import { tradeValidator } from "./lib/tradeValidator";

const tradePlanStatusValidator = v.union(
  v.literal("active"),
  v.literal("closed"),
  v.literal("idea"),
  v.literal("watching"),
);

const tradePlanValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("tradePlans"),
  campaignId: v.optional(v.id("campaigns")),
  closedAt: v.optional(v.number()),
  entryConditions: v.optional(v.string()),
  exitConditions: v.optional(v.string()),
  instrumentNotes: v.optional(v.string()),
  instrumentSymbol: v.string(),
  instrumentType: v.optional(v.string()),
  invalidatedAt: v.optional(v.number()),
  name: v.string(),
  ownerId: v.string(),
  rationale: v.optional(v.string()),
  sortOrder: v.optional(v.number()),
  sourceUrl: v.optional(v.string()),
  status: tradePlanStatusValidator,
  targetConditions: v.optional(v.string()),
});

const nullableNumberValidator = v.union(v.number(), v.null());

const parentCampaignContextValidator = v.object({
  href: v.string(),
  id: v.id("campaigns"),
  name: v.string(),
});

const tradePlanWorkspaceRelationshipValidator = v.object({
  kind: v.union(
    v.literal("bravos"),
    v.literal("linked"),
    v.literal("standalone"),
  ),
  parentCampaign: v.union(parentCampaignContextValidator, v.null()),
});

const tradePlanWorkspaceExecutionValidator = v.object({
  latestTradeDate: nullableNumberValidator,
  pendingAssignedCount: v.number(),
  pendingSuggestedCount: v.number(),
  totalPendingCount: v.number(),
  tradeCount: v.number(),
});

const tradePlanWorkspaceLifecycleValidator = v.object({
  closedAt: nullableNumberValidator,
  isClosed: v.boolean(),
});

const tradePlanWorkspaceSummaryValidator = v.object({
  createdAt: v.number(),
  execution: tradePlanWorkspaceExecutionValidator,
  id: v.id("tradePlans"),
  instrumentSymbol: v.string(),
  isWatched: v.boolean(),
  lifecycle: tradePlanWorkspaceLifecycleValidator,
  name: v.string(),
  relationship: tradePlanWorkspaceRelationshipValidator,
  status: tradePlanStatusValidator,
});

const tradePlanWorkspaceEditorValidator = v.object({
  campaignId: v.union(v.id("campaigns"), v.null()),
  closedAt: nullableNumberValidator,
  entryConditions: v.union(v.string(), v.null()),
  exitConditions: v.union(v.string(), v.null()),
  id: v.id("tradePlans"),
  instrumentSymbol: v.string(),
  name: v.string(),
  rationale: v.union(v.string(), v.null()),
  sourceUrl: v.union(v.string(), v.null()),
  status: tradePlanStatusValidator,
  targetConditions: v.union(v.string(), v.null()),
});

const noteEvidenceValidator = v.object({
  contentType: v.optional(v.string()),
  fileName: v.optional(v.string()),
  kind: v.union(v.literal("chart"), v.literal("image")),
  storageId: v.optional(v.id("_storage")),
  url: v.union(v.string(), v.null()),
});

const tradePlanWorkspaceNoteValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("notes"),
  campaignId: v.optional(v.id("campaigns")),
  chartUrls: v.optional(v.array(v.string())),
  content: v.string(),
  contextHref: v.union(v.string(), v.null()),
  contextKind: v.literal("tradePlan"),
  contextLabel: v.string(),
  evidence: v.optional(v.array(noteEvidenceValidator)),
  noteDate: v.number(),
  ownerId: v.string(),
  tradePlanId: v.optional(v.id("tradePlans")),
});

const mappingSourceValidator = v.union(v.literal("ibkr"), v.literal("kraken"));

const tradePlanWorkspaceAccountMappingValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("accountMappings"),
  accountId: v.string(),
  friendlyName: v.string(),
  ownerId: v.string(),
  source: mappingSourceValidator,
});

const tradePlanWorkspacePortfolioValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("portfolios"),
  name: v.string(),
  ownerId: v.string(),
});

const inboxTradeValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("inboxTrades"),
  assetType: v.optional(v.union(v.literal("crypto"), v.literal("stock"))),
  brokerageAccountId: v.optional(v.string()),
  date: v.optional(v.number()),
  direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
  externalId: v.optional(v.string()),
  fees: v.optional(v.number()),
  notes: v.optional(v.string()),
  orderType: v.optional(v.string()),
  ownerId: v.string(),
  portfolioId: v.optional(v.id("portfolios")),
  price: v.optional(v.number()),
  quantity: v.optional(v.number()),
  side: v.optional(v.union(v.literal("buy"), v.literal("sell"))),
  source: mappingSourceValidator,
  status: v.literal("pending_review"),
  taxes: v.optional(v.number()),
  ticker: v.optional(v.string()),
  tradePlanId: v.optional(v.id("tradePlans")),
  validationErrors: v.array(v.string()),
  validationWarnings: v.array(v.string()),
});

const tradePlanWorkspaceInboxTradeValidator = v.object({
  inboxTrade: inboxTradeValidator,
  matchType: v.union(v.literal("assigned"), v.literal("suggested")),
});

const tradePlanWorkspaceDetailValidator = v.union(
  v.object({
    accountMappings: v.array(tradePlanWorkspaceAccountMappingValidator),
    inboxTrades: v.array(tradePlanWorkspaceInboxTradeValidator),
    notes: v.array(tradePlanWorkspaceNoteValidator),
    portfolios: v.array(tradePlanWorkspacePortfolioValidator),
    summary: tradePlanWorkspaceSummaryValidator,
    tradePlan: tradePlanWorkspaceEditorValidator,
    trades: v.array(tradeValidator),
  }),
  v.null(),
);

type CampaignDoc = Doc<"campaigns">;
type TradePlanDoc = Doc<"tradePlans">;
type InboxTradeDoc = Doc<"inboxTrades">;
type NoteDoc = Doc<"notes">;

function buildCampaignHref(campaignId: Id<"campaigns">): string {
  return `/campaigns/${campaignId}`;
}

function buildTradePlanHref(tradePlanId: Id<"tradePlans">): string {
  return `/trade-plans/${tradePlanId}`;
}

function normalizeOptionalText(value: string | undefined): string | null {
  return value ?? null;
}

function createEmptyTradeExecutionStats() {
  return {
    latestTradeDate: null as number | null,
    tradeCount: 0,
  };
}

function createEmptyPendingStats() {
  return {
    pendingAssignedCount: 0,
    pendingSuggestedCount: 0,
  };
}

function createParentCampaignContext(
  campaign: CampaignDoc | null,
): { href: string; id: Id<"campaigns">; name: string } | null {
  if (campaign === null) {
    return null;
  }

  return {
    href: buildCampaignHref(campaign._id),
    id: campaign._id,
    name: campaign.name,
  };
}

function buildTradePlanWorkspaceSummary(
  tradePlan: TradePlanDoc,
  sourceData: {
    campaignById: Map<Id<"campaigns">, CampaignDoc>;
    pendingStatsByPlanId: Map<
      Id<"tradePlans">,
      { pendingAssignedCount: number; pendingSuggestedCount: number }
    >;
    suggestedPendingCountBySymbol: Map<string, number>;
    tradeStatsByPlanId: Map<
      Id<"tradePlans">,
      { latestTradeDate: number | null; tradeCount: number }
    >;
    watchedTradePlanIds: Set<Id<"tradePlans">>;
  },
) {
  const parentCampaign =
    tradePlan.campaignId !== undefined
      ? (sourceData.campaignById.get(tradePlan.campaignId) ?? null)
      : null;
  const tradeStats =
    sourceData.tradeStatsByPlanId.get(tradePlan._id) ??
    createEmptyTradeExecutionStats();
  const pendingStats =
    sourceData.pendingStatsByPlanId.get(tradePlan._id) ??
    createEmptyPendingStats();
  const pendingSuggestedCount =
    pendingStats.pendingSuggestedCount > 0
      ? pendingStats.pendingSuggestedCount
      : (sourceData.suggestedPendingCountBySymbol.get(
          tradePlan.instrumentSymbol.toUpperCase(),
        ) ?? 0);

  return {
    createdAt: tradePlan._creationTime,
    execution: {
      latestTradeDate: tradeStats.latestTradeDate,
      pendingAssignedCount: pendingStats.pendingAssignedCount,
      pendingSuggestedCount,
      totalPendingCount:
        pendingStats.pendingAssignedCount + pendingSuggestedCount,
      tradeCount: tradeStats.tradeCount,
    },
    id: tradePlan._id,
    instrumentSymbol: tradePlan.instrumentSymbol,
    isWatched: sourceData.watchedTradePlanIds.has(tradePlan._id),
    lifecycle: {
      closedAt: tradePlan.closedAt ?? null,
      isClosed: tradePlan.status === "closed",
    },
    name: tradePlan.name,
    relationship: {
      kind:
        tradePlan.sourceUrl !== undefined
          ? ("bravos" as const)
          : tradePlan.campaignId
            ? ("linked" as const)
            : ("standalone" as const),
      parentCampaign: createParentCampaignContext(parentCampaign),
    },
    status: tradePlan.status,
  };
}

function sortPendingInboxTrades(a: InboxTradeDoc, b: InboxTradeDoc): number {
  return (b.date ?? b._creationTime) - (a.date ?? a._creationTime);
}

function sortNotesAsc(a: NoteDoc, b: NoteDoc): number {
  return a.noteDate - b.noteDate || a._creationTime - b._creationTime;
}

async function resolveTradePlanNoteEvidence(ctx: QueryCtx, note: NoteDoc) {
  const evidenceItems = note.evidence ?? [];
  const resolvedUrls = await Promise.all(
    evidenceItems.map(
      (item) =>
        item.url ??
        (item.storageId ? ctx.storage.getUrl(item.storageId) : null),
    ),
  );

  const evidence = new Map<
    string,
    {
      contentType?: string;
      fileName?: string;
      kind: "chart" | "image";
      storageId?: Id<"_storage">;
      url: string | null;
    }
  >();

  for (const chartUrl of note.chartUrls ?? []) {
    evidence.set(`legacy:${chartUrl}`, {
      kind: "chart",
      url: chartUrl,
    });
  }

  for (const [index, item] of evidenceItems.entries()) {
    const resolvedUrl = resolvedUrls[index];
    const key = item.storageId
      ? `storage:${item.storageId}`
      : `url:${resolvedUrl ?? item.kind}`;

    evidence.set(key, {
      contentType: item.contentType,
      fileName: item.fileName,
      kind: item.kind,
      storageId: item.storageId,
      url: resolvedUrl,
    });
  }

  const normalizedEvidence = Array.from(evidence.values());
  const chartUrls = normalizedEvidence
    .filter((item) => item.kind === "chart")
    .map((item) => item.url)
    .filter((url): url is string => Boolean(url));

  return {
    chartUrls: chartUrls.length > 0 ? chartUrls : undefined,
    evidence: normalizedEvidence.length > 0 ? normalizedEvidence : undefined,
  };
}

async function serializeTradePlanNotes(
  ctx: QueryCtx,
  tradePlan: TradePlanDoc,
  notes: NoteDoc[],
) {
  return await Promise.all(
    notes.map(async (note) => {
      const { chartUrls, evidence } = await resolveTradePlanNoteEvidence(
        ctx,
        note,
      );

      return {
        _creationTime: note._creationTime,
        _id: note._id,
        campaignId: note.campaignId,
        chartUrls,
        content: note.content,
        contextHref: buildTradePlanHref(tradePlan._id),
        contextKind: "tradePlan" as const,
        contextLabel: tradePlan.name,
        evidence,
        noteDate: note.noteDate,
        ownerId: note.ownerId,
        tradePlanId: note.tradePlanId,
      };
    }),
  );
}

function buildTradePlanWorkspaceSourceData(args: {
  campaigns: CampaignDoc[];
  inboxTrades: InboxTradeDoc[];
  trades: Doc<"trades">[];
  watchedTradePlanIds: Iterable<Id<"tradePlans">>;
}) {
  const campaignById = new Map(
    args.campaigns.map((campaign) => [campaign._id, campaign]),
  );
  const watchedTradePlanIds = new Set(args.watchedTradePlanIds);

  const tradeStatsByPlanId = new Map<
    Id<"tradePlans">,
    { latestTradeDate: number | null; tradeCount: number }
  >();
  for (const trade of args.trades) {
    if (!trade.tradePlanId) {
      continue;
    }

    const existing =
      tradeStatsByPlanId.get(trade.tradePlanId) ??
      createEmptyTradeExecutionStats();
    existing.tradeCount += 1;
    existing.latestTradeDate =
      existing.latestTradeDate === null || trade.date > existing.latestTradeDate
        ? trade.date
        : existing.latestTradeDate;
    tradeStatsByPlanId.set(trade.tradePlanId, existing);
  }

  const suggestedPendingCountBySymbol = new Map<string, number>();
  const pendingStatsByPlanId = new Map<
    Id<"tradePlans">,
    { pendingAssignedCount: number; pendingSuggestedCount: number }
  >();
  for (const inboxTrade of args.inboxTrades) {
    if (inboxTrade.tradePlanId) {
      const existing =
        pendingStatsByPlanId.get(inboxTrade.tradePlanId) ??
        createEmptyPendingStats();
      existing.pendingAssignedCount += 1;
      pendingStatsByPlanId.set(inboxTrade.tradePlanId, existing);
      continue;
    }

    if (!inboxTrade.ticker) {
      continue;
    }

    const normalizedTicker = inboxTrade.ticker.toUpperCase();
    suggestedPendingCountBySymbol.set(
      normalizedTicker,
      (suggestedPendingCountBySymbol.get(normalizedTicker) ?? 0) + 1,
    );
  }

  return {
    campaignById,
    pendingStatsByPlanId,
    suggestedPendingCountBySymbol,
    tradeStatsByPlanId,
    watchedTradePlanIds,
  };
}

async function loadTradePlanWorkspaceSourceData(
  ctx: QueryCtx,
  ownerId: string,
) {
  const [campaigns, trades, watchedItems, inboxTrades] = await Promise.all([
    ctx.db
      .query("campaigns")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect(),
    ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect(),
    ctx.db
      .query("watchlist")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect(),
    ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "pending_review"),
      )
      .collect(),
  ]);

  return buildTradePlanWorkspaceSourceData({
    campaigns,
    inboxTrades,
    trades,
    watchedTradePlanIds: watchedItems
      .filter(
        (watchedItem) =>
          watchedItem.itemType === "tradePlan" &&
          watchedItem.tradePlanId !== undefined,
      )
      .map((watchedItem) => watchedItem.tradePlanId as Id<"tradePlans">),
  });
}

async function loadTradePlanWorkspaceSourceDataForPlan(
  ctx: QueryCtx,
  ownerId: string,
  tradePlan: TradePlanDoc,
) {
  const [
    campaigns,
    trades,
    watchlistItems,
    assignedInboxTrades,
    suggestedInboxTrades,
  ] = await Promise.all([
    tradePlan.campaignId ? [await ctx.db.get(tradePlan.campaignId)] : [],
    ctx.db
      .query("trades")
      .withIndex("by_owner_tradePlanId", (q) =>
        q.eq("ownerId", ownerId).eq("tradePlanId", tradePlan._id),
      )
      .collect(),
    ctx.db
      .query("watchlist")
      .withIndex("by_owner_tradePlanId", (q) =>
        q.eq("ownerId", ownerId).eq("tradePlanId", tradePlan._id),
      )
      .collect(),
    ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status_tradePlanId", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("status", "pending_review")
          .eq("tradePlanId", tradePlan._id),
      )
      .collect(),
    ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status_ticker", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("status", "pending_review")
          .eq("ticker", tradePlan.instrumentSymbol.toUpperCase()),
      )
      .collect(),
  ]);

  const suggestedUnassignedInboxTrades = suggestedInboxTrades.filter(
    (inboxTrade) => inboxTrade.tradePlanId === undefined,
  );

  return {
    assignedInboxTrades,
    sourceData: buildTradePlanWorkspaceSourceData({
      campaigns: campaigns.filter((campaign): campaign is CampaignDoc =>
        Boolean(campaign),
      ),
      inboxTrades: [...assignedInboxTrades, ...suggestedUnassignedInboxTrades],
      trades,
      watchedTradePlanIds: watchlistItems.length > 0 ? [tradePlan._id] : [],
    }),
    suggestedInboxTrades: suggestedUnassignedInboxTrades,
  };
}

function sortTradePlansByOrderThenNewest(
  a: {
    _creationTime: number;
    sortOrder?: number;
  },
  b: {
    _creationTime: number;
    sortOrder?: number;
  },
): number {
  const sortA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const sortB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (sortA !== sortB) {
    return sortA - sortB;
  }
  return b._creationTime - a._creationTime;
}

const allowedTransitions: Record<
  "active" | "closed" | "idea" | "watching",
  Array<"active" | "closed" | "idea" | "watching">
> = {
  active: ["watching", "closed"],
  closed: ["idea", "watching", "active"],
  idea: ["watching", "active", "closed"],
  watching: ["idea", "active", "closed"],
};

function isValidStatusTransition(
  from: "active" | "closed" | "idea" | "watching",
  to: "active" | "closed" | "idea" | "watching",
): boolean {
  if (from === to) {
    return true;
  }

  return allowedTransitions[from].includes(to);
}

export const createTradePlan = mutation({
  args: {
    campaignId: v.optional(v.id("campaigns")),
    entryConditions: v.optional(v.string()),
    exitConditions: v.optional(v.string()),
    instrumentNotes: v.optional(v.string()),
    instrumentSymbol: v.string(),
    instrumentType: v.optional(v.string()),
    name: v.string(),
    rationale: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    status: v.optional(tradePlanStatusValidator),
    targetConditions: v.optional(v.string()),
  },
  returns: v.id("tradePlans"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const status = args.status ?? "idea";

    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      assertOwner(campaign, ownerId, "Campaign not found");
    }

    return await ctx.db.insert("tradePlans", {
      campaignId: args.campaignId,
      closedAt: status === "closed" ? Date.now() : undefined,
      entryConditions: args.entryConditions,
      exitConditions: args.exitConditions,
      instrumentNotes: args.instrumentNotes,
      instrumentSymbol: args.instrumentSymbol.trim().toUpperCase(),
      instrumentType: args.instrumentType,
      name: args.name,
      ownerId,
      rationale: args.rationale,
      sortOrder: args.sortOrder,
      sourceUrl: args.sourceUrl,
      status,
      targetConditions: args.targetConditions,
    });
  },
});

export const updateTradePlan = mutation({
  args: {
    campaignId: v.optional(v.union(v.id("campaigns"), v.null())),
    entryConditions: v.optional(v.union(v.string(), v.null())),
    exitConditions: v.optional(v.union(v.string(), v.null())),
    instrumentSymbol: v.optional(v.string()),
    invalidatedAt: v.optional(v.union(v.number(), v.null())),
    name: v.optional(v.string()),
    rationale: v.optional(v.union(v.string(), v.null())),
    sortOrder: v.optional(v.union(v.number(), v.null())),
    sourceUrl: v.optional(v.union(v.string(), v.null())),
    targetConditions: v.optional(v.union(v.string(), v.null())),
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { tradePlanId, ...updates } = args;

    const existingTradePlan = await ctx.db.get(tradePlanId);
    assertOwner(existingTradePlan, ownerId, "Trade plan not found");

    if (updates.campaignId !== undefined && updates.campaignId !== null) {
      const campaign = await ctx.db.get(updates.campaignId);
      assertOwner(campaign, ownerId, "Campaign not found");
    }

    const patch: Record<string, unknown> = {};

    if (updates.campaignId !== undefined) {
      patch.campaignId =
        updates.campaignId === null ? undefined : updates.campaignId;
    }
    if (updates.entryConditions !== undefined)
      patch.entryConditions =
        updates.entryConditions === null ? undefined : updates.entryConditions;
    if (updates.exitConditions !== undefined)
      patch.exitConditions =
        updates.exitConditions === null ? undefined : updates.exitConditions;
    if (updates.instrumentSymbol !== undefined)
      patch.instrumentSymbol = updates.instrumentSymbol.trim().toUpperCase();
    if (updates.invalidatedAt !== undefined)
      patch.invalidatedAt =
        updates.invalidatedAt === null ? undefined : updates.invalidatedAt;
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.rationale !== undefined)
      patch.rationale =
        updates.rationale === null ? undefined : updates.rationale;
    if (updates.sortOrder !== undefined)
      patch.sortOrder =
        updates.sortOrder === null ? undefined : updates.sortOrder;
    if (updates.sourceUrl !== undefined)
      patch.sourceUrl =
        updates.sourceUrl === null ? undefined : updates.sourceUrl;
    if (updates.targetConditions !== undefined)
      patch.targetConditions =
        updates.targetConditions === null
          ? undefined
          : updates.targetConditions;
    await ctx.db.patch(tradePlanId, patch);

    return null;
  },
});

export const updateTradePlanStatus = mutation({
  args: {
    status: tradePlanStatusValidator,
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = assertOwner(
      await ctx.db.get(args.tradePlanId),
      ownerId,
      "Trade plan not found",
    );

    if (!isValidStatusTransition(tradePlan.status, args.status)) {
      throw new ConvexError(
        `Invalid trade plan status transition: ${tradePlan.status} -> ${args.status}`,
      );
    }

    const patch: Record<string, unknown> = {
      status: args.status,
    };

    if (args.status === "closed") {
      patch.closedAt = Date.now();
    } else {
      patch.closedAt = undefined;
    }
    await ctx.db.patch(args.tradePlanId, patch);

    return null;
  },
});

export const getTradePlan = query({
  args: { tradePlanId: v.id("tradePlans") },
  returns: v.union(tradePlanValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan || tradePlan.ownerId !== ownerId) return null;
    return tradePlan;
  },
});

export const listTradePlanWorkspaceSummaries = query({
  args: {
    status: v.optional(tradePlanStatusValidator),
  },
  returns: v.array(tradePlanWorkspaceSummaryValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlans =
      args.status === undefined
        ? await ctx.db
            .query("tradePlans")
            .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
            .collect()
        : await ctx.db
            .query("tradePlans")
            .withIndex("by_owner_status", (q) =>
              q.eq("ownerId", ownerId).eq("status", args.status!),
            )
            .collect();

    const sourceData = await loadTradePlanWorkspaceSourceData(ctx, ownerId);

    return tradePlans
      .sort(sortTradePlansByOrderThenNewest)
      .map((tradePlan) =>
        buildTradePlanWorkspaceSummary(tradePlan, sourceData),
      );
  },
});

export const getTradePlanWorkspace = query({
  args: { tradePlanId: v.id("tradePlans") },
  returns: tradePlanWorkspaceDetailValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan || tradePlan.ownerId !== ownerId) {
      return null;
    }

    const [
      workspaceSourceDataForPlan,
      notes,
      trades,
      accountMappings,
      portfolios,
    ] = await Promise.all([
      loadTradePlanWorkspaceSourceDataForPlan(ctx, ownerId, tradePlan),
      ctx.db
        .query("notes")
        .withIndex("by_owner_tradePlanId", (q) =>
          q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
        )
        .collect(),
      ctx.db
        .query("trades")
        .withIndex("by_owner_tradePlanId", (q) =>
          q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
        )
        .collect(),
      ctx.db
        .query("accountMappings")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect(),
      ctx.db
        .query("portfolios")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .order("desc")
        .collect(),
    ]);

    const { assignedInboxTrades, sourceData, suggestedInboxTrades } =
      workspaceSourceDataForPlan;

    const summary = buildTradePlanWorkspaceSummary(tradePlan, sourceData);
    const serializedNotes = await serializeTradePlanNotes(
      ctx,
      tradePlan,
      notes.sort(sortNotesAsc),
    );

    const sortedTrades = trades.sort((a, b) => b.date - a.date);
    const sortedAccountMappings = [...accountMappings].sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        a.accountId.localeCompare(b.accountId) ||
        a.friendlyName.localeCompare(b.friendlyName),
    );

    const inboxTrades = [
      ...assignedInboxTrades.map((inboxTrade) => ({
        inboxTrade,
        matchType: "assigned" as const,
      })),
      ...suggestedInboxTrades
        .filter((inboxTrade) => inboxTrade.tradePlanId === undefined)
        .map((inboxTrade) => ({
          inboxTrade,
          matchType: "suggested" as const,
        })),
    ].sort((a, b) => sortPendingInboxTrades(a.inboxTrade, b.inboxTrade));

    return {
      accountMappings: sortedAccountMappings,
      inboxTrades,
      notes: serializedNotes,
      portfolios,
      summary,
      tradePlan: {
        campaignId: tradePlan.campaignId ?? null,
        closedAt: tradePlan.closedAt ?? null,
        entryConditions: normalizeOptionalText(tradePlan.entryConditions),
        exitConditions: normalizeOptionalText(tradePlan.exitConditions),
        id: tradePlan._id,
        instrumentSymbol: tradePlan.instrumentSymbol,
        name: tradePlan.name,
        rationale: normalizeOptionalText(tradePlan.rationale),
        sourceUrl: normalizeOptionalText(tradePlan.sourceUrl),
        status: tradePlan.status,
        targetConditions: normalizeOptionalText(tradePlan.targetConditions),
      },
      trades: sortedTrades,
    };
  },
});

export const listTradePlans = query({
  args: {
    campaignId: v.optional(v.union(v.id("campaigns"), v.null())),
    status: v.optional(tradePlanStatusValidator),
  },
  returns: v.array(tradePlanValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    if (args.campaignId === undefined) {
      const tradePlans =
        args.status === undefined
          ? await ctx.db
              .query("tradePlans")
              .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
              .collect()
          : await ctx.db
              .query("tradePlans")
              .withIndex("by_owner_status", (q) =>
                q.eq("ownerId", ownerId).eq("status", args.status!),
              )
              .collect();

      return tradePlans.sort(sortTradePlansByOrderThenNewest);
    }

    const campaignId = args.campaignId === null ? undefined : args.campaignId;
    const tradePlans =
      args.status === undefined
        ? await ctx.db
            .query("tradePlans")
            .withIndex("by_owner_campaignId", (q) =>
              q.eq("ownerId", ownerId).eq("campaignId", campaignId),
            )
            .collect()
        : await ctx.db
            .query("tradePlans")
            .withIndex("by_owner_campaignId_status", (q) =>
              q
                .eq("ownerId", ownerId)
                .eq("campaignId", campaignId)
                .eq("status", args.status!),
            )
            .collect();

    return tradePlans.sort(sortTradePlansByOrderThenNewest);
  },
});

export const listOpenTradePlans = query({
  args: {},
  returns: v.array(tradePlanValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const [activePlans, ideaPlans, watchingPlans] = await Promise.all([
      ctx.db
        .query("tradePlans")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("tradePlans")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "idea"),
        )
        .collect(),
      ctx.db
        .query("tradePlans")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "watching"),
        )
        .collect(),
    ]);

    return [...activePlans, ...ideaPlans, ...watchingPlans].sort(
      sortTradePlansByOrderThenNewest,
    );
  },
});

export const listTradePlansByCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
    status: v.optional(tradePlanStatusValidator),
  },
  returns: v.array(tradePlanValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      return [];
    }

    const tradePlans =
      args.status === undefined
        ? await ctx.db
            .query("tradePlans")
            .withIndex("by_owner_campaignId", (q) =>
              q.eq("ownerId", ownerId).eq("campaignId", args.campaignId),
            )
            .collect()
        : await ctx.db
            .query("tradePlans")
            .withIndex("by_owner_campaignId_status", (q) =>
              q
                .eq("ownerId", ownerId)
                .eq("campaignId", args.campaignId)
                .eq("status", args.status!),
            )
            .collect();

    return tradePlans.sort(sortTradePlansByOrderThenNewest);
  },
});
