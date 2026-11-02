import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { derivePositionEpisodeState } from "./lib/openPositions";
import { listEpisodeTrades } from "./lib/planWrites";

const MAX_THREAD_EPISODES = 500;

const moveValidator = v.object({
  episodeId: v.id("episodes"),
  // The caller states every fill it believes the episode holds, so a fill that
  // arrived since the correction was decided stops the move.
  expectedTradeIds: v.array(v.id("trades")),
  mergeIntoEpisodeId: v.optional(v.id("episodes")),
  toPortfolioId: v.id("portfolios"),
});

function assertFlat(trades: Doc<"trades">[], what: string): void {
  const { isPlausible, netQuantity } = derivePositionEpisodeState(trades);
  if (!isPlausible) {
    throw new ConvexError(`${what} would close more than it holds`);
  }
  if (netQuantity !== 0) throw new ConvexError(`${what} is not flat`);
}

// Only an episode with nothing on it but its fills can change hands; anything
// the user or the counterpart wrote about it belongs to the portfolio it was
// written under.
async function assertBareClosedEpisode(
  ctx: MutationCtx,
  episode: Doc<"episodes">,
): Promise<void> {
  const label = `${episode.ticker} episode ${episode._id}`;
  if (episode.lifecycle !== "closed") {
    throw new ConvexError(`${label} is not closed`);
  }
  if (
    episode.campaignId !== undefined ||
    episode.campaignElementExemptions.length > 0 ||
    episode.currentPlanVersionId !== undefined ||
    episode.retrospective !== undefined
  ) {
    throw new ConvexError(`${label} carries a plan or campaign`);
  }
  const { _id: episodeId, ownerId } = episode;
  const reference =
    (await ctx.db
      .query("planElements")
      .withIndex("by_owner_episodeId_revision", (q) =>
        q.eq("ownerId", ownerId).eq("episodeId", episodeId),
      )
      .first()) ??
    (await ctx.db
      .query("planVersions")
      .withIndex("by_owner_episodeId_versionNumber", (q) =>
        q.eq("ownerId", ownerId).eq("episodeId", episodeId),
      )
      .first()) ??
    (await ctx.db
      .query("notes")
      .withIndex("by_owner_episodeId_noteDate", (q) =>
        q.eq("ownerId", ownerId).eq("episodeId", episodeId),
      )
      .first()) ??
    (await ctx.db
      .query("watchlist")
      .withIndex("by_owner_episodeId", (q) =>
        q.eq("ownerId", ownerId).eq("episodeId", episodeId),
      )
      .first());
  if (reference !== null) {
    throw new ConvexError(`${label} has elements, notes, or a watch on it`);
  }
}

async function assertNoOverlapInPortfolio(
  ctx: MutationCtx,
  args: {
    closedAt: number;
    episode: Doc<"episodes">;
    ignoredEpisodeIds: Id<"episodes">[];
    openedAt: number;
    portfolioId: Id<"portfolios">;
  },
): Promise<void> {
  const { episode } = args;
  const threadEpisodes = await ctx.db
    .query("episodes")
    .withIndex("by_owner_threadId", (q) =>
      q.eq("ownerId", episode.ownerId).eq("threadId", episode.threadId),
    )
    .take(MAX_THREAD_EPISODES);
  const overlapping = threadEpisodes.find(
    (other) =>
      !args.ignoredEpisodeIds.includes(other._id) &&
      other.portfolioId === args.portfolioId &&
      (other.direction === undefined ||
        episode.direction === undefined ||
        other.direction === episode.direction) &&
      other.openedAt <= args.closedAt &&
      (other.closedAt ?? Number.POSITIVE_INFINITY) >= args.openedAt,
  );
  if (overlapping) {
    throw new ConvexError(
      `${episode.ticker} episode ${episode._id} would overlap ${overlapping._id} in the destination portfolio`,
    );
  }
}

/**
 * Moves whole closed round trips to the portfolio they belong in. Moving one
 * fill at a time cannot do this: the first move leaves a closed episode
 * unflat, so it reopens history. All moves apply together or not at all.
 *
 * A trip whose dates overlap an episode in the destination merges into it,
 * since a portfolio never holds two overlapping episodes for one ticker and
 * direction; the emptied episode is deleted. Run with `dryRun` first.
 */
