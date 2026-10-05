import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import {
  deriveInstrumentPositionEpisodes,
  getPositionQuantityDelta,
  MAX_DERIVED_POSITION_TRADES,
} from "./lib/openPositions";
import {
  elementAuthorValidator,
  elementValueValidator,
  planSectionsValidator,
} from "./lib/planModel";
import {
  buildDesk,
  deskValidator,
  elementView,
  elementViewValidator,
  getOwnedThreadByTicker,
  listThreadCampaignLinks,
  MAX_THREADS,
  planVersionView,
  planVersionViewValidator,
  resolveThread,
  resolvedThreadValidator,
  threadSummaryValidator,
} from "./lib/planReads";
import {
  draftPlanVersion,
  endorsePlanVersion,
  ensureThread,
  ensureThreadWithStatus,
  getOwnedEpisode,
  MAX_THREAD_EPISODES,
  openEpisode,
  planModelError,
  recordElements,
  recomputeEpisodeLifecycle,
  setElementStatus,
  shelveEpisode,
} from "./lib/planWrites";

const MAX_BACKFILL_NOTES = 20_000;
const MAX_RESET_EPISODES = 5_000;

const backfillResultValidator = v.object({
  episodesCreated: v.number(),
  threadsCreated: v.number(),
  // Fills whose history disagrees across portfolios, or closes more than it
  // opened, stay unlinked instead of being guessed into an episode.
  tradesLeftUncertain: v.number(),
  tradesLinked: v.number(),
  tradesWithoutPortfolio: v.number(),
  uncertainTickers: v.array(v.string()),
});

/** App edits stop when an episode closes; closed history is read-only. */
async function assertEpisodeEditableFromApp(
  ctx: MutationCtx,
  ownerId: string,
  episodeId: Id<"episodes">,
) {
  const episode = await getOwnedEpisode(ctx, ownerId, episodeId);
  if (episode.lifecycle === "closed") {
    throw planModelError("CONFLICT", "A closed episode is read-only");
  }
  return episode;
}

const threadListItemValidator = threadSummaryValidator.extend({
  activeEpisodeCount: v.number(),
  episodeCount: v.number(),
  episodesTruncated: v.boolean(),
  liveEpisodeCount: v.number(),
});

export const listThreads = query({
  args: {},
  returns: v.array(threadListItemValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const threads = await ctx.db
      .query("instrumentThreads")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(MAX_THREADS + 1);
    if (threads.length > MAX_THREADS) {
      throw new Error(`Thread count exceeds the ${MAX_THREADS}-row limit`);
    }
    const campaignLinks = await listThreadCampaignLinks(ctx, ownerId);
    const items = await Promise.all(
      threads.map(async (thread) => {
        const rows = await ctx.db
          .query("episodes")
          .withIndex("by_owner_threadId", (q) =>
            q.eq("ownerId", ownerId).eq("threadId", thread._id),
          )
          .take(MAX_THREAD_EPISODES + 1);
        const episodes = rows.slice(0, MAX_THREAD_EPISODES);
        return {
          activeEpisodeCount: episodes.filter(
            (episode) => episode.lifecycle === "active",
          ).length,
          campaigns: campaignLinks.get(thread._id) ?? [],
          createdAt: thread.createdAt,
          episodeCount: episodes.length,
          episodesTruncated: rows.length > MAX_THREAD_EPISODES,
          id: thread._id,
          liveEpisodeCount: episodes.filter(
            (episode) =>
              episode.lifecycle !== "closed" && episode.shelvedAt === undefined,
          ).length,
          ticker: thread.ticker,
        };
      }),
    );
    return items.sort(
      (a, b) =>
        b.activeEpisodeCount - a.activeEpisodeCount ||
        b.liveEpisodeCount - a.liveEpisodeCount ||
        a.ticker.localeCompare(b.ticker),
    );
  },
});

export const getThreadPage = query({
  args: { ticker: v.string() },
  returns: v.union(resolvedThreadValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const thread = await getOwnedThreadByTicker(ctx, ownerId, args.ticker);
    if (!thread) return null;
    return await resolveThread(ctx, thread);
  },
});

