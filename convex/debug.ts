import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";

export const getOwnerTokenIdentifier = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return requireUser(ctx);
  },
});

export const backfillAllDataToCurrentUser = mutation({
  args: {},
  returns: v.object({
    campaignNotesUpdated: v.number(),
    campaignsUpdated: v.number(),
    ownerId: v.string(),
    portfolioSnapshotsUpdated: v.number(),
    tradePlansUpdated: v.number(),
    tradesUpdated: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);

    // Only backfill records without an ownerId to avoid overwriting existing ownership
    const campaigns = (await ctx.db.query("campaigns").collect()).filter(r => !r.ownerId);
    const tradePlans = (await ctx.db.query("tradePlans").collect()).filter(r => !r.ownerId);
    const trades = (await ctx.db.query("trades").collect()).filter(r => !r.ownerId);
    const campaignNotes = (await ctx.db.query("campaignNotes").collect()).filter(r => !r.ownerId);
    const portfolioSnapshots = (await ctx.db.query("portfolioSnapshots").collect()).filter(r => !r.ownerId);

    for (const campaign of campaigns) {
      await ctx.db.patch(campaign._id, { ownerId });
    }

    for (const tradePlan of tradePlans) {
      await ctx.db.patch(tradePlan._id, { ownerId });
    }

    for (const trade of trades) {
      await ctx.db.patch(trade._id, { ownerId });
    }

    for (const note of campaignNotes) {
      await ctx.db.patch(note._id, { ownerId });
    }

    for (const snapshot of portfolioSnapshots) {
      await ctx.db.patch(snapshot._id, { ownerId });
    }

    return {
      campaignNotesUpdated: campaignNotes.length,
      campaignsUpdated: campaigns.length,
      ownerId,
      portfolioSnapshotsUpdated: portfolioSnapshots.length,
      tradePlansUpdated: tradePlans.length,
      tradesUpdated: trades.length,
    };
  },
});
