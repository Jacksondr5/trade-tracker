import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { calculateTradesPL } from "./lib/plCalculation";

const campaignValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("campaigns"),
  closedAt: v.optional(v.number()),
  name: v.string(),
  retrospective: v.optional(v.string()),
  status: v.union(
    v.literal("active"),
    v.literal("closed"),
    v.literal("planning"),
  ),
  thesis: v.string(),
});

export const createCampaign = mutation({
  args: {
    name: v.string(),
    thesis: v.string(),
  },
  returns: v.id("campaigns"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("campaigns", {
      name: args.name,
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
    const { campaignId, ...updates } = args;

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
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
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

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
    return await ctx.db.query("campaigns").order("desc").collect();
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
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();

    return campaigns.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const getCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.union(campaignValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.campaignId);
  },
});

export const getCampaignPL = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.object({
    losingTrades: v.number(),
    realizedPL: v.number(),
    tradeCount: v.number(),
    winningTrades: v.number(),
  }),
  handler: async (ctx, args) => {
    const tradePlans = await ctx.db
      .query("tradePlans")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    const tradePlanIds = new Set(tradePlans.map((plan) => plan._id));

    const allTrades = await ctx.db.query("trades").collect();
    const campaignTrades = allTrades.filter(
      (trade) =>
        trade.campaignId === args.campaignId ||
        (trade.tradePlanId && tradePlanIds.has(trade.tradePlanId)),
    );

    const tradesPLMap = calculateTradesPL(allTrades);

    let realizedPL = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    for (const trade of campaignTrades) {
      const pl = tradesPLMap.get(trade._id);
      if (pl !== null && pl !== undefined) {
        realizedPL += pl;
        if (pl > 0) winningTrades++;
        if (pl < 0) losingTrades++;
      }
    }

    return {
      losingTrades,
      realizedPL,
      tradeCount: campaignTrades.length,
      winningTrades,
    };
  },
});

export const getCampaignPositionStatus = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.object({
    isFullyClosed: v.boolean(),
    positions: v.array(
      v.object({
        direction: v.union(v.literal("long"), v.literal("short")),
        quantity: v.number(),
        ticker: v.string(),
      }),
    ),
    realizedPL: v.number(),
  }),
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) {
      return {
        isFullyClosed: false,
        positions: [],
        realizedPL: 0,
      };
    }

    const tradePlans = await ctx.db
      .query("tradePlans")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    const tradePlanIds = new Set(tradePlans.map((plan) => plan._id));

    const allTrades = await ctx.db.query("trades").collect();
    const campaignTrades = allTrades.filter(
      (trade) =>
        trade.campaignId === args.campaignId ||
        (trade.tradePlanId && tradePlanIds.has(trade.tradePlanId)),
    );

    const tradesPLMap = calculateTradesPL(allTrades);
    const positionMap = new Map<string, number>();

    for (const trade of campaignTrades) {
      const key = `${trade.ticker}|${trade.direction}`;
      const currentQty = positionMap.get(key) || 0;

      const qtyChange =
        trade.direction === "long"
          ? trade.side === "buy"
            ? trade.quantity
            : -trade.quantity
          : trade.side === "sell"
            ? trade.quantity
            : -trade.quantity;

      positionMap.set(key, currentQty + qtyChange);
    }

    const positions = Array.from(positionMap.entries())
      .map(([key, quantity]) => {
        const [ticker, direction] = key.split("|");
        return {
          direction: direction as "long" | "short",
          quantity,
          ticker,
        };
      })
      .filter((position) => Math.abs(position.quantity) > 0.0001);

    const isFullyClosed = campaignTrades.length > 0 && positions.length === 0;

    let realizedPL = 0;
    for (const trade of campaignTrades) {
      const pl = tradesPLMap.get(trade._id);
      if (pl !== null && pl !== undefined) {
        realizedPL += pl;
      }
    }

    return {
      isFullyClosed,
      positions,
      realizedPL,
    };
  },
});
