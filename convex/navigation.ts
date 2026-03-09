import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { Infer, v } from "convex/values";
import { requireUser } from "./lib/auth";
import { campaignStatusValidator, tradePlanStatusValidator } from "./lib/statuses";

const parentCampaignContextValidator = v.object({
  href: v.string(),
  id: v.id("campaigns"),
  name: v.string(),
});

const campaignNavigationItemValidator = v.object({
  href: v.string(),
  id: v.id("campaigns"),
  isWatched: v.boolean(),
  itemType: v.literal("campaign"),
  name: v.string(),
  status: campaignStatusValidator,
});

const tradePlanNavigationItemValidator = v.object({
  href: v.string(),
  id: v.id("tradePlans"),
  instrumentSymbol: v.string(),
  isWatched: v.boolean(),
  itemType: v.literal("tradePlan"),
  name: v.string(),
  parentCampaign: v.union(parentCampaignContextValidator, v.null()),
  status: tradePlanStatusValidator,
});

const campaignHierarchyRowValidator = v.object({
  defaultExpanded: v.boolean(),
  href: v.string(),
  id: v.id("campaigns"),
  isWatched: v.boolean(),
  itemType: v.literal("campaign"),
  name: v.string(),
  status: campaignStatusValidator,
  tradePlans: v.array(tradePlanNavigationItemValidator),
});

const navigationHierarchyValidator = v.object({
  campaigns: v.array(campaignHierarchyRowValidator),
  standaloneTradePlans: v.array(tradePlanNavigationItemValidator),
  watchlist: v.array(
    v.union(campaignNavigationItemValidator, tradePlanNavigationItemValidator),
  ),
});

type CampaignDoc = Doc<"campaigns">;
type TradePlanDoc = Doc<"tradePlans">;

type CampaignNavigationItem = Infer<typeof campaignNavigationItemValidator>;

type TradePlanNavigationItem = Infer<typeof tradePlanNavigationItemValidator>;

function buildCampaignHref(campaignId: Id<"campaigns">): string {
  return `/campaigns/${campaignId}`;
}

function buildTradePlanHref(tradePlanId: Id<"tradePlans">): string {
  return `/trade-plans/${tradePlanId}`;
}

const navigationTextCollator = new Intl.Collator("en", {
  sensitivity: "base",
});

function compareText(a: string, b: string): number {
  return navigationTextCollator.compare(a, b);
}

function getNavigationBucket(
  item: Pick<CampaignNavigationItem | TradePlanNavigationItem, "isWatched" | "status">,
): number {
  if (item.isWatched) {
    return 0;
  }

  return item.status === "closed" ? 2 : 1;
}

function compareCampaignItems(
  a: CampaignNavigationItem,
  b: CampaignNavigationItem,
): number {
  const bucketDiff = getNavigationBucket(a) - getNavigationBucket(b);
  if (bucketDiff !== 0) {
    return bucketDiff;
  }

  const nameDiff = compareText(a.name, b.name);
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return compareText(a.id, b.id);
}

function compareTradePlanItems(
  a: TradePlanNavigationItem,
  b: TradePlanNavigationItem,
): number {
  const bucketDiff = getNavigationBucket(a) - getNavigationBucket(b);
  if (bucketDiff !== 0) {
    return bucketDiff;
  }

  const nameDiff = compareText(a.name, b.name);
  if (nameDiff !== 0) {
    return nameDiff;
  }

  const symbolDiff = compareText(a.instrumentSymbol, b.instrumentSymbol);
  if (symbolDiff !== 0) {
    return symbolDiff;
  }

  return compareText(a.id, b.id);
}

function compareWatchlistItems(
  a: CampaignNavigationItem | TradePlanNavigationItem,
  b: CampaignNavigationItem | TradePlanNavigationItem,
): number {
  const aBucket = a.status === "closed" ? 1 : 0;
  const bBucket = b.status === "closed" ? 1 : 0;
  if (aBucket !== bBucket) {
    return aBucket - bBucket;
  }

  const nameDiff = compareText(a.name, b.name);
  if (nameDiff !== 0) {
    return nameDiff;
  }

  const typeDiff = compareText(a.itemType, b.itemType);
  if (typeDiff !== 0) {
    return typeDiff;
  }

  if (a.itemType === "tradePlan" && b.itemType === "tradePlan") {
    const parentNameA = a.parentCampaign?.name ?? "Standalone";
    const parentNameB = b.parentCampaign?.name ?? "Standalone";
    const parentDiff = compareText(parentNameA, parentNameB);
    if (parentDiff !== 0) {
      return parentDiff;
    }

    const symbolDiff = compareText(a.instrumentSymbol, b.instrumentSymbol);
    if (symbolDiff !== 0) {
      return symbolDiff;
    }
  }

  return compareText(a.id, b.id);
}