export const getDesk = query({
  args: {},
  returns: deskValidator,
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    return await buildDesk(ctx, ownerId);
  },
});

// App edits are attributed to the user and supersede rather than overwrite,
// so the counterpart sees the change and its history.

export const recordElementFromApp = mutation({
  args: {
    asOf: v.optional(v.string()),
    author: v.optional(elementAuthorValidator),
    episodeId: v.id("episodes"),
    kind: v.optional(v.string()),
    statement: v.string(),
    status: v.union(v.literal("proposed"), v.literal("agreed")),
    supersedes: v.optional(v.id("planElements")),
    value: v.optional(elementValueValidator),
  },
  returns: elementViewValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    await assertEpisodeEditableFromApp(ctx, ownerId, args.episodeId);
    const [elementId] = await recordElements(ctx, {
      actor: "user",
      elements: [
        {
          asOf: args.asOf,
          author: args.author ?? "user",
          kind: args.kind,
          statement: args.statement,
          status: args.status,
          supersedes: args.supersedes,
          value: args.value,
        },
      ],
      ownerId,
      scope: { episodeId: args.episodeId, kind: "episode" },
      source: "app",
    });
    return elementView((await ctx.db.get(elementId!))!);
  },
});

export const setElementStatusFromApp = mutation({
  args: {
    elementId: v.id("planElements"),
    evidence: v.optional(v.string()),
    status: v.union(v.literal("agreed"), v.literal("dropped")),
  },
  returns: elementViewValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const element = await ctx.db.get(args.elementId);
    if (!element || element.ownerId !== ownerId) {
      throw planModelError("NOT_FOUND", "Element not found");
    }
    if (element.episodeId) {
      await assertEpisodeEditableFromApp(ctx, ownerId, element.episodeId);
    }
    return elementView(
      await setElementStatus(ctx, {
        actor: "user",
        elementId: args.elementId,
        evidence: args.evidence,
        ownerId,
        status: args.status,
      }),
    );
  },
});

/**
 * A user edit to a plan produces a new endorsed version. The editor sends the
 * version it opened from and the latest revision it saw, so a save over
 * decisions recorded in the meantime is refused instead of overwriting them.
 */
export const savePlanVersionFromApp = mutation({
  args: {
    baseVersionNumber: v.union(v.number(), v.null()),
    episodeId: v.id("episodes"),
    observedRevision: v.number(),
    sections: planSectionsValidator,
  },
  returns: planVersionViewValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    await assertEpisodeEditableFromApp(ctx, ownerId, args.episodeId);
    const version = await draftPlanVersion(ctx, {
      actor: "user",
      baseVersionNumber: args.baseVersionNumber,
      endorsed: true,
      episodeId: args.episodeId,
      observedRevision: args.observedRevision,
      ownerId,
      sections: args.sections,
      source: "app",
    });
    return planVersionView(version);
  },
});

export const endorsePlanVersionFromApp = mutation({
  args: { episodeId: v.id("episodes"), versionNumber: v.number() },
  returns: planVersionViewValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    await assertEpisodeEditableFromApp(ctx, ownerId, args.episodeId);
    return planVersionView(
      await endorsePlanVersion(ctx, {
        actor: "user",
        episodeId: args.episodeId,
        ownerId,
        versionNumber: args.versionNumber,
      }),
    );
  },
});

export const setEpisodeShelvedFromApp = mutation({
  args: { episodeId: v.id("episodes"), shelved: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    await shelveEpisode(ctx, {
      actor: "user",
      episodeId: args.episodeId,
      ownerId,
      shelved: args.shelved,
      source: "app",
    });
    return null;
  },
});

export const openEpisodeFromApp = mutation({
  args: {
    portfolioId: v.optional(v.id("portfolios")),
    ticker: v.string(),
  },
  returns: v.id("episodes"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    if (args.portfolioId) {
      assertOwner(await ctx.db.get(args.portfolioId), ownerId, "Portfolio not found");
    }
    const thread = await ensureThread(ctx, ownerId, args.ticker, "user");
    const episode = await openEpisode(ctx, {
      actor: "user",
      ownerId,
      portfolioId: args.portfolioId,
      source: "user",
      threadId: thread._id,
      ticker: thread.ticker,
    });
    return episode._id;
  },
});

