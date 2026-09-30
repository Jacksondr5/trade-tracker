import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  derivePositionEpisodeState,
  getPositionQuantityDelta,
} from "./openPositions";
import {
  effectiveRevision,
  MAX_ELEMENT_STATEMENT_LENGTH,
  MAX_PLAN_LINES_PER_SECTION,
  MAX_PLAN_LINE_LENGTH,
  PLAN_SECTION_KEYS,
  elementRequiresAsOf,
  inferEpisodeLifecycle,
  isAllowedStatusTransition,
  isIsoDate,
  isLevelBearingElement,
  isOpenElementStatus,
  normalizeTicker,
  type Actor,
  type ElementAuthor,
  type ElementValue,
  type PlanSections,
  type WriteSource,
} from "./planModel";

export type PlanModelErrorCode = "CONFLICT" | "NOT_FOUND" | "VALIDATION";

export type PlanModelErrorDetails = {
  /** Set when a correction would reopen a closed episode and needs consent. */
  reopenRequired?: boolean;
  reopenEpisodeId?: string;
  staleAgreedElementIds?: string[];
};

/**
 * Reopens a closed episode because a corrected fill shows it was never flat,
 * and records why as a visible item so the reopening is never silent.
 */
async function reopenEpisodeForCorrection(
  ctx: MutationCtx,
  args: {
    actor: Actor;
    episodeId: Id<"episodes">;
    ownerId: string;
    trade: Doc<"trades">;
  },
): Promise<void> {
  const remaining = await listEpisodeTrades(ctx, args.ownerId, args.episodeId);
  const netQuantity = derivePositionEpisodeState(remaining).netQuantity;
  assertNotOverClosed(netQuantity, args.trade.ticker);
  if (netQuantity === 0) {
    // Still flat after the correction: stays closed, with its dates refreshed.
    if (remaining.length > 0) {
      await ctx.db.patch(args.episodeId, {
        closedAt: Math.max(...remaining.map((row) => row.date)),
        openedAt: Math.min(...remaining.map((row) => row.date)),
        updatedAt: Date.now(),
      });
    }
    return;
  }
  await ctx.db.patch(args.episodeId, {
    closedAt: undefined,
    lifecycle: "active",
    updatedAt: Date.now(),
  });
  const day = new Date(args.trade.date).toISOString().slice(0, 10);
  await recordElements(ctx, {
    actor: args.actor,
    elements: [
      {
        author: "user",
        kind: "correction",
        statement: `Reopened: a correction to the ${args.trade.side} of ${args.trade.quantity} ${args.trade.ticker} on ${day} left the position open`,
        status: "agreed",
      },
    ],
    ownerId: args.ownerId,
    scope: { episodeId: args.episodeId, kind: "episode" },
    source: args.actor === "user" ? "app" : "conversation",
  });
  await recomputeEpisodeLifecycle(ctx, args.episodeId);
}

/** A correction can never leave a closed episode holding a negative position. */
function assertNotOverClosed(netQuantity: number, ticker: string): void {
  if (netQuantity < 0) {
    throw planModelError(
      "VALIDATION",
      `This change would close more ${ticker} than the episode opened`,
    );
  }
}

function reopenRequiredError(
  trade: Doc<"trades">,
  episodeId: Id<"episodes">,
): ConvexError<PlanModelErrorData> {
  return planModelError(
    "CONFLICT",
    `This fill belongs to a closed ${trade.ticker} episode, and the change would leave that position open. Confirm reopening the episode to save it.`,
    { reopenEpisodeId: episodeId, reopenRequired: true },
  );
}

export type PlanModelErrorData = {
  code: PlanModelErrorCode;
  details?: PlanModelErrorDetails;
  message: string;
};

export function planModelError(
  code: PlanModelErrorCode,
  message: string,
  details?: PlanModelErrorDetails,
): ConvexError<PlanModelErrorData> {
  return new ConvexError<PlanModelErrorData>(
    details ? { code, details, message } : { code, message },
  );
}

export function isPlanModelError(
  error: unknown,
): error is ConvexError<PlanModelErrorData> {
  return (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data &&
    "message" in error.data
  );
}

// Write ceilings. Reads stay bounded to the same numbers and flag truncation,
// so no single record can grow past what a resolved read can return.
type StatusHistoryEntry = NonNullable<Doc<"planElements">["statusHistory"]>[number];

function appendStatusHistory(
  element: Pick<Doc<"planElements">, "statusHistory">,
  entry: StatusHistoryEntry,
): StatusHistoryEntry[] {
  return [...(element.statusHistory ?? []), entry];
}

export const MAX_EPISODE_ELEMENTS = 2_000;
export const MAX_CAMPAIGN_ELEMENTS = 500;
export const MAX_EPISODE_TRADES = 5_000;
export const MAX_THREAD_EPISODES = 500;

// Revisions are a per-owner monotonic sequence so ordering and linking never
// depend on clock arithmetic.
export async function allocateRevision(
  ctx: MutationCtx,
  ownerId: string,
): Promise<number> {
  const counter = await ctx.db
    .query("revisionCounters")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
  if (!counter) {
    await ctx.db.insert("revisionCounters", { next: 2, ownerId });
    return 1;
  }
  await ctx.db.patch(counter._id, { next: counter.next + 1 });
  return counter.next;
}

export async function ensureThreadWithStatus(
  ctx: MutationCtx,
  ownerId: string,
  rawTicker: string,
  actor: Actor,
): Promise<{ created: boolean; thread: Doc<"instrumentThreads"> }> {
  const ticker = normalizeTicker(rawTicker);
  if (!ticker) throw planModelError("VALIDATION", "ticker is required");
  const existing = await ctx.db
    .query("instrumentThreads")
    .withIndex("by_owner_ticker", (q) =>
      q.eq("ownerId", ownerId).eq("ticker", ticker),
    )
    .unique();
  if (existing) return { created: false, thread: existing };
  const threadId = await ctx.db.insert("instrumentThreads", {
    createdAt: Date.now(),
    createdBy: actor,
    ownerId,
    ticker,
  });
  return { created: true, thread: (await ctx.db.get(threadId))! };
}

