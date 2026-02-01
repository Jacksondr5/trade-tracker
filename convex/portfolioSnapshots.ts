import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Validator for portfolio snapshot document returned from queries
const portfolioSnapshotValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("portfolioSnapshots"),
  cashBalance: v.optional(v.number()),
  date: v.number(),
  source: v.union(
    v.literal("api"),
    v.literal("calculated"),
    v.literal("manual"),
  ),
  totalValue: v.number(),
});

/**
 * Create a new portfolio snapshot.
 * Source is set to 'manual' for user-entered snapshots.
 */
export const createSnapshot = mutation({
  args: {
    cashBalance: v.optional(v.number()),
    date: v.number(),
    totalValue: v.number(),
  },
  returns: v.id("portfolioSnapshots"),
  handler: async (ctx, args) => {
    const { cashBalance, date, totalValue } = args;

    const snapshotId = await ctx.db.insert("portfolioSnapshots", {
      cashBalance,
      date,
      source: "manual",
      totalValue,
    });

    return snapshotId;
  },
});

/**
 * List all portfolio snapshots sorted by date descending (newest first).
 */
export const listSnapshots = query({
  args: {},
  returns: v.array(portfolioSnapshotValidator),
  handler: async (ctx) => {
    const snapshots = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_date")
      .order("desc")
      .collect();

    return snapshots;
  },
});

/**
 * Get the most recent portfolio snapshot.
 */
export const getLatestSnapshot = query({
  args: {},
  returns: v.union(portfolioSnapshotValidator, v.null()),
  handler: async (ctx) => {
    const snapshot = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_date")
      .order("desc")
      .first();

    return snapshot;
  },
});
