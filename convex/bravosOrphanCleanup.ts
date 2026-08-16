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

const ARCHIVE_FORMAT = "bravos_dangling_reference_repair_v1";
const MAX_ROWS_PER_TABLE = 5_000;
const MAX_ARCHIVE_BYTES = 256 * 1024;
const KNOWN_BRAVOS_ORPHAN_SOURCE_URL =
  "https://bravosresearch.com/news-feed/initiating-long-on-deere-company-de-potential-breakout/";
const PRESERVED_NOTE_CONTENT = "Charts supporting rationale, entry, and target";

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

type Snapshot = {
  archivalReferences: {
    archiveId: string;
    table: "bravosDanglingReferenceArchives" | "planLayerArchives";
    targetId: string;
  }[];
  danglingReferences: OperationalReference[];
  documents: {
    generatedNote: Doc<"notes">;
    importTask: Doc<"importTasks">;
    preservedNote: Doc<"notes">;
  } | null;
  scannedCounts: Record<string, number>;
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
  safeToExecute: v.boolean(),
  scannedCounts: v.record(v.string(), v.number()),
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
  archiveContainsDeletedGeneratedNote: v.boolean(),
  archiveContainsDetachedNote: v.boolean(),
  archiveReadable: v.boolean(),
  archivalReferencesPreserved: v.number(),
  auditToken: v.string(),
  clearedImportTaskReferences: v.number(),
  danglingReferencesRemaining: v.number(),
  deletedGeneratedNotesRemaining: v.number(),
  detachedNotesVerified: v.number(),
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
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
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
    ctx.db.query("planLayerArchives").take(MAX_ROWS_PER_TABLE + 1),
    ctx.db
      .query("bravosDanglingReferenceArchives")
      .take(MAX_ROWS_PER_TABLE + 1),
  ]);
  const scanned = {
    bravosReviewItems: assertBounded(reviewItems, "bravosReviewItems"),
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
  const addReference = (
    table: OperationalReference["table"],
    row: { _id: unknown; ownerId: string },
    field: string,
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
        field,
        ownerId: row.ownerId,
        table,
        targetId: String(targetId),
        targetKind,
      });
    }
  };

  for (const plan of scanned.tradePlans) {
    addReference("tradePlans", plan, "campaignId", "campaign", plan.campaignId);
  }
  for (const note of scanned.notes) {
    addReference(
      "notes",
      note,
      "campaignId",
      "campaign",
      note.campaignId,
      preview(note.content),
    );
    addReference(
      "notes",
      note,
      "tradePlanId",
      "tradePlan",
      note.tradePlanId,
      preview(note.content),
    );
  }
  for (const item of scanned.watchlist) {
    addReference("watchlist", item, "campaignId", "campaign", item.campaignId);
    addReference(
      "watchlist",
      item,
      "tradePlanId",
      "tradePlan",
      item.tradePlanId,
    );
  }
  for (const task of scanned.importTasks) {
    addReference(
      "importTasks",
      task,
      "tradePlanId",
      "tradePlan",
      task.tradePlanId,
      preview(task.pastedText),
    );
    addReference(
      "importTasks",
      task,
      "createdTradePlanId",
      "tradePlan",
      task.createdTradePlanId,
      preview(task.pastedText),
    );
  }
  for (const trade of scanned.trades) {
    addReference(
      "trades",
      trade,
      "tradePlanId",
      "tradePlan",
      trade.tradePlanId,
    );
  }
  for (const trade of scanned.inboxTrades) {
    addReference(
      "inboxTrades",
      trade,
      "tradePlanId",
      "tradePlan",
      trade.tradePlanId,
    );
  }
  for (const retrospective of scanned.retrospectives) {
    addReference(
      "retrospectives",
      retrospective,
      "parentId",
      retrospective.parentKind,
      retrospective.parentId,
      preview(retrospective.content),
    );
  }
  for (const item of scanned.bravosReviewItems) {
    addReference(
      "bravosReviewItems",
      item,
      "appliedTradePlanId",
      "tradePlan",
      item.appliedTradePlanId,
    );
    addReference(
      "bravosReviewItems",
      item,
      "suggestedTradePlanId",
      "tradePlan",
      item.suggestedTradePlanId,
    );
    addReference(
      "bravosReviewItems",
      item,
      "proposedAction.targetTradePlanId",
      "tradePlan",
      item.proposedAction?.kind === "apply_follow_up" ||
        item.proposedAction?.kind === "note_only"
        ? item.proposedAction.targetTradePlanId
        : undefined,
    );
    addReference(
      "bravosReviewItems",
      item,
      "approvedAction.targetTradePlanId",
      "tradePlan",
      item.approvedAction?.kind === "apply_follow_up" ||
        item.approvedAction?.kind === "note_only"
        ? item.approvedAction.targetTradePlanId
        : undefined,
    );
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
    documents:
      generatedNote && importTask && preservedNote
        ? { generatedNote, importTask, preservedNote }
        : null,
    scannedCounts: Object.fromEntries(
      Object.entries(scanned).map(([table, rows]) => [table, rows.length]),
    ),
  };
}

