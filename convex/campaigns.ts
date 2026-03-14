import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";
import { campaignStatusValidator, tradePlanStatusValidator } from "./lib/statuses";

const nullableNumberValidator = v.union(v.number(), v.null());

const campaignValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("campaigns"),
  closedAt: v.optional(v.number()),
  name: v.string(),
  ownerId: v.string(),
  retrospective: v.optional(v.string()),
  status: v.union(
    v.literal("active"),
    v.literal("closed"),
    v.literal("planning"),
  ),
  thesis: v.string(),
});

const linkedTradePlanRollupValidator = v.object({
  activeCount: v.number(),
  closedCount: v.number(),
  ideaCount: v.number(),
  openCount: v.number(),
  totalCount: v.number(),
  watchingCount: v.number(),
});

const linkedTradeRollupValidator = v.object({
  latestTradeDate: nullableNumberValidator,
  totalCount: v.number(),
});

const campaignLifecycleMetadataValidator = v.object({
  closedAt: nullableNumberValidator,
  hasClosedTradePlans: v.boolean(),
  hasLinkedTradePlans: v.boolean(),
  hasOpenTradePlans: v.boolean(),
  hasRetrospective: v.boolean(),
  isClosed: v.boolean(),
});

const campaignWorkspaceSummaryValidator = v.object({
  createdAt: v.number(),
  id: v.id("campaigns"),
  isWatched: v.boolean(),
  lifecycle: campaignLifecycleMetadataValidator,
  linkedTradePlans: linkedTradePlanRollupValidator,
  linkedTrades: linkedTradeRollupValidator,
  name: v.string(),
  status: campaignStatusValidator,
  thesis: v.string(),
});

const campaignWorkspaceTradePlanSummaryValidator = v.object({
  closedAt: nullableNumberValidator,
  id: v.id("tradePlans"),
  instrumentSymbol: v.string(),
  invalidatedAt: nullableNumberValidator,
  isWatched: v.boolean(),
  latestTradeDate: nullableNumberValidator,
  name: v.string(),
  status: tradePlanStatusValidator,
  tradeCount: v.number(),
});

const campaignWorkspaceDetailValidator = v.object({
  linkedTradePlans: v.array(campaignWorkspaceTradePlanSummaryValidator),
  summary: campaignWorkspaceSummaryValidator,
});

type CampaignDoc = Doc<"campaigns">;
type TradePlanDoc = Doc<"tradePlans">;

const DETAIL_SOURCE_DATA_CONCURRENCY = 20;

function sortTradePlansByOrderThenNewest(
  a: Pick<TradePlanDoc, "_creationTime" | "sortOrder">,
  b: Pick<TradePlanDoc, "_creationTime" | "sortOrder">,
): number {
  const sortA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const sortB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (sortA !== sortB) {
    return sortA - sortB;
  }

  return b._creationTime - a._creationTime;
}

function createEmptyTradePlanRollup() {
  return {
    activeCount: 0,
    closedCount: 0,
    ideaCount: 0,
    openCount: 0,
    totalCount: 0,
    watchingCount: 0,
  };
}

function buildTradePlanRollup(
  tradePlans: Array<Pick<TradePlanDoc, "status">>,
) {
  const rollup = createEmptyTradePlanRollup();

  for (const tradePlan of tradePlans) {
    rollup.totalCount += 1;
    if (tradePlan.status === "active") {
      rollup.activeCount += 1;
      rollup.openCount += 1;
      continue;
    }

    if (tradePlan.status === "watching") {
      rollup.watchingCount += 1;
      rollup.openCount += 1;
      continue;
    }

    if (tradePlan.status === "idea") {
      rollup.ideaCount += 1;
      rollup.openCount += 1;
      continue;
    }

    rollup.closedCount += 1;
  }

  return rollup;
}

function buildTradeRollup(
  tradePlanIds: Set<Id<"tradePlans">>,
  tradeStatsByPlanId: Map<Id<"tradePlans">, { latestTradeDate: number | null; totalCount: number }>,
) {
  let totalCount = 0;
  let latestTradeDate: number | null = null;

  for (const tradePlanId of tradePlanIds) {
    const tradeStats = tradeStatsByPlanId.get(tradePlanId);
    if (!tradeStats) {
      continue;
    }

    totalCount += tradeStats.totalCount;
    if (
      tradeStats.latestTradeDate !== null &&
      (latestTradeDate === null || tradeStats.latestTradeDate > latestTradeDate)
    ) {
      latestTradeDate = tradeStats.latestTradeDate;
    }
  }

  return {
    latestTradeDate,
    totalCount,
  };
}

