import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const noteEvidenceInputValidator = v.object({
  contentType: v.optional(v.string()),
  fileName: v.optional(v.string()),
  kind: v.union(v.literal("chart"), v.literal("image")),
  storageId: v.optional(v.id("_storage")),
  url: v.optional(v.string()),
});

const noteEvidenceValidator = v.object({
  contentType: v.optional(v.string()),
  fileName: v.optional(v.string()),
  kind: v.union(v.literal("chart"), v.literal("image")),
  storageId: v.optional(v.id("_storage")),
  url: v.union(v.string(), v.null()),
});

const noteValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("notes"),
  campaignId: v.optional(v.id("campaigns")),
  chartUrls: v.optional(v.array(v.string())),
  content: v.string(),
  contextHref: v.union(v.string(), v.null()),
  contextKind: v.union(
    v.literal("campaign"),
    v.literal("general"),
    v.literal("tradePlan"),
  ),
  contextLabel: v.string(),
  evidence: v.optional(v.array(noteEvidenceValidator)),
  ownerId: v.string(),
  tradePlanId: v.optional(v.id("tradePlans")),
});

type NoteEvidenceInput = {
  contentType?: string;
  fileName?: string;
  kind: "chart" | "image";
  storageId?: Id<"_storage">;
  url?: string;
};

type NotesCtx = QueryCtx | MutationCtx;

function trimNoteContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new ConvexError("Note content is required");
  }
  return trimmed;
}

function trimOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeChartUrls(
  chartUrls: string[] | undefined,
): string[] | undefined {
  if (chartUrls === undefined) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(chartUrls.map((url) => url.trim()).filter(Boolean)),
  );

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeEvidence(
  evidence: NoteEvidenceInput[] | undefined,
): NoteEvidenceInput[] | undefined {
  if (evidence === undefined) {
    return undefined;
  }

  const normalized = evidence.map((item) => {
    const contentType = trimOptionalValue(item.contentType);
    const fileName = trimOptionalValue(item.fileName);
    const url = trimOptionalValue(item.url);

    if (!item.storageId && !url) {
      throw new ConvexError(
        "Each evidence item must include either a storageId or a url",
      );
    }

    return {
      contentType,
      fileName,
      kind: item.kind,
      storageId: item.storageId,
      url,
    };
  });

  return normalized.length > 0 ? normalized : undefined;
}

function validateSingleParent(args: {
  campaignId?: string;
  tradePlanId?: string;
}) {
  const parentCount = [args.campaignId, args.tradePlanId].filter(
    Boolean,
  ).length;
  if (parentCount > 1) {
    throw new ConvexError("A note can only belong to one parent");
  }
}

async function buildNoteContextLookups(ctx: NotesCtx, notes: Doc<"notes">[]) {
  const campaignIds = Array.from(
    new Set(
      notes
        .map((note) => note.campaignId)
        .filter(
          (campaignId): campaignId is Id<"campaigns"> =>
            campaignId !== undefined,
        ),
    ),
  );
  const tradePlanIds = Array.from(
    new Set(
      notes
        .map((note) => note.tradePlanId)
        .filter(
          (tradePlanId): tradePlanId is Id<"tradePlans"> =>
            tradePlanId !== undefined,
        ),
    ),
  );

  const campaigns = await Promise.all(
    campaignIds.map(
      async (campaignId) => [campaignId, await ctx.db.get(campaignId)] as const,
    ),
  );
  const tradePlans = await Promise.all(
    tradePlanIds.map(
      async (tradePlanId) =>
        [tradePlanId, await ctx.db.get(tradePlanId)] as const,
    ),
  );

  return {
    campaigns: new Map(campaigns),
    tradePlans: new Map(tradePlans),
  };
}

async function resolveNoteEvidence(ctx: NotesCtx, note: Doc<"notes">) {
  const evidence = new Map<
    string,
    {
      contentType?: string;
      fileName?: string;
      kind: "chart" | "image";
      storageId?: Id<"_storage">;
      url: string | null;
    }
  >();

  for (const chartUrl of note.chartUrls ?? []) {
    evidence.set(`legacy:${chartUrl}`, {
      kind: "chart",
      url: chartUrl,
    });
  }

  for (const item of note.evidence ?? []) {
    const resolvedUrl =
      item.url ??
      (item.storageId ? await ctx.storage.getUrl(item.storageId) : null);
    const key = item.storageId
      ? `storage:${item.storageId}`
      : `url:${resolvedUrl ?? item.kind}`;

    evidence.set(key, {
      contentType: item.contentType,
      fileName: item.fileName,
      kind: item.kind,
      storageId: item.storageId,
      url: resolvedUrl,
    });
  }

  const normalizedEvidence = Array.from(evidence.values());
  const chartUrls = normalizedEvidence
    .map((item) => item.url)
    .filter((url): url is string => Boolean(url));

  return {
    chartUrls: chartUrls.length > 0 ? chartUrls : undefined,
    evidence: normalizedEvidence.length > 0 ? normalizedEvidence : undefined,
  };
}

