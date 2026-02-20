import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

// Validator for campaign note document returned from queries
const campaignNoteValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("campaignNotes"),
  campaignId: v.id("campaigns"),
  content: v.string(),
  ownerId: v.optional(v.string()),
});

/**
 * Add a new note to a campaign.
 */
export const addNote = mutation({
  args: {
    campaignId: v.id("campaigns"),
    content: v.string(),
  },
  returns: v.id("campaignNotes"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { campaignId, content } = args;

    // Verify campaign exists
    const campaign = await ctx.db.get(campaignId);
    assertOwner(campaign, ownerId, "Campaign not found");

    const noteId = await ctx.db.insert("campaignNotes", {
      campaignId,
      content,
      ownerId,
    });

    return noteId;
  },
});

/**
 * Update an existing campaign note.
 */
export const updateNote = mutation({
  args: {
    content: v.string(),
    noteId: v.id("campaignNotes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const note = await ctx.db.get(args.noteId);
    assertOwner(note, ownerId, "Note not found");

    await ctx.db.patch(args.noteId, {
      content: args.content,
      ownerId,
    });

    return null;
  },
});

/**
 * Get all notes for a campaign, sorted by _creationTime ascending (oldest first).
 */
export const getNotesByCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.array(campaignNoteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    assertOwner(campaign, ownerId, "Campaign not found");

    const notes = await ctx.db
      .query("campaignNotes")
      .withIndex("by_owner_campaignId", (q) =>
        q.eq("ownerId", ownerId).eq("campaignId", args.campaignId),
      )
      .collect();

    // Sort by _creationTime ascending (oldest first) for chronological display
    return notes.sort((a, b) => a._creationTime - b._creationTime);
  },
});
