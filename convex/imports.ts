import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const inboxTradeValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("trades"),
  brokerAccountRef: v.optional(v.string()),
  campaignId: v.optional(v.id("campaigns")),
  date: v.number(),
  price: v.number(),
  quantity: v.number(),
  side: v.union(v.literal("buy"), v.literal("sell")),
  source: v.union(v.literal("ibkr"), v.literal("kraken"), v.literal("manual")),
  suggestedTradePlanId: v.optional(v.id("tradePlans")),
  suggestionReason: v.optional(v.union(v.literal("none"), v.literal("symbol_and_side_match"))),
  ticker: v.string(),
  tradePlanId: v.optional(v.id("tradePlans")),
});

export const syncNow = mutation({
  args: {
    connectionId: v.optional(v.id("brokerageConnections")),
  },
  returns: v.object({ queued: v.number() }),
  handler: async (ctx, args) => {
    const connections = args.connectionId
      ? [await ctx.db.get(args.connectionId)].filter((c) => c !== null)
      : await ctx.db
          .query("brokerageConnections")
          .withIndex("by_status", (q) => q.eq("status", "active"))
          .collect();

    let queued = 0;
    for (const connection of connections) {
      if (!connection || connection.status !== "active") {
        continue;
      }

      const jobId = await ctx.db.insert("importJobs", {
        connectionId: connection._id,
        provider: connection.provider,
        startedAt: Date.now(),
        status: "running",
      });

      await ctx.db.patch(jobId, {
        finishedAt: Date.now(),
        status: "succeeded",
      });

      queued += 1;
    }

    return { queued };
  },
});

export const runScheduledSync = internalMutation({
  args: {},
  returns: v.object({ queued: v.number() }),
  handler: async (ctx) => {
    const activeConnections = await ctx.db
      .query("brokerageConnections")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let queued = 0;
    for (const connection of activeConnections) {
      if (connection.status !== "active") {
        continue;
      }

      const jobId = await ctx.db.insert("importJobs", {
        connectionId: connection._id,
        provider: connection.provider,
        startedAt: Date.now(),
        status: "running",
      });

      await ctx.db.patch(jobId, {
        finishedAt: Date.now(),
        status: "succeeded",
      });
      queued += 1;
    }

    return { queued };
  },
});

export const listInboxRows = query({
  args: {},
  returns: v.array(inboxTradeValidator),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("trades")
      .withIndex("by_inboxStatus", (q) => q.eq("inboxStatus", "pending_review"))
      .collect();

    return rows.sort((a, b) => b.date - a.date);
  },
});

export const listImportErrors = query({
  args: {},
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("importJobs"),
      connectionId: v.id("brokerageConnections"),
      errorMessage: v.optional(v.string()),
      finishedAt: v.optional(v.number()),
      provider: v.union(v.literal("ibkr"), v.literal("kraken")),
      startedAt: v.number(),
      status: v.union(v.literal("failed"), v.literal("running"), v.literal("succeeded")),
    }),
  ),
  handler: async (ctx) => {
    const jobs = await ctx.db.query("importJobs").collect();
    return jobs
      .filter((job) => job.status === "failed")
      .sort((a, b) => b.startedAt - a.startedAt);
  },
});

export const reviewImportedTrade = mutation({
  args: {
    campaignId: v.optional(v.union(v.id("campaigns"), v.null())),
    tradeId: v.id("trades"),
    tradePlanId: v.optional(v.union(v.id("tradePlans"), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const trade = await ctx.db.get(args.tradeId);
    if (!trade) {
      throw new Error("Trade not found");
    }

    let campaignId = args.campaignId === null ? undefined : args.campaignId;
    const tradePlanId = args.tradePlanId === null ? undefined : args.tradePlanId;

    if (tradePlanId) {
      const tradePlan = await ctx.db.get(tradePlanId);
      if (!tradePlan) {
        throw new Error("Trade plan not found");
      }
      if (campaignId && tradePlan.campaignId && campaignId !== tradePlan.campaignId) {
        throw new Error("Direct campaignId must match trade plan campaign");
      }
      campaignId = tradePlan.campaignId ?? campaignId;
    }

    if (campaignId) {
      const campaign = await ctx.db.get(campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }
    }

    await ctx.db.patch(args.tradeId, {
      campaignId,
      inboxStatus: "reviewed",
      tradePlanId,
    });

    return null;
  },
});