function buildCampaignNavigationItem(
  campaign: CampaignDoc,
  watchedCampaignIds: Set<Id<"campaigns">>,
): CampaignNavigationItem {
  return {
    href: buildCampaignHref(campaign._id),
    id: campaign._id,
    isWatched: watchedCampaignIds.has(campaign._id),
    itemType: "campaign",
    name: campaign.name,
    status: campaign.status,
  };
}

function buildTradePlanNavigationItem(
  tradePlan: TradePlanDoc,
  watchedTradePlanIds: Set<Id<"tradePlans">>,
  campaignById: Map<Id<"campaigns">, CampaignDoc>,
): TradePlanNavigationItem {
  const parentCampaign =
    tradePlan.campaignId !== undefined
      ? campaignById.get(tradePlan.campaignId) ?? null
      : null;

  return {
    href: buildTradePlanHref(tradePlan._id),
    id: tradePlan._id,
    instrumentSymbol: tradePlan.instrumentSymbol,
    isWatched: watchedTradePlanIds.has(tradePlan._id),
    itemType: "tradePlan",
    name: tradePlan.name,
    parentCampaign:
      parentCampaign === null
        ? null
        : {
            href: buildCampaignHref(parentCampaign._id),
            id: parentCampaign._id,
            name: parentCampaign.name,
          },
    status: tradePlan.status,
  };
}

export const getCampaignTradePlanHierarchy = query({
  args: {},
  returns: navigationHierarchyValidator,
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);

    const [campaigns, tradePlans, watchedItems] = await Promise.all([
      ctx.db
        .query("campaigns")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect(),
      ctx.db
        .query("tradePlans")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect(),
      ctx.db
        .query("watchlist")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect(),
    ]);

    const campaignById = new Map(campaigns.map((campaign) => [campaign._id, campaign]));
    const tradePlanById = new Map(tradePlans.map((tradePlan) => [tradePlan._id, tradePlan]));

    const watchedCampaignIds = new Set<Id<"campaigns">>();
    const watchedTradePlanIds = new Set<Id<"tradePlans">>();

    for (const watchedItem of watchedItems) {
      if (watchedItem.itemType === "campaign" && watchedItem.campaignId !== undefined) {
        if (campaignById.has(watchedItem.campaignId)) {
          watchedCampaignIds.add(watchedItem.campaignId);
        }
        continue;
      }

      if (
        watchedItem.itemType === "tradePlan" &&
        watchedItem.tradePlanId !== undefined &&
        tradePlanById.has(watchedItem.tradePlanId)
      ) {
        watchedTradePlanIds.add(watchedItem.tradePlanId);
      }
    }

    const childTradePlansByCampaign = new Map<
      Id<"campaigns">,
      Array<TradePlanNavigationItem>
    >();
    const standaloneTradePlans: Array<TradePlanNavigationItem> = [];
    const watchlistTradePlans: Array<TradePlanNavigationItem> = [];

    for (const tradePlan of tradePlans) {
      const tradePlanItem = buildTradePlanNavigationItem(
        tradePlan,
        watchedTradePlanIds,
        campaignById,
      );

      if (tradePlanItem.isWatched) {
        watchlistTradePlans.push(tradePlanItem);
      }

      if (tradePlanItem.parentCampaign === null) {
        standaloneTradePlans.push(tradePlanItem);
        continue;
      }

      const siblingTradePlans =
        childTradePlansByCampaign.get(tradePlanItem.parentCampaign.id) ?? [];
      siblingTradePlans.push(tradePlanItem);
      childTradePlansByCampaign.set(tradePlanItem.parentCampaign.id, siblingTradePlans);
    }

    const watchlistCampaigns: Array<CampaignNavigationItem> = [];
    const campaignRows = campaigns
      .map((campaign) => {
        const campaignItem = buildCampaignNavigationItem(campaign, watchedCampaignIds);
        if (campaignItem.isWatched) {
          watchlistCampaigns.push(campaignItem);
        }

        const childTradePlans =
          childTradePlansByCampaign.get(campaign._id)?.sort(compareTradePlanItems) ?? [];

        return {
          ...campaignItem,
          defaultExpanded: childTradePlans.some((tradePlan) => tradePlan.isWatched),
          tradePlans: childTradePlans,
        };
      })
      .sort(compareCampaignItems);

    const watchlist = [...watchlistCampaigns, ...watchlistTradePlans].sort(
      compareWatchlistItems,
    );

    return {
      campaigns: campaignRows,
      standaloneTradePlans: standaloneTradePlans.sort(compareTradePlanItems),
      watchlist,
    };
  },
});