export const ensureThreadFromApp = mutation({
  args: { ticker: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const thread = await ensureThread(ctx, ownerId, args.ticker, "user");
    return thread.ticker;
  },
});

/**
 * Auto-creates threads for every traded or note-tagged ticker and bare
 * episodes for every flat-to-flat position run per portfolio and direction.
 * Idempotent: trades already linked to an episode are left alone, so it can
 * be run after deploy and again at any time.
 */
export async function backfillThreadsAndEpisodesForOwner(
  ctx: MutationCtx,
  ownerId: string,
): Promise<{
  episodesCreated: number;
  threadsCreated: number;
  tradesLeftUncertain: number;
  tradesLinked: number;
  tradesWithoutPortfolio: number;
  uncertainTickers: string[];
}> {
  const trades = await ctx.db
    .query("trades")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(MAX_DERIVED_POSITION_TRADES + 1);
  if (trades.length > MAX_DERIVED_POSITION_TRADES) {
    throw new ConvexError(
      `Backfill exceeds the ${MAX_DERIVED_POSITION_TRADES}-trade limit`,
    );
  }
  const notes = await ctx.db
    .query("notes")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(MAX_BACKFILL_NOTES + 1);
  if (notes.length > MAX_BACKFILL_NOTES) {
    throw new ConvexError(
      `Backfill exceeds the ${MAX_BACKFILL_NOTES}-note limit`,
    );
  }

  const tickers = new Set<string>();
  for (const trade of trades) tickers.add(trade.ticker.toUpperCase());
  for (const note of notes) {
    if (note.ticker) tickers.add(note.ticker.toUpperCase());
  }
  const threadsByTicker = new Map<string, Doc<"instrumentThreads">>();
  let threadsCreated = 0;
  for (const ticker of tickers) {
    const result = await ensureThreadWithStatus(ctx, ownerId, ticker, "system");
    if (result.created) threadsCreated += 1;
    threadsByTicker.set(ticker, result.thread);
  }

  let episodesCreated = 0;
  let tradesLinked = 0;
  let tradesWithoutPortfolio = 0;
  // Groups that already have an episode were handled by live linking; any
  // fill still unlinked there was left unlinked on purpose (late or ambiguous)
  // and must not be turned into a phantom episode on a rerun.
  const linkedGroups = new Set(
    trades
      .filter((trade) => trade.episodeId !== undefined)
      .map(
        (trade) =>
          `${trade.portfolioId}:${trade.ticker.toUpperCase()}:${trade.direction}`,
      ),
  );
  const unlinked = trades.filter((trade) => trade.episodeId === undefined);
  const byPortfolio = new Map<string, Doc<"trades">[]>();
  for (const trade of unlinked) {
    if (trade.portfolioId === undefined) {
      tradesWithoutPortfolio += 1;
      continue;
    }
    if (
      linkedGroups.has(
        `${trade.portfolioId}:${trade.ticker.toUpperCase()}:${trade.direction}`,
      )
    ) {
      continue;
    }
    const key = `${trade.portfolioId}`;
    byPortfolio.set(key, [...(byPortfolio.get(key) ?? []), trade]);
  }

  // What the ticker's fills say overall, across every portfolio. A
  // per-portfolio open run is only trusted when the open runs for that
  // instrument add up to this; older history often has a buy in one
  // portfolio and its sell in another, which per portfolio looks like an
  // open long beside a negative position. Uncertain history stays unlinked
  // rather than being guessed into an episode.
  const instrumentKey = (trade: Doc<"trades">) =>
    `${trade.ticker.toUpperCase()}:${trade.direction}`;
  // Same 12-decimal normalization as the position math, with a tolerance so
  // fractional fills that sum to dust read as flat.
  const FLAT_EPSILON = 1e-9;
  const round = (value: number) => {
    const normalized = Number(value.toFixed(12));
    return Math.abs(normalized) < FLAT_EPSILON ? 0 : normalized;
  };
  const expectedOpenNet = new Map<string, number>();
  for (const trade of trades) {
    // Fills already linked are accounted for by their own episodes, and a
    // fill deliberately left unlinked in an already-linked group is that
    // group's question, not evidence against another portfolio's run.
    if (trade.episodeId !== undefined) continue;
    if (
      trade.portfolioId !== undefined &&
      linkedGroups.has(
        `${trade.portfolioId}:${trade.ticker.toUpperCase()}:${trade.direction}`,
      )
    ) {
      continue;
    }
    const key = instrumentKey(trade);
    expectedOpenNet.set(
      key,
      round((expectedOpenNet.get(key) ?? 0) + getPositionQuantityDelta(trade)),
    );
  }

  type Run = { net: number; plausible: boolean; trades: Doc<"trades">[] };
  const closedRuns: Run[] = [];
  const openRunsByInstrument = new Map<string, Run[]>();
  const uncertainTickers = new Set<string>();
  let tradesLeftUncertain = 0;

  for (const portfolioTrades of byPortfolio.values()) {
    const runsByInstrument = deriveInstrumentPositionEpisodes(portfolioTrades);
    for (const state of runsByInstrument.values()) {
      // Walk the ordered trades and cut a run at each flat point.
      let current: Run = { net: 0, plausible: true, trades: [] };
      const runs: Run[] = [];
      for (const trade of state.orderedTrades) {
        current.trades.push(trade);
        current.net = round(current.net + getPositionQuantityDelta(trade));
        // A run that ever goes negative closed more than it opened.
        if (current.net < 0) current.plausible = false;
        if (current.net === 0) {
          runs.push(current);
          current = { net: 0, plausible: true, trades: [] };
        }
      }
      if (current.trades.length > 0) runs.push(current);

      for (const run of runs) {
        const key = instrumentKey(run.trades[0]!);
        if (!run.plausible) {
          tradesLeftUncertain += run.trades.length;
          uncertainTickers.add(run.trades[0]!.ticker.toUpperCase());
        } else if (run.net === 0) {
          closedRuns.push(run);
        } else {
          openRunsByInstrument.set(key, [
            ...(openRunsByInstrument.get(key) ?? []),
            run,
          ]);
        }
      }
    }
  }

  const trustedRuns = [...closedRuns];
  for (const [key, runs] of openRunsByInstrument) {
    const openNet = round(runs.reduce((total, run) => total + run.net, 0));
    if (Math.abs(openNet - (expectedOpenNet.get(key) ?? 0)) < 1e-6) {
      trustedRuns.push(...runs);
    } else {
      for (const run of runs) {
        tradesLeftUncertain += run.trades.length;
        uncertainTickers.add(run.trades[0]!.ticker.toUpperCase());
      }
    }
  }

  trustedRuns.sort((a, b) => a.trades[0]!.date - b.trades[0]!.date);
  for (const run of trustedRuns) {
    const first = run.trades[0]!;
    const thread = threadsByTicker.get(first.ticker.toUpperCase())!;
    const episode = await openEpisode(ctx, {
      actor: "system",
      direction: first.direction,
      openedAt: first.date,
      ownerId,
      portfolioId: first.portfolioId,
      provenance: "backfill",
      source: "user",
      threadId: thread._id,
      ticker: first.ticker,
    });
    episodesCreated += 1;
    for (const trade of run.trades) {
      await ctx.db.patch(trade._id, { episodeId: episode._id });
      tradesLinked += 1;
    }
    await recomputeEpisodeLifecycle(ctx, episode._id);
  }

  return {
    episodesCreated,
    threadsCreated,
    tradesLeftUncertain,
    tradesLinked,
    tradesWithoutPortfolio,
    uncertainTickers: [...uncertainTickers].sort(),
  };
}

