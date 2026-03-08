import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const watchlistItemTypeValidator = v.union(
  v.literal("campaign"),
  v.literal("tradePlan"),
);

const watchTargetValidator = v.union(
  v.object({
    campaignId: v.id("campaigns"),
    itemType: v.literal("campaign"),
  }),
  v.object({
    itemType: v.literal("tradePlan"),
    tradePlanId: v.id("tradePlans"),
  }),
);

const watchlistItemValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("watchlist"),
  campaignId: v.optional(v.id("campaigns")),
  itemType: watchlistItemTypeValidator,
  ownerId: v.string(),
  tradePlanId: v.optional(v.id("tradePlans")),
  watchedAt: v.number(),
});

type WatchTarget =
  | {
      campaignId: Id<"campaigns">;
      itemType: "campaign";
    }
  | {
      itemType: "tradePlan";
      tradePlanId: Id<"tradePlans">;
    };

async function assertTargetExists(
  ctx: MutationCtx,
  ownerId: string,
  target: WatchTarget,
) {
  if (target.itemType === "campaign") {
    const campaign = await ctx.db.get(target.campaignId as Id<"campaigns">);
    assertOwner(campaign, ownerId, "Campaign not found");
    return;
  }

  const tradePlan = await ctx.db.get(target.tradePlanId as Id<"tradePlans">);
  assertOwner(tradePlan, ownerId, "Trade plan not found");
}

async function getExistingWatch(
  ctx: MutationCtx,
  ownerId: string,
  target: WatchTarget,
) {
  if (target.itemType === "campaign") {
    return await ctx.db
      .query("watchlist")
      .withIndex("by_owner_campaignId", (q) =>
        q.eq("ownerId", ownerId).eq("campaignId", target.campaignId as Id<"campaigns">),
      )
      .unique();
  }

  return await ctx.db
    .query("watchlist")
    .withIndex("by_owner_tradePlanId", (q) =>
      q.eq("ownerId", ownerId).eq("tradePlanId", target.tradePlanId as Id<"tradePlans">),
    )
    .unique();
}

export const watchItem = mutation({
  args: {
    item: watchTargetValidator,
  },
  returns: v.id("watchlist"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    await assertTargetExists(ctx, ownerId, args.item);

    const existingWatch = await getExistingWatch(ctx, ownerId, args.item);
    if (existingWatch) {
      return existingWatch._id;
    }

    return await ctx.db.insert("watchlist", {
      campaignId:
        args.item.itemType === "campaign" ? args.item.campaignId : undefined,
      itemType: args.item.itemType,
      ownerId,
      tradePlanId:
        args.item.itemType === "tradePlan" ? args.item.tradePlanId : undefined,
      watchedAt: Date.now(),
    });
  },
});

export const unwatchItem = mutation({
  args: {
    item: watchTargetValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);

    const existingWatch = await getExistingWatch(ctx, ownerId, args.item);
    if (existingWatch) {
      await ctx.db.delete(existingWatch._id);
    }

    return null;
  },
});

export const listWatchedItems = query({
  args: {},
  returns: v.array(watchlistItemValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    return await ctx.db
      .query("watchlist")
      .withIndex("by_owner_watchedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});
