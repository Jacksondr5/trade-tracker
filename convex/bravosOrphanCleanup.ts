import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeStorageSha256, sha256Encodings } from "./lib/sha256";

const ARCHIVE_FORMAT = "bravos_dangling_reference_repair_v1";
const MAX_ROWS_PER_TABLE = 5_000;
const MAX_ARCHIVE_BYTES = 256 * 1024;
const KNOWN_BRAVOS_ORPHAN_SOURCE_URL =
  "https://bravosresearch.com/news-feed/initiating-long-on-deere-company-de-potential-breakout/";
const PRESERVED_NOTE_CONTENT = "Charts supporting rationale, entry, and target";

const scannedReferenceFields = {
  bravosReviewItemAppliedNote: {
    field: "appliedNoteId",
    label: "bravosReviewItems.appliedNoteId",
  },
  bravosReviewItemAppliedTradePlan: {
    field: "appliedTradePlanId",
    label: "bravosReviewItems.appliedTradePlanId",
  },
  bravosReviewItemApprovedActionTarget: {
    field: "approvedAction.targetTradePlanId",
    label: "bravosReviewItems.approvedAction.targetTradePlanId",
  },
  bravosReviewItemProposedActionTarget: {
    field: "proposedAction.targetTradePlanId",
    label: "bravosReviewItems.proposedAction.targetTradePlanId",
  },
  bravosReviewItemSuggestedTradePlan: {
    field: "suggestedTradePlanId",
    label: "bravosReviewItems.suggestedTradePlanId",
  },
  checkInNoteIds: { field: "noteIds", label: "checkIns.noteIds[]" },
  importTaskCreatedTradePlan: {
    field: "createdTradePlanId",
    label: "importTasks.createdTradePlanId",
  },
  importTaskTradePlan: {
    field: "tradePlanId",
    label: "importTasks.tradePlanId",
  },
  inboxTradeTradePlan: {
    field: "tradePlanId",
    label: "inboxTrades.tradePlanId",
  },
  noteCampaign: { field: "campaignId", label: "notes.campaignId" },
  noteTradePlan: { field: "tradePlanId", label: "notes.tradePlanId" },
  retrospectiveParent: { field: "parentId", label: "retrospectives.parentId" },
  tradePlanCampaign: { field: "campaignId", label: "tradePlans.campaignId" },
  tradeTradePlan: { field: "tradePlanId", label: "trades.tradePlanId" },
  watchlistCampaign: { field: "campaignId", label: "watchlist.campaignId" },
  watchlistTradePlan: { field: "tradePlanId", label: "watchlist.tradePlanId" },
} as const;

const scannedReferenceFieldLabels = [
  ...Object.values(scannedReferenceFields).map(({ label }) => label),
];

type SnapshotCtx = QueryCtx | MutationCtx;

type OperationalReference = {
  documentId: string;
  field: string;
  ownerId: string;
  table:
    | "bravosReviewItems"
    | "importTasks"
    | "inboxTrades"
    | "notes"
    | "retrospectives"
    | "tradePlans"
    | "trades"
    | "watchlist";
  targetId: string;
  targetKind: "campaign" | "tradePlan";
  contentPreview?: string;
};

type GeneratedNoteReference = {
  documentId: string;
  field: "appliedNoteId" | "noteIds";
  ownerId: string;
  table: "bravosReviewItems" | "checkIns";
};

type Snapshot = {
  archivalReferences: {
    archiveId: string;
    table: "bravosDanglingReferenceArchives" | "planLayerArchives";
    targetId: string;
  }[];
  danglingReferences: OperationalReference[];
  generatedNoteReferences: GeneratedNoteReference[];
  documents: {
    generatedNote: Doc<"notes">;
    importTask: Doc<"importTasks">;
    preservedNote: Doc<"notes">;
  } | null;
  scannedCounts: Record<string, number>;
  scannedReferenceFields: string[];
};

type SnapshotMaterial = Snapshot & {
  archiveJson: string;
  auditToken: string;
  contentHash: string;
};

