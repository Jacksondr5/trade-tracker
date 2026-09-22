import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { derivePositionEpisodeState } from "./openPositions";
import {
  actorValidator,
  elementAuthorValidator,
  elementStatusValidator,
  elementValueValidator,
  episodeLifecycleValidator,
  episodeSourceValidator,
  normalizeTicker,
  partitionElementsAroundCheckpoint,
  planSectionsValidator,
  resolveCampaignRules,
  writeSourceValidator,
  type Actor,
  type ElementValue,
  type PlanLine,
} from "./planModel";
import {
  MAX_EPISODE_ELEMENTS,
  MAX_EPISODE_TRADES,
  MAX_THREAD_EPISODES,
} from "./planWrites";

type Ctx = QueryCtx | MutationCtx;

export const MAX_HISTORY_ELEMENTS = 50;
export const MAX_NOTES_PER_SCOPE = 50;
export const MAX_LIVE_EPISODES = 300;
export const MAX_CAMPAIGN_ELEMENTS = 500;
export const MAX_THREADS = 2_000;

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

export const elementViewValidator = v.object({
  actor: actorValidator,
  asOf: nullableString,
  author: elementAuthorValidator,
  campaignId: v.union(v.id("campaigns"), v.null()),
  createdAt: v.number(),
  episodeId: v.union(v.id("episodes"), v.null()),
  id: v.id("planElements"),
  kind: nullableString,
  noteId: v.union(v.id("notes"), v.null()),
  revision: v.number(),
  source: writeSourceValidator,
  statement: v.string(),
  status: elementStatusValidator,
  statusChangedAt: v.number(),
  statusEvidence: nullableString,
  statusRevision: v.number(),
  supersededById: v.union(v.id("planElements"), v.null()),
  value: v.union(elementValueValidator, v.null()),
});

export type ElementView = {
  actor: Doc<"planElements">["actor"];
  asOf: string | null;
  author: Doc<"planElements">["author"];
  campaignId: Id<"campaigns"> | null;
  createdAt: number;
  episodeId: Id<"episodes"> | null;
  id: Id<"planElements">;
  kind: string | null;
  noteId: Id<"notes"> | null;
  revision: number;
  source: Doc<"planElements">["source"];
  statement: string;
  status: Doc<"planElements">["status"];
  statusChangedAt: number;
  statusEvidence: string | null;
  statusRevision: number;
  supersededById: Id<"planElements"> | null;
  value: ElementValue | null;
};

export function elementView(element: Doc<"planElements">): ElementView {
  return {
    actor: element.actor,
    asOf: element.asOf ?? null,
    author: element.author,
    campaignId: element.campaignId ?? null,
    createdAt: element.createdAt,
    episodeId: element.episodeId ?? null,
    id: element._id,
    kind: element.kind ?? null,
    noteId: element.noteId ?? null,
    revision: element.revision,
    source: element.source,
    statement: element.statement,
    status: element.status,
    statusChangedAt: element.statusChangedAt,
    statusEvidence: element.statusEvidence ?? null,
    statusRevision: element.statusRevision,
    supersededById: element.supersededById ?? null,
    value: element.value ?? null,
  };
}

export const planVersionViewValidator = v.object({
  compiledThroughRevision: v.number(),
  createdAt: v.number(),
  draftedBy: actorValidator,
  endorsed: v.boolean(),
  endorsedAt: nullableNumber,
  endorsedBy: v.union(actorValidator, v.null()),
  episodeId: v.id("episodes"),
  id: v.id("planVersions"),
  revision: v.number(),
  sections: planSectionsValidator,
  source: writeSourceValidator,
  versionNumber: v.number(),
});

export type PlanVersionView = {
  compiledThroughRevision: number;
  createdAt: number;
  draftedBy: Doc<"planVersions">["draftedBy"];
  endorsed: boolean;
  endorsedAt: number | null;
  endorsedBy: Actor | null;
  episodeId: Id<"episodes">;
  id: Id<"planVersions">;
  revision: number;
  sections: Doc<"planVersions">["sections"];
  source: Doc<"planVersions">["source"];
  versionNumber: number;
};

