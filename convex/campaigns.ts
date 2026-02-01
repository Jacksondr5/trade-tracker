import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { calculateTradesPL } from "./lib/plCalculation";

// Reusable validators for nested objects (matching schema.ts)
const instrumentValidator = v.object({
  notes: v.optional(v.string()),
  ticker: v.string(),
  underlying: v.optional(v.string()),
});

const targetValidator = v.object({
  notes: v.optional(v.string()),
  percentage: v.optional(v.number()),
  price: v.number(),
  ticker: v.string(),
});

const stopLossValidator = v.object({
  price: v.number(),
  reason: v.optional(v.string()),
  setAt: v.number(),
  ticker: v.string(),
});

// Validator for campaign document returned from queries
const campaignValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("campaigns"),
  closedAt: v.optional(v.number()),
  entryTargets: v.array(targetValidator),
  instruments: v.array(instrumentValidator),
  name: v.string(),
  outcome: v.optional(
    v.union(
      v.literal("manual"),
      v.literal("profit_target"),
      v.literal("stop_loss"),
    ),
  ),
  profitTargets: v.array(targetValidator),
  retrospective: v.optional(v.string()),
  status: v.union(
    v.literal("active"),
    v.literal("closed"),
    v.literal("planning"),
  ),
  stopLossHistory: v.array(stopLossValidator),
  thesis: v.string(),
});

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

/**
 * List all campaigns sorted by _creationTime descending (newest first).
 */
export const listCampaigns = query({
  args: {},
  returns: v.array(campaignValidator),
  handler: async (ctx) => {
    const campaigns = await ctx.db.query("campaigns").order("desc").collect();

    return campaigns;
  },
});

/**
 * List campaigns filtered by status, sorted by _creationTime descending.
 */
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

    // Sort by _creationTime descending since we can't use two indexes
    return campaigns.sort((a, b) => b._creationTime - a._creationTime);
  },
});

/**
 * Get a single campaign by ID with all nested data.
 */
export const getCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.union(campaignValidator, v.null()),
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    return campaign;
  },
});

/**
 * List campaigns that are planning or active (not closed).
 * For use in dropdowns when linking trades to campaigns.
 */
export const listOpenCampaigns = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("campaigns"),
      name: v.string(),
      status: v.union(v.literal("active"), v.literal("planning")),
    }),
  ),
  handler: async (ctx) => {
    const campaigns = await ctx.db.query("campaigns").order("desc").collect();

    // Filter to only planning and active campaigns, map to minimal shape
    return campaigns
      .filter((c) => c.status === "planning" || c.status === "active")
      .map((c) => ({
        _id: c._id,
        name: c.name,
        status: c.status as "active" | "planning",
      }));
  },
});

/**
 * Add an instrument to a campaign.
 * Prevents duplicate tickers in the same campaign.
 */
export const addInstrument = mutation({
  args: {
    campaignId: v.id("campaigns"),
    notes: v.optional(v.string()),
    ticker: v.string(),
    underlying: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaignId, notes, underlying } = args;
    // Normalize ticker: trim and uppercase for consistent comparison and storage
    const normalizedTicker = args.ticker.trim().toUpperCase();

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    // Check for duplicate ticker (compare normalized values)
    const existingInstrument = campaign.instruments.find(
      (i) => i.ticker.toUpperCase() === normalizedTicker,
    );
    if (existingInstrument) {
      throw new Error(`Instrument with ticker "${normalizedTicker}" already exists in this campaign`);
    }

    // Add the new instrument to the array with normalized ticker
    const newInstrument = {
      notes,
      ticker: normalizedTicker,
      underlying,
    };

    await ctx.db.patch(campaignId, {
      instruments: [...campaign.instruments, newInstrument],
    });

    return null;
  },
});

/**
 * Remove an instrument from a campaign by ticker.
 */
