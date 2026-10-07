import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { getEasternDateString } from "./lib/ibkrSchedule";
import { getPositionQuantityDelta } from "./lib/openPositions";
import { listEpisodeTrades, recomputeEpisodeLifecycle } from "./lib/planWrites";
import { tradeValidator } from "./lib/tradeValidator";

// A manual entry and its brokerage import describe one execution when they
// agree on everything but the exact fill price.
const MAX_PRICE_DIFFERENCE_RATIO = 0.005;
const MAX_REFERENCE_ROWS = 5_000;
const MAX_OPEN_FETCH_JOBS = 1_000;

// A scan that hits its ceiling may have missed a reference, and deleting the
// trade would then leave it dangling.
function assertFullyScanned(rows: unknown[], limit: number, what: string) {
  if (rows.length > limit) {
    throw new ConvexError(`Too many ${what} to check for references`);
  }
}

function assertSameExecution(
  duplicate: Doc<"trades">,
  survivor: Doc<"trades">,
): void {
  const mismatch = (what: string) =>
    new ConvexError(`Not the same execution: ${what} differs`);
  if (duplicate._id === survivor._id) {
    throw new ConvexError("A trade cannot be a duplicate of itself");
  }
  if (duplicate.ticker.toUpperCase() !== survivor.ticker.toUpperCase()) {
    throw mismatch("ticker");
  }
  if (duplicate.side !== survivor.side) throw mismatch("side");
  if (duplicate.direction !== survivor.direction) throw mismatch("direction");
  if (duplicate.assetType !== survivor.assetType) throw mismatch("asset type");
  if (Math.abs(duplicate.quantity - survivor.quantity) > 1e-9) {
    throw mismatch("quantity");
  }
  if (
    getEasternDateString(duplicate.date) !== getEasternDateString(survivor.date)
  ) {
    throw mismatch("trade date");
  }
  if (
    Math.abs(duplicate.price - survivor.price) >
    survivor.price * MAX_PRICE_DIFFERENCE_RATIO
  ) {
    throw mismatch("price");
  }
}

/**
 * Removes a hand-entered trade that a brokerage import also recorded. The
 * import is authoritative: references to the manual entry move to it, and the
 * manual entry is deleted. It refuses anything that is not plainly the same
 * execution, and anything where the row to delete is not a manual entry or
 * the row to keep is not a brokerage import.
 *
 * Episodes are not restructured here. The manual entry's episode has its
 * lifecycle recomputed; run `threads:rebuildBareEpisodes` afterwards so
 * untouched backfilled episodes are re-cut from the corrected fills.
 * Portfolio valuations for the affected dates need a recompute as well.
 */
export const removeDuplicateManualTrade = internalMutation({
  args: {
    duplicateTradeId: v.id("trades"),
    ownerId: v.string(),
    survivorTradeId: v.id("trades"),
  },
  returns: v.object({
    checkInsRepointed: v.number(),
    fetchJobsRepointed: v.number(),
    priceMarksRepointed: v.number(),
    removed: tradeValidator,
  }),
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.get(args.duplicateTradeId);
    const survivor = await ctx.db.get(args.survivorTradeId);
    if (
      !duplicate ||
      !survivor ||
      duplicate.ownerId !== args.ownerId ||
      survivor.ownerId !== args.ownerId
    ) {
      throw new ConvexError("Trade not found");
    }
    if ((duplicate.source ?? "manual") !== "manual") {
      throw new ConvexError(
        "Only a manual entry can be removed as a duplicate",
      );
    }
    if (survivor.source !== "ibkr" && survivor.source !== "kraken") {
      throw new ConvexError("The trade to keep must be a brokerage import");
    }
    assertSameExecution(duplicate, survivor);

    // A closed episode must stay flat without the duplicate; otherwise the
    // history needs a deliberate correction, not a silent one.
    const episode = duplicate.episodeId
      ? await ctx.db.get(duplicate.episodeId)
      : null;
    if (episode?.lifecycle === "closed") {
      const remaining = (
        await listEpisodeTrades(ctx, args.ownerId, episode._id)
      ).filter((trade) => trade._id !== duplicate._id);
      const net = remaining.reduce(
        (total, trade) => total + getPositionQuantityDelta(trade),
        0,
      );
      if (Math.abs(net) > 1e-9) {
        throw new ConvexError(
          "Removing this entry would leave its closed episode open",
        );
      }
    }

    let priceMarksRepointed = 0;
    if (duplicate.portfolioId) {
      const marks = await ctx.db
        .query("portfolioPriceMarks")
        .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
          q
            .eq("ownerId", args.ownerId)
            .eq("portfolioId", duplicate.portfolioId!),
        )
        .take(MAX_REFERENCE_ROWS + 1);
      assertFullyScanned(marks, MAX_REFERENCE_ROWS, "price marks");
      for (const mark of marks) {
        if (mark.sourceTradeId !== duplicate._id) continue;
        await ctx.db.patch(mark._id, {
          price: survivor.price,
          sourceTradeId: survivor._id,
          updatedAt: Date.now(),
        });
        priceMarksRepointed += 1;
      }
    }

    // Finished fetch jobs keep their ids as history; only jobs that may still
    // run are repointed.
    let fetchJobsRepointed = 0;
    for (const status of ["pending", "leased", "failed"] as const) {
      const jobs = await ctx.db
        .query("marketDataFetchJobs")
        .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
          q.eq("ownerId", args.ownerId).eq("status", status),
        )
        .take(MAX_OPEN_FETCH_JOBS + 1);
      assertFullyScanned(jobs, MAX_OPEN_FETCH_JOBS, `${status} fetch jobs`);
      for (const job of jobs) {
        if (!job.sourceTradeIds.includes(duplicate._id)) continue;
        await ctx.db.patch(job._id, {
          sourceTradeIds: [
            ...new Set(
              job.sourceTradeIds.map((id) =>
                id === duplicate._id ? survivor._id : id,
              ),
            ),
          ],
        });
        fetchJobsRepointed += 1;
      }
    }

    let checkInsRepointed = 0;
    const checkIns = await ctx.db
      .query("checkIns")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .take(MAX_REFERENCE_ROWS + 1);
    assertFullyScanned(checkIns, MAX_REFERENCE_ROWS, "check-ins");
    for (const checkIn of checkIns) {
      const surfaced = checkIn.surfacedTradeIds ?? [];
      if (!surfaced.includes(duplicate._id)) continue;
      await ctx.db.patch(checkIn._id, {
        surfacedTradeIds: [
          ...new Set(
            surfaced.map((id) => (id === duplicate._id ? survivor._id : id)),
          ),
        ],
      });
      checkInsRepointed += 1;
    }

    await ctx.db.delete(duplicate._id);
    if (episode && episode.lifecycle !== "closed") {
      await recomputeEpisodeLifecycle(ctx, episode._id);
    }

    return {
      checkInsRepointed,
      fetchJobsRepointed,
      priceMarksRepointed,
      removed: duplicate,
    };
  },
});