export function planVersionView(version: Doc<"planVersions">): PlanVersionView {
  return {
    compiledThroughRevision: version.compiledThroughRevision,
    createdAt: version.createdAt,
    draftedBy: version.draftedBy,
    endorsed: version.endorsed,
    endorsedAt: version.endorsedAt ?? null,
    endorsedBy: version.endorsedBy ?? null,
    episodeId: version.episodeId,
    id: version._id,
    revision: version.revision,
    sections: version.sections,
    source: version.source,
    versionNumber: version.versionNumber,
  };
}

export const linkedTradeViewValidator = v.object({
  date: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  id: v.id("trades"),
  price: v.number(),
  quantity: v.number(),
  side: v.union(v.literal("buy"), v.literal("sell")),
  source: v.union(
    v.literal("manual"),
    v.literal("ibkr"),
    v.literal("kraken"),
  ),
});

export const positionViewValidator = v.union(
  v.null(),
  v.object({
    averageCost: v.number(),
    direction: v.union(v.literal("long"), v.literal("short")),
    netQuantity: v.number(),
    source: v.literal("derived_linked_trades"),
  }),
);

export const episodeSummaryValidator = v.object({
  campaignElementExemptions: v.array(v.id("planElements")),
  campaignId: v.union(v.id("campaigns"), v.null()),
  campaignName: nullableString,
  closedAt: nullableNumber,
  currentPlanVersionId: v.union(v.id("planVersions"), v.null()),
  direction: v.union(v.literal("long"), v.literal("short"), v.null()),
  id: v.id("episodes"),
  lifecycle: episodeLifecycleValidator,
  openedAt: v.number(),
  portfolioId: v.union(v.id("portfolios"), v.null()),
  portfolioName: nullableString,
  revision: v.number(),
  shelvedAt: nullableNumber,
  shelvedBy: v.union(actorValidator, v.null()),
  source: episodeSourceValidator,
  threadId: v.id("instrumentThreads"),
  ticker: v.string(),
});

export type EpisodeSummary = {
  campaignElementExemptions: Id<"planElements">[];
  campaignId: Id<"campaigns"> | null;
  campaignName: string | null;
  closedAt: number | null;
  currentPlanVersionId: Id<"planVersions"> | null;
  direction: "long" | "short" | null;
  id: Id<"episodes">;
  lifecycle: Doc<"episodes">["lifecycle"];
  openedAt: number;
  portfolioId: Id<"portfolios"> | null;
  portfolioName: string | null;
  revision: number;
  shelvedAt: number | null;
  shelvedBy: Actor | null;
  source: Doc<"episodes">["source"];
  threadId: Id<"instrumentThreads">;
  ticker: string;
};

export const noteSummaryValidator = v.object({
  content: v.string(),
  id: v.id("notes"),
  noteDate: v.number(),
  origin: v.union(v.literal("retrospective"), v.null()),
});

export const boundedElementsValidator = v.object({
  items: v.array(elementViewValidator),
  total: v.number(),
  truncated: v.boolean(),
});

export const resolvedEpisodeValidator = v.object({
  campaignRules: v.object({
    applicable: v.array(elementViewValidator),
    exempted: v.array(elementViewValidator),
  }),
  checkpoint: v.union(planVersionViewValidator, v.null()),
  draft: v.union(planVersionViewValidator, v.null()),
  episode: episodeSummaryValidator,
  history: boundedElementsValidator,
  itemsSinceCheckpoint: v.array(elementViewValidator),
  notes: v.object({
    items: v.array(noteSummaryValidator),
    truncated: v.boolean(),
  }),
  openProposals: v.array(
    elementViewValidator.extend({ beforeCheckpoint: v.boolean() }),
  ),
  planVersions: v.array(
    v.object({
      compiledThroughRevision: v.number(),
      createdAt: v.number(),
      endorsed: v.boolean(),
      id: v.id("planVersions"),
      versionNumber: v.number(),
    }),
  ),
  position: positionViewValidator,
  trades: v.array(linkedTradeViewValidator),
});