type RepairSpec = {
  generatedNoteId: Id<"notes">;
  generatedNotePlanId: Id<"tradePlans">;
  importTaskId: Id<"importTasks">;
  preservedNoteId: Id<"notes">;
  preservedNotePlanId: Id<"tradePlans">;
};

type ExecutionResult = {
  archiveId: Id<"bravosDanglingReferenceArchives">;
  archiveStorageId: Id<"_storage">;
  auditToken: string;
  effects: {
    clearedCreatedImportTaskPlanIds: number;
    deletedGeneratedNotes: number;
    detachedNotes: number;
  };
};

const repairSpecValidator = v.object({
  generatedNoteId: v.id("notes"),
  generatedNotePlanId: v.id("tradePlans"),
  importTaskId: v.id("importTasks"),
  preservedNoteId: v.id("notes"),
  preservedNotePlanId: v.id("tradePlans"),
});

const referenceValidator = v.object({
  contentPreview: v.optional(v.string()),
  documentId: v.string(),
  field: v.string(),
  ownerId: v.string(),
  table: v.union(
    v.literal("bravosReviewItems"),
    v.literal("importTasks"),
    v.literal("inboxTrades"),
    v.literal("notes"),
    v.literal("retrospectives"),
    v.literal("tradePlans"),
    v.literal("trades"),
    v.literal("watchlist"),
  ),
  targetId: v.string(),
  targetKind: v.union(v.literal("campaign"), v.literal("tradePlan")),
});

const generatedNoteReferenceValidator = v.object({
  documentId: v.string(),
  field: v.union(v.literal("appliedNoteId"), v.literal("noteIds")),
  ownerId: v.string(),
  table: v.union(v.literal("bravosReviewItems"), v.literal("checkIns")),
});

const dryRunValidator = v.object({
  archivalReferences: v.array(
    v.object({
      archiveId: v.string(),
      table: v.union(
        v.literal("bravosDanglingReferenceArchives"),
        v.literal("planLayerArchives"),
      ),
      targetId: v.string(),
    }),
  ),
  archiveByteLength: v.number(),
  auditToken: v.string(),
  danglingReferences: v.array(referenceValidator),
  expectedEffects: v.object({
    clearedCreatedImportTaskPlanIds: v.number(),
    deletedGeneratedNotes: v.number(),
    detachedNotes: v.number(),
  }),
  generatedNoteReferences: v.array(generatedNoteReferenceValidator),
  safeToExecute: v.boolean(),
  scannedCounts: v.record(v.string(), v.number()),
  scannedReferenceFields: v.array(v.string()),
});

const executionValidator = v.object({
  archiveId: v.id("bravosDanglingReferenceArchives"),
  archiveStorageId: v.id("_storage"),
  auditToken: v.string(),
  effects: v.object({
    clearedCreatedImportTaskPlanIds: v.number(),
    deletedGeneratedNotes: v.number(),
    detachedNotes: v.number(),
  }),
});

const postCheckValidator = v.object({
  archiveContentHashMatches: v.boolean(),
  archiveContainsDeletedGeneratedNote: v.boolean(),
  archiveContainsDetachedNote: v.boolean(),
  archiveReadable: v.boolean(),
  archivalReferencesPreserved: v.number(),
  auditToken: v.string(),
  clearedImportTaskReferences: v.number(),
  danglingReferencesRemaining: v.number(),
  deletedGeneratedNotesRemaining: v.number(),
  detachedNotesVerified: v.number(),
  generatedNoteReferencesRemaining: v.number(),
});

function assertBounded<T>(rows: T[], table: string): T[] {
  if (rows.length > MAX_ROWS_PER_TABLE) {
    throw new ConvexError(
      `Bravos dangling-reference repair refused: ${table} exceeds its ${MAX_ROWS_PER_TABLE}-row safety limit`,
    );
  }
  return rows;
}

function preview(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 240);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256Hex(value: string) {
  return (await sha256Encodings(value)).hex;
}

