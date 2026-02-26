import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const noteValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("notes"),
  campaignId: v.optional(v.id("campaigns")),
  chartUrls: v.optional(v.array(v.string())),
  content: v.string(),
  ownerId: v.string(),
  tradeId: v.optional(v.id("trades")),
  tradePlanId: v.optional(v.id("tradePlans")),
});

function trimNoteContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Note content is required");
  }
  return trimmed;
}

function validateSingleParent(args: {
  campaignId?: string;
  tradePlanId?: string;
  tradeId?: string;
}) {
  const parentCount = [args.campaignId, args.tradePlanId, args.tradeId].filter(
    Boolean,
  ).length;
  if (parentCount > 1) {
    throw new Error("A note can only belong to one parent");
  }
}

export const addNote = mutation({
  args: {
    campaignId: v.optional(v.id("campaigns")),
    chartUrls: v.optional(v.array(v.string())),
    content: v.string(),
    tradeId: v.optional(v.id("trades")),
    tradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: v.id("notes"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const content = trimNoteContent(args.content);
    validateSingleParent(args);

    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      assertOwner(campaign, ownerId, "Campaign not found");
    }
    if (args.tradePlanId) {
      const tradePlan = await ctx.db.get(args.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }
    if (args.tradeId) {
      const trade = await ctx.db.get(args.tradeId);
      assertOwner(trade, ownerId, "Trade not found");
    }

    return await ctx.db.insert("notes", {
      campaignId: args.campaignId,
      chartUrls: args.chartUrls,
      content,
      ownerId,
      tradeId: args.tradeId,
      tradePlanId: args.tradePlanId,
    });
  },
});

export const updateNote = mutation({
  args: {
    chartUrls: v.optional(v.array(v.string())),
    content: v.optional(v.string()),
    noteId: v.id("notes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const note = await ctx.db.get(args.noteId);
    assertOwner(note, ownerId, "Note not found");

    const patch: Record<string, unknown> = {};
    if (args.content !== undefined) {
      patch.content = trimNoteContent(args.content);
    }
    if (args.chartUrls !== undefined) {
      patch.chartUrls = args.chartUrls;
    }

    await ctx.db.patch(args.noteId, patch);
    return null;
  },
});

export const getNotesByCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) return [];

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner_campaignId", (q) =>
        q.eq("ownerId", ownerId).eq("campaignId", args.campaignId),
      )
      .collect();

    return notes.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const getNotesByTradePlan = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan || tradePlan.ownerId !== ownerId) return [];

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner_tradePlanId", (q) =>
        q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
      )
      .collect();

    return notes.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const getNotesByTrade = query({
  args: {
    tradeId: v.id("trades"),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const trade = await ctx.db.get(args.tradeId);
    if (!trade || trade.ownerId !== ownerId) return [];

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner_tradeId", (q) =>
        q.eq("ownerId", ownerId).eq("tradeId", args.tradeId),
      )
      .collect();

    return notes.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const getGeneralNotes = query({
  args: {},
  returns: v.array(noteValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);

    const allOwnerNotes = await ctx.db
      .query("notes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("asc")
      .collect();

    return allOwnerNotes.filter(
      (n) => !n.campaignId && !n.tradePlanId && !n.tradeId,
    );
  },
});
