import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

// Temporary migration surface for removing legacy trade-attached notes
// before the follow-up schema PR removes `tradeId` from the notes model.
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const DEFAULT_SAMPLE_SIZE = 20;
const MAX_SAMPLE_SIZE = 100;

const tradeAttachedNoteSampleValidator = v.object({
  createdAt: v.number(),
  noteId: v.id("notes"),
  ownerId: v.string(),
  tradeId: v.id("trades"),
});

function normalizePositiveInt(args: {
  fallback: number;
  max: number;
  name: string;
  value: number | undefined;
}): number {
  const value = args.value ?? args.fallback;

  if (!Number.isInteger(value) || value <= 0) {
    throw new ConvexError(`${args.name} must be a positive integer`);
  }

  if (value > args.max) {
    throw new ConvexError(`${args.name} must be ${args.max} or less`);
  }

  return value;
}

async function listTradeAttachedNotes(
  ctx: QueryCtx | MutationCtx,
) {
  const notes = await ctx.db.query("notes").collect();

  return notes
    .filter((note) => note.tradeId !== undefined)
    .sort((a, b) => a._creationTime - b._creationTime);
}

export const getTradeAttachedNotesSummary = internalQuery({
  args: {
    sampleSize: v.optional(v.number()),
  },
  returns: v.object({
    sample: v.array(tradeAttachedNoteSampleValidator),
    totalCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const sampleSize = normalizePositiveInt({
      fallback: DEFAULT_SAMPLE_SIZE,
      max: MAX_SAMPLE_SIZE,
      name: "sampleSize",
      value: args.sampleSize,
    });
    const tradeAttachedNotes = await listTradeAttachedNotes(ctx);

    return {
      sample: tradeAttachedNotes.slice(0, sampleSize).map((note) => ({
        createdAt: note._creationTime,
        noteId: note._id,
        ownerId: note.ownerId,
        tradeId: note.tradeId!,
      })),
      totalCount: tradeAttachedNotes.length,
    };
  },
});

export const deleteTradeAttachedNotesBatch = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    deletedCount: v.number(),
    deletedNoteIds: v.array(v.id("notes")),
    hasMore: v.boolean(),
    remainingCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const batchSize = normalizePositiveInt({
      fallback: DEFAULT_BATCH_SIZE,
      max: MAX_BATCH_SIZE,
      name: "batchSize",
      value: args.batchSize,
    });
    const tradeAttachedNotes = await listTradeAttachedNotes(ctx);
    const notesToDelete = tradeAttachedNotes.slice(0, batchSize);

    for (const note of notesToDelete) {
      await ctx.db.delete(note._id);
    }

    const remainingCount = tradeAttachedNotes.length - notesToDelete.length;

    return {
      deletedCount: notesToDelete.length,
      deletedNoteIds: notesToDelete.map((note) => note._id),
      hasMore: remainingCount > 0,
      remainingCount,
    };
  },
});