async function readSnapshot(
  ctx: SnapshotCtx,
  spec: RepairSpec,
): Promise<Snapshot> {
  const [
    campaigns,
    tradePlans,
    notes,
    watchlist,
    importTasks,
    trades,
    inboxTrades,
    retrospectives,
    reviewItems,
    checkIns,
    planLayerArchives,
    bravosArchives,
  ] = await Promise.all([
    ctx.db.query("campaigns").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db.query("tradePlans").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db.query("notes").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db.query("watchlist").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db.query("importTasks").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db.query("trades").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db.query("inboxTrades").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db.query("retrospectives").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db.query("bravosReviewItems").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db.query("checkIns").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db.query("planLayerArchives").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db
      .query("bravosDanglingReferenceArchives")
      .take(MAX_ROWS_PER_TABLE + 1),
  ]);
  const scanned = {
    bravosReviewItems: assertBounded(reviewItems, "bravosReviewItems"),
    checkIns: assertBounded(checkIns, "checkIns"),
    campaigns: assertBounded(campaigns, "campaigns"),
    importTasks: assertBounded(importTasks, "importTasks"),
    inboxTrades: assertBounded(inboxTrades, "inboxTrades"),
    notes: assertBounded(notes, "notes"),
    bravosDanglingReferenceArchives: assertBounded(
      bravosArchives,
      "bravosDanglingReferenceArchives",
    ),
    planLayerArchives: assertBounded(planLayerArchives, "planLayerArchives"),
    retrospectives: assertBounded(retrospectives, "retrospectives"),
    tradePlans: assertBounded(tradePlans, "tradePlans"),
    trades: assertBounded(trades, "trades"),
    watchlist: assertBounded(watchlist, "watchlist"),
  };
  const campaignIds = new Set(scanned.campaigns.map((row) => String(row._id)));
  const tradePlanIds = new Set(
    scanned.tradePlans.map((row) => String(row._id)),
  );
  const danglingReferences: OperationalReference[] = [];
  const generatedNoteReferences: GeneratedNoteReference[] = [];
  const addReference = (
    table: OperationalReference["table"],
    row: { _id: unknown; ownerId: string },
    field: { field: string },
    targetKind: OperationalReference["targetKind"],
    targetId: unknown,
    contentPreview?: string,
  ) => {
    if (targetId === undefined) return;
    const ids = targetKind === "campaign" ? campaignIds : tradePlanIds;
    if (!ids.has(String(targetId))) {
      danglingReferences.push({
        contentPreview,
        documentId: String(row._id),
        field: field.field,
        ownerId: row.ownerId,
        table,
        targetId: String(targetId),
        targetKind,
      });
    }
  };

  for (const plan of scanned.tradePlans) {
    addReference(
      "tradePlans",
      plan,
      scannedReferenceFields.tradePlanCampaign,
      "campaign",
      plan.campaignId,
    );
  }
  for (const note of scanned.notes) {
    addReference(
      "notes",
      note,
      scannedReferenceFields.noteCampaign,
      "campaign",
      note.campaignId,
      preview(note.content),
    );
    addReference(
      "notes",
      note,
      scannedReferenceFields.noteTradePlan,
      "tradePlan",
      note.tradePlanId,
      preview(note.content),
    );
  }
  for (const item of scanned.watchlist) {
    addReference(
      "watchlist",
      item,
      scannedReferenceFields.watchlistCampaign,
      "campaign",
      item.campaignId,
    );
    addReference(
      "watchlist",
      item,
      scannedReferenceFields.watchlistTradePlan,
      "tradePlan",
      item.tradePlanId,
    );
  }
  for (const task of scanned.importTasks) {
    addReference(
      "importTasks",
      task,
      scannedReferenceFields.importTaskTradePlan,
      "tradePlan",
      task.tradePlanId,
      preview(task.pastedText),
    );
    addReference(
      "importTasks",
      task,
      scannedReferenceFields.importTaskCreatedTradePlan,
      "tradePlan",
      task.createdTradePlanId,
      preview(task.pastedText),
    );
  }
  for (const trade of scanned.trades) {
    addReference(
      "trades",
      trade,
      scannedReferenceFields.tradeTradePlan,
      "tradePlan",
      trade.tradePlanId,
    );
  }
  for (const trade of scanned.inboxTrades) {
    addReference(
      "inboxTrades",
      trade,
      scannedReferenceFields.inboxTradeTradePlan,
      "tradePlan",
      trade.tradePlanId,
    );
  }
  for (const retrospective of scanned.retrospectives) {
    addReference(
      "retrospectives",
      retrospective,
      scannedReferenceFields.retrospectiveParent,
      retrospective.parentKind,
      retrospective.parentId,
      preview(retrospective.content),
    );
  }
  for (const item of scanned.bravosReviewItems) {
    if (item.appliedNoteId === spec.generatedNoteId) {
      generatedNoteReferences.push({
        documentId: String(item._id),
        field: scannedReferenceFields.bravosReviewItemAppliedNote.field,
        ownerId: item.ownerId,
        table: "bravosReviewItems",
      });
    }
    addReference(
      "bravosReviewItems",
      item,
      scannedReferenceFields.bravosReviewItemAppliedTradePlan,
      "tradePlan",
      item.appliedTradePlanId,
    );
    addReference(
      "bravosReviewItems",
      item,
      scannedReferenceFields.bravosReviewItemSuggestedTradePlan,
      "tradePlan",
      item.suggestedTradePlanId,
    );
    addReference(
      "bravosReviewItems",
      item,
      scannedReferenceFields.bravosReviewItemProposedActionTarget,
      "tradePlan",
      item.proposedAction?.kind === "apply_follow_up" ||
        item.proposedAction?.kind === "note_only"
        ? item.proposedAction.targetTradePlanId
        : undefined,
    );
    addReference(
      "bravosReviewItems",
      item,
      scannedReferenceFields.bravosReviewItemApprovedActionTarget,
      "tradePlan",
      item.approvedAction?.kind === "apply_follow_up" ||
        item.approvedAction?.kind === "note_only"
        ? item.approvedAction.targetTradePlanId
        : undefined,
    );
  }
  for (const checkIn of scanned.checkIns) {
    if (checkIn.noteIds?.some((noteId) => noteId === spec.generatedNoteId)) {
      generatedNoteReferences.push({
        documentId: String(checkIn._id),
        field: scannedReferenceFields.checkInNoteIds.field,
        ownerId: checkIn.ownerId,
        table: "checkIns",
      });
    }
  }

  const generatedNote = scanned.notes.find(
    (note) => note._id === spec.generatedNoteId,
  );
  const importTask = scanned.importTasks.find(
    (task) => task._id === spec.importTaskId,
  );
  const preservedNote = scanned.notes.find(
    (note) => note._id === spec.preservedNoteId,
  );
  return {
    archivalReferences: [
      ...scanned.planLayerArchives.flatMap((archive) =>
        archive.deletedTradePlanIds
          .filter((id) => !tradePlanIds.has(String(id)))
          .map((targetId) => ({
            archiveId: String(archive._id),
            table: "planLayerArchives" as const,
            targetId: String(targetId),
          })),
      ),
      ...scanned.bravosDanglingReferenceArchives.flatMap((archive) =>
        [archive.generatedNotePlanId, archive.preservedNotePlanId]
          .filter((id) => !tradePlanIds.has(String(id)))
          .map((targetId) => ({
            archiveId: String(archive._id),
            table: "bravosDanglingReferenceArchives" as const,
            targetId: String(targetId),
          })),
      ),
    ],
    danglingReferences,
    generatedNoteReferences,
    documents:
      generatedNote && importTask && preservedNote
        ? { generatedNote, importTask, preservedNote }
        : null,
    scannedCounts: Object.fromEntries(
      Object.entries(scanned).map(([table, rows]) => [table, rows.length]),
    ),
    scannedReferenceFields: scannedReferenceFieldLabels,
  };
}