export async function ensureThread(
  ctx: MutationCtx,
  ownerId: string,
  rawTicker: string,
  actor: Actor,
): Promise<Doc<"instrumentThreads">> {
  return (await ensureThreadWithStatus(ctx, ownerId, rawTicker, actor)).thread;
}

export async function getOwnedEpisode(
  ctx: MutationCtx,
  ownerId: string,
  episodeId: Id<"episodes">,
): Promise<Doc<"episodes">> {
  const episode = await ctx.db.get(episodeId);
  if (!episode || episode.ownerId !== ownerId) {
    throw planModelError("NOT_FOUND", "Episode not found");
  }
  return episode;
}

export async function getOwnedCampaign(
  ctx: MutationCtx,
  ownerId: string,
  campaignId: Id<"campaigns">,
): Promise<Doc<"campaigns">> {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.ownerId !== ownerId) {
    throw planModelError("NOT_FOUND", "Campaign not found");
  }
  return campaign;
}

export async function listEpisodeElements(
  ctx: MutationCtx,
  ownerId: string,
  episodeId: Id<"episodes">,
): Promise<Doc<"planElements">[]> {
  // The write ceiling in recordElements keeps this within one bounded read.
  return await ctx.db
    .query("planElements")
    .withIndex("by_owner_episodeId_revision", (q) =>
      q.eq("ownerId", ownerId).eq("episodeId", episodeId),
    )
    .take(MAX_EPISODE_ELEMENTS);
}

async function countScopeElements(
  ctx: MutationCtx,
  ownerId: string,
  scope: ElementScope,
): Promise<number> {
  const rows =
    scope.kind === "episode"
      ? await ctx.db
          .query("planElements")
          .withIndex("by_owner_episodeId_revision", (q) =>
            q.eq("ownerId", ownerId).eq("episodeId", scope.episodeId),
          )
          .take(MAX_EPISODE_ELEMENTS + 1)
      : await ctx.db
          .query("planElements")
          .withIndex("by_owner_campaignId_revision", (q) =>
            q.eq("ownerId", ownerId).eq("campaignId", scope.campaignId),
          )
          .take(MAX_CAMPAIGN_ELEMENTS + 1);
  return rows.length;
}

export async function listEpisodeTrades(
  ctx: MutationCtx,
  ownerId: string,
  episodeId: Id<"episodes">,
): Promise<Doc<"trades">[]> {
  const trades = await ctx.db
    .query("trades")
    .withIndex("by_owner_episodeId", (q) =>
      q.eq("ownerId", ownerId).eq("episodeId", episodeId),
    )
    .take(MAX_EPISODE_TRADES + 1);
  if (trades.length > MAX_EPISODE_TRADES) {
    throw new Error(
      `Episode trade count exceeds the ${MAX_EPISODE_TRADES}-trade limit`,
    );
  }
  return trades;
}

/**
 * Re-derives an episode's lifecycle from its linked fills, agreed entry
 * elements, and endorsed checkpoint. Fills win; the user never sets it.
 */
export async function recomputeEpisodeLifecycle(
  ctx: MutationCtx,
  episodeId: Id<"episodes">,
): Promise<Doc<"episodes">> {
  const episode = await ctx.db.get(episodeId);
  if (!episode) throw planModelError("NOT_FOUND", "Episode not found");
  // Closed is terminal. A corrected or moved fill never reopens history; a
  // later fill opens a new episode instead.
  if (episode.lifecycle === "closed") return episode;
  const [trades, elements] = await Promise.all([
    listEpisodeTrades(ctx, episode.ownerId, episodeId),
    listEpisodeElements(ctx, episode.ownerId, episodeId),
  ]);
  const positionState = derivePositionEpisodeState(trades);
  const lifecycle = inferEpisodeLifecycle({
    hasAgreedEntryElement: elements.some(
      (element) => element.status === "agreed" && isLevelBearingElement(element),
    ),
    hasEndorsedPlan: episode.currentPlanVersionId !== undefined,
    hasLinkedTrades: trades.length > 0,
    netQuantity: positionState.netQuantity,
  });

  const patch: Partial<Doc<"episodes">> = {};
  if (lifecycle !== episode.lifecycle) {
    patch.lifecycle = lifecycle;
    patch.closedAt =
      lifecycle === "closed"
        ? Math.max(...trades.map((trade) => trade.date))
        : undefined;
  }
  if (trades.length > 0) {
    const firstTrade = positionState.orderedTrades[0]!;
    if (episode.direction === undefined) patch.direction = firstTrade.direction;
    if (episode.portfolioId === undefined && firstTrade.portfolioId) {
      patch.portfolioId = firstTrade.portfolioId;
    }
    // A shelved idea that later fills is live again; fills beat dispositions.
    if (episode.shelvedAt !== undefined) {
      patch.shelvedAt = undefined;
      patch.shelvedBy = undefined;
      patch.shelvedSource = undefined;
    }
    if (episode.openedAt > firstTrade.date) patch.openedAt = firstTrade.date;
  }
  if (Object.keys(patch).length === 0) return episode;
  await ctx.db.patch(episodeId, { ...patch, updatedAt: Date.now() });
  return (await ctx.db.get(episodeId))!;
}

