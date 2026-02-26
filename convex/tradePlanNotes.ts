import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

// Validator for trade plan note document returned from queries
const tradePlanNoteValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("tradePlanNotes"),
  content: v.string(),
  ownerId: v.string(),
  tradePlanId: v.id("tradePlans"),
});

function normalizeNoteContent(content: string): string {
  const normalized = content.trim();
  if (!normalized) {
    throw new Error("Note content cannot be empty");
  }

  return normalized;
}

/**
 * Add a new note to a trade plan.
 */
export const addNote = mutation({
  args: {
    content: v.string(),
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.id("tradePlanNotes"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { tradePlanId } = args;
    const content = normalizeNoteContent(args.content);

    // Verify trade plan exists
    const tradePlan = await ctx.db.get(tradePlanId);
    assertOwner(tradePlan, ownerId, "Trade plan not found");

    const noteId = await ctx.db.insert("tradePlanNotes", {
      content,
      ownerId,
      tradePlanId,
    });

    return noteId;
  },
});

/**
 * Update an existing trade plan note.
 */
export const updateNote = mutation({
  args: {
    content: v.string(),
    noteId: v.id("tradePlanNotes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const note = await ctx.db.get(args.noteId);
    assertOwner(note, ownerId, "Note not found");

    await ctx.db.patch(args.noteId, {
      content: normalizeNoteContent(args.content),
    });

    return null;
  },
});

/**
 * Get all notes for a trade plan, sorted by _creationTime ascending (oldest first).
 */
export const getNotesByTradePlan = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.array(tradePlanNoteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan || tradePlan.ownerId !== ownerId) {
      return [];
    }

    return await ctx.db
      .query("tradePlanNotes")
      .withIndex("by_owner_tradePlanId", (q) =>
        q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
      )
      .collect();
  },
});
