import type { GenericDatabaseReader } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { getEasternDateString } from "./lib/ibkrSchedule";
import {
  actorValidator,
  elementAuthorValidator,
  elementValueValidator,
  PLAN_SECTION_KEYS,
  writeSourceValidator,
  type PlanSections,
} from "./lib/planModel";
import {
  buildDesk,
  deskValidator,
  elementView,
  elementViewValidator,
  episodeSummary,
  episodeSummaryValidator,
  getOwnedThreadByTicker,
  listCampaignElements,
  planVersionView,
  planVersionViewValidator,
  resolveEpisode,
  resolvedEpisodeValidator,
  resolveThread,
  resolvedThreadValidator,
} from "./lib/planReads";
import {
  draftPlanVersion,
  endorsePlanVersion,
  ensureThread,
  getOwnedCampaign,
  getOwnedEpisode,
  openEpisode,
  planModelError,
  recordElements,
  setCampaignLinks,
  setElementStatus,
  setEpisodeCampaign,
  shelveEpisode,
  withOperation,
} from "./lib/planWrites";
import {
  buildValuationSnapshot,
  valuationSnapshotValidator,
} from "./lib/valuationSnapshot";

/**
 * The counterpart's interface to the instrument thread model.
 *
 * Reads return resolved context so the counterpart never reassembles state
 * across endpoints. Writes are idempotent by operation id and revision-aware:
 * conflicts surface as errors instead of overwriting.
 */

const writeActorValidator = actorValidator;

const positionFreshnessValidator = v.object({
  latestAttemptStatus: v.union(v.string(), v.null()),
  latestSuccessfulStatementDate: v.union(v.string(), v.null()),
});

