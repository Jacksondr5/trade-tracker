import { v } from "convex/values";
import { mutation } from "../_generated/server";

export const run = mutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    dryRun: v.optional(v.boolean()),
    numItems: v.optional(v.number()),
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    patched: v.number(),
    scanned: v.number(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("notes").paginate({
      cursor: args.cursor,
      numItems: args.numItems ?? 100,
    });
    let patched = 0;

    for (const note of page.page) {
      if (note.noteDate !== undefined) {
        continue;
      }

      patched += 1;
      if (args.dryRun === true) {
        continue;
      }

      await ctx.db.patch(note._id, {
        noteDate: note._creationTime,
      });
    }

    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      patched,
      scanned: page.page.length,
    };
  },
});