export type ResolvedEpisode = {
  campaignRules: { applicable: ElementView[]; exempted: ElementView[] };
  checkpoint: PlanVersionView | null;
  draft: PlanVersionView | null;
  episode: EpisodeSummary;
  history: { items: ElementView[]; total: number; truncated: boolean };
  itemsSinceCheckpoint: ElementView[];
  notes: {
    items: Array<{
      content: string;
      id: Id<"notes">;
      noteDate: number;
      origin: "retrospective" | null;
    }>;
    truncated: boolean;
  };
  openProposals: Array<ElementView & { beforeCheckpoint: boolean }>;
  planVersions: Array<{
    compiledThroughRevision: number;
    createdAt: number;
    endorsed: boolean;
    id: Id<"planVersions">;
    versionNumber: number;
  }>;
  position: {
    averageCost: number;
    direction: "long" | "short";
    netQuantity: number;
    source: "derived_linked_trades";
  } | null;
  trades: Array<{
    date: number;
    direction: "long" | "short";
    id: Id<"trades">;
    price: number;
    quantity: number;
    side: "buy" | "sell";
    source: "manual" | "ibkr" | "kraken";
  }>;
};

async function takeBounded<T>(
  query: { take(n: number): Promise<T[]> },
  limit: number,
  label: string,
): Promise<T[]> {
  const rows = await query.take(limit + 1);
  if (rows.length > limit) {
    throw new Error(`${label} exceeds the ${limit}-row limit`);
  }
  return rows;
}

export async function getOwnedThreadByTicker(
  ctx: Ctx,
  ownerId: string,
  rawTicker: string,
): Promise<Doc<"instrumentThreads"> | null> {
  const ticker = normalizeTicker(rawTicker);
  if (!ticker) return null;
  return await ctx.db
    .query("instrumentThreads")
    .withIndex("by_owner_ticker", (q) =>
      q.eq("ownerId", ownerId).eq("ticker", ticker),
    )
    .unique();
}

export async function listCampaignElements(
  ctx: Ctx,
  ownerId: string,
  campaignId: Id<"campaigns">,
): Promise<Doc<"planElements">[]> {
  return await takeBounded(
    ctx.db
      .query("planElements")
      .withIndex("by_owner_campaignId_revision", (q) =>
        q.eq("ownerId", ownerId).eq("campaignId", campaignId),
      ),
    MAX_CAMPAIGN_ELEMENTS,
    "Campaign element count",
  );
}

export async function episodeSummary(
  ctx: Ctx,
  episode: Doc<"episodes">,
  lookups?: {
    campaigns?: Map<Id<"campaigns">, Doc<"campaigns"> | null>;
    portfolios?: Map<Id<"portfolios">, Doc<"portfolios"> | null>;
  },
): Promise<EpisodeSummary> {
  const campaign = episode.campaignId
    ? (lookups?.campaigns?.get(episode.campaignId) ??
      (await ctx.db.get(episode.campaignId)))
    : null;
  const portfolio = episode.portfolioId
    ? (lookups?.portfolios?.get(episode.portfolioId) ??
      (await ctx.db.get(episode.portfolioId)))
    : null;
  return {
    campaignElementExemptions: episode.campaignElementExemptions,
    campaignId: episode.campaignId ?? null,
    campaignName: campaign?.name ?? null,
    closedAt: episode.closedAt ?? null,
    currentPlanVersionId: episode.currentPlanVersionId ?? null,
    direction: episode.direction ?? null,
    id: episode._id,
    lifecycle: episode.lifecycle,
    openedAt: episode.openedAt,
    portfolioId: episode.portfolioId ?? null,
    portfolioName: portfolio?.name ?? null,
    revision: episode.revision,
    shelvedAt: episode.shelvedAt ?? null,
    shelvedBy: episode.shelvedBy ?? null,
    source: episode.source,
    threadId: episode.threadId,
    ticker: episode.ticker,
  };
}

function tradeView(trade: Doc<"trades">) {
  return {
    date: trade.date,
    direction: trade.direction,
    id: trade._id,
    price: trade.price,
    quantity: trade.quantity,
    side: trade.side,
    source: trade.source ?? ("manual" as const),
  };
}