async function positionFreshness(
  ctx: Parameters<typeof buildValuationSnapshot>[0],
  ownerId: string,
) {
  const [latestAttempt, latestSuccess] = await Promise.all([
    ctx.db
      .query("brokerageSyncRuns")
      .withIndex("by_ownerId_and_reportType_and_startedAt", (q) =>
        q.eq("ownerId", ownerId).eq("reportType", "activity"),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("brokerageSyncRuns")
      .withIndex("by_ownerId_and_reportType_and_status_and_updatedAt", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("reportType", "activity")
          .eq("status", "succeeded"),
      )
      .order("desc")
      .first(),
  ]);
  return {
    latestAttemptStatus: latestAttempt?.status ?? null,
    latestSuccessfulStatementDate: latestSuccess?.reportDate ?? null,
  };
}

export const getThreadContext = internalQuery({
  args: { now: v.number(), ownerId: v.string(), ticker: v.string() },
  returns: v.union(
    v.null(),
    resolvedThreadValidator.extend({
      positionFreshness: positionFreshnessValidator,
      valuation: valuationSnapshotValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const thread = await getOwnedThreadByTicker(ctx, args.ownerId, args.ticker);
    if (!thread) return null;
    const [resolved, valuation, freshness] = await Promise.all([
      resolveThread(ctx, thread),
      buildValuationSnapshot(ctx, {
        ownerId: args.ownerId,
        todayDate: getEasternDateString(args.now),
      }),
      positionFreshness(ctx, args.ownerId),
    ]);
    return { ...resolved, positionFreshness: freshness, valuation };
  },
});

export const getEpisodeContext = internalQuery({
  args: { episodeId: v.string(), now: v.number(), ownerId: v.string() },
  returns: v.union(
    v.null(),
    resolvedEpisodeValidator.extend({
      positionFreshness: positionFreshnessValidator,
      valuation: valuationSnapshotValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const episodeId = ctx.db.normalizeId("episodes", args.episodeId);
    if (!episodeId) return null;
    const episode = await ctx.db.get(episodeId);
    if (!episode || episode.ownerId !== args.ownerId) return null;
    const [resolved, valuation, freshness] = await Promise.all([
      resolveEpisode(ctx, episode),
      buildValuationSnapshot(ctx, {
        ownerId: args.ownerId,
        todayDate: getEasternDateString(args.now),
      }),
      positionFreshness(ctx, args.ownerId),
    ]);
    return { ...resolved, positionFreshness: freshness, valuation };
  },
});

const MAX_ELEMENT_PAGE = 200;

/** Cursor-paginated element history for one episode, oldest first. */
export const listEpisodeElementsForCounterpart = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    episodeId: v.string(),
    numItems: v.number(),
    ownerId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      hasMore: v.boolean(),
      items: v.array(elementViewValidator),
      nextCursor: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const episodeId = ctx.db.normalizeId("episodes", args.episodeId);
    if (!episodeId) return null;
    const episode = await ctx.db.get(episodeId);
    if (!episode || episode.ownerId !== args.ownerId) return null;
    const page = await ctx.db
      .query("planElements")
      .withIndex("by_owner_episodeId_revision", (q) =>
        q.eq("ownerId", args.ownerId).eq("episodeId", episodeId),
      )
      .order("asc")
      .paginate({
        cursor: args.cursor,
        numItems: Math.min(Math.max(args.numItems, 1), MAX_ELEMENT_PAGE),
      });
    return {
      hasMore: !page.isDone,
      items: page.page.map(elementView),
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/** One historical plan version with its sections. */
export const getPlanVersionForCounterpart = internalQuery({
  args: { episodeId: v.string(), ownerId: v.string(), versionNumber: v.number() },
  returns: v.union(v.null(), planVersionViewValidator),
  handler: async (ctx, args) => {
    const episodeId = ctx.db.normalizeId("episodes", args.episodeId);
    if (!episodeId) return null;
    const version = await ctx.db
      .query("planVersions")
      .withIndex("by_owner_episodeId_versionNumber", (q) =>
        q
          .eq("ownerId", args.ownerId)
          .eq("episodeId", episodeId)
          .eq("versionNumber", args.versionNumber),
      )
      .unique();
    return version ? planVersionView(version) : null;
  },
});

export const getDeskContext = internalQuery({
  args: { ownerId: v.string() },
  returns: deskValidator,
  handler: async (ctx, args) => {
    return await buildDesk(ctx, args.ownerId);
  },
});

const campaignContextValidator = v.object({
  benchmarkTicker: v.union(v.string(), v.null()),
  elements: v.array(elementViewValidator),
  id: v.id("campaigns"),
  linkedTickers: v.array(v.string()),
  name: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("closed"),
    v.literal("planning"),
  ),
  thesis: v.string(),
});

export const listCampaignContexts = internalQuery({
  args: { ownerId: v.string() },
  returns: v.array(campaignContextValidator),
  handler: async (ctx, args) => {
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .take(1_001);
    if (campaigns.length > 1_000) {
      throw new Error("Campaign count exceeds the 1000-row limit");
    }
    return await Promise.all(
      campaigns.map(async (campaign) => {
        const benchmark = campaign.benchmarkThreadId
          ? await ctx.db.get(campaign.benchmarkThreadId)
          : null;
        const linked = await Promise.all(
          (campaign.linkedThreadIds ?? []).map((id) => ctx.db.get(id)),
        );
        const elements = await listCampaignElements(
          ctx,
          args.ownerId,
          campaign._id,
        );
        return {
          benchmarkTicker: benchmark?.ticker ?? null,
          elements: elements.map(elementView),
          id: campaign._id,
          linkedTickers: linked
            .flatMap((thread) => (thread ? [thread.ticker] : []))
            .sort((a, b) => a.localeCompare(b)),
          name: campaign.name,
          status: campaign.status,
          thesis: campaign.thesis,
        };
      }),
    );
  },
});

const planLineInputValidator = v.object({
  asOf: v.optional(v.string()),
  elementId: v.optional(v.string()),
  noteId: v.optional(v.string()),
  text: v.string(),
  value: v.optional(elementValueValidator),
});

const planSectionsInputValidator = v.object({
  entry: v.array(planLineInputValidator),
  scenarios: v.array(planLineInputValidator),
  size: v.array(planLineInputValidator),
  stop: v.array(planLineInputValidator),
  structure: v.array(planLineInputValidator),
  targets: v.array(planLineInputValidator),
});

const elementInputValidator = v.object({
  asOf: v.optional(v.string()),
  author: elementAuthorValidator,
  kind: v.optional(v.string()),
  noteId: v.optional(v.string()),
  statement: v.string(),
  status: v.union(v.literal("proposed"), v.literal("agreed")),
  supersedes: v.optional(v.string()),
  value: v.optional(elementValueValidator),
});

type NormalizableTable =
  | "campaigns"
  | "episodes"
  | "notes"
  | "planElements"
  | "portfolios";

function normalizeIdOrThrow<TableName extends NormalizableTable>(
  ctx: { db: GenericDatabaseReader<DataModel> },
  table: TableName,
  id: string,
  label: string,
): Id<TableName> {
  const normalized = ctx.db.normalizeId(table, id);
  if (!normalized) throw planModelError("NOT_FOUND", `${label} not found`);
  return normalized;
}

export const openEpisodeForCounterpart = internalMutation({
  args: {
    actor: writeActorValidator,
    campaignId: v.optional(v.string()),
    operationId: v.optional(v.string()),
    ownerId: v.string(),
    portfolioId: v.optional(v.string()),
    source: writeSourceValidator,
    ticker: v.string(),
  },
  returns: v.object({
    episode: episodeSummaryValidator,
    replayed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { replayed, result } = await withOperation(
      ctx,
      { kind: "open-episode", operationId: args.operationId, ownerId: args.ownerId },
      async () => {
        const thread = await ensureThread(ctx, args.ownerId, args.ticker, args.actor);
        const portfolioId = args.portfolioId
          ? normalizeIdOrThrow(ctx, "portfolios", args.portfolioId, "Portfolio")
          : undefined;
        if (portfolioId) {
          const portfolio = await ctx.db.get(portfolioId);
          if (!portfolio || portfolio.ownerId !== args.ownerId) {
            throw planModelError("NOT_FOUND", "Portfolio not found");
          }
        }
        const campaignId = args.campaignId
          ? normalizeIdOrThrow(ctx, "campaigns", args.campaignId, "Campaign")
          : undefined;
        if (campaignId) await getOwnedCampaign(ctx, args.ownerId, campaignId);
        const episode = await openEpisode(ctx, {
          actor: args.actor,
          ownerId: args.ownerId,
          portfolioId,
          source: "user",
          threadId: thread._id,
          ticker: thread.ticker,
        });
        if (campaignId) {
          await setEpisodeCampaign(ctx, {
            campaignId,
            episodeId: episode._id,
            ownerId: args.ownerId,
          });
        }
        return { episodeId: episode._id };
      },
    );
    const episode = await getOwnedEpisode(ctx, args.ownerId, result.episodeId);
    return { episode: await episodeSummary(ctx, episode), replayed };
  },
});

export const recordElementsForCounterpart = internalMutation({
  args: {
    actor: writeActorValidator,
    campaignId: v.optional(v.string()),
    elements: v.array(elementInputValidator),
    episodeId: v.optional(v.string()),
    operationId: v.optional(v.string()),
    ownerId: v.string(),
    source: writeSourceValidator,
  },
  returns: v.object({
    elements: v.array(elementViewValidator),
    replayed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if ((args.episodeId === undefined) === (args.campaignId === undefined)) {
      throw planModelError(
        "VALIDATION",
        "Exactly one of episodeId or campaignId is required",
      );
    }
    const scope =
      args.episodeId !== undefined
        ? {
            episodeId: normalizeIdOrThrow(ctx, "episodes", args.episodeId, "Episode"),
            kind: "episode" as const,
          }
        : {
            campaignId: normalizeIdOrThrow(
              ctx,
              "campaigns",
              args.campaignId!,
              "Campaign",
            ),
            kind: "campaign" as const,
          };
    const { replayed, result } = await withOperation(
      ctx,
      { kind: "record-elements", operationId: args.operationId, ownerId: args.ownerId },
      async () => {
        const ids = await recordElements(ctx, {
          actor: args.actor,
          elements: args.elements.map((element) => ({
            asOf: element.asOf,
            author: element.author,
            kind: element.kind,
            noteId: element.noteId
              ? normalizeIdOrThrow(ctx, "notes", element.noteId, "Note")
              : undefined,
            statement: element.statement,
            status: element.status,
            supersedes: element.supersedes
              ? normalizeIdOrThrow(ctx, "planElements", element.supersedes, "Element")
              : undefined,
            value: element.value,
          })),
          operationId: args.operationId,
          ownerId: args.ownerId,
          scope,
          source: args.source,
        });
        return { elementIds: ids };
      },
    );
    const elements = await Promise.all(
      result.elementIds.map(async (id) => elementView((await ctx.db.get(id))!)),
    );
    return { elements, replayed };
  },
});

export const setElementStatusForCounterpart = internalMutation({
  args: {
    actor: writeActorValidator,
    elementId: v.string(),
    evidence: v.optional(v.string()),
    operationId: v.optional(v.string()),
    ownerId: v.string(),
    status: v.union(v.literal("agreed"), v.literal("dropped")),
  },
  returns: v.object({ element: elementViewValidator, replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const elementId = normalizeIdOrThrow(ctx, "planElements", args.elementId, "Element");
    const { replayed, result } = await withOperation(
      ctx,
      { kind: "set-element-status", operationId: args.operationId, ownerId: args.ownerId },
      async () => {
        const element = await setElementStatus(ctx, {
          actor: args.actor,
          elementId,
          evidence: args.evidence,
          ownerId: args.ownerId,
          status: args.status,
        });
        return { elementId: element._id };
      },
    );
    return { element: elementView((await ctx.db.get(result.elementId))!), replayed };
  },
});

export const draftPlanVersionForCounterpart = internalMutation({
  args: {
    actor: writeActorValidator,
    compiledThroughRevision: v.optional(v.number()),
    episodeId: v.string(),
    operationId: v.optional(v.string()),
    ownerId: v.string(),
    sections: planSectionsInputValidator,
    source: writeSourceValidator,
  },
  returns: v.object({ replayed: v.boolean(), version: planVersionViewValidator }),
  handler: async (ctx, args) => {
    const episodeId = normalizeIdOrThrow(ctx, "episodes", args.episodeId, "Episode");
    const sections = Object.fromEntries(
      PLAN_SECTION_KEYS.map((key) => [
        key,
        args.sections[key].map((line) => ({
          asOf: line.asOf,
          elementId: line.elementId
            ? normalizeIdOrThrow(ctx, "planElements", line.elementId, "Cited element")
            : undefined,
          noteId: line.noteId
            ? normalizeIdOrThrow(ctx, "notes", line.noteId, "Cited note")
            : undefined,
          text: line.text,
          value: line.value,
        })),
      ]),
    ) as PlanSections;
    const { replayed, result } = await withOperation(
      ctx,
      { kind: "draft-plan-version", operationId: args.operationId, ownerId: args.ownerId },
      async () => {
        const version = await draftPlanVersion(ctx, {
          actor: args.actor,
          compiledThroughRevision: args.compiledThroughRevision,
          endorsed: false,
          episodeId,
          operationId: args.operationId,
          ownerId: args.ownerId,
          sections,
          source: args.source,
        });
        return { versionId: version._id };
      },
    );
    return { replayed, version: planVersionView((await ctx.db.get(result.versionId))!) };
  },
});

export const endorsePlanVersionForCounterpart = internalMutation({
  args: {
    actor: writeActorValidator,
    episodeId: v.string(),
    operationId: v.optional(v.string()),
    ownerId: v.string(),
    versionNumber: v.number(),
  },
  returns: v.object({ replayed: v.boolean(), version: planVersionViewValidator }),
  handler: async (ctx, args) => {
    const episodeId = normalizeIdOrThrow(ctx, "episodes", args.episodeId, "Episode");
    const { replayed, result } = await withOperation(
      ctx,
      { kind: "endorse-plan-version", operationId: args.operationId, ownerId: args.ownerId },
      async () => {
        const version = await endorsePlanVersion(ctx, {
          actor: args.actor,
          episodeId,
          ownerId: args.ownerId,
          versionNumber: args.versionNumber,
        });
        return { versionId: version._id };
      },
    );
    return { replayed, version: planVersionView((await ctx.db.get(result.versionId))!) };
  },
});

export const setEpisodeCampaignForCounterpart = internalMutation({
  args: {
    campaignId: v.union(v.string(), v.null()),
    episodeId: v.string(),
    exemptedCampaignElementIds: v.optional(v.array(v.string())),
    operationId: v.optional(v.string()),
    ownerId: v.string(),
  },
  returns: v.object({ episode: episodeSummaryValidator, replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const episodeId = normalizeIdOrThrow(ctx, "episodes", args.episodeId, "Episode");
    const { replayed } = await withOperation(
      ctx,
      { kind: "set-episode-campaign", operationId: args.operationId, ownerId: args.ownerId },
      async () => {
        await setEpisodeCampaign(ctx, {
          campaignId: args.campaignId
            ? normalizeIdOrThrow(ctx, "campaigns", args.campaignId, "Campaign")
            : null,
          episodeId,
          exemptedCampaignElementIds: args.exemptedCampaignElementIds?.map((id) =>
            normalizeIdOrThrow(ctx, "planElements", id, "Element"),
          ),
          ownerId: args.ownerId,
        });
        return { episodeId };
      },
    );
    const episode = await getOwnedEpisode(ctx, args.ownerId, episodeId);
    return { episode: await episodeSummary(ctx, episode), replayed };
  },
});

export const shelveEpisodeForCounterpart = internalMutation({
  args: {
    actor: writeActorValidator,
    episodeId: v.string(),
    operationId: v.optional(v.string()),
    ownerId: v.string(),
    shelved: v.boolean(),
    source: writeSourceValidator,
  },
  returns: v.object({ episode: episodeSummaryValidator, replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const episodeId = normalizeIdOrThrow(ctx, "episodes", args.episodeId, "Episode");
    const { replayed } = await withOperation(
      ctx,
      { kind: "shelve-episode", operationId: args.operationId, ownerId: args.ownerId },
      async () => {
        await shelveEpisode(ctx, {
          actor: args.actor,
          episodeId,
          ownerId: args.ownerId,
          shelved: args.shelved,
          source: args.source,
        });
        return { episodeId };
      },
    );
    const episode = await getOwnedEpisode(ctx, args.ownerId, episodeId);
    return { episode: await episodeSummary(ctx, episode), replayed };
  },
});

export const upsertCampaignForCounterpart = internalMutation({
  args: {
    actor: writeActorValidator,
    benchmarkTicker: v.optional(v.union(v.string(), v.null())),
    campaignId: v.optional(v.string()),
    linkedTickers: v.optional(v.array(v.string())),
    name: v.optional(v.string()),
    operationId: v.optional(v.string()),
    ownerId: v.string(),
    thesis: v.optional(v.string()),
  },
  returns: v.object({ campaign: campaignContextValidator, replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const { replayed, result } = await withOperation(
      ctx,
      { kind: "upsert-campaign", operationId: args.operationId, ownerId: args.ownerId },
      async () => {
        let campaignId: Id<"campaigns">;
        if (args.campaignId) {
          campaignId = normalizeIdOrThrow(ctx, "campaigns", args.campaignId, "Campaign");
          await getOwnedCampaign(ctx, args.ownerId, campaignId);
          const patch: { name?: string; thesis?: string } = {};
          if (args.name !== undefined) {
            const name = args.name.trim();
            if (!name) throw planModelError("VALIDATION", "name is required");
            patch.name = name;
          }
          if (args.thesis !== undefined) patch.thesis = args.thesis.trim();
          if (Object.keys(patch).length > 0) await ctx.db.patch(campaignId, patch);
        } else {
          const name = args.name?.trim();
          if (!name) throw planModelError("VALIDATION", "name is required");
          campaignId = await ctx.db.insert("campaigns", {
            name,
            ownerId: args.ownerId,
            status: "active",
            thesis: args.thesis?.trim() ?? "",
          });
        }
        await setCampaignLinks(ctx, {
          actor: args.actor,
          benchmarkTicker: args.benchmarkTicker,
          campaignId,
          linkedTickers: args.linkedTickers,
          ownerId: args.ownerId,
        });
        return { campaignId };
      },
    );
    const campaign = await getOwnedCampaign(ctx, args.ownerId, result.campaignId);
    const benchmark = campaign.benchmarkThreadId
      ? await ctx.db.get(campaign.benchmarkThreadId)
      : null;
    const linked = await Promise.all(
      (campaign.linkedThreadIds ?? []).map((id) => ctx.db.get(id)),
    );
    const elements = await listCampaignElements(ctx, args.ownerId, campaign._id);
    return {
      campaign: {
        benchmarkTicker: benchmark?.ticker ?? null,
        elements: elements.map(elementView),
        id: campaign._id,
        linkedTickers: linked
          .flatMap((thread) => (thread ? [thread.ticker] : []))
          .sort((a, b) => a.localeCompare(b)),
        name: campaign.name,
        status: campaign.status,
        thesis: campaign.thesis,
      },
      replayed,
    };
  },
});
