import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { calculateTradesPL } from "./lib/plCalculation";

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
  entryConditions: v.string(),
  exitConditions: v.string(),
  instrumentNotes: v.optional(v.string()),
  instrumentSymbol: v.string(),
  instrumentType: v.optional(v.string()),
  invalidatedAt: v.optional(v.number()),
  name: v.string(),
  rationale: v.optional(v.string()),
  sortOrder: v.optional(v.number()),
  status: tradePlanStatusValidator,
  targetConditions: v.string(),
});

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
    entryConditions: v.string(),
    exitConditions: v.string(),
    instrumentNotes: v.optional(v.string()),
    instrumentSymbol: v.string(),
    instrumentType: v.optional(v.string()),
    name: v.string(),
    rationale: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    status: v.optional(tradePlanStatusValidator),
    targetConditions: v.string(),
  },
  returns: v.id("tradePlans"),
  handler: async (ctx, args) => {
    const status = args.status ?? "idea";

    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }
    }

    return await ctx.db.insert("tradePlans", {
      campaignId: args.campaignId,
      entryConditions: args.entryConditions,
      exitConditions: args.exitConditions,
      instrumentNotes: args.instrumentNotes,
      instrumentSymbol: args.instrumentSymbol.trim().toUpperCase(),
      instrumentType: args.instrumentType,
      name: args.name,
      rationale: args.rationale,
      sortOrder: args.sortOrder,
      status,
      targetConditions: args.targetConditions,
    });
  },
});

export const updateTradePlan = mutation({
  args: {
    campaignId: v.optional(v.union(v.id("campaigns"), v.null())),
    entryConditions: v.optional(v.string()),
    exitConditions: v.optional(v.string()),
    instrumentNotes: v.optional(v.string()),
    instrumentSymbol: v.optional(v.string()),
    instrumentType: v.optional(v.string()),
    invalidatedAt: v.optional(v.union(v.number(), v.null())),
    name: v.optional(v.string()),
    rationale: v.optional(v.string()),
    sortOrder: v.optional(v.union(v.number(), v.null())),
    targetConditions: v.optional(v.string()),
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { tradePlanId, ...updates } = args;

    const existingTradePlan = await ctx.db.get(tradePlanId);
    if (!existingTradePlan) {
      throw new Error("Trade plan not found");
    }

    if (updates.campaignId !== undefined && updates.campaignId !== null) {
      const campaign = await ctx.db.get(updates.campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }
    }

    const patch: Record<string, unknown> = {};

    if (updates.campaignId !== undefined) {
      patch.campaignId = updates.campaignId === null ? undefined : updates.campaignId;
    }
    if (updates.entryConditions !== undefined)
      patch.entryConditions = updates.entryConditions;
    if (updates.exitConditions !== undefined) patch.exitConditions = updates.exitConditions;
    if (updates.instrumentNotes !== undefined)
      patch.instrumentNotes = updates.instrumentNotes;
    if (updates.instrumentSymbol !== undefined)
      patch.instrumentSymbol = updates.instrumentSymbol.trim().toUpperCase();
    if (updates.instrumentType !== undefined)
      patch.instrumentType = updates.instrumentType;
    if (updates.invalidatedAt !== undefined)
      patch.invalidatedAt = updates.invalidatedAt === null ? undefined : updates.invalidatedAt;
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.rationale !== undefined) patch.rationale = updates.rationale;
    if (updates.sortOrder !== undefined)
      patch.sortOrder = updates.sortOrder === null ? undefined : updates.sortOrder;
    if (updates.targetConditions !== undefined)
      patch.targetConditions = updates.targetConditions;

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
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan) {
      throw new Error("Trade plan not found");
    }

    if (!isValidStatusTransition(tradePlan.status, args.status)) {
      throw new Error(`Invalid trade plan status transition: ${tradePlan.status} -> ${args.status}`);
    }

    if (tradePlan.campaignId && args.status !== "closed") {
      const campaign = await ctx.db.get(tradePlan.campaignId);
      if (!campaign) {
        throw new Error("Linked campaign not found");
      }

      if (campaign.status === "closed") {
        throw new Error("Cannot reopen or activate a trade plan linked to a closed campaign");
      }
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
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.union(tradePlanValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tradePlanId);
  },
});