export async function openEpisode(
  ctx: MutationCtx,
  args: {
    actor: Actor;
    campaignId?: Id<"campaigns">;
    direction?: "long" | "short";
    openedAt?: number;
    ownerId: string;
    portfolioId?: Id<"portfolios">;
    source: "user" | "external";
    threadId: Id<"instrumentThreads">;
    ticker: string;
  },
): Promise<Doc<"episodes">> {
  const existing = await ctx.db
    .query("episodes")
    .withIndex("by_owner_threadId", (q) =>
      q.eq("ownerId", args.ownerId).eq("threadId", args.threadId),
    )
    .take(MAX_THREAD_EPISODES);
  if (existing.length >= MAX_THREAD_EPISODES) {
    throw planModelError(
      "VALIDATION",
      `A thread may hold at most ${MAX_THREAD_EPISODES} episodes`,
    );
  }
  const now = Date.now();
  const episodeId = await ctx.db.insert("episodes", {
    campaignElementExemptions: [],
    campaignId: args.campaignId,
    createdBy: args.actor,
    direction: args.direction,
    lifecycle: "idea",
    openedAt: args.openedAt ?? now,
    ownerId: args.ownerId,
    portfolioId: args.portfolioId,
    revision: await allocateRevision(ctx, args.ownerId),
    source: args.source,
    threadId: args.threadId,
    ticker: normalizeTicker(args.ticker),
    updatedAt: now,
  });
  return (await ctx.db.get(episodeId))!;
}

function episodeAcceptsTrade(
  episode: Doc<"episodes">,
  trade: Pick<Doc<"trades">, "direction" | "portfolioId">,
): boolean {
  if (episode.lifecycle === "closed") return false;
  if (episode.direction !== undefined && episode.direction !== trade.direction) {
    return false;
  }
  return (
    episode.portfolioId === undefined ||
    episode.portfolioId === trade.portfolioId
  );
}

async function listThreadEpisodesForLinking(
  ctx: MutationCtx,
  ownerId: string,
  threadId: Id<"instrumentThreads">,
): Promise<Doc<"episodes">[]> {
  // The write ceiling in openEpisode keeps this within one bounded read.
  return await ctx.db
    .query("episodes")
    .withIndex("by_owner_threadId", (q) =>
      q.eq("ownerId", ownerId).eq("threadId", threadId),
    )
    .take(MAX_THREAD_EPISODES);
}

/**
 * Keeps a trade attached to the right episode after any trade write. Trades
 * without a portfolio stay unlinked: an unattributed fill is tolerated data,
 * not a reason to guess an episode. A late fill dated before the open
 * episode began, or inside a closed episode's span, also stays unlinked;
 * wrong linkage fabricates history, an unlinked trade does not.
 */
export async function syncTradeEpisodeLink(
  ctx: MutationCtx,
  tradeId: Id<"trades">,
  options: {
    actor?: Actor;
    /**
     * Consent to reopen a closed episode when a correction shows it was never
     * flat. Without it such a correction is refused with reopenRequired.
     */
    allowReopen?: boolean;
  } = {},
): Promise<Id<"episodes"> | null> {
  const trade = await ctx.db.get(tradeId);
  if (!trade) return null;
  const previousEpisodeId = trade.episodeId;
  const previousEpisode = previousEpisodeId
    ? await ctx.db.get(previousEpisodeId)
    : null;

  // Every traded ticker gets a thread, even when the fill cannot be placed.
  const thread = await ensureThread(ctx, trade.ownerId, trade.ticker, "system");
  let targetEpisodeId: Id<"episodes"> | undefined;
  if (trade.portfolioId !== undefined) {
    const stillFits =
      previousEpisode !== null &&
      previousEpisode.ownerId === trade.ownerId &&
      previousEpisode.threadId === thread._id &&
      previousEpisode.portfolioId === trade.portfolioId &&
      (previousEpisode.direction === undefined ||
        previousEpisode.direction === trade.direction);
    if (previousEpisode?.lifecycle === "closed" && stillFits) {
      // Closed history changes only deliberately. A correction that keeps the
      // episode flat just refreshes its dates; one that leaves a position
      // open reopens it, and only with consent.
      const remainingTrades = await listEpisodeTrades(
        ctx,
        trade.ownerId,
        previousEpisode._id,
      );
      const netQuantity =
        derivePositionEpisodeState(remainingTrades).netQuantity;
      assertNotOverClosed(netQuantity, trade.ticker);
      if (netQuantity !== 0) {
        if (!options.allowReopen) {
          throw reopenRequiredError(trade, previousEpisode._id);
        }
        await reopenEpisodeForCorrection(ctx, {
          actor: options.actor ?? "user",
          episodeId: previousEpisode._id,
          ownerId: trade.ownerId,
          trade,
        });
        return previousEpisode._id;
      }
      await ctx.db.patch(previousEpisode._id, {
        closedAt: Math.max(...remainingTrades.map((row) => row.date)),
        openedAt: Math.min(...remainingTrades.map((row) => row.date)),
        updatedAt: Date.now(),
      });
      return previousEpisode._id;
    }
    // The execution-date rules apply to every placement, including a fill
    // that is already linked and is being corrected: a fill inside a closed
    // episode's span belongs to that history and is left unlinked rather
    // than attached anywhere, and a fill dated before its open episode began
    // is left for the conversation to sort.
    const threadEpisodes = await listThreadEpisodesForLinking(
      ctx,
      trade.ownerId,
      thread._id,
    );
    const insideClosedSpan = threadEpisodes.some(
      (episode) =>
        episode.lifecycle === "closed" &&
        episode.portfolioId === trade.portfolioId &&
        (episode.direction === undefined ||
          episode.direction === trade.direction) &&
        trade.date >= episode.openedAt &&
        episode.closedAt !== undefined &&
        trade.date <= episode.closedAt,
    );
    if (insideClosedSpan) {
      targetEpisodeId = undefined;
    } else if (stillFits && trade.date >= previousEpisode.openedAt) {
      targetEpisodeId = previousEpisode._id;
    } else {
      const accepting = threadEpisodes.filter((episode) =>
        episodeAcceptsTrade(episode, trade),
      );
      const candidates = accepting.filter(
        (episode) => trade.date >= episode.openedAt,
      );
      const exactMatch = candidates.find(
        (episode) => episode.portfolioId === trade.portfolioId,
      );
      const adoptable = candidates.find(
        (episode) => episode.portfolioId === undefined,
      );
      // An open episode that began after this fill means the fill belongs to
      // neither it nor whatever closed before it.
      const predatesOpenEpisode = accepting.length > candidates.length;
      // A closing-side fill never starts an engagement; with no open episode
      // to join it stays unlinked instead of becoming a negative position.
      const isClosingFill = getPositionQuantityDelta(trade) < 0;
      const target =
        exactMatch ??
        adoptable ??
        (predatesOpenEpisode || isClosingFill
          ? null
          : await openEpisode(ctx, {
              actor: "system",
              direction: trade.direction,
              openedAt: trade.date,
              ownerId: trade.ownerId,
              portfolioId: trade.portfolioId,
              source: "user",
              threadId: thread._id,
              ticker: trade.ticker,
            }));
      targetEpisodeId = target?._id;
    }
  }

  if (previousEpisodeId !== targetEpisodeId) {
    if (previousEpisode?.lifecycle === "closed") {
      // Moving a fill out of closed history leaves that history open unless
      // the fill had no net effect; that also needs consent.
      const remaining = (
        await listEpisodeTrades(ctx, trade.ownerId, previousEpisode._id)
      ).filter((row) => row._id !== trade._id);
      const netQuantity = derivePositionEpisodeState(remaining).netQuantity;
      assertNotOverClosed(netQuantity, trade.ticker);
      if (netQuantity !== 0 && !options.allowReopen) {
        throw reopenRequiredError(trade, previousEpisode._id);
      }
    }
    await ctx.db.patch(tradeId, { episodeId: targetEpisodeId });
  }
  if (targetEpisodeId) {
    await recomputeEpisodeLifecycle(ctx, targetEpisodeId);
  }
  if (previousEpisode && previousEpisodeId !== targetEpisodeId) {
    if (previousEpisode.lifecycle === "closed") {
      await reopenEpisodeForCorrection(ctx, {
        actor: options.actor ?? "user",
        episodeId: previousEpisode._id,
        ownerId: trade.ownerId,
        trade,
      });
    } else {
      await recomputeEpisodeLifecycle(ctx, previousEpisode._id);
    }
  }
  return targetEpisodeId ?? null;
}

