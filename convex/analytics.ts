import { query } from "./_generated/server";
import { v } from "convex/values";
import { calculateTradesPL } from "./lib/plCalculation";

/**
 * Get dashboard statistics for portfolio analytics.
 *
 * Returns:
 * - totalRealizedPL: Total realized P&L from all trades
 * - totalRealizedPLYTD: Realized P&L from trades this year (Jan 1+)
 * - closedCampaignCount: Number of closed campaigns
 * - winningCampaignCount: Number of closed campaigns with positive P&L
 * - winRate: Winning campaigns / closed campaigns × 100 (null if no closed campaigns)
 * - avgWin: Average P&L of winning campaigns (null if no winners)
 * - avgLoss: Average P&L of losing campaigns (null if no losers)
 * - profitFactor: Total gains / total losses (null if no losses)
 * - openCampaignCount: Number of planning + active campaigns
 * - totalTradeCount: Total number of trades
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

    // Calculate P&L for all trades using shared helper
    const tradesPLMap = calculateTradesPL(allTrades);

    // Calculate total realized P&L
    let totalRealizedPL = 0;
    for (const [, pl] of tradesPLMap) {
      if (pl !== null) {
        totalRealizedPL += pl;
      }
    }

    // Calculate YTD realized P&L (trades with date >= Jan 1 of current year)
    const currentYear = new Date().getFullYear();
    const ytdStartTimestamp = new Date(currentYear, 0, 1).getTime();

    let totalRealizedPLYTD = 0;
    for (const trade of allTrades) {
      if (trade.date >= ytdStartTimestamp) {
        const pl = tradesPLMap.get(trade._id);
        if (pl !== null && pl !== undefined) {
          totalRealizedPLYTD += pl;
        }
      }
    }

    // Calculate P&L per campaign
    const campaignPLMap = new Map<string, number>();
    for (const trade of allTrades) {
      if (trade.campaignId) {
        const pl = tradesPLMap.get(trade._id);
        if (pl !== null && pl !== undefined) {
          const currentPL = campaignPLMap.get(trade.campaignId) ?? 0;
          campaignPLMap.set(trade.campaignId, currentPL + pl);
        }
      }
    }

    // Count campaigns by status and P&L
    let closedCampaignCount = 0;
    let openCampaignCount = 0;
    let winningCampaignCount = 0;
    let losingCampaignCount = 0;
    let totalWins = 0;
    let totalLosses = 0;

    for (const campaign of allCampaigns) {
      if (campaign.status === "closed") {
        closedCampaignCount++;
        const campaignPL = campaignPLMap.get(campaign._id) ?? 0;

        if (campaignPL > 0) {
          winningCampaignCount++;
          totalWins += campaignPL;
        } else if (campaignPL < 0) {
          losingCampaignCount++;
          totalLosses += Math.abs(campaignPL);
        }
      } else {
        // planning or active
        openCampaignCount++;
      }
    }

    // Calculate win rate (percentage)
    const winRate =
      closedCampaignCount > 0
        ? (winningCampaignCount / closedCampaignCount) * 100
        : null;

    // Calculate average win and average loss
    const avgWin =
      winningCampaignCount > 0 ? totalWins / winningCampaignCount : null;
    const avgLoss =
      losingCampaignCount > 0
        ? -(totalLosses / losingCampaignCount)
        : null;

    // Calculate profit factor (total gains / total losses)
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : null;

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