function approvedShape(snapshot: Snapshot, spec: RepairSpec) {
  const { documents, danglingReferences } = snapshot;
  if (!documents || danglingReferences.length !== 3) {
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
    archiveStorageId: v.id("_storage"),
    archivalReferencesPreserved: v.number(),
    clearedImportTaskReferences: v.number(),
    danglingReferencesRemaining: v.number(),
    deletedGeneratedNotesRemaining: v.number(),
    deletedGeneratedNoteId: v.id("notes"),
    detachedNotesVerified: v.number(),
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
      archiveStorageId: archive.storageId,
      archivalReferencesPreserved: snapshot.archivalReferences.length,
      clearedImportTaskReferences:
        importTask?.createdTradePlanId === undefined ? 1 : 0,
      danglingReferencesRemaining: snapshot.danglingReferences.length,
      deletedGeneratedNotesRemaining: generatedNote === null ? 0 : 1,
      deletedGeneratedNoteId: archive.deletedGeneratedNoteId,
      detachedNotesVerified:
        preservedNote !== null && preservedNote.tradePlanId === undefined
          ? 1
          : 0,
    };
  },
});

export const postCheck = internalAction({
  args: { auditToken: v.string() },
  returns: postCheckValidator,
  handler: async (ctx, args) => {
    const state: {
      archiveStorageId: Id<"_storage">;
      archivalReferencesPreserved: number;
      clearedImportTaskReferences: number;
      danglingReferencesRemaining: number;
      deletedGeneratedNotesRemaining: number;
      deletedGeneratedNoteId: Id<"notes">;
      detachedNotesVerified: number;
    } = await ctx.runQuery(internal.bravosOrphanCleanup.getPostCheckState, {
      auditToken: args.auditToken,
    });
    const blob = await ctx.storage.get(state.archiveStorageId);
    const archiveText = blob ? await blob.text() : "";
    return {
      archiveContainsDeletedGeneratedNote:
        archiveText.includes(String(state.deletedGeneratedNoteId)) &&
        archiveText.includes(KNOWN_BRAVOS_ORPHAN_SOURCE_URL),
      archiveContainsDetachedNote: archiveText.includes(PRESERVED_NOTE_CONTENT),
      archiveReadable: blob !== null,
      archivalReferencesPreserved: state.archivalReferencesPreserved,
      auditToken: args.auditToken,
      clearedImportTaskReferences: state.clearedImportTaskReferences,
      danglingReferencesRemaining: state.danglingReferencesRemaining,
      deletedGeneratedNotesRemaining: state.deletedGeneratedNotesRemaining,
      detachedNotesVerified: state.detachedNotesVerified,
    };
  },
});