export const listTradePlans = query({
  args: {
    campaignId: v.optional(v.union(v.id("campaigns"), v.null())),
    status: v.optional(tradePlanStatusValidator),
  },
  returns: v.array(tradePlanValidator),
  handler: async (ctx, args) => {
    const allTradePlans = await ctx.db.query("tradePlans").collect();

    return allTradePlans
      .filter((plan) => {
        if (args.campaignId !== undefined) {
          if (args.campaignId === null) {
            if (plan.campaignId !== undefined) {
              return false;
            }
          } else if (plan.campaignId !== args.campaignId) {
            return false;
          }
        }

        if (args.status !== undefined && plan.status !== args.status) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const sortA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const sortB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (sortA !== sortB) {
          return sortA - sortB;
        }
        return b._creationTime - a._creationTime;
      });
  },
});

export const listStandaloneTradePlans = query({
  args: {
    status: v.optional(tradePlanStatusValidator),
  },
  returns: v.array(tradePlanValidator),
  handler: async (ctx, args) => {
    const allTradePlans = await ctx.db.query("tradePlans").collect();

    return allTradePlans
      .filter((plan) => {
        if (plan.campaignId !== undefined) {
          return false;
        }

        if (args.status !== undefined && plan.status !== args.status) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const listTradePlansByCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
    status: v.optional(tradePlanStatusValidator),
  },
  returns: v.array(tradePlanValidator),
  handler: async (ctx, args) => {
    const tradePlans = await ctx.db
      .query("tradePlans")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();

    return tradePlans
      .filter((plan) => (args.status ? plan.status === args.status : true))
      .sort((a, b) => {
        const sortA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const sortB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (sortA !== sortB) {
          return sortA - sortB;
        }
        return b._creationTime - a._creationTime;
      });
  },
});

const tradeWithPLValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("trades"),
  assetType: v.union(v.literal("crypto"), v.literal("stock")),
  campaignId: v.optional(v.id("campaigns")),
  date: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  notes: v.optional(v.string()),
  price: v.number(),
  quantity: v.number(),
  realizedPL: v.union(v.number(), v.null()),
  side: v.union(v.literal("buy"), v.literal("sell")),
  ticker: v.string(),
  tradePlanId: v.optional(v.id("tradePlans")),
});

export const getTradesByTradePlan = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.array(tradeWithPLValidator),
  handler: async (ctx, args) => {
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_tradePlanId", (q) => q.eq("tradePlanId", args.tradePlanId))
      .collect();

    const allTrades = await ctx.db.query("trades").collect();
    const plMap = calculateTradesPL(allTrades);

    return trades
      .sort((a, b) => b.date - a.date)
      .map((trade) => ({
        ...trade,
        realizedPL: plMap.get(trade._id) ?? null,
      }));
  },
});

export const getTradePlanPL = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.object({
    losingTrades: v.number(),
    realizedPL: v.number(),
    tradeCount: v.number(),
    winningTrades: v.number(),
  }),
  handler: async (ctx, args) => {
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_tradePlanId", (q) => q.eq("tradePlanId", args.tradePlanId))
      .collect();

    const allTrades = await ctx.db.query("trades").collect();
    const plMap = calculateTradesPL(allTrades);

    let realizedPL = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    for (const trade of trades) {
      const pl = plMap.get(trade._id);
      if (pl !== null && pl !== undefined) {
        realizedPL += pl;
        if (pl > 0) {
          winningTrades++;
        } else if (pl < 0) {
          losingTrades++;
        }
      }
    }

    return {
      losingTrades,
      realizedPL,
      tradeCount: trades.length,
      winningTrades,
    };
  },
});