function approvedShape(snapshot: Snapshot, spec: RepairSpec) {
  const { documents, danglingReferences, generatedNoteReferences } = snapshot;
  if (
    !documents ||
    danglingReferences.length !== 3 ||
    generatedNoteReferences.length !== 0
  ) {
    return false;
  }
  const { generatedNote, importTask, preservedNote } = documents;
  const expectedReferences = [
    `${spec.generatedNoteId}:tradePlanId:${spec.generatedNotePlanId}`,
    `${spec.importTaskId}:createdTradePlanId:${spec.generatedNotePlanId}`,
    `${spec.preservedNoteId}:tradePlanId:${spec.preservedNotePlanId}`,
  ];
  const actualReferences = danglingReferences.map(
    (reference) =>
      `${reference.documentId}:${reference.field}:${reference.targetId}`,
  );
  return (
    expectedReferences.every((reference) =>
      actualReferences.includes(reference),
    ) &&
    generatedNote.ownerId === importTask.ownerId &&
    generatedNote.ownerId === preservedNote.ownerId &&
    generatedNote.tradePlanId === spec.generatedNotePlanId &&
    generatedNote.content ===
      `Imported from service post: ${KNOWN_BRAVOS_ORPHAN_SOURCE_URL}` &&
    importTask.mode === "create" &&
    importTask.status === "done" &&
    importTask.sourceUrl === KNOWN_BRAVOS_ORPHAN_SOURCE_URL &&
    importTask.createdTradePlanId === spec.generatedNotePlanId &&
    importTask.tradePlanId === undefined &&
    preservedNote.tradePlanId === spec.preservedNotePlanId &&
    preservedNote.content === PRESERVED_NOTE_CONTENT
  );
}