async function loadCampaignWorkspaceSourceData(
  ctx: QueryCtx,
  ownerId: string,
) {
  const [tradePlans, trades, watchedItems] = await Promise.all([
    ctx.db
      .query("tradePlans")
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
  ]);

  const watchedCampaignIds = new Set<Id<"campaigns">>();
  const watchedTradePlanIds = new Set<Id<"tradePlans">>();

  for (const watchedItem of watchedItems) {
    if (watchedItem.itemType === "campaign" && watchedItem.campaignId) {
      watchedCampaignIds.add(watchedItem.campaignId);
      continue;
    }

    if (watchedItem.itemType === "tradePlan" && watchedItem.tradePlanId) {
      watchedTradePlanIds.add(watchedItem.tradePlanId);
    }
  }

  const tradePlansByCampaignId = new Map<Id<"campaigns">, Array<TradePlanDoc>>();
  for (const tradePlan of tradePlans) {
    if (!tradePlan.campaignId) {
      continue;
    }

    const existing = tradePlansByCampaignId.get(tradePlan.campaignId) ?? [];
    existing.push(tradePlan);
    tradePlansByCampaignId.set(tradePlan.campaignId, existing);
  }

  const tradeStatsByPlanId = new Map<
    Id<"tradePlans">,
    { latestTradeDate: number | null; totalCount: number }
  >();
  for (const trade of trades) {
    if (!trade.tradePlanId) {
      continue;
    }

    const existing = tradeStatsByPlanId.get(trade.tradePlanId) ?? {
      latestTradeDate: null,
      totalCount: 0,
    };
    existing.totalCount += 1;
    existing.latestTradeDate =
      existing.latestTradeDate === null || trade.date > existing.latestTradeDate
        ? trade.date
        : existing.latestTradeDate;
    tradeStatsByPlanId.set(trade.tradePlanId, existing);
  }

  return {
    tradePlansByCampaignId,
    tradeStatsByPlanId,
    watchedCampaignIds,
    watchedTradePlanIds,
  };
}

async function loadCampaignWorkspaceDetailSourceData(
  ctx: QueryCtx,
  ownerId: string,
  campaignId: Id<"campaigns">,
) {
  const [tradePlans, watchedCampaign] = await Promise.all([
    ctx.db
      .query("tradePlans")
      .withIndex("by_owner_campaignId", (q) =>
        q.eq("ownerId", ownerId).eq("campaignId", campaignId),
      )
      .collect(),
    ctx.db
      .query("watchlist")
      .withIndex("by_owner_campaignId", (q) =>
        q.eq("ownerId", ownerId).eq("campaignId", campaignId),
      )
      .first(),
  ]);

  const watchedCampaignIds = new Set<Id<"campaigns">>();
  if (watchedCampaign?.itemType === "campaign" && watchedCampaign.campaignId) {
    watchedCampaignIds.add(watchedCampaign.campaignId);
  }

  const watchedTradePlanIds = new Set<Id<"tradePlans">>();
  const tradeStatsByPlanId = new Map<
    Id<"tradePlans">,
    { latestTradeDate: number | null; totalCount: number }
  >();

  for (let i = 0; i < tradePlans.length; i += DETAIL_SOURCE_DATA_CONCURRENCY) {
    const tradePlanChunk = tradePlans.slice(i, i + DETAIL_SOURCE_DATA_CONCURRENCY);

    await Promise.all(
      tradePlanChunk.map(async (tradePlan) => {
        const [trades, watchedTradePlan] = await Promise.all([
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
            .unique(),
        ]);

        if (watchedTradePlan?.itemType === "tradePlan" && watchedTradePlan.tradePlanId) {
          watchedTradePlanIds.add(watchedTradePlan.tradePlanId);
        }

        let latestTradeDate: number | null = null;
        for (const trade of trades) {
          latestTradeDate =
            latestTradeDate === null || trade.date > latestTradeDate
              ? trade.date
              : latestTradeDate;
        }

        tradeStatsByPlanId.set(tradePlan._id, {
          latestTradeDate,
          totalCount: trades.length,
        });
      }),
    );
  }

  return {
    tradePlansByCampaignId: new Map([[campaignId, tradePlans]]),
    tradeStatsByPlanId,
    watchedCampaignIds,
    watchedTradePlanIds,
  };
}

function buildCampaignWorkspaceSummary(
  campaign: CampaignDoc,
  sourceData: Awaited<ReturnType<typeof loadCampaignWorkspaceSourceData>>,
  linkedTradePlansOverride?: Array<TradePlanDoc>,
) {
  const linkedTradePlans =
    linkedTradePlansOverride ??
    sourceData.tradePlansByCampaignId.get(campaign._id)?.sort(sortTradePlansByOrderThenNewest) ??
    [];
  const linkedTradePlanRollup = buildTradePlanRollup(linkedTradePlans);
  const linkedTradePlanIds = new Set(linkedTradePlans.map((tradePlan) => tradePlan._id));
  const linkedTradeRollup = buildTradeRollup(linkedTradePlanIds, sourceData.tradeStatsByPlanId);

  return {
    createdAt: campaign._creationTime,
    id: campaign._id,
    isWatched: sourceData.watchedCampaignIds.has(campaign._id),
    lifecycle: {
      closedAt: campaign.closedAt ?? null,
      hasClosedTradePlans: linkedTradePlanRollup.closedCount > 0,
      hasLinkedTradePlans: linkedTradePlanRollup.totalCount > 0,
      hasOpenTradePlans: linkedTradePlanRollup.openCount > 0,
      hasRetrospective: Boolean(campaign.retrospective?.trim()),
      isClosed: campaign.status === "closed",
    },
    linkedTradePlans: linkedTradePlanRollup,
    linkedTrades: linkedTradeRollup,
    name: campaign.name,
    status: campaign.status,
    thesis: campaign.thesis,
  };
}