function validateAsOf(asOf: string | undefined, label: string): void {
  if (asOf !== undefined && !isIsoDate(asOf)) {
    throw planModelError("VALIDATION", `${label} must use YYYY-MM-DD`);
  }
}

export type ElementInput = {
  asOf?: string;
  author: ElementAuthor;
  kind?: string;
  noteId?: Id<"notes">;
  statement: string;
  status: "proposed" | "agreed";
  supersedes?: Id<"planElements">;
  value?: ElementValue;
};

export type ElementScope =
  | { campaignId: Id<"campaigns">; kind: "campaign" }
  | { episodeId: Id<"episodes">; kind: "episode" };

function elementBelongsToScope(
  element: Doc<"planElements">,
  scope: ElementScope,
): boolean {
  return scope.kind === "episode"
    ? element.episodeId === scope.episodeId
    : element.campaignId === scope.campaignId;
}

/**
 * Records a batch of elements as one conceptual update. Superseding an element
 * that is no longer open is a conflict surfaced to the caller, never a silent
 * overwrite.
 */
export async function recordElements(
  ctx: MutationCtx,
  args: {
    actor: Actor;
    elements: ElementInput[];
    operationId?: string;
    ownerId: string;
    scope: ElementScope;
    source: WriteSource;
  },
): Promise<Id<"planElements">[]> {
  if (args.elements.length === 0) {
    throw planModelError("VALIDATION", "elements must not be empty");
  }
  if (args.scope.kind === "episode") {
    await getOwnedEpisode(ctx, args.ownerId, args.scope.episodeId);
  } else {
    await getOwnedCampaign(ctx, args.ownerId, args.scope.campaignId);
  }

  const ceiling =
    args.scope.kind === "episode" ? MAX_EPISODE_ELEMENTS : MAX_CAMPAIGN_ELEMENTS;
  const existingCount = await countScopeElements(ctx, args.ownerId, args.scope);
  if (existingCount + args.elements.length > ceiling) {
    throw planModelError(
      "VALIDATION",
      `This ${args.scope.kind} may hold at most ${ceiling} elements`,
    );
  }

  const now = Date.now();
  const insertedIds: Id<"planElements">[] = [];
  for (const input of args.elements) {
    const statement = input.statement.trim();
    if (!statement) {
      throw planModelError("VALIDATION", "statement is required");
    }
    if (statement.length > MAX_ELEMENT_STATEMENT_LENGTH) {
      throw planModelError(
        "VALIDATION",
        `statement must be at most ${MAX_ELEMENT_STATEMENT_LENGTH} characters`,
      );
    }
    validateAsOf(input.asOf, "asOf");
    if (
      input.asOf === undefined &&
      elementRequiresAsOf({ statement, value: input.value })
    ) {
      throw planModelError(
        "VALIDATION",
        "asOf is required when an element carries a value",
      );
    }
    // Two-tier rule in the API: the counterpart's own statement starts as a
    // proposal; only the user relaying agreement can create it agreed.
    if (
      input.author === "counterpart" &&
      input.status === "agreed" &&
      args.actor !== "user"
    ) {
      throw planModelError(
        "VALIDATION",
        "A counterpart-authored element must be recorded as proposed; mark it agreed in a later write",
      );
    }
    if (input.noteId) {
      const note = await ctx.db.get(input.noteId);
      if (!note || note.ownerId !== args.ownerId) {
        throw planModelError("NOT_FOUND", "Note not found");
      }
    }

    let superseded: Doc<"planElements"> | null = null;
    if (input.supersedes) {
      superseded = await ctx.db.get(input.supersedes);
      if (
        !superseded ||
        superseded.ownerId !== args.ownerId ||
        !elementBelongsToScope(superseded, args.scope)
      ) {
        throw planModelError("NOT_FOUND", "Superseded element not found");
      }
      if (!isOpenElementStatus(superseded.status)) {
        throw planModelError(
          "CONFLICT",
          `Element ${superseded._id} is already ${superseded.status}`,
        );
      }
    }

    const revision = await allocateRevision(ctx, args.ownerId);
    const elementId = await ctx.db.insert("planElements", {
      actor: args.actor,
      asOf: input.asOf,
      author: input.author,
      campaignId:
        args.scope.kind === "campaign" ? args.scope.campaignId : undefined,
      createdAt: now,
      episodeId:
        args.scope.kind === "episode" ? args.scope.episodeId : undefined,
      kind: input.kind?.trim() || undefined,
      noteId: input.noteId,
      operationId: args.operationId,
      ownerId: args.ownerId,
      revision,
      source: args.source,
      statement,
      status: input.status,
      statusChangedAt: now,
      statusChangedBy: args.actor,
      statusHistory: [
        { actor: args.actor, at: now, revision, status: input.status },
      ],
      statusRevision: revision,
      value: input.value,
    });
    insertedIds.push(elementId);

    if (superseded) {
      const supersedeRevision = await allocateRevision(ctx, args.ownerId);
      await ctx.db.patch(superseded._id, {
        status: "superseded",
        statusChangedAt: now,
        statusChangedBy: args.actor,
        statusHistory: appendStatusHistory(superseded, {
          actor: args.actor,
          at: now,
          revision: supersedeRevision,
          status: "superseded",
        }),
        statusRevision: supersedeRevision,
        supersededById: elementId,
      });
    }
  }

  if (args.scope.kind === "episode") {
    await recomputeEpisodeLifecycle(ctx, args.scope.episodeId);
  }
  return insertedIds;
}

