import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";

const ARCHIVE_FORMAT = "plan_layer_clean_slate_v1";
const MAX_CAMPAIGNS = 100;
const MAX_TRADE_PLANS = 500;
const MAX_NOTES = 1_000;
const MAX_TRADES = 1_000;
const MAX_LINKED_TRADES_PER_PLAN = 500;
const MAX_TRADE_COUNT_PAGES = 1_000;
const MAX_INBOX_TRADES = 500;
const MAX_IMPORT_TASKS = 500;
const MAX_WATCHLIST_ITEMS = 500;
const MAX_RETROSPECTIVES = 100;
const MAX_REVIEW_ITEMS = 500;
const MAX_CHECK_INS = 500;
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const MAX_PLANNED_WRITES = 1_000;
const NOTE_PREVIEW_COUNT = 5;
const PREVIEW_LENGTH = 320;
const IMPORTED_SERVICE_POST_PREFIX = "Imported from service post";

type SnapshotCtx = QueryCtx | MutationCtx;

type PlanLayerSnapshot = {
  bravosReviewItems: Doc<"bravosReviewItems">[];
  campaigns: Doc<"campaigns">[];
  checkIns: Doc<"checkIns">[];
  generatedNotes: Doc<"notes">[];
  importTasks: Doc<"importTasks">[];
  inboxTrades: Doc<"inboxTrades">[];
  notesToSalvage: Doc<"notes">[];
  retrospectives: Doc<"retrospectives">[];
  tradePlans: Doc<"tradePlans">[];
  trades: Doc<"trades">[];
  watchlistItems: Doc<"watchlist">[];
};

type SnapshotMaterial = PlanLayerSnapshot & {
  archiveJson: string;
  auditToken: string;
  byteLength: number;
  contentHash: string;
};

type CleanupCounts = {
  archiveDocuments: number;
  bravosReviewItemsPatched: number;
  campaignsDeleted: number;
  checkInsPatched: number;
  clearedAppliedReviewItemNoteIds: number;
  clearedAppliedReviewItemPlanIds: number;
  clearedApprovedActionTargets: number;
  clearedCheckInNoteIds: number;
  clearedCreatedImportTaskPlanIds: number;
  clearedInboxTradePlanIds: number;
  clearedLinkedImportTaskPlanIds: number;
  clearedProposedActionTargets: number;
  clearedSuggestedReviewItemPlanIds: number;
  deletedGeneratedNotes: number;
  deletedWatchlistItems: number;
  importTasksPatched: number;
  notesSalvagedFromCampaigns: number;
  notesSalvagedFromTradePlans: number;
  retrospectivesConverted: number;
  tradePlansDeleted: number;
  tradesUnlinked: number;
};

type ExecutionResult = {
  archiveId: Id<"planLayerArchives">;
  archiveStorageId: Id<"_storage">;
  auditToken: string;
  counts: CleanupCounts;
};

type PostCleanupCounts = {
  attachedNotesRemaining: number;
  bravosReviewPlanReferencesRemaining: number;
  campaignsRemaining: number;
  checkInGeneratedNoteIdsRemaining: number;
  importTaskPlanReferencesRemaining: number;
  inboxTradePlanReferencesRemaining: number;
  retrospectiveNotesRemaining: number;
  retrospectivesRemaining: number;
  salvagedNotesVerified: number;
  tradePlanReferencesRemaining: number;
  tradePlansRemaining: number;
  tradesAfter: number;
  tradesBefore: number;
  watchlistPlanReferencesRemaining: number;
};

type PostCleanupStateCounts = Omit<PostCleanupCounts, "tradesAfter">;

const notePreviewValidator = v.object({
  contentPreview: v.string(),
  id: v.id("notes"),
  noteDate: v.number(),
  ticker: v.union(v.string(), v.null()),
});

const retrospectivePreviewValidator = v.object({
  contentPreview: v.string(),
  id: v.id("retrospectives"),
  noteDate: v.number(),
  parentKind: v.union(v.literal("campaign"), v.literal("tradePlan")),
  ticker: v.union(v.string(), v.null()),
});

const cleanupCountsValidator = v.object({
  archiveDocuments: v.number(),
  bravosReviewItemsPatched: v.number(),
  campaignsDeleted: v.number(),
  checkInsPatched: v.number(),
  clearedAppliedReviewItemNoteIds: v.number(),
  clearedAppliedReviewItemPlanIds: v.number(),
  clearedApprovedActionTargets: v.number(),
  clearedCheckInNoteIds: v.number(),
  clearedCreatedImportTaskPlanIds: v.number(),
  clearedInboxTradePlanIds: v.number(),
  clearedLinkedImportTaskPlanIds: v.number(),
  clearedProposedActionTargets: v.number(),
  clearedSuggestedReviewItemPlanIds: v.number(),
  deletedGeneratedNotes: v.number(),
  deletedWatchlistItems: v.number(),
  importTasksPatched: v.number(),
  notesSalvagedFromCampaigns: v.number(),
  notesSalvagedFromTradePlans: v.number(),
  retrospectivesConverted: v.number(),
  tradePlansDeleted: v.number(),
  tradesUnlinked: v.number(),
});