export function positionFromTrades(trades: Doc<"trades">[]) {
  if (trades.length === 0) return null;
  const state = derivePositionEpisodeState(trades);
  if (state.netQuantity === 0 || !state.openingTrade) return null;
  const openingIndex = state.orderedTrades.indexOf(state.openingTrade);
  const entries = state.orderedTrades.slice(openingIndex).filter(
    (trade) =>
      (trade.direction === "long" && trade.side === "buy") ||
      (trade.direction === "short" && trade.side === "sell"),
  );
  const quantity = entries.reduce((total, trade) => total + trade.quantity, 0);
  const cost = entries.reduce(
    (total, trade) => total + trade.quantity * trade.price,
    0,
  );
  return {
    averageCost: quantity > 0 ? cost / quantity : 0,
    direction: state.openingTrade.direction,
    netQuantity: state.netQuantity,
    source: "derived_linked_trades" as const,
  };
}

export async function resolveEpisode(
  ctx: Ctx,
  episode: Doc<"episodes">,
): Promise<ResolvedEpisode> {
  const ownerId = episode.ownerId;
  const [elements, versions, trades, notes] = await Promise.all([
    takeBounded(
      ctx.db
        .query("planElements")
        .withIndex("by_owner_episodeId_revision", (q) =>
          q.eq("ownerId", ownerId).eq("episodeId", episode._id),
        ),
      MAX_EPISODE_ELEMENTS,
      "Episode element count",
    ),
    ctx.db
      .query("planVersions")
      .withIndex("by_owner_episodeId_versionNumber", (q) =>
        q.eq("ownerId", ownerId).eq("episodeId", episode._id),
      )
      .order("asc")
      .collect(),
    takeBounded(
      ctx.db
        .query("trades")
        .withIndex("by_owner_episodeId", (q) =>
          q.eq("ownerId", ownerId).eq("episodeId", episode._id),
        ),
      MAX_EPISODE_TRADES,
      "Episode trade count",
    ),
    ctx.db
      .query("notes")
      .withIndex("by_owner_episodeId_noteDate", (q) =>
        q.eq("ownerId", ownerId).eq("episodeId", episode._id),
      )
      .order("desc")
      .take(MAX_NOTES_PER_SCOPE + 1),
  ]);

  const checkpoint =
    [...versions].reverse().find((version) => version.endorsed) ?? null;
  const latest = versions[versions.length - 1] ?? null;
  const draft =
    latest && !latest.endorsed && latest._id !== checkpoint?._id ? latest : null;

  const partition = partitionElementsAroundCheckpoint(
    elements,
    checkpoint?.compiledThroughRevision ?? null,
  );

  let campaignRules: ResolvedEpisode["campaignRules"] = {
    applicable: [],
    exempted: [],
  };
  if (episode.campaignId) {
    const campaignElements = await listCampaignElements(
      ctx,
      ownerId,
      episode.campaignId,
    );
    const resolved = resolveCampaignRules(
      campaignElements,
      new Set<string>(episode.campaignElementExemptions),
    );
    campaignRules = {
      applicable: resolved.applicable.map(elementView),
      exempted: resolved.exempted.map(elementView),
    };
  }

  const historyItems = partition.history.slice(-MAX_HISTORY_ELEMENTS);
  return {
    campaignRules,
    checkpoint: checkpoint ? planVersionView(checkpoint) : null,
    draft: draft ? planVersionView(draft) : null,
    episode: await episodeSummary(ctx, episode),
    history: {
      items: historyItems.map(elementView),
      total: partition.history.length,
      truncated: partition.history.length > historyItems.length,
    },
    itemsSinceCheckpoint: partition.itemsSinceCheckpoint.map(elementView),
    notes: {
      items: notes.slice(0, MAX_NOTES_PER_SCOPE).map((note) => ({
        content: note.content,
        id: note._id,
        noteDate: note.noteDate,
        origin: note.origin ?? null,
      })),
      truncated: notes.length > MAX_NOTES_PER_SCOPE,
    },
    openProposals: partition.openProposals.map((element) => ({
      ...elementView(element),
      beforeCheckpoint: element.beforeCheckpoint,
    })),
    planVersions: versions.map((version) => ({
      compiledThroughRevision: version.compiledThroughRevision,
      createdAt: version.createdAt,
      endorsed: version.endorsed,
      id: version._id,
      versionNumber: version.versionNumber,
    })),
    position: positionFromTrades(trades),
    trades: [...trades]
      .sort((a, b) => a.date - b.date || a._creationTime - b._creationTime)
      .map(tradeView),
  };
}