/**
 * Removes episodes the backfill created that nothing has touched since: no
 * elements, plan versions, notes, campaign, shelving, or watchlist entry.
 * Their fills become unlinked again so the backfill can be re-run with
 * corrected rules. Anything a person or the Trade Assistant has worked on
 * is left exactly as it is, and so is every episode a live fill opened:
 * rebuilding those could re-link a late fill that was deliberately left out.
 *
 * `includeUnmarked` also takes system episodes written before provenance was
 * recorded. It exists for the one production run made before the marker; the
 * caller must have verified those episodes all came from the backfill.
 */
export async function resetBareBackfilledEpisodesForOwner(
  ctx: MutationCtx,
  ownerId: string,
  options: { includeUnmarked?: boolean } = {},
): Promise<{ episodesKept: number; episodesRemoved: number; tradesUnlinked: number }> {
  const episodes = await ctx.db
    .query("episodes")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(MAX_RESET_EPISODES + 1);
  if (episodes.length > MAX_RESET_EPISODES) {
    throw new ConvexError(
      `Reset exceeds the ${MAX_RESET_EPISODES}-episode limit`,
    );
  }
  let episodesKept = 0;
  let episodesRemoved = 0;
  let tradesUnlinked = 0;
  for (const episode of episodes) {
    const backfilled =
      episode.provenance === "backfill" ||
      (options.includeUnmarked === true && episode.provenance === undefined);
    const untouched =
      backfilled &&
      episode.createdBy === "system" &&
      episode.campaignId === undefined &&
      episode.shelvedAt === undefined &&
      episode.currentPlanVersionId === undefined &&
      (await ctx.db
        .query("planElements")
        .withIndex("by_owner_episodeId_revision", (q) =>
          q.eq("ownerId", ownerId).eq("episodeId", episode._id),
        )
        .first()) === null &&
      (await ctx.db
        .query("planVersions")
        .withIndex("by_owner_episodeId_versionNumber", (q) =>
          q.eq("ownerId", ownerId).eq("episodeId", episode._id),
        )
        .first()) === null &&
      (await ctx.db
        .query("notes")
        .withIndex("by_owner_episodeId_noteDate", (q) =>
          q.eq("ownerId", ownerId).eq("episodeId", episode._id),
        )
        .first()) === null &&
      (await ctx.db
        .query("watchlist")
        .withIndex("by_owner_episodeId", (q) =>
          q.eq("ownerId", ownerId).eq("episodeId", episode._id),
        )
        .first()) === null;
    if (!untouched) {
      episodesKept += 1;
      continue;
    }
    const linked = await ctx.db
      .query("trades")
      .withIndex("by_owner_episodeId", (q) =>
        q.eq("ownerId", ownerId).eq("episodeId", episode._id),
      )
      .take(MAX_DERIVED_POSITION_TRADES);
    for (const trade of linked) {
      await ctx.db.patch(trade._id, { episodeId: undefined });
      tradesUnlinked += 1;
    }
    await ctx.db.delete(episode._id);
    episodesRemoved += 1;
  }
  return { episodesKept, episodesRemoved, tradesUnlinked };
}


