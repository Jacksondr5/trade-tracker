import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const generalNoteValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("generalNotes"),
  content: v.string(),
  ownerId: v.string(),
});

/**
 * Get all general notes for the authenticated user, sorted by _creationTime ascending.
 */
export const getNotes = query({
  args: {},
  returns: v.array(generalNoteValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);

    const notes = await ctx.db
      .query("generalNotes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    return notes.sort((a, b) => a._creationTime - b._creationTime);
  },
});

/**
 * Normalize and validate note content.
 */
const trimNoteContent = (content: string) => {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Note content is required");
  }
  return trimmed;
};

/**
 * Add a new general note.
 */
export const addNote = mutation({
  args: {
    content: v.string(),
  },
  returns: v.id("generalNotes"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);

    const noteId = await ctx.db.insert("generalNotes", {
      content: trimNoteContent(args.content),
      ownerId,
    });

    return noteId;
  },
});

/**
 * Update an existing general note.
 */
export const updateNote = mutation({
  args: {
    content: v.string(),
    noteId: v.id("generalNotes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const note = await ctx.db.get(args.noteId);
    assertOwner(note, ownerId, "Note not found");

    await ctx.db.patch(args.noteId, {
      content: trimNoteContent(args.content),
    });

    return null;
  },
});