async function snapshotMaterial(
  ctx: SnapshotCtx,
  spec: RepairSpec,
): Promise<SnapshotMaterial> {
  const snapshot = await readSnapshot(ctx, spec);
  const archiveJson = JSON.stringify(
    canonicalize({
      archiveFormat: ARCHIVE_FORMAT,
      archivalReferences: snapshot.archivalReferences,
      danglingReferences: snapshot.danglingReferences,
      documents: snapshot.documents,
      repairSpec: spec,
      scannedCounts: snapshot.scannedCounts,
      generatedNoteReferences: snapshot.generatedNoteReferences,
      scannedReferenceFields: snapshot.scannedReferenceFields,
    }),
  );
  const byteLength = new TextEncoder().encode(archiveJson).byteLength;
  if (byteLength > MAX_ARCHIVE_BYTES) {
    throw new ConvexError(
      `Bravos dangling-reference repair refused: archive exceeds its ${MAX_ARCHIVE_BYTES}-byte safety limit`,
    );
  }
  const contentHash = await sha256Hex(archiveJson);
  return {
    ...snapshot,
    archiveJson,
    auditToken: `${ARCHIVE_FORMAT}:${contentHash}`,
    contentHash,
  };
}

function dryRun(material: SnapshotMaterial, spec: RepairSpec) {
  return {
    archiveByteLength: new TextEncoder().encode(material.archiveJson)
      .byteLength,
    archivalReferences: material.archivalReferences,
    auditToken: material.auditToken,
    danglingReferences: material.danglingReferences,
    expectedEffects: {
      clearedCreatedImportTaskPlanIds: 1,
      deletedGeneratedNotes: 1,
      detachedNotes: 1,
    },
    generatedNoteReferences: material.generatedNoteReferences,
    scannedReferenceFields: material.scannedReferenceFields,
    safeToExecute: approvedShape(material, spec),
    scannedCounts: material.scannedCounts,
  };
}

export const inspect = internalQuery({
  args: repairSpecValidator,
  returns: dryRunValidator,
  handler: async (ctx, args) => dryRun(await snapshotMaterial(ctx, args), args),
});