export const threadSummaryValidator = v.object({
  campaigns: v.array(
    v.object({
      id: v.id("campaigns"),
      isBenchmark: v.boolean(),
      name: v.string(),
    }),
  ),
  createdAt: v.number(),
  id: v.id("instrumentThreads"),
  ticker: v.string(),
});

export const resolvedThreadValidator = v.object({
  history: v.array(resolvedEpisodeValidator),
  liveEpisodes: v.array(resolvedEpisodeValidator),
  notes: v.object({
    items: v.array(noteSummaryValidator),
    truncated: v.boolean(),
  }),
  shelvedEpisodes: v.array(resolvedEpisodeValidator),
  thread: threadSummaryValidator,
});

export type ThreadSummary = {
  campaigns: Array<{ id: Id<"campaigns">; isBenchmark: boolean; name: string }>;
  createdAt: number;
  id: Id<"instrumentThreads">;
  ticker: string;
};

export type ResolvedThread = {
  history: ResolvedEpisode[];
  liveEpisodes: ResolvedEpisode[];
  notes: ResolvedEpisode["notes"];
  shelvedEpisodes: ResolvedEpisode[];
  thread: ThreadSummary;
};

export async function listThreadCampaignLinks(
  ctx: Ctx,
  ownerId: string,
): Promise<Map<Id<"instrumentThreads">, ThreadSummary["campaigns"]>> {
  const campaigns = await takeBounded(
    ctx.db
      .query("campaigns")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId)),
    1_000,
    "Campaign count",
  );
  const links = new Map<Id<"instrumentThreads">, ThreadSummary["campaigns"]>();
  for (const campaign of campaigns) {
    const threadIds = new Set<Id<"instrumentThreads">>(
      campaign.linkedThreadIds ?? [],
    );
    if (campaign.benchmarkThreadId) threadIds.add(campaign.benchmarkThreadId);
    for (const threadId of threadIds) {
      const list = links.get(threadId) ?? [];
      list.push({
        id: campaign._id,
        isBenchmark: campaign.benchmarkThreadId === threadId,
        name: campaign.name,
      });
      links.set(threadId, list);
    }
  }
  return links;
}

export async function listThreadEpisodes(
  ctx: Ctx,
  ownerId: string,
  threadId: Id<"instrumentThreads">,
): Promise<Doc<"episodes">[]> {
  return await takeBounded(
    ctx.db
      .query("episodes")
      .withIndex("by_owner_threadId", (q) =>
        q.eq("ownerId", ownerId).eq("threadId", threadId),
      ),
    MAX_THREAD_EPISODES,
    "Thread episode count",
  );
}

export async function listThreadNotes(
  ctx: Ctx,
  thread: Doc<"instrumentThreads">,
): Promise<{ items: Doc<"notes">[]; truncated: boolean }> {
  // The probe's ticker tag remains the thread key, so ticker-tagged notes
  // and explicitly thread-attached notes both belong here.
  const [byTicker, byThread] = await Promise.all([
    ctx.db
      .query("notes")
      .withIndex("by_owner_ticker_noteDate", (q) =>
        q.eq("ownerId", thread.ownerId).eq("ticker", thread.ticker),
      )
      .order("desc")
      .take(MAX_NOTES_PER_SCOPE + 1),
    ctx.db
      .query("notes")
      .withIndex("by_owner_threadId_noteDate", (q) =>
        q.eq("ownerId", thread.ownerId).eq("threadId", thread._id),
      )
      .order("desc")
      .take(MAX_NOTES_PER_SCOPE + 1),
  ]);
  const seen = new Set<Id<"notes">>();
  const merged: Doc<"notes">[] = [];
  for (const note of [...byTicker, ...byThread]) {
    if (note.episodeId || note.campaignId) continue;
    if (seen.has(note._id)) continue;
    seen.add(note._id);
    merged.push(note);
  }
  merged.sort((a, b) => b.noteDate - a.noteDate || b._creationTime - a._creationTime);
  return {
    items: merged.slice(0, MAX_NOTES_PER_SCOPE),
    truncated: merged.length > MAX_NOTES_PER_SCOPE,
  };
}

