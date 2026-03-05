import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";

const strategyDocValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("strategyDoc"),
  content: v.string(),
  ownerId: v.string(),
  updatedAt: v.number(),
});

export const get = query({
  args: {},
  returns: v.union(strategyDocValidator, v.null()),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const doc = await ctx.db
      .query("strategyDoc")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    return doc;
  },
});

export const save = mutation({
  args: {
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const existing = await ctx.db
      .query("strategyDoc")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("strategyDoc", {
        content: args.content,
        ownerId,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