export const getArchivePayload = internalQuery({
  args: repairSpecValidator,
  returns: v.object({
    archiveJson: v.string(),
    auditToken: v.string(),
    contentHash: v.string(),
    safeToExecute: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const material = await snapshotMaterial(ctx, args);
    return {
      archiveJson: material.archiveJson,
      auditToken: material.auditToken,
      contentHash: material.contentHash,
      safeToExecute: approvedShape(material, args),
    };
  },
});

export const hasCommittedAuditToken = internalQuery({
  args: { auditToken: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    (await ctx.db
      .query("bravosDanglingReferenceArchives")
      .withIndex("by_auditToken", (q) => q.eq("auditToken", args.auditToken))
      .unique()) !== null,
});

export const commit = internalMutation({
  args: {
    archiveContentHash: v.string(),
    archiveStorageId: v.id("_storage"),
    expectedAuditToken: v.string(),
    repairSpec: repairSpecValidator,
  },
  returns: executionValidator,
  handler: async (ctx, args) => {
    const material = await snapshotMaterial(ctx, args.repairSpec);
    if (material.auditToken !== args.expectedAuditToken) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: live data no longer matches the approved audit token",
      );
    }
    if (!approvedShape(material, args.repairSpec)) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: live dangling references no longer match the approved three-document repair",
      );
    }
    if (material.contentHash !== args.archiveContentHash) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: stored archive does not match the approved audit content",
      );
    }
    const storedArchive = await ctx.db.system.get(
      "_storage",
      args.archiveStorageId,
    );
    const archiveDigest = await sha256Encodings(material.archiveJson);
    if (
      !storedArchive ||
      normalizeStorageSha256(storedArchive.sha256) !== archiveDigest.hex
    ) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: stored archive blob is missing or does not match the approved audit content",
      );
    }
    const documents = material.documents;
    if (!documents) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: approved documents are missing",
      );
    }
    const archiveId = await ctx.db.insert("bravosDanglingReferenceArchives", {
      archiveFormat: ARCHIVE_FORMAT,
      auditToken: material.auditToken,
      contentHash: material.contentHash,
      createdAt: Date.now(),
      deletedGeneratedNoteId: documents.generatedNote._id,
      detachedNoteId: documents.preservedNote._id,
      generatedNotePlanId: args.repairSpec.generatedNotePlanId,
      ownerId: documents.generatedNote.ownerId,
      patchedImportTaskId: documents.importTask._id,
      preservedNotePlanId: args.repairSpec.preservedNotePlanId,
      storageId: args.archiveStorageId,
    });
    await ctx.db.patch(documents.importTask._id, {
      createdTradePlanId: undefined,
    });
    await ctx.db.patch(documents.preservedNote._id, {
      tradePlanId: undefined,
    });
    await ctx.db.delete(documents.generatedNote._id);
    return {
      archiveId,
      archiveStorageId: args.archiveStorageId,
      auditToken: material.auditToken,
      effects: {
        clearedCreatedImportTaskPlanIds: 1,
        deletedGeneratedNotes: 1,
        detachedNotes: 1,
      },
    };
  },
});

export const execute = internalAction({
  args: { expectedAuditToken: v.string(), repairSpec: repairSpecValidator },
  returns: executionValidator,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const payload: {
      archiveJson: string;
      auditToken: string;
      contentHash: string;
      safeToExecute: boolean;
    } = await ctx.runQuery(
      internal.bravosOrphanCleanup.getArchivePayload,
      args.repairSpec,
    );
    if (payload.auditToken !== args.expectedAuditToken) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: live data no longer matches the approved audit token",
      );
    }
    if (!payload.safeToExecute) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: live dangling references no longer match the approved three-document repair",
      );
    }
    let archiveStorageId: Id<"_storage"> | undefined;
    try {
      archiveStorageId = await ctx.storage.store(
        new Blob([payload.archiveJson], { type: "application/json" }),
      );
      const committed: ExecutionResult = await ctx.runMutation(
        internal.bravosOrphanCleanup.commit,
        {
          archiveContentHash: payload.contentHash,
          archiveStorageId,
          expectedAuditToken: args.expectedAuditToken,
          repairSpec: args.repairSpec,
        },
      );
      return committed;
    } catch (error) {
      if (archiveStorageId) {
        let archiveWasCommitted = true;
        try {
          archiveWasCommitted = await ctx.runQuery(
            internal.bravosOrphanCleanup.hasCommittedAuditToken,
            { auditToken: args.expectedAuditToken },
          );
          if (!archiveWasCommitted) await ctx.storage.delete(archiveStorageId);
        } catch {
          // Retain an unprovable blob rather than risk deleting a committed archive.
        }
      }
      throw error;
    }
  },
});