/**
 * Moves an open element to agreed or dropped. Dropping needs a stated reason
 * because nonmention is never evidence of withdrawal.
 */
export async function setElementStatus(
  ctx: MutationCtx,
  args: {
    actor: Actor;
    elementId: Id<"planElements">;
    evidence?: string;
    ownerId: string;
    status: "agreed" | "dropped";
  },
): Promise<Doc<"planElements">> {
  const element = await ctx.db.get(args.elementId);
  if (!element || element.ownerId !== args.ownerId) {
    throw planModelError("NOT_FOUND", "Element not found");
  }
  if (!isAllowedStatusTransition(element.status, args.status)) {
    throw planModelError(
      "CONFLICT",
      `Element ${element._id} cannot move from ${element.status} to ${args.status}`,
    );
  }
  if (args.status === "dropped" && !args.evidence?.trim()) {
    throw planModelError(
      "VALIDATION",
      "Dropping an element requires evidence of withdrawal",
    );
  }
  const now = Date.now();
  const revision = await allocateRevision(ctx, args.ownerId);
  const evidence = args.evidence?.trim() || undefined;
  await ctx.db.patch(element._id, {
    status: args.status,
    statusChangedAt: now,
    statusChangedBy: args.actor,
    statusEvidence: evidence,
    statusHistory: appendStatusHistory(element, {
      actor: args.actor,
      at: now,
      evidence,
      revision,
      status: args.status,
    }),
    statusRevision: revision,
  });
  if (element.episodeId) {
    await recomputeEpisodeLifecycle(ctx, element.episodeId);
  }
  return (await ctx.db.get(element._id))!;
}

function validateSections(sections: PlanSections): PlanSections {
  const normalized = { ...sections };
  for (const key of PLAN_SECTION_KEYS) {
    const lines = sections[key];
    if (lines.length > MAX_PLAN_LINES_PER_SECTION) {
      throw planModelError(
        "VALIDATION",
        `${key} may hold at most ${MAX_PLAN_LINES_PER_SECTION} lines`,
      );
    }
    normalized[key] = lines.map((line) => {
      const text = line.text.trim();
      if (!text) {
        throw planModelError("VALIDATION", `${key} lines need text`);
      }
      if (text.length > MAX_PLAN_LINE_LENGTH) {
        throw planModelError(
          "VALIDATION",
          `${key} lines must be at most ${MAX_PLAN_LINE_LENGTH} characters`,
        );
      }
      validateAsOf(line.asOf, `${key} asOf`);
      return { ...line, text };
    });
  }
  return normalized;
}

async function latestPlanVersion(
  ctx: MutationCtx,
  ownerId: string,
  episodeId: Id<"episodes">,
): Promise<Doc<"planVersions"> | null> {
  return await ctx.db
    .query("planVersions")
    .withIndex("by_owner_episodeId_versionNumber", (q) =>
      q.eq("ownerId", ownerId).eq("episodeId", episodeId),
    )
    .order("desc")
    .first();
}

/**
 * Writes a new plan version. `compiledThroughRevision` defaults to the
 * latest revision the owner has allocated, so every element written before
 * the draft is considered by it. A user edit in the app passes
 * `endorsed: true` because the user is both drafter and endorser.
 */