const dryRunValidator = v.object({
  archiveByteLength: v.number(),
  auditToken: v.string(),
  classificationNotice: v.string(),
  counts: cleanupCountsValidator,
  generatedImportNoteCandidateCount: v.number(),
  generatedImportNoteCandidatePreviews: v.array(notePreviewValidator),
  importMarkerNotesWithAdditionalProseSalvaged: v.number(),
  plannedWrites: v.number(),
  retrospectivePreviews: v.array(retrospectivePreviewValidator),
  salvagedNotePreviews: v.array(notePreviewValidator),
});

const executionValidator = v.object({
  archiveId: v.id("planLayerArchives"),
  archiveStorageId: v.id("_storage"),
  auditToken: v.string(),
  counts: cleanupCountsValidator,
});

const postCleanupStateCountsValidator = v.object({
  attachedNotesRemaining: v.number(),
  bravosReviewPlanReferencesRemaining: v.number(),
  campaignsRemaining: v.number(),
  checkInGeneratedNoteIdsRemaining: v.number(),
  importTaskPlanReferencesRemaining: v.number(),
  inboxTradePlanReferencesRemaining: v.number(),
  retrospectiveNotesRemaining: v.number(),
  retrospectivesRemaining: v.number(),
  salvagedNotesVerified: v.number(),
  tradePlanReferencesRemaining: v.number(),
  tradePlansRemaining: v.number(),
  tradesBefore: v.number(),
  watchlistPlanReferencesRemaining: v.number(),
});

const postCleanupCountsValidator = v.object({
  ...postCleanupStateCountsValidator.fields,
  tradesAfter: v.number(),
});

const postCleanupStateValidator = v.object({
  archiveReadable: v.boolean(),
  archiveStorageId: v.id("_storage"),
  auditToken: v.string(),
  counts: postCleanupStateCountsValidator,
});

const postCleanupValidator = v.object({
  archiveReadable: v.boolean(),
  archiveStorageId: v.id("_storage"),
  auditToken: v.string(),
  counts: postCleanupCountsValidator,
});

function assertBounded<T>(rows: T[], label: string, maximum: number): T[] {
  if (rows.length > maximum) {
    throw new ConvexError(
      `Plan-layer cleanup refused: ${label} exceeds its bounded safety limit of ${maximum}`,
    );
  }
  return rows;
}

function includesId(
  ids: Set<string>,
  value: Id<"campaigns"> | Id<"tradePlans"> | Id<"notes"> | undefined,
) {
  return value !== undefined && ids.has(String(value));
}

function isBravosSourceUrl(sourceUrl: string): boolean {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    return (
      hostname === "bravosresearch.com" ||
      hostname.endsWith(".bravosresearch.com")
    );
  } catch {
    return false;
  }
}

function actionTargetsPlan(
  action: Doc<"bravosReviewItems">["proposedAction"] | undefined,
  tradePlanIds: Set<string>,
) {
  return (
    (action?.kind === "apply_follow_up" || action?.kind === "note_only") &&
    includesId(tradePlanIds, action.targetTradePlanId)
  );
}

function actionHasTradePlanTarget(
  action: Doc<"bravosReviewItems">["proposedAction"] | undefined,
) {
  return (
    (action?.kind === "apply_follow_up" || action?.kind === "note_only") &&
    action.targetTradePlanId !== undefined
  );
}

function actionWithoutDeletedTarget(
  action: Doc<"bravosReviewItems">["proposedAction"] | undefined,
  tradePlanIds: Set<string>,
) {
  if (
    action?.kind === "apply_follow_up" &&
    includesId(tradePlanIds, action.targetTradePlanId)
  ) {
    return { ...action, targetTradePlanId: undefined };
  }
  if (
    action?.kind === "note_only" &&
    includesId(tradePlanIds, action.targetTradePlanId)
  ) {
    return { ...action, targetTradePlanId: undefined };
  }
  return action;
}

function preview(content: string) {
  const trimmed = content.trim();
  return trimmed.length <= PREVIEW_LENGTH
    ? trimmed
    : `${trimmed.slice(0, PREVIEW_LENGTH - 1)}…`;
}

function hasImportedServicePostMarker(note: Doc<"notes">) {
  return new RegExp(`^${IMPORTED_SERVICE_POST_PREFIX}(?:\\s|:|$)`).test(
    note.content.trim(),
  );
}

