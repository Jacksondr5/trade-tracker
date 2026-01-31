import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create a new campaign with name and thesis.
 * Status is set to 'planning' by default.
 */
export const createCampaign = mutation({
  args: {
    name: v.string(),
    thesis: v.string(),
  },
  returns: v.id("campaigns"),
  handler: async (ctx, args) => {
    const { name, thesis } = args;

    const campaignId = await ctx.db.insert("campaigns", {
      entryTargets: [],
      instruments: [],
      name,
      profitTargets: [],
      status: "planning",
      stopLossHistory: [],
      thesis,
    });

    return campaignId;
  },
});

/**
 * Update a campaign's name, thesis, or retrospective.
 */
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

    const existingCampaign = await ctx.db.get(campaignId);
    if (!existingCampaign) {
      throw new Error("Campaign not found");
    }

    // Build patch object with only defined values
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.retrospective !== undefined)
      patch.retrospective = updates.retrospective;
    if (updates.thesis !== undefined) patch.thesis = updates.thesis;

    await ctx.db.patch(campaignId, patch);

    return null;
  },
});

/**
 * Update a campaign's status.
 * When changing to 'closed', outcome is required and closedAt timestamp is set.
 */
export const updateCampaignStatus = mutation({
  args: {
    campaignId: v.id("campaigns"),
    outcome: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("profit_target"),
        v.literal("stop_loss"),
      ),
    ),
    status: v.union(
      v.literal("active"),
      v.literal("closed"),
      v.literal("planning"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaignId, outcome, status } = args;

    const existingCampaign = await ctx.db.get(campaignId);
    if (!existingCampaign) {
      throw new Error("Campaign not found");
    }

    // Validate that outcome is provided when closing
    if (status === "closed" && !outcome) {
      throw new Error("Outcome is required when closing a campaign");
    }

    // Build patch object
    const patch: Record<string, unknown> = {
      status,
    };

    // Set outcome and closedAt when closing
    if (status === "closed") {
      patch.outcome = outcome;
      patch.closedAt = Date.now();
    }

    await ctx.db.patch(campaignId, patch);

    return null;
  },
});