async function serializeNotes(ctx: NotesCtx, notes: Doc<"notes">[]) {
  const lookups = await buildNoteContextLookups(ctx, notes);

  return await Promise.all(
    notes.map(async (note) => {
      const { chartUrls, evidence } = await resolveNoteEvidence(ctx, note);

      if (note.campaignId) {
        const campaign = lookups.campaigns.get(note.campaignId);
        return {
          _creationTime: note._creationTime,
          _id: note._id,
          campaignId: note.campaignId,
          chartUrls,
          content: note.content,
          contextHref: `/campaigns/${note.campaignId}`,
          contextKind: "campaign" as const,
          contextLabel: campaign?.name ?? "Campaign",
          evidence,
          ownerId: note.ownerId,
          tradePlanId: note.tradePlanId,
        };
      }

      if (note.tradePlanId) {
        const tradePlan = lookups.tradePlans.get(note.tradePlanId);
        return {
          _creationTime: note._creationTime,
          _id: note._id,
          campaignId: note.campaignId,
          chartUrls,
          content: note.content,
          contextHref: `/trade-plans/${note.tradePlanId}`,
          contextKind: "tradePlan" as const,
          contextLabel: tradePlan?.name ?? "Trade Plan",
          evidence,
          ownerId: note.ownerId,
          tradePlanId: note.tradePlanId,
        };
      }

      return {
        _creationTime: note._creationTime,
        _id: note._id,
        campaignId: note.campaignId,
        chartUrls,
        content: note.content,
        contextHref: null,
        contextKind: "general" as const,
        contextLabel: "General note",
        evidence,
        ownerId: note.ownerId,
        tradePlanId: note.tradePlanId,
      };
    }),
  );
}

export const addNote = mutation({
  args: {
    campaignId: v.optional(v.id("campaigns")),
    chartUrls: v.optional(v.array(v.string())),
    content: v.string(),
    evidence: v.optional(v.array(noteEvidenceInputValidator)),
    tradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: v.id("notes"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const content = trimNoteContent(args.content);
    const chartUrls = normalizeChartUrls(args.chartUrls);
    const evidence = normalizeEvidence(args.evidence);
    validateSingleParent(args);

    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      assertOwner(campaign, ownerId, "Campaign not found");
    }
    if (args.tradePlanId) {
      const tradePlan = await ctx.db.get(args.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }

    return await ctx.db.insert("notes", {
      campaignId: args.campaignId,
      chartUrls,
      content,
      evidence,
      ownerId,
      tradePlanId: args.tradePlanId,
    });
  },
});

export const updateNote = mutation({
  args: {
    chartUrls: v.optional(v.array(v.string())),
    content: v.optional(v.string()),
    evidence: v.optional(v.array(noteEvidenceInputValidator)),
    noteId: v.id("notes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const note = await ctx.db.get(args.noteId);
    assertOwner(note, ownerId, "Note not found");

    const patch: Record<string, unknown> = {};
    if (args.content !== undefined) {
      patch.content = trimNoteContent(args.content);
    }
    if (args.chartUrls !== undefined) {
      patch.chartUrls = normalizeChartUrls(args.chartUrls);
    }
    if (args.evidence !== undefined) {
      patch.evidence = normalizeEvidence(args.evidence);
    }

    await ctx.db.patch(args.noteId, patch);
    return null;
  },
});

export const generateEvidenceUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getNotesByCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) return [];

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner_campaignId", (q) =>
        q.eq("ownerId", ownerId).eq("campaignId", args.campaignId),
      )
      .order("asc")
      .collect();

    return await serializeNotes(ctx, notes);
  },
});

export const getNotesByTradePlan = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan || tradePlan.ownerId !== ownerId) return [];

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner_tradePlanId", (q) =>
        q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
      )
      .order("asc")
      .collect();

    return await serializeNotes(ctx, notes);
  },
});

export const getGeneralNotes = query({
  args: {},
  returns: v.array(noteValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();

    return await serializeNotes(
      ctx,
      notes.filter((note) => !note.campaignId && !note.tradePlanId),
    );
  },
});

export const getNotesFeed = query({
  args: {},
  returns: v.array(noteValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();

    return await serializeNotes(ctx, notes);
  },
});