export async function draftPlanVersion(
  ctx: MutationCtx,
  args: {
    actor: Actor;
    /**
     * The version the editor was opened from (null when there was none).
     * When given, a newer version is a conflict.
     */
    baseVersionNumber?: number | null;
    compiledThroughRevision?: number;
    endorsed: boolean;
    episodeId: Id<"episodes">;
    /** The latest revision the editor had seen; later changes are a conflict. */
    observedRevision?: number;
    operationId?: string;
    ownerId: string;
    sections: PlanSections;
    source: WriteSource;
  },
): Promise<Doc<"planVersions">> {
  if (args.endorsed && args.actor !== "user") {
    throw planModelError(
      "VALIDATION",
      "Only the user can endorse a plan version",
    );
  }
  const episode = await getOwnedEpisode(ctx, args.ownerId, args.episodeId);
  const sections = validateSections(args.sections);
  for (const key of PLAN_SECTION_KEYS) {
    for (const line of sections[key]) {
      if (line.elementId) {
        const element = await ctx.db.get(line.elementId);
        if (!element || element.ownerId !== args.ownerId) {
          throw planModelError("NOT_FOUND", "Cited element not found");
        }
      }
      if (line.noteId) {
        const note = await ctx.db.get(line.noteId);
        if (!note || note.ownerId !== args.ownerId) {
          throw planModelError("NOT_FOUND", "Cited note not found");
        }
      }
    }
  }

  const previous = await latestPlanVersion(ctx, args.ownerId, episode._id);
  if (
    args.baseVersionNumber !== undefined &&
    (previous?.versionNumber ?? null) !== args.baseVersionNumber
  ) {
    throw planModelError(
      "CONFLICT",
      `The plan changed: version ${previous?.versionNumber ?? "none"} is now the latest`,
    );
  }
  if (args.observedRevision !== undefined) {
    const elements = await listEpisodeElements(ctx, args.ownerId, episode._id);
    const unseen = elements
      .filter((element) => effectiveRevision(element) > args.observedRevision!)
      .map((element) => element._id);
    if (previous && previous.revision > args.observedRevision) {
      throw planModelError("CONFLICT", "A newer plan version exists");
    }
    if (unseen.length > 0) {
      throw planModelError(
        "CONFLICT",
        "Elements changed after the plan was opened; reload before saving",
        { staleAgreedElementIds: unseen },
      );
    }
  }
  const revision = await allocateRevision(ctx, args.ownerId);
  // A draft compiles what its author read: the observed revision when given,
  // otherwise everything recorded so far.
  const compiledThroughRevision =
    args.compiledThroughRevision ?? args.observedRevision ?? revision - 1;
  if (
    !Number.isSafeInteger(compiledThroughRevision) ||
    compiledThroughRevision < 0 ||
    compiledThroughRevision > revision - 1
  ) {
    throw planModelError(
      "VALIDATION",
      `compiledThroughRevision must be an integer from 0 to ${revision - 1}`,
    );
  }
  if (
    previous &&
    compiledThroughRevision < previous.compiledThroughRevision
  ) {
    throw planModelError(
      "CONFLICT",
      "compiledThroughRevision must not move backwards",
    );
  }
  const now = Date.now();
  const versionId = await ctx.db.insert("planVersions", {
    compiledThroughRevision,
    createdAt: now,
    draftedBy: args.actor,
    endorsed: args.endorsed,
    endorsedAt: args.endorsed ? now : undefined,
    endorsedBy: args.endorsed ? "user" : undefined,
    endorsementActor: args.endorsed ? args.actor : undefined,
    episodeId: episode._id,
    operationId: args.operationId,
    ownerId: args.ownerId,
    revision,
    sections,
    source: args.source,
    versionNumber: (previous?.versionNumber ?? 0) + 1,
  });
  if (args.endorsed) {
    await ctx.db.patch(episode._id, {
      currentPlanVersionId: versionId,
      updatedAt: now,
    });
    await recomputeEpisodeLifecycle(ctx, episode._id);
  }
  return (await ctx.db.get(versionId))!;
}

/**
 * Records the user's endorsement of one exact version. Endorsing anything but
 * the latest version is a conflict: the user must see the newest draft.
 */