function validateCampaignName(name: string): string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new ConvexError("Campaign name is required");
  }
  if (trimmedName.length > 120) {
    throw new ConvexError("Campaign name must be 120 characters or fewer");
  }
  return trimmedName;
}

export const createCampaign = mutation({
  args: {
    name: v.string(),
    thesis: v.string(),
  },
  returns: v.id("campaigns"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    return await ctx.db.insert("campaigns", {
      name: validateCampaignName(args.name),
      ownerId,
      status: "planning",
      thesis: args.thesis,
    });
  },
});

export const updateCampaign = mutation({
  args: {
    campaignId: v.id("campaigns"),
    name: v.optional(v.string()),
    retrospective: v.optional(v.string()),
    thesis: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { campaignId, ...updates } = args;

    const campaign = await ctx.db.get(campaignId);
    assertOwner(campaign, ownerId, "Campaign not found");

    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) {
      patch.name = validateCampaignName(updates.name);
    }
    if (updates.retrospective !== undefined) patch.retrospective = updates.retrospective;
    if (updates.thesis !== undefined) patch.thesis = updates.thesis;

    await ctx.db.patch(campaignId, patch);
    return null;
  },
});

export const updateCampaignStatus = mutation({
  args: {
    campaignId: v.id("campaigns"),
    status: v.union(
      v.literal("active"),
      v.literal("closed"),
      v.literal("planning"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    assertOwner(campaign, ownerId, "Campaign not found");

    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "closed") {
      patch.closedAt = Date.now();
    } else {
      patch.closedAt = undefined;
    }

    await ctx.db.patch(args.campaignId, patch);
    return null;
  },
});

export const listCampaigns = query({
  args: {},
  returns: v.array(campaignValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    return await ctx.db
      .query("campaigns")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

export const listCampaignsByStatus = query({
  args: {
    status: v.union(
      v.literal("active"),
      v.literal("closed"),
      v.literal("planning"),
    ),
  },
  returns: v.array(campaignValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", args.status),
      )
      .order("desc")
      .collect();
    return campaigns;
  },
});

export const listCampaignWorkspaceSummaries = query({
  args: {
    status: v.optional(campaignStatusValidator),
  },
  returns: v.array(campaignWorkspaceSummaryValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaigns =
      args.status === undefined
        ? await ctx.db
            .query("campaigns")
            .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
            .order("desc")
            .collect()
        : await ctx.db
            .query("campaigns")
            .withIndex("by_owner_status", (q) =>
              q.eq("ownerId", ownerId).eq("status", args.status!),
            )
            .order("desc")
            .collect();

    if (campaigns.length === 0) {
      return [];
    }

    const sourceData = await loadCampaignWorkspaceSourceData(ctx, ownerId);

    return campaigns.map((campaign) => buildCampaignWorkspaceSummary(campaign, sourceData));
  },
});

export const getCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.union(campaignValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      return null;
    }
    return campaign;
  },
});

export const getCampaignWorkspace = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.union(campaignWorkspaceDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      return null;
    }

    const sourceData = await loadCampaignWorkspaceDetailSourceData(
      ctx,
      ownerId,
      campaign._id,
    );
    const linkedTradePlans =
      sourceData.tradePlansByCampaignId.get(campaign._id)?.sort(sortTradePlansByOrderThenNewest) ??
      [];

    return {
      linkedTradePlans: linkedTradePlans.map((tradePlan) => {
        const tradeStats = sourceData.tradeStatsByPlanId.get(tradePlan._id) ?? {
          latestTradeDate: null,
          totalCount: 0,
        };

        return {
          closedAt: tradePlan.closedAt ?? null,
          id: tradePlan._id,
          instrumentSymbol: tradePlan.instrumentSymbol,
          invalidatedAt: tradePlan.invalidatedAt ?? null,
          isWatched: sourceData.watchedTradePlanIds.has(tradePlan._id),
          latestTradeDate: tradeStats.latestTradeDate,
          name: tradePlan.name,
          status: tradePlan.status,
          tradeCount: tradeStats.totalCount,
        };
      }),
      summary: buildCampaignWorkspaceSummary(campaign, sourceData, linkedTradePlans),
    };
  },
});
