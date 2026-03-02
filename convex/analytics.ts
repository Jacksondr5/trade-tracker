import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";

export const getDashboardStats = query({
  args: {},
  returns: v.object({
    closedCampaignCount: v.number(),
    openCampaignCount: v.number(),
    totalTradeCount: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const allTrades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    );

    const allCampaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    const openCampaignCount = allCampaigns.filter(
      (campaign) => campaign.status === "planning" || campaign.status === "active",
    ).length;
    const closedCampaignCount = allCampaigns.filter(
      (campaign) => campaign.status === "closed",
    ).length;

    return {
      closedCampaignCount,
      openCampaignCount,
      totalTradeCount: allTrades.length,
    };
  },
});
