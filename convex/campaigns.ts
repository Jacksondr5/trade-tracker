import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

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