export async function endorsePlanVersion(
  ctx: MutationCtx,
  args: {
    /**
     * Proposed elements the user agreed to in the same breath as the plan.
     * They are marked agreed as part of the endorsement and absorbed into
     * the checkpoint, so one "yes" never needs two conflicting calls.
     */
    agreeElementIds?: Id<"planElements">[];
    actor: Actor;
    episodeId: Id<"episodes">;
    ownerId: string;
    versionNumber: number;
  },
): Promise<Doc<"planVersions">> {
  // Only the user (in the app) or the counterpart (relaying the user's words
  // in conversation) can record endorsement. A migration agent never can.
  if (args.actor !== "user" && args.actor !== "counterpart") {
    throw planModelError(
      "VALIDATION",
      `Actor ${args.actor} cannot endorse a plan version`,
    );
  }
  const episode = await getOwnedEpisode(ctx, args.ownerId, args.episodeId);
  const latest = await latestPlanVersion(ctx, args.ownerId, episode._id);
  if (!latest) throw planModelError("NOT_FOUND", "No plan version to endorse");
  if (latest.versionNumber !== args.versionNumber) {
    throw planModelError(
      "CONFLICT",
      `Version ${args.versionNumber} is not the latest (latest is ${latest.versionNumber})`,
    );
  }
  if (latest.endorsed) return latest;
  const elements = await listEpisodeElements(ctx, args.ownerId, episode._id);
  const agreeIds = new Set<string>(args.agreeElementIds ?? []);
  for (const id of agreeIds) {
    const element = elements.find((row) => row._id === id);
    if (!element) {
      throw planModelError("NOT_FOUND", `Element ${id} is not on this episode`);
    }
    if (element.status !== "proposed" && element.status !== "agreed") {
      throw planModelError(
        "CONFLICT",
        `Element ${id} is ${element.status} and cannot be agreed`,
      );
    }
  }
  // A draft is stale when anything it depends on moved after its cutoff: a
  // newly agreed element, or a withdrawal or supersede of an element the
  // draft cites.
  const citedIds = new Set<string>();
  for (const key of PLAN_SECTION_KEYS) {
    for (const line of latest.sections[key]) {
      if (line.elementId) citedIds.add(line.elementId);
    }
  }
  const stale = elements.filter(
    (element) =>
      effectiveRevision(element) > latest.compiledThroughRevision &&
      (element.status === "agreed" || citedIds.has(element._id)),
  );
  if (stale.length > 0) {
    const ids = stale.map((element) => element._id);
    throw planModelError(
      "CONFLICT",
      `Version ${latest.versionNumber} was compiled before changes to elements ${ids.join(", ")}; redraft before endorsing`,
      { staleAgreedElementIds: ids },
    );
  }
  const now = Date.now();
  for (const element of elements) {
    if (!agreeIds.has(element._id) || element.status === "agreed") continue;
    const revision = await allocateRevision(ctx, args.ownerId);
    await ctx.db.patch(element._id, {
      status: "agreed",
      statusChangedAt: now,
      statusChangedBy: args.actor,
      statusHistory: appendStatusHistory(element, {
        actor: args.actor,
        at: now,
        revision,
        status: "agreed",
      }),
      statusRevision: revision,
    });
  }
  // Agreements made with the endorsement are part of the checkpoint.
  const compiledThroughRevision =
    agreeIds.size > 0
      ? await allocateRevision(ctx, args.ownerId)
      : latest.compiledThroughRevision;
  // The endorser is always the user; the actor records who relayed it.
  await ctx.db.patch(latest._id, {
    compiledThroughRevision,
    endorsed: true,
    endorsedAt: now,
    endorsedBy: "user",
    endorsementActor: args.actor,
  });
  await ctx.db.patch(episode._id, {
    currentPlanVersionId: latest._id,
    updatedAt: now,
  });
  await recomputeEpisodeLifecycle(ctx, episode._id);
  return (await ctx.db.get(latest._id))!;
}

/**
 * Deliberately places one fill after a conversation has sorted it out: into
 * a chosen episode, or out of any episode (`episodeId: null`). Closed history
 * is only changed when it stays flat, so a missed fill can complete a closed
 * episode's record but never reopen it.
 */
export async function linkTrade(
  ctx: MutationCtx,
  args: {
    actor: Actor;
    /** Consent to reopen a closed episode the move would leave open. */
    allowReopen?: boolean;
    episodeId: Id<"episodes"> | null;
    ownerId: string;
    tradeId: Id<"trades">;
  },
): Promise<Doc<"trades">> {
  const trade = await ctx.db.get(args.tradeId);
  if (!trade || trade.ownerId !== args.ownerId) {
    throw planModelError("NOT_FOUND", "Trade not found");
  }
  const current = trade.episodeId ? await ctx.db.get(trade.episodeId) : null;
  if (current && current._id === args.episodeId) return trade;

  const netWith = async (
    episodeId: Id<"episodes">,
    change: (rows: Doc<"trades">[]) => Doc<"trades">[],
  ) =>
    derivePositionEpisodeState(
      change(await listEpisodeTrades(ctx, args.ownerId, episodeId)),
    ).netQuantity;

  if (current?.lifecycle === "closed") {
    const remaining = await netWith(current._id, (rows) =>
      rows.filter((row) => row._id !== trade._id),
    );
    assertNotOverClosed(remaining, trade.ticker);
    if (remaining !== 0 && !args.allowReopen) {
      throw reopenRequiredError(trade, current._id);
    }
  }

  let target: Doc<"episodes"> | null = null;
  if (args.episodeId) {
    target = await getOwnedEpisode(ctx, args.ownerId, args.episodeId);
    if (target.ticker !== normalizeTicker(trade.ticker)) {
      throw planModelError("VALIDATION", "The episode is for a different ticker");
    }
    if (trade.portfolioId === undefined) {
      throw planModelError(
        "VALIDATION",
        "Assign the fill to a portfolio before linking it to an episode",
      );
    }
    if (
      target.portfolioId !== undefined &&
      target.portfolioId !== trade.portfolioId
    ) {
      throw planModelError("VALIDATION", "The episode is in a different portfolio");
    }
    if (target.direction !== undefined && target.direction !== trade.direction) {
      throw planModelError("VALIDATION", "The episode has the opposite direction");
    }
    if (target.lifecycle === "closed") {
      const after = await netWith(target._id, (rows) => [...rows, trade]);
      assertNotOverClosed(after, trade.ticker);
      if (after !== 0 && !args.allowReopen) {
        throw reopenRequiredError(trade, target._id);
      }
    }
  }

  await ctx.db.patch(trade._id, { episodeId: target?._id });
  const now = Date.now();
  for (const episode of [current, target]) {
    if (!episode) continue;
    if (episode.lifecycle === "closed") {
      const rows = await listEpisodeTrades(ctx, args.ownerId, episode._id);
      if (rows.length > 0) {
        await ctx.db.patch(episode._id, {
          openedAt: Math.min(...rows.map((row) => row.date)),
          updatedAt: now,
        });
      }
      // Reopens (with a recorded reason) only if the move left it open.
      await reopenEpisodeForCorrection(ctx, {
        actor: args.actor,
        episodeId: episode._id,
        ownerId: args.ownerId,
        trade,
      });
    } else {
      if (target && episode._id === target._id && target.portfolioId === undefined) {
        await ctx.db.patch(episode._id, { portfolioId: trade.portfolioId });
      }
      await recomputeEpisodeLifecycle(ctx, episode._id);
    }
  }
  return (await ctx.db.get(trade._id))!;
}