export async function resolveThread(
  ctx: Ctx,
  thread: Doc<"instrumentThreads">,
): Promise<ResolvedThread> {
  const [episodes, notes, campaignLinks] = await Promise.all([
    listThreadEpisodes(ctx, thread.ownerId, thread._id),
    listThreadNotes(ctx, thread),
    listThreadCampaignLinks(ctx, thread.ownerId),
  ]);
  const resolved = await Promise.all(
    episodes
      .sort((a, b) => b.openedAt - a.openedAt)
      .map((episode) => resolveEpisode(ctx, episode)),
  );
  return {
    history: resolved.filter(
      (item) => item.episode.lifecycle === "closed",
    ),
    liveEpisodes: resolved.filter(
      (item) =>
        item.episode.lifecycle !== "closed" && item.episode.shelvedAt === null,
    ),
    notes: {
      items: notes.items.map((note) => ({
        content: note.content,
        id: note._id,
        noteDate: note.noteDate,
        origin: note.origin ?? null,
      })),
      truncated: notes.truncated,
    },
    shelvedEpisodes: resolved.filter(
      (item) =>
        item.episode.lifecycle !== "closed" && item.episode.shelvedAt !== null,
    ),
    thread: {
      campaigns: campaignLinks.get(thread._id) ?? [],
      createdAt: thread.createdAt,
      id: thread._id,
      ticker: thread.ticker,
    },
  };
}

const planLineViewValidator = v.object({
  asOf: nullableString,
  elementId: v.union(v.id("planElements"), v.null()),
  noteId: v.union(v.id("notes"), v.null()),
  text: v.string(),
  value: v.union(elementValueValidator, v.null()),
});

function lineView(line: PlanLine) {
  return {
    asOf: line.asOf ?? null,
    elementId: line.elementId ?? null,
    noteId: line.noteId ?? null,
    text: line.text,
    value: line.value ?? null,
  };
}

export const deskRowValidator = v.object({
  checkpoint: v.union(
    v.null(),
    v.object({
      entry: v.array(planLineViewValidator),
      scenarios: v.array(planLineViewValidator),
      size: v.array(planLineViewValidator),
      stop: v.array(planLineViewValidator),
      targets: v.array(planLineViewValidator),
      versionNumber: v.number(),
    }),
  ),
  draftVersionNumber: nullableNumber,
  episode: episodeSummaryValidator,
  itemsSinceCheckpoint: v.array(elementViewValidator),
  position: positionViewValidator,
});

export const deskGroupValidator = v.object({
  campaign: v.union(
    v.null(),
    v.object({
      benchmark: v.union(
        v.null(),
        v.object({
          latestClose: v.union(
            v.null(),
            v.object({ close: v.number(), date: v.string() }),
          ),
          ticker: v.string(),
        }),
      ),
      id: v.id("campaigns"),
      name: v.string(),
      rules: v.array(elementViewValidator),
    }),
  ),
  rows: v.array(deskRowValidator),
});

export const deskValidator = v.object({
  groups: v.array(deskGroupValidator),
  liveEpisodeCount: v.number(),
  truncated: v.boolean(),
});

async function latestCloseForTicker(ctx: Ctx, ownerId: string, ticker: string) {
  for (const assetType of ["stock", "crypto"] as const) {
    const instrument = await ctx.db
      .query("marketDataInstruments")
      .withIndex("by_ownerId_and_assetType_and_symbol", (q) =>
        q.eq("ownerId", ownerId).eq("assetType", assetType).eq("symbol", ticker),
      )
      .unique();
    if (!instrument?.providerSymbol) continue;
    const snapshots = await ctx.db
      .query("marketPriceSnapshots")
      .withIndex("by_provider_and_providerSymbol_and_date", (q) =>
        q
          .eq("provider", instrument.provider)
          .eq("providerSymbol", instrument.providerSymbol!),
      )
      .order("desc")
      .take(25);
    const snapshot = snapshots.find(
      (row) => row.status === "ok" && row.close !== undefined,
    );
    if (snapshot?.close !== undefined) {
      return { close: snapshot.close, date: snapshot.date };
    }
  }
  return null;
}