function isMarkerOnlyImportedServicePost(note: Doc<"notes">) {
  return new RegExp(`^${IMPORTED_SERVICE_POST_PREFIX}(?::\\s+\\S+)?$`).test(
    note.content.trim(),
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function plannedCounts(snapshot: PlanLayerSnapshot): CleanupCounts {
  const tradePlanIds = new Set(
    snapshot.tradePlans.map((plan) => String(plan._id)),
  );
  const generatedNoteIds = new Set(
    snapshot.generatedNotes.map((note) => String(note._id)),
  );
  const importTaskFieldClears = snapshot.importTasks.reduce(
    (count, task) =>
      count +
      Number(includesId(tradePlanIds, task.tradePlanId)) +
      Number(includesId(tradePlanIds, task.createdTradePlanId)),
    0,
  );
  const reviewCounts = snapshot.bravosReviewItems.reduce(
    (counts, item) => {
      counts.clearedAppliedReviewItemNoteIds += Number(
        includesId(generatedNoteIds, item.appliedNoteId),
      );
      counts.clearedAppliedReviewItemPlanIds += Number(
        includesId(tradePlanIds, item.appliedTradePlanId),
      );
      counts.clearedSuggestedReviewItemPlanIds += Number(
        includesId(tradePlanIds, item.suggestedTradePlanId),
      );
      counts.clearedProposedActionTargets += Number(
        actionTargetsPlan(item.proposedAction, tradePlanIds),
      );
      counts.clearedApprovedActionTargets += Number(
        actionTargetsPlan(item.approvedAction, tradePlanIds),
      );
      return counts;
    },
    {
      clearedAppliedReviewItemNoteIds: 0,
      clearedAppliedReviewItemPlanIds: 0,
      clearedApprovedActionTargets: 0,
      clearedProposedActionTargets: 0,
      clearedSuggestedReviewItemPlanIds: 0,
    },
  );
  const clearedCheckInNoteIds = snapshot.checkIns.reduce(
    (count, checkIn) =>
      count +
      (checkIn.noteIds ?? []).filter((noteId) =>
        includesId(generatedNoteIds, noteId),
      ).length,
    0,
  );

  return {
    archiveDocuments:
      snapshot.campaigns.length +
      snapshot.tradePlans.length +
      snapshot.generatedNotes.length +
      snapshot.retrospectives.length +
      snapshot.watchlistItems.length,
    bravosReviewItemsPatched: snapshot.bravosReviewItems.length,
    campaignsDeleted: snapshot.campaigns.length,
    checkInsPatched: snapshot.checkIns.length,
    ...reviewCounts,
    clearedCheckInNoteIds,
    clearedCreatedImportTaskPlanIds:
      importTaskFieldClears -
      snapshot.importTasks.filter((task) =>
        includesId(tradePlanIds, task.tradePlanId),
      ).length,
    clearedInboxTradePlanIds: snapshot.inboxTrades.length,
    clearedLinkedImportTaskPlanIds: snapshot.importTasks.filter((task) =>
      includesId(tradePlanIds, task.tradePlanId),
    ).length,
    deletedGeneratedNotes: snapshot.generatedNotes.length,
    deletedWatchlistItems: snapshot.watchlistItems.length,
    importTasksPatched: snapshot.importTasks.length,
    notesSalvagedFromCampaigns: snapshot.notesToSalvage.filter(
      (note) => note.campaignId !== undefined,
    ).length,
    notesSalvagedFromTradePlans: snapshot.notesToSalvage.filter(
      (note) => note.tradePlanId !== undefined,
    ).length,
    retrospectivesConverted: snapshot.retrospectives.length,
    tradePlansDeleted: snapshot.tradePlans.length,
    tradesUnlinked: snapshot.trades.length,
  };
}

function writeCount(counts: ReturnType<typeof plannedCounts>) {
  return (
    1 +
    counts.campaignsDeleted +
    counts.tradePlansDeleted +
    counts.deletedGeneratedNotes +
    counts.deletedWatchlistItems +
    counts.notesSalvagedFromCampaigns +
    counts.notesSalvagedFromTradePlans +
    counts.retrospectivesConverted * 2 +
    counts.tradesUnlinked +
    counts.clearedInboxTradePlanIds +
    counts.importTasksPatched +
    counts.bravosReviewItemsPatched +
    counts.checkInsPatched
  );
}

async function readBoundedTradesForPlans(
  ctx: SnapshotCtx,
  ownerId: string,
  tradePlanIds: Id<"tradePlans">[],
  label: string,
) {
  const trades: Doc<"trades">[] = [];
  for (const tradePlanId of tradePlanIds) {
    const remainingBeforeRefusal = MAX_TRADES + 1 - trades.length;
    if (remainingBeforeRefusal <= 0) {
      throw new ConvexError(
        `Plan-layer cleanup refused: ${label} exceeds its bounded safety limit of ${MAX_TRADES}`,
      );
    }
    const rows = await ctx.db
      .query("trades")
      .withIndex("by_owner_tradePlanId", (q) =>
        q.eq("ownerId", ownerId).eq("tradePlanId", tradePlanId),
      )
      .take(Math.min(MAX_LINKED_TRADES_PER_PLAN + 1, remainingBeforeRefusal));
    assertBounded(
      rows,
      "trades linked to one trade plan",
      MAX_LINKED_TRADES_PER_PLAN,
    );
    trades.push(...rows);
    assertBounded(trades, label, MAX_TRADES);
  }
  return trades;
}

async function readSnapshot(
  ctx: SnapshotCtx,
  ownerId: string,
): Promise<PlanLayerSnapshot> {
  const [
    campaigns,
    tradePlans,
    notes,
    inboxTrades,
    importTasks,
    watchlistItems,
    retrospectives,
    allReviewItems,
    allCheckIns,
  ] = await Promise.all([
    ctx.db
      .query("campaigns")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(MAX_CAMPAIGNS + 1),
    ctx.db
      .query("tradePlans")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(MAX_TRADE_PLANS + 1),
    ctx.db
      .query("notes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(MAX_NOTES + 1),
    ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_date", (q) => q.eq("ownerId", ownerId))
      .take(MAX_INBOX_TRADES + 1),
    ctx.db
      .query("importTasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(MAX_IMPORT_TASKS + 1),
    ctx.db
      .query("watchlist")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(MAX_WATCHLIST_ITEMS + 1),
    ctx.db
      .query("retrospectives")
      .withIndex("by_owner_parent", (q) => q.eq("ownerId", ownerId))
      .take(MAX_RETROSPECTIVES + 1),
    ctx.db
      .query("bravosReviewItems")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(MAX_REVIEW_ITEMS + 1),
    ctx.db
      .query("checkIns")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(MAX_CHECK_INS + 1),
  ]);

  assertBounded(campaigns, "campaign set", MAX_CAMPAIGNS);
  assertBounded(tradePlans, "trade-plan set", MAX_TRADE_PLANS);
  assertBounded(notes, "note set", MAX_NOTES);
  assertBounded(inboxTrades, "inbox-trade set", MAX_INBOX_TRADES);
  assertBounded(importTasks, "import-task set", MAX_IMPORT_TASKS);
  assertBounded(watchlistItems, "watchlist set", MAX_WATCHLIST_ITEMS);
  assertBounded(retrospectives, "retrospective set", MAX_RETROSPECTIVES);
  assertBounded(allReviewItems, "Bravos review set", MAX_REVIEW_ITEMS);
  assertBounded(allCheckIns, "check-in set", MAX_CHECK_INS);

  const campaignIds = new Set(
    campaigns.map((campaign) => String(campaign._id)),
  );
  const tradePlanIds = new Set(tradePlans.map((plan) => String(plan._id)));
  const trades = await readBoundedTradesForPlans(
    ctx,
    ownerId,
    tradePlans.map((plan) => plan._id),
    "linked trade set",
  );
  const bravosAppliedNoteIds = new Set(
    allReviewItems
      .filter((item) => isBravosSourceUrl(item.sourceUrl))
      .map((item) => item.appliedNoteId)
      .filter((noteId): noteId is Id<"notes"> => noteId !== undefined)
      .map(String),
  );
  const attachedNotes = notes.filter(
    (note) =>
      includesId(campaignIds, note.campaignId) ||
      includesId(tradePlanIds, note.tradePlanId),
  );
  for (const note of notes) {
    if (
      (note.campaignId !== undefined &&
        !includesId(campaignIds, note.campaignId)) ||
      (note.tradePlanId !== undefined &&
        !includesId(tradePlanIds, note.tradePlanId))
    ) {
      throw new ConvexError(
        `Plan-layer cleanup refused: note ${note._id} references a campaign or trade plan outside the owner cleanup set`,
      );
    }
  }
  for (const note of attachedNotes) {
    if (note.campaignId !== undefined && note.tradePlanId !== undefined) {
      throw new ConvexError(
        `Plan-layer cleanup refused: note ${note._id} has both campaign and trade-plan parents`,
      );
    }
  }
  const generatedNotes = attachedNotes.filter(
    (note) =>
      bravosAppliedNoteIds.has(String(note._id)) ||
      isMarkerOnlyImportedServicePost(note),
  );
  const generatedNoteIds = new Set(
    generatedNotes.map((note) => String(note._id)),
  );
  const bravosReviewItems = allReviewItems.filter(
    (item) =>
      includesId(generatedNoteIds, item.appliedNoteId) ||
      includesId(tradePlanIds, item.appliedTradePlanId) ||
      includesId(tradePlanIds, item.suggestedTradePlanId) ||
      actionTargetsPlan(item.proposedAction, tradePlanIds) ||
      actionTargetsPlan(item.approvedAction, tradePlanIds),
  );

  return {
    bravosReviewItems,
    campaigns,
    checkIns: allCheckIns.filter((checkIn) =>
      (checkIn.noteIds ?? []).some((noteId) =>
        includesId(generatedNoteIds, noteId),
      ),
    ),
    generatedNotes,
    importTasks: importTasks.filter(
      (task) =>
        includesId(tradePlanIds, task.tradePlanId) ||
        includesId(tradePlanIds, task.createdTradePlanId),
    ),
    inboxTrades: inboxTrades.filter((trade) =>
      includesId(tradePlanIds, trade.tradePlanId),
    ),
    notesToSalvage: attachedNotes.filter(
      (note) => !generatedNoteIds.has(String(note._id)),
    ),
    retrospectives: retrospectives.filter((retro) => {
      const hasExpectedParent =
        (retro.parentKind === "campaign" &&
          includesId(campaignIds, retro.parentId)) ||
        (retro.parentKind === "tradePlan" &&
          includesId(tradePlanIds, retro.parentId));
      if (!hasExpectedParent) {
        throw new ConvexError(
          `Plan-layer cleanup refused: retrospective ${retro._id} references a campaign or trade plan outside the owner cleanup set`,
        );
      }
      return true;
    }),
    tradePlans,
    trades: trades.filter((trade) =>
      includesId(tradePlanIds, trade.tradePlanId),
    ),
    watchlistItems: watchlistItems.filter(
      (item) =>
        includesId(campaignIds, item.campaignId) ||
        includesId(tradePlanIds, item.tradePlanId),
    ),
  };
}

async function snapshotMaterial(
  ctx: SnapshotCtx,
  ownerId: string,
): Promise<SnapshotMaterial> {
  const snapshot = await readSnapshot(ctx, ownerId);
  const archiveJson = JSON.stringify(
    canonicalize({
      archiveFormat: ARCHIVE_FORMAT,
      ownerId,
      snapshot,
    }),
  );
  const byteLength = new TextEncoder().encode(archiveJson).byteLength;
  if (byteLength > MAX_ARCHIVE_BYTES) {
    throw new ConvexError(
      `Plan-layer cleanup refused: archive payload exceeds its ${MAX_ARCHIVE_BYTES}-byte safety limit`,
    );
  }
  const counts = plannedCounts(snapshot);
  const plannedWrites = writeCount(counts);
  if (plannedWrites > MAX_PLANNED_WRITES) {
    throw new ConvexError(
      `Plan-layer cleanup refused: ${plannedWrites} planned writes exceeds its ${MAX_PLANNED_WRITES}-write safety limit`,
    );
  }
  const contentHash = await sha256Hex(archiveJson);
  return {
    ...snapshot,
    archiveJson,
    auditToken: `${ARCHIVE_FORMAT}:${contentHash}`,
    byteLength,
    contentHash,
  };
}

function dryRunSummary(material: SnapshotMaterial) {
  const planById = new Map(
    material.tradePlans.map((plan) => [String(plan._id), plan]),
  );
  const counts = plannedCounts(material);
  const importMarkerNotesWithAdditionalProseSalvaged =
    material.notesToSalvage.filter(hasImportedServicePostMarker).length;
  const generatedImportNoteCandidates = material.generatedNotes.filter(
    isMarkerOnlyImportedServicePost,
  );
  const notePreviewFor = (note: Doc<"notes">) => ({
    contentPreview: preview(note.content),
    id: note._id,
    noteDate: note.noteDate,
    ticker:
      note.tradePlanId === undefined
        ? null
        : (planById.get(String(note.tradePlanId))?.instrumentSymbol ?? null),
  });
  return {
    archiveByteLength: material.byteLength,
    auditToken: material.auditToken,
    classificationNotice:
      "Notes without a generated-data signal are conservatively treated as Jackson-authored; this is a negative-signal classification, not proof. Marker-only ‘Imported from service post’ notes are machine provenance and archive-only; marker-prefixed notes with additional prose remain salvaged.",
    counts,
    generatedImportNoteCandidateCount: generatedImportNoteCandidates.length,
    generatedImportNoteCandidatePreviews: generatedImportNoteCandidates
      .slice(0, NOTE_PREVIEW_COUNT)
      .map(notePreviewFor),
    importMarkerNotesWithAdditionalProseSalvaged,
    plannedWrites: writeCount(counts),
    retrospectivePreviews: material.retrospectives.map((retro) => {
      const plan = planById.get(String(retro.parentId));
      return {
        contentPreview: preview(retro.content),
        id: retro._id,
        noteDate: retro.updatedAt,
        parentKind: retro.parentKind,
        ticker: plan?.instrumentSymbol ?? null,
      };
    }),
    salvagedNotePreviews: [...material.notesToSalvage]
      .sort((left, right) => right.noteDate - left.noteDate)
      .slice(0, NOTE_PREVIEW_COUNT)
      .map(notePreviewFor),
  };
}

export const inspect = internalQuery({
  args: { ownerId: v.string() },
  returns: dryRunValidator,
  handler: async (ctx, args) =>
    dryRunSummary(await snapshotMaterial(ctx, args.ownerId)),
});

export const getArchivePayload = internalQuery({
  args: { ownerId: v.string() },
  returns: v.object({
    archiveJson: v.string(),
    auditToken: v.string(),
    contentHash: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    archiveJson: string;
    auditToken: string;
    contentHash: string;
  }> => {
    const material = await snapshotMaterial(ctx, args.ownerId);
    return {
      archiveJson: material.archiveJson,
      auditToken: material.auditToken,
      contentHash: material.contentHash,
    };
  },
});

export const hasCommittedAuditToken = internalQuery({
  args: { auditToken: v.string(), ownerId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    (await ctx.db
      .query("planLayerArchives")
      .withIndex("by_owner_auditToken", (q) =>
        q.eq("ownerId", args.ownerId).eq("auditToken", args.auditToken),
      )
      .unique()) !== null,
});

export const countOwnerTradesPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), ownerId: v.string() },
  returns: v.object({
    continueCursor: v.string(),
    count: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .paginate({ cursor: args.cursor, numItems: 500 });
    return {
      continueCursor: page.continueCursor,
      count: page.page.length,
      isDone: page.isDone,
    };
  },
});

async function countOwnerTrades(
  ctx: Pick<ActionCtx, "runQuery">,
  ownerId: string,
) {
  let cursor: string | null = null;
  let count = 0;
  for (
    let pageNumber = 0;
    pageNumber < MAX_TRADE_COUNT_PAGES;
    pageNumber += 1
  ) {
    const page: { continueCursor: string; count: number; isDone: boolean } =
      await ctx.runQuery(internal.planLayerCleanup.countOwnerTradesPage, {
        cursor,
        ownerId,
      });
    count += page.count;
    cursor = page.continueCursor;
    if (page.isDone) return count;
  }
  throw new ConvexError(
    `Plan-layer cleanup refused: owner trade count exceeds its ${MAX_TRADE_COUNT_PAGES}-page safety limit`,
  );
}

export const getPostCheckState = internalQuery({
  args: { auditToken: v.string(), ownerId: v.string() },
  returns: postCleanupStateValidator,
  handler: async (ctx, args) => {
    const archive = await ctx.db
      .query("planLayerArchives")
      .withIndex("by_owner_auditToken", (q) =>
        q.eq("ownerId", args.ownerId).eq("auditToken", args.auditToken),
      )
      .unique();
    if (!archive) {
      throw new ConvexError(
        "Plan-layer cleanup post-check refused: no committed archive matches this audit token",
      );
    }

    const [
      campaigns,
      tradePlans,
      notes,
      inboxTrades,
      importTasks,
      watchlistItems,
      retrospectives,
      reviewItems,
      checkIns,
      salvagedNotes,
    ] = await Promise.all([
      ctx.db
        .query("campaigns")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_CAMPAIGNS + 1),
      ctx.db
        .query("tradePlans")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_TRADE_PLANS + 1),
      ctx.db
        .query("notes")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_NOTES + 1),
      ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_INBOX_TRADES + 1),
      ctx.db
        .query("importTasks")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_IMPORT_TASKS + 1),
      ctx.db
        .query("watchlist")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_WATCHLIST_ITEMS + 1),
      ctx.db
        .query("retrospectives")
        .withIndex("by_owner_parent", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_RETROSPECTIVES + 1),
      ctx.db
        .query("bravosReviewItems")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_REVIEW_ITEMS + 1),
      ctx.db
        .query("checkIns")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_CHECK_INS + 1),
      Promise.all(archive.salvagedNoteIds.map((noteId) => ctx.db.get(noteId))),
    ]);
    assertBounded(campaigns, "post-check campaign set", MAX_CAMPAIGNS);
    assertBounded(tradePlans, "post-check trade-plan set", MAX_TRADE_PLANS);
    assertBounded(notes, "post-check note set", MAX_NOTES);
    assertBounded(inboxTrades, "post-check inbox-trade set", MAX_INBOX_TRADES);
    assertBounded(importTasks, "post-check import-task set", MAX_IMPORT_TASKS);
    assertBounded(
      watchlistItems,
      "post-check watchlist set",
      MAX_WATCHLIST_ITEMS,
    );
    assertBounded(
      retrospectives,
      "post-check retrospective set",
      MAX_RETROSPECTIVES,
    );
    assertBounded(
      reviewItems,
      "post-check Bravos review set",
      MAX_REVIEW_ITEMS,
    );
    assertBounded(checkIns, "post-check check-in set", MAX_CHECK_INS);

    const generatedNoteIds = new Set(archive.generatedNoteIds.map(String));
    const linkedTrades = await readBoundedTradesForPlans(
      ctx,
      args.ownerId,
      archive.deletedTradePlanIds,
      "post-check linked trade set",
    );
    const counts: PostCleanupStateCounts = {
      attachedNotesRemaining: notes.filter(
        (note) =>
          note.campaignId !== undefined || note.tradePlanId !== undefined,
      ).length,
      bravosReviewPlanReferencesRemaining: reviewItems.filter(
        (item) =>
          item.appliedTradePlanId !== undefined ||
          item.suggestedTradePlanId !== undefined ||
          actionHasTradePlanTarget(item.proposedAction) ||
          actionHasTradePlanTarget(item.approvedAction),
      ).length,
      campaignsRemaining: campaigns.length,
      checkInGeneratedNoteIdsRemaining: checkIns.reduce(
        (count, checkIn) =>
          count +
          (checkIn.noteIds ?? []).filter((noteId) =>
            generatedNoteIds.has(String(noteId)),
          ).length,
        0,
      ),
      importTaskPlanReferencesRemaining: importTasks.filter(
        (task) =>
          task.tradePlanId !== undefined ||
          task.createdTradePlanId !== undefined,
      ).length,
      inboxTradePlanReferencesRemaining: inboxTrades.filter(
        (trade) => trade.tradePlanId !== undefined,
      ).length,
      retrospectiveNotesRemaining: notes.filter(
        (note) => note.origin === "retrospective",
      ).length,
      retrospectivesRemaining: retrospectives.length,
      salvagedNotesVerified: salvagedNotes.filter(
        (note) =>
          note !== null &&
          note.campaignId === undefined &&
          note.tradePlanId === undefined,
      ).length,
      tradePlanReferencesRemaining: linkedTrades.length,
      tradePlansRemaining: tradePlans.length,
      tradesBefore: archive.baselineTradeCount,
      watchlistPlanReferencesRemaining: watchlistItems.filter(
        (item) =>
          item.campaignId !== undefined || item.tradePlanId !== undefined,
      ).length,
    };
    return {
      archiveReadable: (await ctx.storage.getUrl(archive.storageId)) !== null,
      archiveStorageId: archive.storageId,
      auditToken: archive.auditToken,
      counts,
    };
  },
});