export const removeInstrument = mutation({
  args: {
    campaignId: v.id("campaigns"),
    ticker: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaignId } = args;
    // Normalize ticker for consistent comparison
    const normalizedTicker = args.ticker.trim().toUpperCase();

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    // Filter out the instrument with the specified ticker (compare normalized values)
    const updatedInstruments = campaign.instruments.filter(
      (i) => i.ticker.toUpperCase() !== normalizedTicker,
    );

    // Check if the instrument was found
    if (updatedInstruments.length === campaign.instruments.length) {
      throw new Error(`Instrument with ticker "${normalizedTicker}" not found in this campaign`);
    }

    await ctx.db.patch(campaignId, {
      instruments: updatedInstruments,
    });

    return null;
  },
});

/**
 * Add an entry target to a campaign.
 */
export const addEntryTarget = mutation({
  args: {
    campaignId: v.id("campaigns"),
    notes: v.optional(v.string()),
    percentage: v.optional(v.number()),
    price: v.number(),
    ticker: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaignId, notes, percentage, price, ticker } = args;

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const newTarget = {
      notes,
      percentage,
      price,
      ticker,
    };

    await ctx.db.patch(campaignId, {
      entryTargets: [...campaign.entryTargets, newTarget],
    });

    return null;
  },
});

/**
 * Remove an entry target from a campaign by index.
 */
export const removeEntryTarget = mutation({
  args: {
    campaignId: v.id("campaigns"),
    index: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaignId, index } = args;

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    if (index < 0 || index >= campaign.entryTargets.length) {
      throw new Error(`Invalid entry target index: ${index}`);
    }

    const updatedTargets = campaign.entryTargets.filter((_, i) => i !== index);

    await ctx.db.patch(campaignId, {
      entryTargets: updatedTargets,
    });

    return null;
  },
});

/**
 * Add a profit target to a campaign.
 */
export const addProfitTarget = mutation({
  args: {
    campaignId: v.id("campaigns"),
    notes: v.optional(v.string()),
    percentage: v.optional(v.number()),
    price: v.number(),
    ticker: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaignId, notes, percentage, price, ticker } = args;

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const newTarget = {
      notes,
      percentage,
      price,
      ticker,
    };

    await ctx.db.patch(campaignId, {
      profitTargets: [...campaign.profitTargets, newTarget],
    });

    return null;
  },
});

/**
 * Remove a profit target from a campaign by index.
 */
export const removeProfitTarget = mutation({
  args: {
    campaignId: v.id("campaigns"),
    index: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaignId, index } = args;

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    if (index < 0 || index >= campaign.profitTargets.length) {
      throw new Error(`Invalid profit target index: ${index}`);
    }

    const updatedTargets = campaign.profitTargets.filter((_, i) => i !== index);

    await ctx.db.patch(campaignId, {
      profitTargets: updatedTargets,
    });

    return null;
  },
});

/**
 * Get P&L statistics for a campaign.
 * Calculates total realized P&L and trade counts from linked trades.
 */
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
    const { campaignId } = args;

    // Get all trades linked to this campaign
    const campaignTrades = await ctx.db
      .query("trades")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", campaignId))
      .collect();

    // Get ALL trades to calculate accurate P&L (position tracking needs full history)
    const allTrades = await ctx.db.query("trades").collect();

    // Calculate P&L using shared helper
    const tradesPLMap = calculateTradesPL(allTrades);

    // Calculate campaign stats from trades linked to this campaign
    let realizedPL = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    for (const trade of campaignTrades) {
      const pl = tradesPLMap.get(trade._id);
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
      tradeCount: campaignTrades.length,
      winningTrades,
    };
  },
});

/**
 * Add a stop loss entry to a campaign's stop loss history.
 * Stop losses are append-only to preserve history.
 */
export const addStopLoss = mutation({
  args: {
    campaignId: v.id("campaigns"),
    price: v.number(),
    reason: v.optional(v.string()),
    ticker: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaignId, price, reason, ticker } = args;

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const newStopLoss = {
      price,
      reason,
      setAt: Date.now(),
      ticker,
    };

    await ctx.db.patch(campaignId, {
      stopLossHistory: [...campaign.stopLossHistory, newStopLoss],
    });

    return null;
  },
});