export async function buildDesk(ctx: Ctx, ownerId: string) {
  const episodes: Doc<"episodes">[] = [];
  for (const lifecycle of ["active", "watching", "idea"] as const) {
    const rows = await ctx.db
      .query("episodes")
      .withIndex("by_owner_lifecycle", (q) =>
        q.eq("ownerId", ownerId).eq("lifecycle", lifecycle),
      )
      .take(MAX_LIVE_EPISODES + 1);
    episodes.push(...rows);
  }
  const live = episodes.filter((episode) => episode.shelvedAt === undefined);
  const truncated = live.length > MAX_LIVE_EPISODES;
  const bounded = live.slice(0, MAX_LIVE_EPISODES);

  const campaignIds = [
    ...new Set(
      bounded
        .map((episode) => episode.campaignId)
        .filter((id): id is Id<"campaigns"> => id !== undefined),
    ),
  ];
  const portfolioIds = [
    ...new Set(
      bounded
        .map((episode) => episode.portfolioId)
        .filter((id): id is Id<"portfolios"> => id !== undefined),
    ),
  ];
  const campaigns = new Map(
    await Promise.all(
      campaignIds.map(async (id) => [id, await ctx.db.get(id)] as const),
    ),
  );
  const portfolios = new Map(
    await Promise.all(
      portfolioIds.map(async (id) => [id, await ctx.db.get(id)] as const),
    ),
  );

  const rows = await Promise.all(
    bounded.map(async (episode) => {
      const resolved = await resolveEpisode(ctx, episode);
      return {
        checkpoint: resolved.checkpoint
          ? {
              entry: resolved.checkpoint.sections.entry.map(lineView),
              scenarios: resolved.checkpoint.sections.scenarios.map(lineView),
              size: resolved.checkpoint.sections.size.map(lineView),
              stop: resolved.checkpoint.sections.stop.map(lineView),
              targets: resolved.checkpoint.sections.targets.map(lineView),
              versionNumber: resolved.checkpoint.versionNumber,
            }
          : null,
        draftVersionNumber: resolved.draft?.versionNumber ?? null,
        episode: await episodeSummary(ctx, episode, { campaigns, portfolios }),
        itemsSinceCheckpoint: resolved.itemsSinceCheckpoint.filter(
          (item) => item.status === "agreed" || item.status === "proposed",
        ),
        position: resolved.position,
      };
    }),
  );

  const lifecycleOrder = { active: 0, watching: 1, idea: 2, closed: 3 } as const;
  rows.sort(
    (a, b) =>
      lifecycleOrder[a.episode.lifecycle] - lifecycleOrder[b.episode.lifecycle] ||
      a.episode.ticker.localeCompare(b.episode.ticker) ||
      b.episode.openedAt - a.episode.openedAt,
  );

  const groups: Array<{
    campaign: {
      benchmark: { latestClose: { close: number; date: string } | null; ticker: string } | null;
      id: Id<"campaigns">;
      name: string;
      rules: ElementView[];
    } | null;
    rows: typeof rows;
  }> = [];
  for (const campaignId of campaignIds) {
    const campaign = campaigns.get(campaignId);
    if (!campaign) continue;
    const benchmarkThread = campaign.benchmarkThreadId
      ? await ctx.db.get(campaign.benchmarkThreadId)
      : null;
    const rules = resolveCampaignRules(
      await listCampaignElements(ctx, ownerId, campaignId),
      new Set(),
    ).applicable;
    groups.push({
      campaign: {
        benchmark: benchmarkThread
          ? {
              latestClose: await latestCloseForTicker(
                ctx,
                ownerId,
                benchmarkThread.ticker,
              ),
              ticker: benchmarkThread.ticker,
            }
          : null,
        id: campaign._id,
        name: campaign.name,
        rules: rules.map(elementView),
      },
      rows: rows.filter((row) => row.episode.campaignId === campaignId),
    });
  }
  groups.sort((a, b) => a.campaign!.name.localeCompare(b.campaign!.name));
  const ungrouped = rows.filter((row) => row.episode.campaignId === null);
  if (ungrouped.length > 0 || groups.length === 0) {
    groups.push({ campaign: null, rows: ungrouped });
  }

  return { groups, liveEpisodeCount: live.length, truncated };
}