export const postCheck = internalAction({
  args: { auditToken: v.string(), ownerId: v.string() },
  returns: postCleanupValidator,
  handler: async (ctx, args) => {
    const state: {
      archiveReadable: boolean;
      archiveStorageId: Id<"_storage">;
      auditToken: string;
      counts: PostCleanupStateCounts;
    } = await ctx.runQuery(internal.planLayerCleanup.getPostCheckState, args);
    return {
      ...state,
      counts: {
        ...state.counts,
        tradesAfter: await countOwnerTrades(ctx, args.ownerId),
      },
    };
  },
});

export const execute = internalAction({
  args: {
    expectedAuditToken: v.string(),
    ownerId: v.string(),
    productionSnapshotReference: v.string(),
  },
  returns: executionValidator,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const snapshotReference = args.productionSnapshotReference.trim();
    if (!snapshotReference) {
      throw new ConvexError(
        "Plan-layer cleanup refused: a retained production snapshot reference is required",
      );
    }
    const payload: {
      archiveJson: string;
      auditToken: string;
      contentHash: string;
    } = await ctx.runQuery(internal.planLayerCleanup.getArchivePayload, {
      ownerId: args.ownerId,
    });
    if (payload.auditToken !== args.expectedAuditToken) {
      throw new ConvexError(
        "Plan-layer cleanup refused: live data no longer matches the approved audit token",
      );
    }
    const baselineTradeCount = await countOwnerTrades(ctx, args.ownerId);

    let archiveStorageId: Id<"_storage"> | undefined;
    try {
      archiveStorageId = await ctx.storage.store(
        new Blob([payload.archiveJson], { type: "application/json" }),
      );
      const committed: ExecutionResult = await ctx.runMutation(
        internal.planLayerCleanup.commit,
        {
          archiveContentHash: payload.contentHash,
          archiveStorageId,
          baselineTradeCount,
          expectedAuditToken: args.expectedAuditToken,
          ownerId: args.ownerId,
          productionSnapshotReference: snapshotReference,
        },
      );
      return committed;
    } catch (error) {
      if (archiveStorageId) {
        let archiveWasCommitted = true;
        try {
          archiveWasCommitted = await ctx.runQuery(
            internal.planLayerCleanup.hasCommittedAuditToken,
            { auditToken: args.expectedAuditToken, ownerId: args.ownerId },
          );
          if (!archiveWasCommitted) {
            await ctx.storage.delete(archiveStorageId);
          }
        } catch (cleanupError) {
          console.error(
            "Plan-layer cleanup archive blob cleanup could not prove the blob is unreferenced",
            cleanupError,
          );
        }
      }
      throw error;
    }
  },
});

