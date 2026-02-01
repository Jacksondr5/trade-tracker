import { query } from "./_generated/server";
import { v } from "convex/values";
import { calculateTradesPL } from "./lib/plCalculation";

/**
 * Get dashboard statistics for portfolio analytics.
 * Calculates P&L, win rates, and other key metrics.
 */
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
    // Get all trades
    const allTrades = await ctx.db.query("trades").collect();
    
    // Get all campaigns
    const allCampaigns = await ctx.db.query("campaigns").collect();

    // Calculate P&L for all trades
    const tradesPLMap = calculateTradesPL(allTrades);

    // Calculate YTD start date (Jan 1 of current year at midnight UTC)
    const now = new Date();
    const ytdStart = new Date(now.getFullYear(), 0, 1).getTime();

    // Calculate trade P&L stats
    let totalRealizedPL = 0;
    let totalRealizedPLYTD = 0;
    let totalGains = 0;
    let totalLosses = 0;

    for (const trade of allTrades) {
      const pl = tradesPLMap.get(trade._id);
      if (pl !== null && pl !== undefined) {
        totalRealizedPL += pl;
        
        // Check if trade is in YTD
        if (trade.date >= ytdStart) {
          totalRealizedPLYTD += pl;
        }
        
        // Track wins/losses for profit factor
        if (pl > 0) {
          totalGains += pl;
        } else if (pl < 0) {
          totalLosses += Math.abs(pl);
        }
      }
    }

    // Calculate campaign stats
    const closedCampaigns = allCampaigns.filter((c) => c.status === "closed");
    const openCampaigns = allCampaigns.filter(
      (c) => c.status === "planning" || c.status === "active"
    );

    // For winning campaigns, calculate P&L per campaign and determine if it's winning
    // A campaign is "winning" if its total realized P&L is positive
    let winningCampaignCount = 0;
    const campaignPLs: number[] = [];

    for (const campaign of closedCampaigns) {
      // Get trades for this campaign
      const campaignTrades = allTrades.filter(
        (t) => t.campaignId === campaign._id
      );
      
      // Sum P&L for campaign's trades
      let campaignPL = 0;
      for (const trade of campaignTrades) {
        const pl = tradesPLMap.get(trade._id);
        if (pl !== null && pl !== undefined) {
          campaignPL += pl;
        }
      }
      
      campaignPLs.push(campaignPL);
      if (campaignPL > 0) {
        winningCampaignCount++;
      }
    }

    // Calculate win rate (winning campaigns / closed campaigns × 100)
    const winRate =
      closedCampaigns.length > 0
        ? (winningCampaignCount / closedCampaigns.length) * 100
        : null;

    // Calculate average win/loss from campaign P&Ls
    const winningPLs = campaignPLs.filter((pl) => pl > 0);
    const losingPLs = campaignPLs.filter((pl) => pl < 0);

    const avgWin =
      winningPLs.length > 0
        ? winningPLs.reduce((sum, pl) => sum + pl, 0) / winningPLs.length
        : null;

    const avgLoss =
      losingPLs.length > 0
        ? losingPLs.reduce((sum, pl) => sum + pl, 0) / losingPLs.length
        : null;

    // Calculate profit factor (total gains / total losses)
    // Only defined if there are losses
    const profitFactor = totalLosses > 0 ? totalGains / totalLosses : null;

    return {
      avgLoss,
      avgWin,
      closedCampaignCount: closedCampaigns.length,
      openCampaignCount: openCampaigns.length,
      profitFactor,
      totalRealizedPL,
      totalRealizedPLYTD,
      totalTradeCount: allTrades.length,
      winRate,
      winningCampaignCount,
    };
  },
});