export const getPostCheckState = internalQuery({
  args: { auditToken: v.string() },
  returns: v.object({
    archiveContentHash: v.string(),
    archiveStorageId: v.id("_storage"),
    archivalReferencesPreserved: v.number(),
    clearedImportTaskReferences: v.number(),
    danglingReferencesRemaining: v.number(),
    deletedGeneratedNotesRemaining: v.number(),
    deletedGeneratedNoteId: v.id("notes"),
    detachedNoteId: v.id("notes"),
    detachedNotesVerified: v.number(),
    generatedNoteReferencesRemaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const archive = await ctx.db
      .query("bravosDanglingReferenceArchives")
      .withIndex("by_auditToken", (q) => q.eq("auditToken", args.auditToken))
      .unique();
    if (!archive) {
      throw new ConvexError(
        "Bravos dangling-reference repair post-check refused: no committed archive matches this audit token",
      );
    }
    const [snapshot, importTask, preservedNote, generatedNote] =
      await Promise.all([
        readSnapshot(ctx, {
          generatedNoteId: archive.deletedGeneratedNoteId,
          generatedNotePlanId: archive.generatedNotePlanId,
          importTaskId: archive.patchedImportTaskId,
          preservedNoteId: archive.detachedNoteId,
          preservedNotePlanId: archive.preservedNotePlanId,
        }),
        ctx.db.get(archive.patchedImportTaskId),
        ctx.db.get(archive.detachedNoteId),
        ctx.db.get(archive.deletedGeneratedNoteId),
      ]);
    return {
      archiveContentHash: archive.contentHash,
      archiveStorageId: archive.storageId,
      archivalReferencesPreserved: snapshot.archivalReferences.length,
      clearedImportTaskReferences:
        importTask?.createdTradePlanId === undefined ? 1 : 0,
      danglingReferencesRemaining:
        snapshot.danglingReferences.length +
        snapshot.generatedNoteReferences.length,
      deletedGeneratedNotesRemaining: generatedNote === null ? 0 : 1,
      deletedGeneratedNoteId: archive.deletedGeneratedNoteId,
      detachedNoteId: archive.detachedNoteId,
      detachedNotesVerified:
        preservedNote !== null && preservedNote.tradePlanId === undefined
          ? 1
          : 0,
      generatedNoteReferencesRemaining: snapshot.generatedNoteReferences.length,
    };
  },
});

export const postCheck = internalAction({
  args: { auditToken: v.string() },
  returns: postCheckValidator,
  handler: async (ctx, args) => {
    const state: {
      archiveContentHash: string;
      archiveStorageId: Id<"_storage">;
      archivalReferencesPreserved: number;
      clearedImportTaskReferences: number;
      danglingReferencesRemaining: number;
      deletedGeneratedNotesRemaining: number;
      deletedGeneratedNoteId: Id<"notes">;
      detachedNoteId: Id<"notes">;
      detachedNotesVerified: number;
      generatedNoteReferencesRemaining: number;
    } = await ctx.runQuery(internal.bravosOrphanCleanup.getPostCheckState, {
      auditToken: args.auditToken,
    });
    const blob = await ctx.storage.get(state.archiveStorageId);
    const archiveText = blob ? await blob.text() : "";
    return {
      archiveContentHashMatches:
        blob !== null && (await sha256Hex(archiveText)) === state.archiveContentHash,
      archiveContainsDeletedGeneratedNote:
        archiveText.includes(String(state.deletedGeneratedNoteId)) &&
        archiveText.includes(KNOWN_BRAVOS_ORPHAN_SOURCE_URL),
      archiveContainsDetachedNote:
        archiveText.includes(String(state.detachedNoteId)) &&
        archiveText.includes(PRESERVED_NOTE_CONTENT),
      archiveReadable: blob !== null,
      archivalReferencesPreserved: state.archivalReferencesPreserved,
      auditToken: args.auditToken,
      clearedImportTaskReferences: state.clearedImportTaskReferences,
      danglingReferencesRemaining: state.danglingReferencesRemaining,
      deletedGeneratedNotesRemaining: state.deletedGeneratedNotesRemaining,
      detachedNotesVerified: state.detachedNotesVerified,
      generatedNoteReferencesRemaining: state.generatedNoteReferencesRemaining,
    };
  },
});