export const commit = internalMutation({
  args: {
    archiveContentHash: v.string(),
    archiveStorageId: v.id("_storage"),
    baselineTradeCount: v.number(),
    expectedAuditToken: v.string(),
    ownerId: v.string(),
    productionSnapshotReference: v.string(),
  },
  returns: executionValidator,
  handler: async (ctx, args) => {
    const material = await snapshotMaterial(ctx, args.ownerId);
    if (
      material.auditToken !== args.expectedAuditToken ||
      args.archiveContentHash !== material.contentHash
    ) {
      throw new ConvexError(
        "Plan-layer cleanup refused: live data or archive content no longer matches the approved audit token",
      );
    }
    const existingArchive = await ctx.db
      .query("planLayerArchives")
      .withIndex("by_owner_auditToken", (q) =>
        q.eq("ownerId", args.ownerId).eq("auditToken", args.expectedAuditToken),
      )
      .unique();
    if (existingArchive) {
      throw new ConvexError(
        "Plan-layer cleanup refused: this audit token has already been committed",
      );
    }

    const counts = plannedCounts(material);
    const planById = new Map(
      material.tradePlans.map((plan) => [String(plan._id), plan]),
    );
    const tradePlanIds = new Set(
      material.tradePlans.map((plan) => String(plan._id)),
    );
    const generatedNoteIds = new Set(
      material.generatedNotes.map((note) => String(note._id)),
    );
    const archiveId = await ctx.db.insert("planLayerArchives", {
      archiveFormat: ARCHIVE_FORMAT,
      auditToken: material.auditToken,
      baselineTradeCount: args.baselineTradeCount,
      contentHash: material.contentHash,
      createdAt: Date.now(),
      deletedTradePlanIds: material.tradePlans.map((plan) => plan._id),
      generatedNoteIds: material.generatedNotes.map((note) => note._id),
      ownerId: args.ownerId,
      productionSnapshotReference: args.productionSnapshotReference,
      retrospectivesConverted: material.retrospectives.length,
      salvagedNoteIds: material.notesToSalvage.map((note) => note._id),
      storageId: args.archiveStorageId,
    });

    for (const note of material.notesToSalvage) {
      const ticker =
        note.tradePlanId === undefined
          ? note.ticker
          : (planById.get(String(note.tradePlanId))?.instrumentSymbol ??
            note.ticker);
      await ctx.db.patch(note._id, {
        campaignId: undefined,
        ticker,
        tradePlanId: undefined,
      });
    }
    for (const retrospective of material.retrospectives) {
      const ticker = planById.get(
        String(retrospective.parentId),
      )?.instrumentSymbol;
      await ctx.db.insert("notes", {
        content: retrospective.content,
        noteDate: retrospective.updatedAt,
        origin: "retrospective",
        ownerId: retrospective.ownerId,
        ticker,
      });
    }
    for (const trade of material.trades) {
      await ctx.db.patch(trade._id, { tradePlanId: undefined });
    }
    for (const inboxTrade of material.inboxTrades) {
      await ctx.db.patch(inboxTrade._id, { tradePlanId: undefined });
    }
    for (const task of material.importTasks) {
      await ctx.db.patch(task._id, {
        createdTradePlanId: includesId(tradePlanIds, task.createdTradePlanId)
          ? undefined
          : task.createdTradePlanId,
        tradePlanId: includesId(tradePlanIds, task.tradePlanId)
          ? undefined
          : task.tradePlanId,
      });
    }
    for (const reviewItem of material.bravosReviewItems) {
      await ctx.db.patch(reviewItem._id, {
        appliedNoteId: includesId(generatedNoteIds, reviewItem.appliedNoteId)
          ? undefined
          : reviewItem.appliedNoteId,
        appliedTradePlanId: includesId(
          tradePlanIds,
          reviewItem.appliedTradePlanId,
        )
          ? undefined
          : reviewItem.appliedTradePlanId,
        approvedAction: actionWithoutDeletedTarget(
          reviewItem.approvedAction,
          tradePlanIds,
        ),
        proposedAction: actionWithoutDeletedTarget(
          reviewItem.proposedAction,
          tradePlanIds,
        )!,
        suggestedTradePlanId: includesId(
          tradePlanIds,
          reviewItem.suggestedTradePlanId,
        )
          ? undefined
          : reviewItem.suggestedTradePlanId,
      });
    }
    for (const checkIn of material.checkIns) {
      const noteIds = (checkIn.noteIds ?? []).filter(
        (noteId) => !includesId(generatedNoteIds, noteId),
      );
      await ctx.db.patch(checkIn._id, {
        noteIds: noteIds.length > 0 ? noteIds : undefined,
      });
    }
    for (const watchlistItem of material.watchlistItems) {
      await ctx.db.delete(watchlistItem._id);
    }
    for (const generatedNote of material.generatedNotes) {
      await ctx.db.delete(generatedNote._id);
    }
    for (const retrospective of material.retrospectives) {
      await ctx.db.delete(retrospective._id);
    }
    for (const tradePlan of material.tradePlans) {
      await ctx.db.delete(tradePlan._id);
    }
    for (const campaign of material.campaigns) {
      await ctx.db.delete(campaign._id);
    }

    return {
      archiveId,
      archiveStorageId: args.archiveStorageId,
      auditToken: material.auditToken,
      counts,
    };
  },
});
