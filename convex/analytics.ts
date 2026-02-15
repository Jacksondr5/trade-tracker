import { query } from "./_generated/server";
import { v } from "convex/values";
import { calculateTradesPL } from "./lib/plCalculation";

export const getDashboardStats = query({
  args: {},
  returns: v.object({
    avgLoss: v.union(v.number(), v.null()),
    avgWin: v.union(v.number(), v.null()),
    closedCampaignCount: v.number(),
    openCampaignCount: v.number(),
    profitFactor: v.union(v.number(), v.null()),
    totalRealizedPL: v.number(),
    totalRealizedPLYTD: v.number(),
    totalTradeCount: v.number(),
    winRate: v.union(v.number(), v.null()),
    winningCampaignCount: v.number(),
  }),
  handler: async (ctx) => {
    // Fetch all trades for P&L calculation
    const allTrades = await ctx.db.query("trades").collect();

    // Calculate P&L for all trades
    const tradePLMap = calculateTradesPL(allTrades);

    // Calculate total realized P&L
    let totalRealizedPL = 0;
    for (const pl of tradePLMap.values()) {
      if (pl !== null) {
        totalRealizedPL += pl;
      }
    }

    // Calculate YTD P&L (trades from Jan 1 of current year)
    const currentYear = new Date().getFullYear();
    const ytdStartTimestamp = new Date(currentYear, 0, 1).getTime();

    let totalRealizedPLYTD = 0;
    for (const trade of allTrades) {
      if (trade.date >= ytdStartTimestamp) {
        const pl = tradePLMap.get(trade._id.toString());
        if (pl !== null && pl !== undefined) {
          totalRealizedPLYTD += pl;
        }
      }
    }

    // Fetch all campaigns and trade plans.
    const allCampaigns = await ctx.db.query("campaigns").collect();
    const allTradePlans = await ctx.db.query("tradePlans").collect();
    const campaignTradePlanIds = new Map<string, Set<string>>();

    for (const tradePlan of allTradePlans) {
      if (!tradePlan.campaignId) {
        continue;
      }

      const key = tradePlan.campaignId.toString();
      if (!campaignTradePlanIds.has(key)) {
        campaignTradePlanIds.set(key, new Set<string>());
      }
      campaignTradePlanIds.get(key)!.add(tradePlan._id.toString());
    }

    // Count open and closed campaigns
    const openCampaignCount = allCampaigns.filter(
      (c) => c.status === "planning" || c.status === "active"
    ).length;
    const closedCampaigns = allCampaigns.filter((c) => c.status === "closed");
    const closedCampaignCount = closedCampaigns.length;

    // Calculate campaign P&L for closed campaigns through linked trade plans.
    const campaignPLs: number[] = [];
    for (const campaign of closedCampaigns) {
      const tradePlanIds = campaignTradePlanIds.get(campaign._id.toString()) ?? new Set<string>();
      let campaignPL = 0;
      for (const trade of allTrades) {
        if (trade.tradePlanId && tradePlanIds.has(trade.tradePlanId.toString())) {
          const pl = tradePLMap.get(trade._id.toString());
          if (pl !== null && pl !== undefined) {
            campaignPL += pl;
          }
        }
      }
      campaignPLs.push(campaignPL);
    }

    // Calculate winning campaign count and win rate
    const winningCampaignCount = campaignPLs.filter((pl) => pl > 0).length;
    const winRate =
      closedCampaignCount > 0
        ? (winningCampaignCount / closedCampaignCount) * 100
        : null;

    // Calculate average win and average loss from closing trades
    const wins: number[] = [];
    const losses: number[] = [];
    for (const pl of tradePLMap.values()) {
      if (pl !== null) {
        if (pl > 0) {
          wins.push(pl);
        } else if (pl < 0) {
          losses.push(pl);
        }
      }
    }

    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : null;
    const avgLoss =
      losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : null;

    // Calculate profit factor (total gains / total losses)
    const totalGains = wins.reduce((a, b) => a + b, 0);
    const totalLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
    const profitFactor = totalLosses > 0 ? totalGains / totalLosses : null;

    return {
      avgLoss,
      avgWin,
      closedCampaignCount,
      openCampaignCount,
      profitFactor,
      totalRealizedPL,
      totalRealizedPLYTD,
      totalTradeCount: allTrades.length,
      winRate,
      winningCampaignCount,
    };
  },
});
