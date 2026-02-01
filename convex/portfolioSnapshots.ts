import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Validator for portfolio snapshot return type
const portfolioSnapshotValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("portfolioSnapshots"),
  cashBalance: v.optional(v.number()),
  date: v.number(),
  source: v.union(v.literal("manual"), v.literal("calculated"), v.literal("api")),
  totalValue: v.number(),
});

export const createSnapshot = mutation({
  args: {
    cashBalance: v.optional(v.number()),
    date: v.number(),
    totalValue: v.number(),
  },
  returns: v.id("portfolioSnapshots"),
  handler: async (ctx, args) => {
    const snapshotId = await ctx.db.insert("portfolioSnapshots", {
      cashBalance: args.cashBalance,
      date: args.date,
      source: "manual",
      totalValue: args.totalValue,
    });

    return snapshotId;
  },
});

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
