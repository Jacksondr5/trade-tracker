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

// This is an explicit operational-reference audit contract, not schema
// reflection. Any new campaign, trade-plan, or note reference in schema.ts
// must be added to the relevant list and scanned below; schema-derived
// enumeration is follow-up work.
const scannedOperationalReferenceFields = {
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

const scannedArchivalReferenceFields = {
  bravosDetachedNote: {
    field: "detachedNoteId",
    label: "bravosDanglingReferenceArchives.detachedNoteId",
  },
  bravosGeneratedNote: {
    field: "deletedGeneratedNoteId",
    label: "bravosDanglingReferenceArchives.deletedGeneratedNoteId",
  },
  bravosGeneratedPlan: {
    field: "generatedNotePlanId",
    label: "bravosDanglingReferenceArchives.generatedNotePlanId",
  },
  bravosPreservedPlan: {
    field: "preservedNotePlanId",
    label: "bravosDanglingReferenceArchives.preservedNotePlanId",
  },
  planLayerDeletedPlan: {
    field: "deletedTradePlanIds",
    label: "planLayerArchives.deletedTradePlanIds[]",
  },
  planLayerGeneratedNote: {
    field: "generatedNoteIds",
    label: "planLayerArchives.generatedNoteIds[]",
  },
  planLayerSalvagedNote: {
    field: "salvagedNoteIds",
    label: "planLayerArchives.salvagedNoteIds[]",
  },
  planLayerSalvagedTicker: {
    field: "salvagedNoteTickerExpectations.noteId",
    label: "planLayerArchives.salvagedNoteTickerExpectations[].noteId",
  },
} as const;

const scannedOperationalReferenceFieldLabels = [
  ...Object.values(scannedOperationalReferenceFields).map(({ label }) => label),
];
const scannedArchivalReferenceFieldLabels = [
  ...Object.values(scannedArchivalReferenceFields).map(({ label }) => label),
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

type GeneratedNoteArchiveReference = {
  archiveId: string;
  field: string;
  table: "bravosDanglingReferenceArchives" | "planLayerArchives";
};

type Snapshot = {
  archivalReferences: {
    archiveId: string;
    field: string;
    table: "bravosDanglingReferenceArchives" | "planLayerArchives";
    targetId: string;
  }[];
  danglingReferences: OperationalReference[];
  generatedNoteArchiveReferences: GeneratedNoteArchiveReference[];
  generatedNoteReferences: GeneratedNoteReference[];
  documents: {
    generatedNote: Doc<"notes">;
    importTask: Doc<"importTasks">;
    preservedNote: Doc<"notes">;
  } | null;
  scannedCounts: Record<string, number>;
  scannedArchivalReferenceFields: string[];
  scannedOperationalReferenceFields: string[];
};

type SnapshotMaterial = Snapshot & {
  archiveContentHash: string;
  archiveJson: string;
  auditJson: string;
  auditToken: string;
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

const generatedNoteArchiveReferenceValidator = v.object({
  archiveId: v.string(),
  field: v.string(),
  table: v.union(
    v.literal("bravosDanglingReferenceArchives"),
    v.literal("planLayerArchives"),
  ),
});

const dryRunValidator = v.object({
  archivalReferences: v.array(
    v.object({
      archiveId: v.string(),
      field: v.string(),
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
  generatedNoteArchiveReferences: v.array(generatedNoteArchiveReferenceValidator),
  refusalReason: v.union(v.string(), v.null()),
  safeToExecute: v.boolean(),
  scannedCounts: v.record(v.string(), v.number()),
  scannedArchivalReferenceFields: v.array(v.string()),
  scannedOperationalReferenceFields: v.array(v.string()),
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
  campaignOrPlanReferencesRemaining: v.number(),
  clearedImportTaskReferences: v.number(),
  deletedGeneratedNotesRemaining: v.number(),
  detachedNotesVerified: v.number(),
  generatedNoteReferencesRemaining: v.number(),
  generatedNoteArchiveReferencesRemaining: v.number(),
  scannedCountsAfter: v.record(v.string(), v.number()),
  scannedCountsBefore: v.record(v.string(), v.number()),
  scannedCountsExpectedAfter: v.record(v.string(), v.number()),
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

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function archivePayload(snapshot: Snapshot, spec: RepairSpec) {
  return {
    archiveFormat: ARCHIVE_FORMAT,
    archivalReferences: snapshot.archivalReferences,
    danglingReferences: snapshot.danglingReferences,
    documents: snapshot.documents,
    generatedNoteArchiveReferences: snapshot.generatedNoteArchiveReferences,
    generatedNoteReferences: snapshot.generatedNoteReferences,
    repairSpec: spec,
    scannedArchivalReferenceFields: snapshot.scannedArchivalReferenceFields,
    scannedCounts: snapshot.scannedCounts,
    scannedOperationalReferenceFields:
      snapshot.scannedOperationalReferenceFields,
  };
}

function auditPayload(snapshot: Snapshot, spec: RepairSpec) {
  // This positive list is the approval contract. The recovery archive above is
  // deliberately broader: it retains scan counts and every other audit fact.
  return {
    archiveFormat: ARCHIVE_FORMAT,
    archivalReferences: snapshot.archivalReferences,
    danglingReferences: snapshot.danglingReferences,
    documents: snapshot.documents,
    generatedNoteArchiveReferences: snapshot.generatedNoteArchiveReferences,
    generatedNoteReferences: snapshot.generatedNoteReferences,
    repairSpec: spec,
    scannedArchivalReferenceFields: snapshot.scannedArchivalReferenceFields,
    scannedOperationalReferenceFields:
      snapshot.scannedOperationalReferenceFields,
  };
}

function auditTokenForContentHash(contentHash: string) {
  return `${ARCHIVE_FORMAT}:${contentHash}`;
}

function expectedPostCheckScannedCounts(
  scannedCountsBefore: Record<string, number>,
) {
  return {
    ...scannedCountsBefore,
    bravosDanglingReferenceArchives:
      (scannedCountsBefore.bravosDanglingReferenceArchives ?? 0) + 1,
    notes: (scannedCountsBefore.notes ?? 0) - 1,
  };
}

function auditJsonFromArchiveJson(archiveJson: string) {
  const archive = JSON.parse(archiveJson) as Record<string, unknown>;
  delete archive.scannedCounts;
  return JSON.stringify(canonicalize(archive));
}

function previewAuditValue(value: unknown) {
  const text = JSON.stringify(canonicalize(value));
  return text.length > 480 ? `${text.slice(0, 477)}...` : text;
}

function auditDriftDetail(expectedAuditJson: string, actualAuditJson: string) {
  try {
    const expected = JSON.parse(expectedAuditJson) as Record<string, unknown>;
    const actual = JSON.parse(actualAuditJson) as Record<string, unknown>;
    const boundFacts = [
      "danglingReferences",
      "generatedNoteReferences",
      "generatedNoteArchiveReferences",
      "archivalReferences",
      "documents",
      "repairSpec",
      "scannedOperationalReferenceFields",
      "scannedArchivalReferenceFields",
    ];
    for (const fact of boundFacts) {
      const expectedCanonical = JSON.stringify(canonicalize(expected[fact]));
      const actualCanonical = JSON.stringify(canonicalize(actual[fact]));
      if (expectedCanonical !== actualCanonical) {
        return `${fact} changed from ${previewAuditValue(expected[fact])} to ${previewAuditValue(actual[fact])}`;
      }
    }
  } catch {
    return "the supplied approved audit payload is not valid JSON";
  }
  return "the audit content hash changed without an identifiable bound-fact difference";
}

function approvalFailure(snapshot: Snapshot, spec: RepairSpec): string | null {
  const {
    documents,
    danglingReferences,
    generatedNoteArchiveReferences,
    generatedNoteReferences,
  } = snapshot;
  if (!documents) {
    return "approved documents changed from all three required documents present to one or more missing";
  }
  if (generatedNoteArchiveReferences.length !== 0) {
    return `the generated note gained archival references: ${previewAuditValue(generatedNoteArchiveReferences)}`;
  }
  if (generatedNoteReferences.length !== 0) {
    return `the generated note gained operational references: ${previewAuditValue(generatedNoteReferences)}`;
  }
  if (danglingReferences.length !== 3) {
    return `operational dangling references changed from exactly three approved references to ${previewAuditValue(danglingReferences)}`;
  }
  const expectedReferences = [
    `${spec.generatedNoteId}:tradePlanId:${spec.generatedNotePlanId}`,
    `${spec.importTaskId}:createdTradePlanId:${spec.generatedNotePlanId}`,
    `${spec.preservedNoteId}:tradePlanId:${spec.preservedNotePlanId}`,
  ];
  const actualReferences = danglingReferences.map(
    (reference) =>
      `${reference.documentId}:${reference.field}:${reference.targetId}`,
  );
  if (!expectedReferences.every((reference) => actualReferences.includes(reference))) {
    return `operational dangling references changed from ${previewAuditValue(expectedReferences)} to ${previewAuditValue(actualReferences)}`;
  }
  const { generatedNote, importTask, preservedNote } = documents;
  if (
    generatedNote.ownerId !== importTask.ownerId ||
    generatedNote.ownerId !== preservedNote.ownerId
  ) {
    return "approved document owners no longer match";
  }
  if (generatedNote.tradePlanId !== spec.generatedNotePlanId) {
    return `generated note tradePlanId changed from ${spec.generatedNotePlanId} to ${String(generatedNote.tradePlanId)}`;
  }
  const requiredMarker = `Imported from service post: ${KNOWN_BRAVOS_ORPHAN_SOURCE_URL}`;
  if (generatedNote.content !== requiredMarker) {
    return `generated note content changed from the exact approved import marker to ${preview(generatedNote.content)}`;
  }
  if (importTask.mode !== "create" || importTask.status !== "done") {
    return `import task mode/status changed from create/done to ${importTask.mode}/${importTask.status}`;
  }
  if (importTask.sourceUrl !== KNOWN_BRAVOS_ORPHAN_SOURCE_URL) {
    return `import task sourceUrl changed from ${KNOWN_BRAVOS_ORPHAN_SOURCE_URL} to ${String(importTask.sourceUrl)}`;
  }
  if (importTask.createdTradePlanId !== spec.generatedNotePlanId) {
    return `import task createdTradePlanId changed from ${spec.generatedNotePlanId} to ${String(importTask.createdTradePlanId)}`;
  }
  if (importTask.tradePlanId !== undefined) {
    return `import task tradePlanId changed from undefined to ${String(importTask.tradePlanId)}`;
  }
  if (preservedNote.tradePlanId !== spec.preservedNotePlanId) {
    return `preserved note tradePlanId changed from ${spec.preservedNotePlanId} to ${String(preservedNote.tradePlanId)}`;
  }
  if (preservedNote.content !== PRESERVED_NOTE_CONTENT) {
    return `preserved note content changed from ${PRESERVED_NOTE_CONTENT} to ${preview(preservedNote.content)}`;
  }
  return null;
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
      scannedOperationalReferenceFields.tradePlanCampaign,
      "campaign",
      plan.campaignId,
    );
  }
  for (const note of scanned.notes) {
    addReference(
      "notes",
      note,
      scannedOperationalReferenceFields.noteCampaign,
      "campaign",
      note.campaignId,
      preview(note.content),
    );
    addReference(
      "notes",
      note,
      scannedOperationalReferenceFields.noteTradePlan,
      "tradePlan",
      note.tradePlanId,
      preview(note.content),
    );
  }
  for (const item of scanned.watchlist) {
    addReference(
      "watchlist",
      item,
      scannedOperationalReferenceFields.watchlistCampaign,
      "campaign",
      item.campaignId,
    );
    addReference(
      "watchlist",
      item,
      scannedOperationalReferenceFields.watchlistTradePlan,
      "tradePlan",
      item.tradePlanId,
    );
  }
  for (const task of scanned.importTasks) {
    addReference(
      "importTasks",
      task,
      scannedOperationalReferenceFields.importTaskTradePlan,
      "tradePlan",
      task.tradePlanId,
      preview(task.pastedText),
    );
    addReference(
      "importTasks",
      task,
      scannedOperationalReferenceFields.importTaskCreatedTradePlan,
      "tradePlan",
      task.createdTradePlanId,
      preview(task.pastedText),
    );
  }
  for (const trade of scanned.trades) {
    addReference(
      "trades",
      trade,
      scannedOperationalReferenceFields.tradeTradePlan,
      "tradePlan",
      trade.tradePlanId,
    );
  }
  for (const trade of scanned.inboxTrades) {
    addReference(
      "inboxTrades",
      trade,
      scannedOperationalReferenceFields.inboxTradeTradePlan,
      "tradePlan",
      trade.tradePlanId,
    );
  }
  for (const retrospective of scanned.retrospectives) {
    addReference(
      "retrospectives",
      retrospective,
      scannedOperationalReferenceFields.retrospectiveParent,
      retrospective.parentKind,
      retrospective.parentId,
      preview(retrospective.content),
    );
  }
  for (const item of scanned.bravosReviewItems) {
    if (item.appliedNoteId === spec.generatedNoteId) {
      generatedNoteReferences.push({
        documentId: String(item._id),
        field: scannedOperationalReferenceFields.bravosReviewItemAppliedNote.field,
        ownerId: item.ownerId,
        table: "bravosReviewItems",
      });
    }
    addReference(
      "bravosReviewItems",
      item,
      scannedOperationalReferenceFields.bravosReviewItemAppliedTradePlan,
      "tradePlan",
      item.appliedTradePlanId,
    );
    addReference(
      "bravosReviewItems",
      item,
      scannedOperationalReferenceFields.bravosReviewItemSuggestedTradePlan,
      "tradePlan",
      item.suggestedTradePlanId,
    );
    addReference(
      "bravosReviewItems",
      item,
      scannedOperationalReferenceFields.bravosReviewItemProposedActionTarget,
      "tradePlan",
      item.proposedAction?.kind === "apply_follow_up" ||
        item.proposedAction?.kind === "note_only"
        ? item.proposedAction.targetTradePlanId
        : undefined,
    );
    addReference(
      "bravosReviewItems",
      item,
      scannedOperationalReferenceFields.bravosReviewItemApprovedActionTarget,
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
        field: scannedOperationalReferenceFields.checkInNoteIds.field,
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
  const generatedNoteArchiveReferences: GeneratedNoteArchiveReference[] = [
    ...scanned.planLayerArchives.flatMap((archive) => {
      const noteIdFields = [
        {
          field: scannedArchivalReferenceFields.planLayerGeneratedNote.field,
          noteIds: archive.generatedNoteIds,
        },
        {
          field: scannedArchivalReferenceFields.planLayerSalvagedNote.field,
          noteIds: archive.salvagedNoteIds,
        },
        {
          field: scannedArchivalReferenceFields.planLayerSalvagedTicker.field,
          noteIds: archive.salvagedNoteTickerExpectations.map(
            ({ noteId }) => noteId,
          ),
        },
      ];
      return noteIdFields
        .filter(({ noteIds }) => noteIds.includes(spec.generatedNoteId))
        .map(({ field }) => ({
          archiveId: String(archive._id),
          field,
          table: "planLayerArchives" as const,
        }));
    }),
    ...scanned.bravosDanglingReferenceArchives.flatMap((archive) =>
      [
        {
          field: scannedArchivalReferenceFields.bravosGeneratedNote.field,
          noteId: archive.deletedGeneratedNoteId,
        },
        {
          field: scannedArchivalReferenceFields.bravosDetachedNote.field,
          noteId: archive.detachedNoteId,
        },
      ]
        .filter(({ noteId }) => noteId === spec.generatedNoteId)
        .map(({ field }) => ({
          archiveId: String(archive._id),
          field,
          table: "bravosDanglingReferenceArchives" as const,
        })),
    ),
  ];
  return {
    archivalReferences: [
      ...scanned.planLayerArchives.flatMap((archive) =>
        archive.deletedTradePlanIds
          .filter((id) => !tradePlanIds.has(String(id)))
          .map((targetId) => ({
            archiveId: String(archive._id),
            field: scannedArchivalReferenceFields.planLayerDeletedPlan.field,
            table: "planLayerArchives" as const,
            targetId: String(targetId),
          })),
      ),
      ...scanned.bravosDanglingReferenceArchives.flatMap((archive) =>
        [
          {
            field: scannedArchivalReferenceFields.bravosGeneratedPlan.field,
            targetId: archive.generatedNotePlanId,
          },
          {
            field: scannedArchivalReferenceFields.bravosPreservedPlan.field,
            targetId: archive.preservedNotePlanId,
          },
        ]
          .filter(({ targetId }) => !tradePlanIds.has(String(targetId)))
          .map(({ field, targetId }) => ({
            archiveId: String(archive._id),
            field,
            table: "bravosDanglingReferenceArchives" as const,
            targetId: String(targetId),
          })),
      ),
    ],
    danglingReferences,
    generatedNoteArchiveReferences,
    generatedNoteReferences,
    documents:
      generatedNote && importTask && preservedNote
        ? { generatedNote, importTask, preservedNote }
        : null,
    scannedCounts: Object.fromEntries(
      Object.entries(scanned).map(([table, rows]) => [table, rows.length]),
    ),
    scannedArchivalReferenceFields: scannedArchivalReferenceFieldLabels,
    scannedOperationalReferenceFields: scannedOperationalReferenceFieldLabels,
  };
}

async function snapshotMaterial(
  ctx: SnapshotCtx,
  spec: RepairSpec,
): Promise<SnapshotMaterial> {
  const snapshot = await readSnapshot(ctx, spec);
  const archiveJson = JSON.stringify(canonicalize(archivePayload(snapshot, spec)));
  const auditJson = JSON.stringify(canonicalize(auditPayload(snapshot, spec)));
  const byteLength = new TextEncoder().encode(archiveJson).byteLength;
  if (byteLength > MAX_ARCHIVE_BYTES) {
    throw new ConvexError(
      `Bravos dangling-reference repair refused: archive exceeds its ${MAX_ARCHIVE_BYTES}-byte safety limit`,
    );
  }
  const archiveContentHash = await sha256Hex(archiveJson);
  const auditContentHash = await sha256Hex(auditJson);
  return {
    ...snapshot,
    archiveContentHash,
    archiveJson,
    auditJson,
    auditToken: auditTokenForContentHash(auditContentHash),
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
    generatedNoteArchiveReferences: material.generatedNoteArchiveReferences,
    generatedNoteReferences: material.generatedNoteReferences,
    scannedArchivalReferenceFields: material.scannedArchivalReferenceFields,
    scannedOperationalReferenceFields:
      material.scannedOperationalReferenceFields,
    refusalReason: approvalFailure(material, spec),
    safeToExecute: approvalFailure(material, spec) === null,
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
    auditJson: v.string(),
    auditToken: v.string(),
    contentHash: v.string(),
    refusalReason: v.union(v.string(), v.null()),
    safeToExecute: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const material = await snapshotMaterial(ctx, args);
    return {
      archiveJson: material.archiveJson,
      auditJson: material.auditJson,
      auditToken: material.auditToken,
      contentHash: material.archiveContentHash,
      refusalReason: approvalFailure(material, args),
      safeToExecute: approvalFailure(material, args) === null,
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
    expectedArchiveJson: v.string(),
    expectedAuditJson: v.string(),
    expectedAuditToken: v.string(),
    repairSpec: repairSpecValidator,
  },
  returns: executionValidator,
  handler: async (ctx, args) => {
    let expectedAuditJsonFromArchive: string;
    try {
      expectedAuditJsonFromArchive = auditJsonFromArchiveJson(
        args.expectedArchiveJson,
      );
    } catch {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: supplied archive payload is not valid JSON",
      );
    }
    if (expectedAuditJsonFromArchive !== args.expectedAuditJson) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: supplied archive payload does not match the approved audit payload",
      );
    }
    const expectedArchiveContentHash = await sha256Hex(args.expectedArchiveJson);
    if (expectedArchiveContentHash !== args.archiveContentHash) {
      throw new ConvexError(
        `Bravos dangling-reference repair refused: supplied archive content hash changed from ${args.archiveContentHash} to ${expectedArchiveContentHash}`,
      );
    }
    const material = await snapshotMaterial(ctx, args.repairSpec);
    const expectedAuditTokenForJson = auditTokenForContentHash(
      await sha256Hex(args.expectedAuditJson),
    );
    if (expectedAuditTokenForJson !== args.expectedAuditToken) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: supplied audit payload does not bind the expected audit token",
      );
    }
    if (material.auditToken !== args.expectedAuditToken) {
      throw new ConvexError(
        `Bravos dangling-reference repair refused: ${auditDriftDetail(args.expectedAuditJson, material.auditJson)}`,
      );
    }
    const failure = approvalFailure(material, args.repairSpec);
    if (failure) {
      throw new ConvexError(
        `Bravos dangling-reference repair refused: ${failure}`,
      );
    }
    const storedArchive = await ctx.db.system.get(
      "_storage",
      args.archiveStorageId,
    );
    const archiveDigest = await sha256Encodings(args.expectedArchiveJson);
    if (!storedArchive) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: stored archive blob is missing",
      );
    }
    if (normalizeStorageSha256(storedArchive.sha256) !== archiveDigest.hex) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: stored archive blob content does not match the approved archive content hash",
      );
    }
    const documents = material.documents;
    if (!documents) {
      throw new ConvexError(
        "Bravos dangling-reference repair refused: approved document set changed from all documents present to one or more missing",
      );
    }
    const archiveId = await ctx.db.insert("bravosDanglingReferenceArchives", {
      archiveFormat: ARCHIVE_FORMAT,
      auditToken: material.auditToken,
      contentHash: material.archiveContentHash,
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
      auditJson: string;
      auditToken: string;
      contentHash: string;
      refusalReason: string | null;
      safeToExecute: boolean;
    } = await ctx.runQuery(
      internal.bravosOrphanCleanup.getArchivePayload,
      args.repairSpec,
    );
    if (payload.auditToken !== args.expectedAuditToken) {
      throw new ConvexError(
        `Bravos dangling-reference repair refused: audit content hash changed from ${args.expectedAuditToken} to ${payload.auditToken}`,
      );
    }
    if (!payload.safeToExecute) {
      throw new ConvexError(
        `Bravos dangling-reference repair refused: ${payload.refusalReason ?? "current audit does not satisfy the approved three-document repair"}`,
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
          expectedArchiveJson: payload.archiveJson,
          expectedAuditJson: payload.auditJson,
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
    campaignOrPlanReferencesRemaining: v.number(),
    clearedImportTaskReferences: v.number(),
    deletedGeneratedNotesRemaining: v.number(),
    deletedGeneratedNoteId: v.id("notes"),
    detachedNoteId: v.id("notes"),
    detachedNotesVerified: v.number(),
    generatedNoteArchiveReferencesRemaining: v.number(),
    generatedNoteReferencesRemaining: v.number(),
    scannedCountsAfter: v.record(v.string(), v.number()),
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
      campaignOrPlanReferencesRemaining: snapshot.danglingReferences.length,
      clearedImportTaskReferences:
        importTask?.createdTradePlanId === undefined ? 1 : 0,
      deletedGeneratedNotesRemaining: generatedNote === null ? 0 : 1,
      deletedGeneratedNoteId: archive.deletedGeneratedNoteId,
      detachedNoteId: archive.detachedNoteId,
      detachedNotesVerified:
        preservedNote !== null && preservedNote.tradePlanId === undefined
          ? 1
          : 0,
      generatedNoteArchiveReferencesRemaining:
        snapshot.generatedNoteArchiveReferences.length,
      generatedNoteReferencesRemaining: snapshot.generatedNoteReferences.length,
      scannedCountsAfter: snapshot.scannedCounts,
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
      campaignOrPlanReferencesRemaining: number;
      clearedImportTaskReferences: number;
      deletedGeneratedNotesRemaining: number;
      deletedGeneratedNoteId: Id<"notes">;
      detachedNoteId: Id<"notes">;
      detachedNotesVerified: number;
      generatedNoteArchiveReferencesRemaining: number;
      generatedNoteReferencesRemaining: number;
      scannedCountsAfter: Record<string, number>;
    } = await ctx.runQuery(internal.bravosOrphanCleanup.getPostCheckState, {
      auditToken: args.auditToken,
    });
    const blob = await ctx.storage.get(state.archiveStorageId);
    const archiveText = blob ? await blob.text() : "";
    let archivedPayload: { scannedCounts?: Record<string, number> } | null =
      null;
    try {
      archivedPayload = archiveText
        ? (JSON.parse(archiveText) as { scannedCounts?: Record<string, number> })
        : null;
    } catch {
      // The hash check below reports a corrupt archive without hiding the rest
      // of the independent post-check behind a JSON parse failure.
    }
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
      campaignOrPlanReferencesRemaining:
        state.campaignOrPlanReferencesRemaining,
      clearedImportTaskReferences: state.clearedImportTaskReferences,
      deletedGeneratedNotesRemaining: state.deletedGeneratedNotesRemaining,
      detachedNotesVerified: state.detachedNotesVerified,
      generatedNoteArchiveReferencesRemaining:
        state.generatedNoteArchiveReferencesRemaining,
      generatedNoteReferencesRemaining: state.generatedNoteReferencesRemaining,
      scannedCountsAfter: state.scannedCountsAfter,
      scannedCountsBefore: archivedPayload?.scannedCounts ?? {},
      scannedCountsExpectedAfter: expectedPostCheckScannedCounts(
        archivedPayload?.scannedCounts ?? {},
      ),
    };
  },
});