export async function setEpisodeCampaign(
  ctx: MutationCtx,
  args: {
    campaignId: Id<"campaigns"> | null;
    episodeId: Id<"episodes">;
    exemptedCampaignElementIds?: Id<"planElements">[];
    ownerId: string;
  },
): Promise<Doc<"episodes">> {
  const episode = await getOwnedEpisode(ctx, args.ownerId, args.episodeId);
  let exemptions: Id<"planElements">[] = [];
  if (args.campaignId) {
    const campaign = await getOwnedCampaign(ctx, args.ownerId, args.campaignId);
    for (const elementId of args.exemptedCampaignElementIds ?? []) {
      const element = await ctx.db.get(elementId);
      if (
        !element ||
        element.ownerId !== args.ownerId ||
        element.campaignId !== campaign._id
      ) {
        throw planModelError(
          "NOT_FOUND",
          "Exempted element is not a campaign element",
        );
      }
    }
    exemptions = [...new Set(args.exemptedCampaignElementIds ?? [])];
    if (!(campaign.linkedThreadIds ?? []).includes(episode.threadId)) {
      await ctx.db.patch(campaign._id, {
        linkedThreadIds: [...(campaign.linkedThreadIds ?? []), episode.threadId],
      });
    }
  }
  await ctx.db.patch(episode._id, {
    campaignElementExemptions: exemptions,
    campaignId: args.campaignId ?? undefined,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(episode._id))!;
}

/** Shelving is the one user-set disposition, and only for unfilled ideas. */
export async function shelveEpisode(
  ctx: MutationCtx,
  args: {
    actor: Actor;
    episodeId: Id<"episodes">;
    ownerId: string;
    shelved: boolean;
    source: WriteSource;
  },
): Promise<Doc<"episodes">> {
  const episode = await getOwnedEpisode(ctx, args.ownerId, args.episodeId);
  if (args.shelved) {
    if (episode.lifecycle === "closed") {
      throw planModelError("CONFLICT", "A closed episode cannot be shelved");
    }
    const trades = await listEpisodeTrades(ctx, args.ownerId, episode._id);
    if (trades.length > 0) {
      throw planModelError(
        "CONFLICT",
        "An episode with fills cannot be shelved; lifecycle follows fills",
      );
    }
  }
  const now = Date.now();
  await ctx.db.patch(episode._id, {
    shelvedAt: args.shelved ? now : undefined,
    shelvedBy: args.shelved ? args.actor : undefined,
    shelvedSource: args.shelved ? args.source : undefined,
    updatedAt: now,
  });
  return (await ctx.db.get(episode._id))!;
}

export async function setCampaignLinks(
  ctx: MutationCtx,
  args: {
    actor: Actor;
    benchmarkTicker?: string | null;
    campaignId: Id<"campaigns">;
    linkedTickers?: string[];
    ownerId: string;
  },
): Promise<Doc<"campaigns">> {
  const campaign = await getOwnedCampaign(ctx, args.ownerId, args.campaignId);
  const patch: Partial<Doc<"campaigns">> = {};
  if (args.benchmarkTicker !== undefined) {
    patch.benchmarkThreadId =
      args.benchmarkTicker === null
        ? undefined
        : (
            await ensureThread(
              ctx,
              args.ownerId,
              args.benchmarkTicker,
              args.actor,
            )
          )._id;
  }
  if (args.linkedTickers !== undefined) {
    const ids: Id<"instrumentThreads">[] = [];
    for (const ticker of args.linkedTickers) {
      const thread = await ensureThread(ctx, args.ownerId, ticker, args.actor);
      if (!ids.includes(thread._id)) ids.push(thread._id);
    }
    patch.linkedThreadIds = ids;
  }
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(campaign._id, patch);
  }
  return (await ctx.db.get(campaign._id))!;
}

/**
 * Idempotent operation wrapper. A retry with the same operation id returns
 * the recorded result; the same id reused for a different kind is a conflict.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a over the canonical request body; enough to tell two bodies apart. */
export function requestFingerprint(request: unknown): string {
  const text = stableStringify(request);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length}:${hash.toString(16)}`;
}

export async function withOperation<T>(
  ctx: MutationCtx,
  args: {
    kind: string;
    operationId?: string;
    ownerId: string;
    /** The request body without its operation id. */
    request?: unknown;
  },
  run: () => Promise<T>,
): Promise<{ replayed: boolean; result: T }> {
  if (!args.operationId) {
    return { replayed: false, result: await run() };
  }
  const requestHash =
    args.request === undefined ? undefined : requestFingerprint(args.request);
  const existing = await ctx.db
    .query("counterpartOperations")
    .withIndex("by_owner_operationId", (q) =>
      q.eq("ownerId", args.ownerId).eq("operationId", args.operationId!),
    )
    .unique();
  if (existing) {
    if (existing.kind !== args.kind) {
      throw planModelError(
        "CONFLICT",
        `operationId ${args.operationId} was already used for ${existing.kind}`,
      );
    }
    if (
      requestHash !== undefined &&
      existing.requestHash !== undefined &&
      existing.requestHash !== requestHash
    ) {
      throw planModelError(
        "CONFLICT",
        `operationId ${args.operationId} was already used with a different request`,
      );
    }
    return { replayed: true, result: JSON.parse(existing.resultJson) as T };
  }
  const result = await run();
  await ctx.db.insert("counterpartOperations", {
    createdAt: Date.now(),
    kind: args.kind,
    operationId: args.operationId,
    ownerId: args.ownerId,
    requestHash,
    resultJson: JSON.stringify(result),
  });
  return { replayed: false, result };
}