export const backfillThreadsAndEpisodes = internalMutation({
  args: { ownerId: v.string() },
  returns: backfillResultValidator,
  handler: async (ctx, args) => {
    return await backfillThreadsAndEpisodesForOwner(ctx, args.ownerId);
  },
});

/**
 * Clears untouched backfilled episodes and backfills again in one
 * transaction. Use after the backfill rules change; it never removes an
 * episode that carries any planning.
 */
export const rebuildBareEpisodes = internalMutation({
  args: {
    // Also rebuild system episodes written before provenance was recorded.
    includeUnmarked: v.optional(v.boolean()),
    ownerId: v.string(),
  },
  returns: v.object({
    backfill: backfillResultValidator,
    reset: v.object({
      episodesKept: v.number(),
      episodesRemoved: v.number(),
      tradesUnlinked: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const reset = await resetBareBackfilledEpisodesForOwner(ctx, args.ownerId, {
      includeUnmarked: args.includeUnmarked,
    });
    const backfill = await backfillThreadsAndEpisodesForOwner(ctx, args.ownerId);
    return { backfill, reset };
  },
});

export const backfillThreadsAndEpisodesForCurrentUser = mutation({
  args: {},
  returns: backfillResultValidator,
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    return await backfillThreadsAndEpisodesForOwner(ctx, ownerId);
  },
});
