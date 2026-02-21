import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";

// Validator for portfolio snapshot return type
const portfolioSnapshotValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("portfolioSnapshots"),
  cashBalance: v.optional(v.number()),
  date: v.number(),
  ownerId: v.string(),
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
    const ownerId = await requireUser(ctx);
    const snapshotId = await ctx.db.insert("portfolioSnapshots", {
      cashBalance: args.cashBalance,
      date: args.date,
      ownerId,
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
    const ownerId = await requireUser(ctx);
    const snapshots = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_owner_date", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();

    return snapshots;
  },
});
