import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";

const KNOWN_BRAVOS_ORPHAN_SOURCE_URL =
  "https://bravosresearch.com/news-feed/initiating-long-on-deere-company-de-potential-breakout/";
const MAX_REVIEW_ITEMS_TO_INSPECT = 500;

function actionTargetsPlan(
  action: Doc<"bravosReviewItems">["proposedAction"] | undefined,
  tradePlanId: Id<"tradePlans">,
) {
  return (
    (action?.kind === "apply_follow_up" || action?.kind === "note_only") &&
    action.targetTradePlanId === tradePlanId
  );
}

/**
 * Private, one-off repair for the single Bravos orphan found after the broad
 * cleanup completed. It deliberately accepts only a note/task pair with the
 * exact provenance shape and refuses unresolved references or user content.
 */
export const repairKnownBravosOrphan = internalMutation({
  args: {
    dryRun: v.boolean(),
    importTaskId: v.id("importTasks"),
    missingTradePlanId: v.id("tradePlans"),
    noteId: v.id("notes"),
  },
  returns: v.object({
    clearedCreatedImportTaskPlanIds: v.number(),
    deletedNotes: v.number(),
    patchedImportTasks: v.number(),
  }),
  handler: async (ctx, args) => {
    const [note, importTask, missingTradePlan] = await Promise.all([
      ctx.db.get(args.noteId),
      ctx.db.get(args.importTaskId),
      ctx.db.get(args.missingTradePlanId),
    ]);

    if (missingTradePlan) {
      throw new ConvexError(
        "Bravos orphan repair refused: referenced trade plan still exists",
      );
    }
    if (!note || !importTask) {
      throw new ConvexError(
        "Bravos orphan repair refused: expected note or import task is missing",
      );
    }
    if (
      note.ownerId !== importTask.ownerId ||
      note.tradePlanId !== args.missingTradePlanId ||
      note.content !==
        `Imported from service post: ${KNOWN_BRAVOS_ORPHAN_SOURCE_URL}` ||
      importTask.mode !== "create" ||
      importTask.status !== "done" ||
      importTask.sourceUrl !== KNOWN_BRAVOS_ORPHAN_SOURCE_URL ||
      importTask.createdTradePlanId !== args.missingTradePlanId ||
      importTask.tradePlanId !== undefined
    ) {
      throw new ConvexError(
        "Bravos orphan repair refused: records no longer match the approved provenance",
      );
    }

    const [reviewItems, watchlistItems, retrospectives] = await Promise.all([
      ctx.db
        .query("bravosReviewItems")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", note.ownerId))
        .take(MAX_REVIEW_ITEMS_TO_INSPECT + 1),
      ctx.db
        .query("watchlist")
        .withIndex("by_owner_tradePlanId", (q) =>
          q
            .eq("ownerId", note.ownerId)
            .eq("tradePlanId", args.missingTradePlanId),
        )
        .take(1),
      ctx.db
        .query("retrospectives")
        .withIndex("by_owner_parent", (q) =>
          q.eq("ownerId", note.ownerId).eq("parentId", args.missingTradePlanId),
        )
        .take(1),
    ]);
    if (reviewItems.length > MAX_REVIEW_ITEMS_TO_INSPECT) {
      throw new ConvexError(
        "Bravos orphan repair review history exceeds its bounded safety limit",
      );
    }
    const hasReviewReference = reviewItems.some(
      (item) =>
        item.appliedNoteId === note._id ||
        item.appliedTradePlanId === args.missingTradePlanId ||
        item.suggestedTradePlanId === args.missingTradePlanId ||
        actionTargetsPlan(item.proposedAction, args.missingTradePlanId) ||
        actionTargetsPlan(item.approvedAction, args.missingTradePlanId),
    );
    if (hasReviewReference) {
      throw new ConvexError(
        "Bravos orphan repair refused: a review item still references the orphan",
      );
    }
    if (watchlistItems.length > 0 || retrospectives.length > 0) {
      throw new ConvexError(
        "Bravos orphan repair refused: a user-content reference still targets the orphan",
      );
    }

    if (!args.dryRun) {
      await ctx.db.patch(importTask._id, { createdTradePlanId: undefined });
      await ctx.db.delete(note._id);
    }

    return {
      clearedCreatedImportTaskPlanIds: 1,
      deletedNotes: 1,
      patchedImportTasks: 1,
    };
  },
});
