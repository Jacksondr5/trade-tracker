import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

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
  ownerId: v.string(),
  rationale: v.optional(v.string()),
  sortOrder: v.optional(v.number()),
  status: tradePlanStatusValidator,
  targetConditions: v.string(),
});

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
    const ownerId = await requireUser(ctx);
    const status = args.status ?? "idea";

    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      assertOwner(campaign, ownerId, "Campaign not found");
    }

    return await ctx.db.insert("tradePlans", {
      campaignId: args.campaignId,
      entryConditions: args.entryConditions,
      exitConditions: args.exitConditions,
      instrumentNotes: args.instrumentNotes,
      instrumentSymbol: args.instrumentSymbol.trim().toUpperCase(),
      instrumentType: args.instrumentType,
      name: args.name,
      ownerId,
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
    const ownerId = await requireUser(ctx);
    const tradePlan = assertOwner(
      await ctx.db.get(args.tradePlanId),
      ownerId,
      "Trade plan not found",
    );

    if (!isValidStatusTransition(tradePlan.status, args.status)) {
      throw new Error(`Invalid trade plan status transition: ${tradePlan.status} -> ${args.status}`);
    }

    if (tradePlan.campaignId && args.status !== "closed") {
      const campaign = assertOwner(
        await ctx.db.get(tradePlan.campaignId),
        ownerId,
        "Linked campaign not found",
      );

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
      (a, b) => b._creationTime - a._creationTime,
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