export const moveClosedRoundTrips = internalMutation({
  args: {
    dryRun: v.boolean(),
    moves: v.array(moveValidator),
    ownerId: v.string(),
  },
  returns: v.object({
    dryRun: v.boolean(),
    moves: v.array(
      v.object({
        episodeDeleted: v.boolean(),
        fromPortfolioId: v.id("portfolios"),
        resultEpisodeId: v.id("episodes"),
        resultFillCount: v.number(),
        ticker: v.string(),
        toPortfolioId: v.id("portfolios"),
        tradesMoved: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const results = [];
    for (const move of args.moves) {
      const episode = await ctx.db.get(move.episodeId);
      if (!episode || episode.ownerId !== args.ownerId) {
        throw new ConvexError(`Episode ${move.episodeId} not found`);
      }
      const destination = await ctx.db.get(move.toPortfolioId);
      if (!destination || destination.ownerId !== args.ownerId) {
        throw new ConvexError("Destination portfolio not found");
      }
      const fromPortfolioId = episode.portfolioId;
      if (!fromPortfolioId || fromPortfolioId === move.toPortfolioId) {
        throw new ConvexError(
          `${episode.ticker} episode ${episode._id} is not in another portfolio`,
        );
      }
      await assertBareClosedEpisode(ctx, episode);

      const trades = await listEpisodeTrades(ctx, args.ownerId, episode._id);
      const actualIds = trades.map((trade) => trade._id as string).sort();
      const expectedIds = [...move.expectedTradeIds]
        .map((tradeId) => tradeId as string)
        .sort();
      if (actualIds.join() !== expectedIds.join()) {
        throw new ConvexError(
          `${episode.ticker} episode ${episode._id} does not hold the expected fills`,
        );
      }
      if (trades.some((trade) => trade.portfolioId !== fromPortfolioId)) {
        throw new ConvexError(
          `${episode.ticker} episode ${episode._id} has a fill in another portfolio`,
        );
      }
      assertFlat(trades, `${episode.ticker} episode ${episode._id}`);

      let resultTrades = trades;
      let target: Doc<"episodes"> | null = null;
      if (move.mergeIntoEpisodeId) {
        target = await ctx.db.get(move.mergeIntoEpisodeId);
        if (
          !target ||
          target.ownerId !== args.ownerId ||
          target._id === episode._id ||
          target.threadId !== episode.threadId ||
          target.direction !== episode.direction ||
          target.lifecycle !== "closed" ||
          target.portfolioId !== move.toPortfolioId
        ) {
          throw new ConvexError(
            `${episode.ticker} episode ${episode._id} cannot merge into ${move.mergeIntoEpisodeId}`,
          );
        }
        resultTrades = [
          ...(await listEpisodeTrades(ctx, args.ownerId, target._id)),
          ...trades,
        ];
        assertFlat(resultTrades, `Merged ${episode.ticker} episode`);
      }
      const dates = resultTrades.map((trade) => trade.date);
      const openedAt = Math.min(...dates);
      const closedAt = Math.max(...dates);
      await assertNoOverlapInPortfolio(ctx, {
        closedAt,
        episode,
        ignoredEpisodeIds: target ? [episode._id, target._id] : [episode._id],
        openedAt,
        portfolioId: move.toPortfolioId,
      });

      const resultEpisodeId = target?._id ?? episode._id;
      if (!args.dryRun) {
        for (const trade of trades) {
          await ctx.db.patch(trade._id, {
            episodeId: resultEpisodeId,
            portfolioId: move.toPortfolioId,
          });
        }
        const now = Date.now();
        await ctx.db.patch(
          resultEpisodeId,
          target
            ? { closedAt, openedAt, updatedAt: now }
            : { portfolioId: move.toPortfolioId, updatedAt: now },
        );
        if (target) await ctx.db.delete(episode._id);
      }
      results.push({
        episodeDeleted: target !== null,
        fromPortfolioId,
        resultEpisodeId,
        resultFillCount: resultTrades.length,
        ticker: episode.ticker,
        toPortfolioId: move.toPortfolioId,
        tradesMoved: trades.length,
      });
    }
    return { dryRun: args.dryRun, moves: results };
  },
});
