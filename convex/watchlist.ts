import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const watchlistItemTypeValidator = v.union(
  v.literal("campaign"),
  v.literal("episode"),
  v.literal("thread"),
  v.literal("tradePlan"),
);

const watchTargetValidator = v.union(
  v.object({
    campaignId: v.id("campaigns"),
    itemType: v.literal("campaign"),
  }),
  v.object({
    episodeId: v.id("episodes"),
    itemType: v.literal("episode"),
  }),
  v.object({
    itemType: v.literal("thread"),
    threadId: v.id("instrumentThreads"),
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
  episodeId: v.optional(v.id("episodes")),
  itemType: watchlistItemTypeValidator,
  ownerId: v.string(),
  threadId: v.optional(v.id("instrumentThreads")),
  tradePlanId: v.optional(v.id("tradePlans")),
  watchedAt: v.number(),
});

type WatchTarget =
  | { campaignId: Id<"campaigns">; itemType: "campaign" }
  | { episodeId: Id<"episodes">; itemType: "episode" }
  | { itemType: "thread"; threadId: Id<"instrumentThreads"> }
  | { itemType: "tradePlan"; tradePlanId: Id<"tradePlans"> };

async function assertTargetExists(
  ctx: MutationCtx,
  ownerId: string,
  target: WatchTarget,
) {
  switch (target.itemType) {
    case "campaign":
      assertOwner(await ctx.db.get(target.campaignId), ownerId, "Campaign not found");
      return;
    case "episode":
      assertOwner(await ctx.db.get(target.episodeId), ownerId, "Episode not found");
      return;
    case "thread":
      assertOwner(await ctx.db.get(target.threadId), ownerId, "Thread not found");
      return;
    case "tradePlan":
      assertOwner(await ctx.db.get(target.tradePlanId), ownerId, "Trade plan not found");
      return;
  }
}

async function getExistingWatch(
  ctx: MutationCtx,
  ownerId: string,
  target: WatchTarget,
) {
  switch (target.itemType) {
    case "campaign":
      return await ctx.db
        .query("watchlist")
        .withIndex("by_owner_campaignId", (q) =>
          q.eq("ownerId", ownerId).eq("campaignId", target.campaignId),
        )
        .unique();
    case "episode":
      return await ctx.db
        .query("watchlist")
        .withIndex("by_owner_episodeId", (q) =>
          q.eq("ownerId", ownerId).eq("episodeId", target.episodeId),
        )
        .unique();
    case "thread":
      return await ctx.db
        .query("watchlist")
        .withIndex("by_owner_threadId", (q) =>
          q.eq("ownerId", ownerId).eq("threadId", target.threadId),
        )
        .unique();
    case "tradePlan":
      return await ctx.db
        .query("watchlist")
        .withIndex("by_owner_tradePlanId", (q) =>
          q.eq("ownerId", ownerId).eq("tradePlanId", target.tradePlanId),
        )
        .unique();
  }
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
      episodeId:
        args.item.itemType === "episode" ? args.item.episodeId : undefined,
      itemType: args.item.itemType,
      ownerId,
      threadId: args.item.itemType === "thread" ? args.item.threadId : undefined,
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
    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_owner_watchedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();

    const resolved = await Promise.all(
      items.map(async (item) => {
        if (item.itemType === "campaign") {
          if (!item.campaignId) return null;
          const campaign = await ctx.db.get(item.campaignId);
          return campaign && campaign.ownerId === ownerId ? item : null;
        }
        if (item.itemType === "episode") {
          if (!item.episodeId) return null;
          const episode = await ctx.db.get(item.episodeId);
          return episode && episode.ownerId === ownerId ? item : null;
        }
        if (item.itemType === "thread") {
          if (!item.threadId) return null;
          const thread = await ctx.db.get(item.threadId);
          return thread && thread.ownerId === ownerId ? item : null;
        }

        if (!item.tradePlanId) return null;
        const tradePlan = await ctx.db.get(item.tradePlanId);
        return tradePlan && tradePlan.ownerId === ownerId ? item : null;
      }),
    );

    return resolved.filter((item): item is (typeof items)[number] => item !== null);
  },
});
