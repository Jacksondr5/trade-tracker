import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const retrospectiveValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("retrospectives"),
  content: v.string(),
  ownerId: v.string(),
  parentId: v.union(v.id("campaigns"), v.id("tradePlans")),
  parentKind: v.union(v.literal("campaign"), v.literal("tradePlan")),
  updatedAt: v.number(),
});

export const getRetrospective = query({
  args: {
    parentId: v.union(v.id("campaigns"), v.id("tradePlans")),
  },
  returns: v.union(retrospectiveValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const retro = await ctx.db
      .query("retrospectives")
      .withIndex("by_owner_parent", (q) =>
        q.eq("ownerId", ownerId).eq("parentId", args.parentId),
      )
      .unique();
    return retro ?? null;
  },
});

export const upsertRetrospective = mutation({
  args: {
    content: v.string(),
    parentId: v.union(v.id("campaigns"), v.id("tradePlans")),
    parentKind: v.union(v.literal("campaign"), v.literal("tradePlan")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);

    // Validate ownership of parent and lifecycle gating
    if (args.parentKind === "campaign") {
      const parentId = args.parentId as Id<"campaigns">;
      const campaign = assertOwner(
        await ctx.db.get(parentId),
        ownerId,
        "Campaign not found",
      );
      if (campaign.status !== "closed") {
        throw new ConvexError(
          "Retrospective can only be written for closed campaigns",
        );
      }
    } else {
      const parentId = args.parentId as Id<"tradePlans">;
      const tradePlan = assertOwner(
        await ctx.db.get(parentId),
        ownerId,
        "Trade plan not found",
      );
      if (tradePlan.status !== "closed") {
        throw new ConvexError(
          "Retrospective can only be written for closed trade plans",
        );
      }
    }

    const existing = await ctx.db
      .query("retrospectives")
      .withIndex("by_owner_parent", (q) =>
        q.eq("ownerId", ownerId).eq("parentId", args.parentId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("retrospectives", {
        content: args.content,
        ownerId,
        parentId: args.parentId,
        parentKind: args.parentKind,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});
