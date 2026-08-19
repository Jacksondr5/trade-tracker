import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  classifyIbkrExternalId,
  ibkrLogicalFillFingerprint,
  isMidnightEastern,
} from "./lib/ibkrTradeIdentity";

const ARCHIVE_FORMAT = "ibkr_duplicate_fill_repair_v1";
const EXPECTED_GROUP_COUNT = 31;
const EXPECTED_ACCEPTED_INBOX_COUNT = 25;
const EXPECTED_ACCEPTED_ACCEPTED_COUNT = 2;
const EXPECTED_TRANSITION_COUNT = 4;
const MAX_ROWS_PER_TABLE = 5_000;
const MAX_ARCHIVE_BYTES = 512 * 1024;

export const INBOUND_REFERENCE_FIELD_DENOMINATOR = [
  "checkIns.surfacedTradeIds",
  "importTasks.inboxTradeId",
  "marketDataFetchJobs.sourceTradeIds",
  "portfolioPriceMarks.sourceTradeId",
] as const;

const KNOWN_TRANSITION_PAIRS = new Map([
  ["00015e71.6a7e2fbf.01.01", "5523063596"],
  ["00030e5e.6e4fb220.01.01", "5523042492"],
  ["0001ebd7.6a7dcc9e.01.01", "5523128204"],
  ["00024966.6a7dc56c.01.01", "5523594973"],
]);

type Locator =
  | { id: Id<"trades">; table: "trades" }
  | { id: Id<"inboxTrades">; table: "inboxTrades" };

type RepairSpec = {
  ownerId: string;
  pairs: Array<{ first: Locator; second: Locator; survivor: Locator }>;
};

type DuplicateRow =
  | { document: Doc<"trades">; table: "trades" }
  | { document: Doc<"inboxTrades">; table: "inboxTrades" };

type PairKind =
  | "accepted_accepted_csv_order"
  | "accepted_inbox_csv_order"
  | "transition_inbox_execution_order";

type PlannedPair = {
  adoptedExternalId: string | null;
  deleted: DuplicateRow;
  fingerprint: string;
  index: number;
  kind: PairKind;
  survivor: DuplicateRow;
  survivorPatch: Record<string, unknown>;
};

type ReferenceObservation = {
  action: "none" | "refuse" | "remove_duplicate" | "repoint";
  documentId: string;
  field: (typeof INBOUND_REFERENCE_FIELD_DENOMINATOR)[number];
  referencedDuplicateId: string;
  referencedRole: "deleted" | "survivor";
  replacementId: string | null;
  table:
    | "checkIns"
    | "importTasks"
    | "marketDataFetchJobs"
    | "portfolioPriceMarks";
};

type ReferenceSnapshot = {
  observations: ReferenceObservation[];
  refusalReasons: string[];
  scannedCounts: Record<string, number>;
};

type Snapshot = {
  candidateRowsScanned: { inboxTrades: number; trades: number };
  discoveredPairKeys: string[];
  pairPlans: PlannedPair[];
  referenceSnapshot: ReferenceSnapshot;
  refusalReasons: string[];
  suppliedPairKeys: string[];
};

type SnapshotMaterial = Snapshot & {
  archiveContentHash: string;
  archiveJson: string;
  auditJson: string;
  auditToken: string;
};

type ExecutionResult = {
  archiveId: Id<"ibkrDuplicateFillRepairArchives">;
  archiveStorageId: Id<"_storage">;
  auditToken: string;
  deletedInboxTrades: number;
  deletedTrades: number;
  patchedReferenceDocuments: number;
  patchedSurvivors: number;
};

const locatorValidator = v.union(
  v.object({ id: v.id("trades"), table: v.literal("trades") }),
  v.object({ id: v.id("inboxTrades"), table: v.literal("inboxTrades") }),
);

const repairSpecValidator = v.object({
  ownerId: v.string(),
  pairs: v.array(
    v.object({
      first: locatorValidator,
      second: locatorValidator,
      survivor: locatorValidator,
    }),
  ),
});

const rowEvidenceValidator = v.object({
  brokerageAccountId: v.union(v.string(), v.null()),
  creationTime: v.number(),
  date: v.union(v.number(), v.null()),
  direction: v.union(v.string(), v.null()),
  documentJson: v.string(),
  externalId: v.union(v.string(), v.null()),
  externalIdKind: v.union(
    v.literal("csv"),
    v.literal("execution"),
    v.literal("order"),
    v.literal("other"),
  ),
  fees: v.union(v.number(), v.null()),
  id: v.string(),
  orderType: v.union(v.string(), v.null()),
  portfolioId: v.union(v.string(), v.null()),
  price: v.union(v.number(), v.null()),
  quantity: v.union(v.number(), v.null()),
  side: v.union(v.string(), v.null()),
  source: v.union(v.string(), v.null()),
  table: v.union(v.literal("trades"), v.literal("inboxTrades")),
  taxes: v.union(v.number(), v.null()),
  ticker: v.union(v.string(), v.null()),
  tradePlanId: v.union(v.string(), v.null()),
});

const pairEvidenceValidator = v.object({
  adoptedExternalId: v.union(v.string(), v.null()),
  deleted: rowEvidenceValidator,
  fingerprint: v.string(),
  index: v.number(),
  kind: v.union(
    v.literal("accepted_accepted_csv_order"),
    v.literal("accepted_inbox_csv_order"),
    v.literal("transition_inbox_execution_order"),
  ),
  survivor: rowEvidenceValidator,
  survivorAfterJson: v.string(),
  survivorCurrentExternalId: v.union(v.string(), v.null()),
  survivorId: v.string(),
});

const referenceObservationValidator = v.object({
  action: v.union(
    v.literal("none"),
    v.literal("refuse"),
    v.literal("remove_duplicate"),
    v.literal("repoint"),
  ),
  documentId: v.string(),
  field: v.union(
    ...INBOUND_REFERENCE_FIELD_DENOMINATOR.map((field) => v.literal(field)),
  ),
  referencedDuplicateId: v.string(),
  referencedRole: v.union(v.literal("deleted"), v.literal("survivor")),
  replacementId: v.union(v.string(), v.null()),
  table: v.union(
    v.literal("checkIns"),
    v.literal("importTasks"),
    v.literal("marketDataFetchJobs"),
    v.literal("portfolioPriceMarks"),
  ),
});

const dryRunValidator = v.object({
  archiveByteLength: v.number(),
  auditJson: v.string(),
  auditToken: v.string(),
  candidateRowsScanned: v.object({
    inboxTrades: v.number(),
    trades: v.number(),
  }),
  expectedEffects: v.object({
    deletedInboxTrades: v.number(),
    deletedTrades: v.number(),
    patchedReferenceDocuments: v.number(),
    patchedSurvivors: v.number(),
  }),
  inboundReferenceFieldDenominator: v.array(v.string()),
  pairKindCounts: v.object({
    acceptedAccepted: v.number(),
    acceptedInbox: v.number(),
    transitionInbox: v.number(),
  }),
  pairs: v.array(pairEvidenceValidator),
  pairsWithoutCanonicalOrderId: v.array(v.number()),
  referenceObservations: v.array(referenceObservationValidator),
  referenceRowsScanned: v.record(v.string(), v.number()),
  refusalReasons: v.array(v.string()),
  safeToExecute: v.boolean(),
});

const executionValidator = v.object({
  archiveId: v.id("ibkrDuplicateFillRepairArchives"),
  archiveStorageId: v.id("_storage"),
  auditToken: v.string(),
  deletedInboxTrades: v.number(),
  deletedTrades: v.number(),
  patchedReferenceDocuments: v.number(),
  patchedSurvivors: v.number(),
});

const postCheckValidator = v.object({
  archiveContainsEveryDeletedDocument: v.boolean(),
  archiveContentHashMatches: v.boolean(),
  archiveReadable: v.boolean(),
  auditToken: v.string(),
  candidateRowsScanned: v.object({
    inboxTrades: v.number(),
    trades: v.number(),
  }),
  deletedRowsExpected: v.number(),
  deletedRowsRemaining: v.number(),
  duplicateGroupsRemaining: v.number(),
  inboundReferenceFieldDenominator: v.array(v.string()),
  inboundReferencesToDeletedRowsRemaining: v.number(),
  referenceRowsScanned: v.record(v.string(), v.number()),
  survivorsExpected: v.number(),
  survivorsMatchingArchivedAfterState: v.number(),
});

function assertBounded<T>(rows: T[], table: string): T[] {
  if (rows.length > MAX_ROWS_PER_TABLE) {
    throw new ConvexError(
      `IBKR duplicate-fill repair refused: ${table} exceeds its ${MAX_ROWS_PER_TABLE}-row safety limit`,
    );
  }
  return rows;
}

function locatorKey(locator: Locator): string {
  return `${locator.table}:${String(locator.id)}`;
}

function rowLocator(row: DuplicateRow): Locator {
  return row.table === "trades"
    ? { id: row.document._id, table: "trades" }
    : { id: row.document._id, table: "inboxTrades" };
}

function pairKey(locators: Locator[]): string {
  return locators.map(locatorKey).sort().join("+");
}

function rowEvidence(row: DuplicateRow) {
  const document = row.document;
  return {
    brokerageAccountId: document.brokerageAccountId ?? null,
    creationTime: document._creationTime,
    date: document.date ?? null,
    direction: document.direction ?? null,
    documentJson: JSON.stringify(document),
    externalId: document.externalId ?? null,
    externalIdKind: classifyIbkrExternalId(document.externalId),
    fees: document.fees ?? null,
    id: String(document._id),
    orderType: document.orderType ?? null,
    portfolioId: document.portfolioId ? String(document.portfolioId) : null,
    price: document.price ?? null,
    quantity: document.quantity ?? null,
    side: document.side ?? null,
    source: document.source ?? null,
    table: row.table,
    taxes: document.taxes ?? null,
    ticker: document.ticker ?? null,
    tradePlanId: document.tradePlanId ? String(document.tradePlanId) : null,
  };
}

function stableSort<T>(values: T[], key: (value: T) => string): T[] {
  return [...values].sort((a, b) => key(a).localeCompare(key(b)));
}

function jsonValue(value: unknown): string {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "undefined" : encoded;
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

function normalizeStorageSha256(sha256: string): string | null {
  if (/^[0-9a-f]{64}$/i.test(sha256)) return sha256.toLowerCase();
  try {
    const bytes = Uint8Array.from(atob(sha256), (character) =>
      character.charCodeAt(0),
    );
    return bytes.length === 32
      ? Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
      : null;
  } catch {
    return null;
  }
}

function firstDifference(
  expected: unknown,
  actual: unknown,
  path = "audit",
): string | null {
  if (Object.is(expected, actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return `${path}.length changed from ${expected.length} to ${actual.length}`;
    }
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstDifference(
        expected[index],
        actual[index],
        `${path}[${index}]`,
      );
      if (difference) return difference;
    }
    return null;
  } else if (
    expected !== null &&
    actual !== null &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = [
      ...new Set([
        ...Object.keys(expectedRecord),
        ...Object.keys(actualRecord),
      ]),
    ].sort((a, b) => {
      const priority = (key: string) =>
        key === "pairs"
          ? 0
          : key === "referenceObservations"
            ? 1
            : key === "discoveredPairKeys"
              ? 2
              : key === "refusalReasons"
                ? 3
                : 4;
      if (priority(a) !== priority(b)) return priority(a) - priority(b);
      if (a === "documentJson") return 1;
      if (b === "documentJson") return -1;
      return a.localeCompare(b);
    });
    for (const key of keys) {
      if (!(key in expectedRecord)) return `${path}.${key} was added`;
      if (!(key in actualRecord)) return `${path}.${key} was removed`;
      const difference = firstDifference(
        expectedRecord[key],
        actualRecord[key],
        `${path}.${key}`,
      );
      if (difference) return difference;
    }
    return null;
  }
  return `${path} changed from ${jsonValue(expected)} to ${jsonValue(actual)}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

type SnapshotCtx = QueryCtx | MutationCtx;

async function readOwnerCandidateRows(
  ctx: SnapshotCtx,
  ownerId: string,
): Promise<{
  inboxTrades: Doc<"inboxTrades">[];
  rows: DuplicateRow[];
  trades: Doc<"trades">[];
}> {
  const [trades, inboxTrades] = await Promise.all([
    ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(MAX_ROWS_PER_TABLE + 1),
    ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_source_status", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("source", "ibkr")
          .eq("status", "pending_review"),
      )
      .take(MAX_ROWS_PER_TABLE + 1),
  ]);
  assertBounded(trades, "owner trades");
  assertBounded(inboxTrades, "owner IBKR inbox trades");
  return {
    inboxTrades,
    rows: [
      ...trades
        .filter((trade) => trade.source === "ibkr")
        .map((document) => ({ document, table: "trades" as const })),
      ...inboxTrades.map((document) => ({
        document,
        table: "inboxTrades" as const,
      })),
    ],
    trades,
  };
}

async function readLocator(
  ctx: SnapshotCtx,
  locator: Locator,
  ownerId: string,
  pairIndex: number,
  role: "first" | "second",
): Promise<DuplicateRow> {
  const document = await ctx.db.get(locator.id);
  if (!document) {
    throw new ConvexError(
      `IBKR duplicate-fill repair refused: pair ${pairIndex} ${role} ${locatorKey(locator)} is missing`,
    );
  }
  if (document.ownerId !== ownerId) {
    throw new ConvexError(
      `IBKR duplicate-fill repair refused: pair ${pairIndex} ${role} ownerId changed from ${ownerId} to ${document.ownerId}`,
    );
  }
  return locator.table === "trades"
    ? { document: document as Doc<"trades">, table: "trades" }
    : { document: document as Doc<"inboxTrades">, table: "inboxTrades" };
}

function identifierRow(
  rows: DuplicateRow[],
  kind: "csv" | "execution" | "order",
): DuplicateRow | undefined {
  return rows.find(
    (row) => classifyIbkrExternalId(row.document.externalId) === kind,
  );
}

function classifyPair(rows: DuplicateRow[], pairIndex: number): PairKind {
  const csv = identifierRow(rows, "csv");
  const execution = identifierRow(rows, "execution");
  const order = identifierRow(rows, "order");
  if (
    csv?.table === "trades" &&
    order?.table === "inboxTrades" &&
    rows.every((row) => row === csv || row === order)
  ) {
    return "accepted_inbox_csv_order";
  }
  if (
    csv?.table === "trades" &&
    order?.table === "trades" &&
    rows.every((row) => row === csv || row === order)
  ) {
    return "accepted_accepted_csv_order";
  }
  if (
    execution?.table === "inboxTrades" &&
    order?.table === "inboxTrades" &&
    rows.every((row) => row === execution || row === order)
  ) {
    const expectedOrder = KNOWN_TRANSITION_PAIRS.get(
      execution.document.externalId ?? "",
    );
    if (expectedOrder !== order.document.externalId) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: pair ${pairIndex} transition mapping changed from ${execution.document.externalId ?? "missing"}->${expectedOrder ?? "unapproved"} to ${execution.document.externalId ?? "missing"}->${order.document.externalId ?? "missing"}`,
      );
    }
    return "transition_inbox_execution_order";
  }
  throw new ConvexError(
    `IBKR duplicate-fill repair refused: pair ${pairIndex} table/externalId shape is ${rows
      .map(
        (row) =>
          `${row.table}:${classifyIbkrExternalId(row.document.externalId)}:${row.document.externalId ?? "missing"}`,
      )
      .join(", ")}`,
  );
}

function mergeSurvivorMetadata(
  survivor: DuplicateRow,
  deleted: DuplicateRow,
  pairIndex: number,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of ["portfolioId", "tradePlanId"] as const) {
    const survivorValue = survivor.document[field];
    const deletedValue = deleted.document[field];
    if (
      survivorValue !== undefined &&
      deletedValue !== undefined &&
      String(survivorValue) !== String(deletedValue)
    ) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: pair ${pairIndex} ${field} conflicts between survivor ${String(survivorValue)} and deleted row ${String(deletedValue)}`,
      );
    }
    if (survivorValue === undefined && deletedValue !== undefined) {
      patch[field] = deletedValue;
    }
  }

  const orderRow = [survivor, deleted].find(
    (row) => classifyIbkrExternalId(row.document.externalId) === "order",
  );
  if (!orderRow) return patch;
  if (survivor.document.externalId !== orderRow.document.externalId) {
    patch.externalId = orderRow.document.externalId;
  }
  for (const field of ["fees", "taxes", "orderType"] as const) {
    const authoritativeValue = orderRow.document[field];
    if (
      authoritativeValue !== undefined &&
      survivor.document[field] !== authoritativeValue
    ) {
      patch[field] = authoritativeValue;
    }
  }

  if (survivor.table === "inboxTrades" && deleted.table === "inboxTrades") {
    const validationErrors = [
      ...new Set([
        ...survivor.document.validationErrors,
        ...deleted.document.validationErrors,
      ]),
    ];
    const validationWarnings = [
      ...new Set([
        ...survivor.document.validationWarnings,
        ...deleted.document.validationWarnings,
      ]),
    ];
    if (
      JSON.stringify(validationErrors) !==
      JSON.stringify(survivor.document.validationErrors)
    ) {
      patch.validationErrors = validationErrors;
    }
    if (
      JSON.stringify(validationWarnings) !==
      JSON.stringify(survivor.document.validationWarnings)
    ) {
      patch.validationWarnings = validationWarnings;
    }
  }
  return patch;
}

function commonIdentity(row: DuplicateRow) {
  return {
    assetType: row.document.assetType ?? null,
    brokerageAccountId:
      row.document.brokerageAccountId?.trim().toUpperCase() ?? null,
    date: row.document.date ?? null,
    direction: row.document.direction ?? null,
    price: row.document.price ?? null,
    quantity: row.document.quantity ?? null,
    side: row.document.side ?? null,
    source: row.document.source ?? null,
    ticker: row.document.ticker?.trim().toUpperCase() ?? null,
  };
}

function assertLogicalPair(rows: DuplicateRow[], pairIndex: number): string {
  for (const row of rows) {
    if (
      row.document.date !== undefined &&
      isMidnightEastern(row.document.date)
    ) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: pair ${pairIndex} ${locatorKey(rowLocator(row))} date ${row.document.date} is midnight Eastern and cannot prove second-granularity identity`,
      );
    }
  }
  const [firstIdentity, secondIdentity] = rows.map(commonIdentity);
  const differingFields = Object.keys(firstIdentity).filter(
    (field) =>
      firstIdentity[field as keyof typeof firstIdentity] !==
      secondIdentity[field as keyof typeof secondIdentity],
  );
  if (differingFields.length > 0) {
    throw new ConvexError(
      `IBKR duplicate-fill repair refused: pair ${pairIndex} logical fill field(s) ${differingFields.join(", ")} differ`,
    );
  }
  const fingerprint = ibkrLogicalFillFingerprint(rows[0].document);
  if (!fingerprint) {
    throw new ConvexError(
      `IBKR duplicate-fill repair refused: pair ${pairIndex} is missing a complete IBKR US-equity logical fingerprint`,
    );
  }
  return fingerprint;
}

async function planSuppliedPairs(
  ctx: SnapshotCtx,
  spec: RepairSpec,
): Promise<{ pairPlans: PlannedPair[]; suppliedPairKeys: string[] }> {
  if (spec.pairs.length !== EXPECTED_GROUP_COUNT) {
    throw new ConvexError(
      `IBKR duplicate-fill repair refused: supplied pair count changed from ${EXPECTED_GROUP_COUNT} to ${spec.pairs.length}`,
    );
  }
  const seen = new Set<string>();
  const pairPlans: PlannedPair[] = [];
  for (let index = 0; index < spec.pairs.length; index += 1) {
    const pair = spec.pairs[index]!;
    const pairIndex = index + 1;
    const firstKey = locatorKey(pair.first);
    const secondKey = locatorKey(pair.second);
    const survivorKey = locatorKey(pair.survivor);
    if (firstKey === secondKey) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: pair ${pairIndex} repeats ${firstKey}`,
      );
    }
    if (survivorKey !== firstKey && survivorKey !== secondKey) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: pair ${pairIndex} survivor ${survivorKey} is not one of ${firstKey}, ${secondKey}`,
      );
    }
    for (const key of [firstKey, secondKey]) {
      if (seen.has(key)) {
        throw new ConvexError(
          `IBKR duplicate-fill repair refused: document ${key} appears in more than one supplied pair`,
        );
      }
      seen.add(key);
    }
    const rows = await Promise.all([
      readLocator(ctx, pair.first, spec.ownerId, pairIndex, "first"),
      readLocator(ctx, pair.second, spec.ownerId, pairIndex, "second"),
    ]);
    const fingerprint = assertLogicalPair(rows, pairIndex);
    const kind = classifyPair(rows, pairIndex);
    const suppliedSurvivor = rows.find(
      (row) => locatorKey(rowLocator(row)) === survivorKey,
    )!;
    const requiredSurvivor =
      kind === "accepted_inbox_csv_order"
        ? rows.find((row) => row.table === "trades")!
        : identifierRow(rows, "order")!;
    if (suppliedSurvivor !== requiredSurvivor) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: pair ${pairIndex} survivor policy requires ${locatorKey(rowLocator(requiredSurvivor))}, not ${survivorKey}`,
      );
    }
    const survivor = requiredSurvivor;
    const deleted = rows.find((row) => row !== survivor)!;
    const orderRow = identifierRow(rows, "order");
    pairPlans.push({
      adoptedExternalId: orderRow?.document.externalId ?? null,
      deleted,
      fingerprint,
      index: pairIndex,
      kind,
      survivor,
      survivorPatch: mergeSurvivorMetadata(survivor, deleted, pairIndex),
    });
  }
  return {
    pairPlans: stableSort(pairPlans, (plan) =>
      pairKey([rowLocator(plan.survivor), rowLocator(plan.deleted)]),
    ).map((plan, index) => ({ ...plan, index: index + 1 })),
    suppliedPairKeys: stableSort(
      spec.pairs.map((pair) => pairKey([pair.first, pair.second])),
      (key) => key,
    ),
  };
}

async function scanInboundReferences(
  ctx: SnapshotCtx,
  pairPlans: PlannedPair[],
): Promise<ReferenceSnapshot> {
  const [checkIns, importTasks, marketDataFetchJobs, portfolioPriceMarks] =
    await Promise.all([
      ctx.db
        .query("checkIns")
        .withIndex("by_owner")
        .take(MAX_ROWS_PER_TABLE + 1),
      ctx.db
        .query("importTasks")
        .withIndex("by_owner")
        .take(MAX_ROWS_PER_TABLE + 1),
      ctx.db
        .query("marketDataFetchJobs")
        .withIndex("by_ownerId_and_status_and_updatedAt")
        .take(MAX_ROWS_PER_TABLE + 1),
      ctx.db
        .query("portfolioPriceMarks")
        .withIndex("by_ownerId_and_portfolioId_and_date")
        .take(MAX_ROWS_PER_TABLE + 1),
    ]);
  assertBounded(checkIns, "checkIns reference scan");
  assertBounded(importTasks, "importTasks reference scan");
  assertBounded(marketDataFetchJobs, "marketDataFetchJobs reference scan");
  assertBounded(portfolioPriceMarks, "portfolioPriceMarks reference scan");

  const roleById = new Map<
    string,
    { replacement: Locator; role: "deleted" | "survivor"; row: DuplicateRow }
  >();
  for (const plan of pairPlans) {
    roleById.set(String(plan.survivor.document._id), {
      replacement: rowLocator(plan.survivor),
      role: "survivor",
      row: plan.survivor,
    });
    roleById.set(String(plan.deleted.document._id), {
      replacement: rowLocator(plan.survivor),
      role: "deleted",
      row: plan.deleted,
    });
  }

  const observations: ReferenceObservation[] = [];
  const refusalReasons: string[] = [];
  const observe = (args: {
    documentId: string;
    field: ReferenceObservation["field"];
    referencedId: string;
    survivorAlreadyReferenced?: boolean;
    table: ReferenceObservation["table"];
  }) => {
    const match = roleById.get(args.referencedId);
    if (!match) return;
    let action: ReferenceObservation["action"] = "none";
    let replacementId: string | null = null;
    if (match.role === "deleted") {
      replacementId = String(match.replacement.id);
      const acceptsReplacement =
        args.field === "checkIns.surfacedTradeIds" ||
        (args.field === "importTasks.inboxTradeId" &&
          match.replacement.table === "inboxTrades") ||
        ((args.field === "marketDataFetchJobs.sourceTradeIds" ||
          args.field === "portfolioPriceMarks.sourceTradeId") &&
          match.replacement.table === "trades");
      if (!acceptsReplacement) {
        action = "refuse";
        refusalReasons.push(
          `${args.field} document ${args.documentId} references deleted ${locatorKey(rowLocator(match.row))}, but survivor ${locatorKey(match.replacement)} is not valid for that field`,
        );
      } else {
        action = args.survivorAlreadyReferenced
          ? "remove_duplicate"
          : "repoint";
      }
    }
    observations.push({
      action,
      documentId: args.documentId,
      field: args.field,
      referencedDuplicateId: args.referencedId,
      referencedRole: match.role,
      replacementId,
      table: args.table,
    });
  };

  for (const checkIn of checkIns) {
    const ids = checkIn.surfacedTradeIds ?? [];
    for (const referencedId of ids) {
      const match = roleById.get(referencedId);
      observe({
        documentId: String(checkIn._id),
        field: "checkIns.surfacedTradeIds",
        referencedId,
        survivorAlreadyReferenced:
          match?.role === "deleted" &&
          ids.includes(String(match.replacement.id)),
        table: "checkIns",
      });
    }
  }
  for (const task of importTasks) {
    if (!task.inboxTradeId) continue;
    observe({
      documentId: String(task._id),
      field: "importTasks.inboxTradeId",
      referencedId: String(task.inboxTradeId),
      table: "importTasks",
    });
  }
  for (const job of marketDataFetchJobs) {
    const ids = job.sourceTradeIds.map(String);
    for (const referencedId of ids) {
      const match = roleById.get(referencedId);
      observe({
        documentId: String(job._id),
        field: "marketDataFetchJobs.sourceTradeIds",
        referencedId,
        survivorAlreadyReferenced:
          match?.role === "deleted" &&
          ids.includes(String(match.replacement.id)),
        table: "marketDataFetchJobs",
      });
    }
  }
  for (const mark of portfolioPriceMarks) {
    observe({
      documentId: String(mark._id),
      field: "portfolioPriceMarks.sourceTradeId",
      referencedId: String(mark.sourceTradeId),
      table: "portfolioPriceMarks",
    });
  }

  return {
    observations: stableSort(
      observations,
      (observation) =>
        `${observation.field}:${observation.documentId}:${observation.referencedDuplicateId}`,
    ),
    refusalReasons: [...new Set(refusalReasons)].sort(),
    scannedCounts: {
      checkIns: checkIns.length,
      importTasks: importTasks.length,
      marketDataFetchJobs: marketDataFetchJobs.length,
      portfolioPriceMarks: portfolioPriceMarks.length,
    },
  };
}

function discoveredGroups(rows: DuplicateRow[]): {
  keys: string[];
  oversized: string[];
} {
  const grouped = new Map<string, DuplicateRow[]>();
  for (const row of rows) {
    const fingerprint = ibkrLogicalFillFingerprint(row.document);
    if (!fingerprint) continue;
    const group = grouped.get(fingerprint) ?? [];
    group.push(row);
    grouped.set(fingerprint, group);
  }
  const keys: string[] = [];
  const oversized: string[] = [];
  for (const [fingerprint, group] of grouped) {
    if (group.length < 2) continue;
    const key = pairKey(group.map(rowLocator));
    if (group.length === 2) keys.push(key);
    else oversized.push(`${fingerprint}:${key}`);
  }
  return { keys: keys.sort(), oversized: oversized.sort() };
}

function pairKindCounts(pairPlans: PlannedPair[]) {
  return {
    acceptedAccepted: pairPlans.filter(
      (plan) => plan.kind === "accepted_accepted_csv_order",
    ).length,
    acceptedInbox: pairPlans.filter(
      (plan) => plan.kind === "accepted_inbox_csv_order",
    ).length,
    transitionInbox: pairPlans.filter(
      (plan) => plan.kind === "transition_inbox_execution_order",
    ).length,
  };
}

async function readSnapshot(
  ctx: SnapshotCtx,
  spec: RepairSpec,
): Promise<Snapshot> {
  const [{ pairPlans, suppliedPairKeys }, ownerRows] = await Promise.all([
    planSuppliedPairs(ctx, spec),
    readOwnerCandidateRows(ctx, spec.ownerId),
  ]);
  const discovered = discoveredGroups(ownerRows.rows);
  const referenceSnapshot = await scanInboundReferences(ctx, pairPlans);
  const counts = pairKindCounts(pairPlans);
  const refusalReasons = [...referenceSnapshot.refusalReasons];
  if (counts.acceptedInbox !== EXPECTED_ACCEPTED_INBOX_COUNT) {
    refusalReasons.push(
      `accepted/inbox pair count changed from ${EXPECTED_ACCEPTED_INBOX_COUNT} to ${counts.acceptedInbox}`,
    );
  }
  if (counts.acceptedAccepted !== EXPECTED_ACCEPTED_ACCEPTED_COUNT) {
    refusalReasons.push(
      `accepted/accepted pair count changed from ${EXPECTED_ACCEPTED_ACCEPTED_COUNT} to ${counts.acceptedAccepted}`,
    );
  }
  if (counts.transitionInbox !== EXPECTED_TRANSITION_COUNT) {
    refusalReasons.push(
      `transition inbox pair count changed from ${EXPECTED_TRANSITION_COUNT} to ${counts.transitionInbox}`,
    );
  }
  if (discovered.oversized.length > 0) {
    refusalReasons.push(
      `logical fingerprint scan found group(s) larger than two: ${discovered.oversized.join(", ")}`,
    );
  }
  const missing = suppliedPairKeys.filter(
    (key) => !discovered.keys.includes(key),
  );
  const unexpected = discovered.keys.filter(
    (key) => !suppliedPairKeys.includes(key),
  );
  if (missing.length > 0) {
    refusalReasons.push(
      `supplied duplicate pair(s) no longer discovered: ${missing.join(", ")}`,
    );
  }
  if (unexpected.length > 0) {
    refusalReasons.push(
      `unapproved duplicate pair(s) discovered: ${unexpected.join(", ")}`,
    );
  }
  return {
    candidateRowsScanned: {
      inboxTrades: ownerRows.inboxTrades.length,
      trades: ownerRows.trades.length,
    },
    discoveredPairKeys: discovered.keys,
    pairPlans,
    referenceSnapshot,
    refusalReasons: [...new Set(refusalReasons)].sort(),
    suppliedPairKeys,
  };
}

function pairAuditEvidence(plan: PlannedPair) {
  return {
    adoptedExternalId: plan.adoptedExternalId,
    deleted: rowEvidence(plan.deleted),
    fingerprint: plan.fingerprint,
    index: plan.index,
    kind: plan.kind,
    survivor: rowEvidence(plan.survivor),
    survivorAfterJson: JSON.stringify({
      ...plan.survivor.document,
      ...plan.survivorPatch,
    }),
    survivorCurrentExternalId: plan.survivor.document.externalId ?? null,
    survivorId: String(plan.survivor.document._id),
  };
}

function auditPayload(snapshot: Snapshot, spec: RepairSpec) {
  return {
    archiveFormat: ARCHIVE_FORMAT,
    discoveredPairKeys: snapshot.discoveredPairKeys,
    inboundReferenceFieldDenominator: [...INBOUND_REFERENCE_FIELD_DENOMINATOR],
    ownerId: spec.ownerId,
    pairs: snapshot.pairPlans.map(pairAuditEvidence),
    pairsWithoutCanonicalOrderId: snapshot.pairPlans
      .filter((plan) => plan.adoptedExternalId === null)
      .map((plan) => plan.index),
    referenceObservations: snapshot.referenceSnapshot.observations,
    refusalReasons: snapshot.refusalReasons,
    suppliedPairKeys: snapshot.suppliedPairKeys,
  };
}

function archivePayload(snapshot: Snapshot, spec: RepairSpec) {
  return {
    ...auditPayload(snapshot, spec),
    candidateRowsScanned: snapshot.candidateRowsScanned,
    referenceRowsScanned: snapshot.referenceSnapshot.scannedCounts,
  };
}

async function snapshotMaterial(
  ctx: SnapshotCtx,
  spec: RepairSpec,
): Promise<SnapshotMaterial> {
  const snapshot = await readSnapshot(ctx, spec);
  const auditJson = JSON.stringify(auditPayload(snapshot, spec));
  const archiveJson = JSON.stringify(archivePayload(snapshot, spec));
  const archiveByteLength = new TextEncoder().encode(archiveJson).byteLength;
  if (archiveByteLength > MAX_ARCHIVE_BYTES) {
    throw new ConvexError(
      `IBKR duplicate-fill repair refused: archive payload is ${archiveByteLength} bytes and exceeds its ${MAX_ARCHIVE_BYTES}-byte safety limit`,
    );
  }
  const auditHash = await sha256Hex(auditJson);
  return {
    ...snapshot,
    archiveContentHash: await sha256Hex(archiveJson),
    archiveJson,
    auditJson,
    auditToken: `${ARCHIVE_FORMAT}:${auditHash}`,
  };
}

function expectedEffects(snapshot: Snapshot) {
  return {
    deletedInboxTrades: snapshot.pairPlans.filter(
      (plan) => plan.deleted.table === "inboxTrades",
    ).length,
    deletedTrades: snapshot.pairPlans.filter(
      (plan) => plan.deleted.table === "trades",
    ).length,
    patchedReferenceDocuments: new Set(
      snapshot.referenceSnapshot.observations
        .filter(
          (observation) =>
            observation.action === "repoint" ||
            observation.action === "remove_duplicate",
        )
        .map((observation) => `${observation.table}:${observation.documentId}`),
    ).size,
    patchedSurvivors: snapshot.pairPlans.filter(
      (plan) => Object.keys(plan.survivorPatch).length > 0,
    ).length,
  };
}

function dryRun(material: SnapshotMaterial) {
  return {
    archiveByteLength: new TextEncoder().encode(material.archiveJson)
      .byteLength,
    auditJson: material.auditJson,
    auditToken: material.auditToken,
    candidateRowsScanned: material.candidateRowsScanned,
    expectedEffects: expectedEffects(material),
    inboundReferenceFieldDenominator: [...INBOUND_REFERENCE_FIELD_DENOMINATOR],
    pairKindCounts: pairKindCounts(material.pairPlans),
    pairs: material.pairPlans.map(pairAuditEvidence),
    pairsWithoutCanonicalOrderId: material.pairPlans
      .filter((plan) => plan.adoptedExternalId === null)
      .map((plan) => plan.index),
    referenceObservations: material.referenceSnapshot.observations,
    referenceRowsScanned: material.referenceSnapshot.scannedCounts,
    refusalReasons: material.refusalReasons,
    safeToExecute: material.refusalReasons.length === 0,
  };
}

export const discover = internalQuery({
  args: { ownerId: v.string() },
  returns: v.object({
    candidateRowsScanned: v.object({
      inboxTrades: v.number(),
      trades: v.number(),
    }),
    groups: v.array(
      v.object({
        fingerprint: v.string(),
        rows: v.array(rowEvidenceValidator),
      }),
    ),
    midnightRowsExcluded: v.array(rowEvidenceValidator),
  }),
  handler: async (ctx, args) => {
    const ownerRows = await readOwnerCandidateRows(ctx, args.ownerId);
    const grouped = new Map<string, DuplicateRow[]>();
    const midnightRowsExcluded: DuplicateRow[] = [];
    for (const row of ownerRows.rows) {
      if (
        row.document.date !== undefined &&
        isMidnightEastern(row.document.date)
      ) {
        midnightRowsExcluded.push(row);
        continue;
      }
      const fingerprint = ibkrLogicalFillFingerprint(row.document);
      if (!fingerprint) continue;
      const group = grouped.get(fingerprint) ?? [];
      group.push(row);
      grouped.set(fingerprint, group);
    }
    return {
      candidateRowsScanned: {
        inboxTrades: ownerRows.inboxTrades.length,
        trades: ownerRows.trades.length,
      },
      groups: [...grouped.entries()]
        .filter(([, rows]) => rows.length > 1)
        .map(([fingerprint, rows]) => ({
          fingerprint,
          rows: stableSort(rows, (row) => locatorKey(rowLocator(row))).map(
            rowEvidence,
          ),
        }))
        .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)),
      midnightRowsExcluded: stableSort(midnightRowsExcluded, (row) =>
        locatorKey(rowLocator(row)),
      ).map(rowEvidence),
    };
  },
});

export const inspect = internalQuery({
  args: repairSpecValidator,
  returns: dryRunValidator,
  handler: async (ctx, args) => dryRun(await snapshotMaterial(ctx, args)),
});

export const getArchivePayload = internalQuery({
  args: repairSpecValidator,
  returns: v.object({
    archiveJson: v.string(),
    auditJson: v.string(),
    auditToken: v.string(),
    contentHash: v.string(),
    refusalReasons: v.array(v.string()),
    safeToExecute: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const material = await snapshotMaterial(ctx, args);
    return {
      archiveJson: material.archiveJson,
      auditJson: material.auditJson,
      auditToken: material.auditToken,
      contentHash: material.archiveContentHash,
      refusalReasons: material.refusalReasons,
      safeToExecute: material.refusalReasons.length === 0,
    };
  },
});

export const hasCommittedAuditToken = internalQuery({
  args: { auditToken: v.string(), ownerId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    (await ctx.db
      .query("ibkrDuplicateFillRepairArchives")
      .withIndex("by_owner_auditToken", (q) =>
        q.eq("ownerId", args.ownerId).eq("auditToken", args.auditToken),
      )
      .unique()) !== null,
});

function auditJsonFromArchiveJson(archiveJson: string): string {
  const parsed = JSON.parse(archiveJson) as Record<string, unknown>;
  delete parsed.candidateRowsScanned;
  delete parsed.referenceRowsScanned;
  return JSON.stringify(parsed);
}

async function applyReferencePatches(
  ctx: MutationCtx,
  pairPlans: PlannedPair[],
): Promise<number> {
  const replacementByDeletedId = new Map<string, Locator>();
  for (const plan of pairPlans) {
    replacementByDeletedId.set(
      String(plan.deleted.document._id),
      rowLocator(plan.survivor),
    );
  }
  const [checkIns, importTasks, marketDataFetchJobs, portfolioPriceMarks] =
    await Promise.all([
      ctx.db
        .query("checkIns")
        .withIndex("by_owner")
        .take(MAX_ROWS_PER_TABLE + 1),
      ctx.db
        .query("importTasks")
        .withIndex("by_owner")
        .take(MAX_ROWS_PER_TABLE + 1),
      ctx.db
        .query("marketDataFetchJobs")
        .withIndex("by_ownerId_and_status_and_updatedAt")
        .take(MAX_ROWS_PER_TABLE + 1),
      ctx.db
        .query("portfolioPriceMarks")
        .withIndex("by_ownerId_and_portfolioId_and_date")
        .take(MAX_ROWS_PER_TABLE + 1),
    ]);
  assertBounded(checkIns, "checkIns reference patch");
  assertBounded(importTasks, "importTasks reference patch");
  assertBounded(marketDataFetchJobs, "marketDataFetchJobs reference patch");
  assertBounded(portfolioPriceMarks, "portfolioPriceMarks reference patch");
  let patchedDocuments = 0;

  for (const checkIn of checkIns) {
    if (!checkIn.surfacedTradeIds) continue;
    const replaced = checkIn.surfacedTradeIds.map((id) =>
      String(replacementByDeletedId.get(id)?.id ?? id),
    );
    const unique = [...new Set(replaced)];
    if (JSON.stringify(unique) !== JSON.stringify(checkIn.surfacedTradeIds)) {
      await ctx.db.patch(checkIn._id, { surfacedTradeIds: unique });
      patchedDocuments += 1;
    }
  }
  for (const task of importTasks) {
    if (!task.inboxTradeId) continue;
    const replacement = replacementByDeletedId.get(String(task.inboxTradeId));
    if (!replacement) continue;
    if (replacement.table !== "inboxTrades") {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: importTasks.inboxTradeId document ${String(task._id)} cannot reference survivor ${locatorKey(replacement)}`,
      );
    }
    await ctx.db.patch(task._id, { inboxTradeId: replacement.id });
    patchedDocuments += 1;
  }
  for (const job of marketDataFetchJobs) {
    const replaced = job.sourceTradeIds.map((id) => {
      const replacement = replacementByDeletedId.get(String(id));
      if (!replacement) return id;
      if (replacement.table !== "trades") {
        throw new ConvexError(
          `IBKR duplicate-fill repair refused: marketDataFetchJobs.sourceTradeIds document ${String(job._id)} cannot reference survivor ${locatorKey(replacement)}`,
        );
      }
      return replacement.id;
    });
    const unique = [
      ...new Map(replaced.map((id) => [String(id), id])).values(),
    ];
    if (
      JSON.stringify(unique.map(String)) !==
      JSON.stringify(job.sourceTradeIds.map(String))
    ) {
      await ctx.db.patch(job._id, { sourceTradeIds: unique });
      patchedDocuments += 1;
    }
  }
  for (const mark of portfolioPriceMarks) {
    const replacement = replacementByDeletedId.get(String(mark.sourceTradeId));
    if (!replacement) continue;
    if (replacement.table !== "trades") {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: portfolioPriceMarks.sourceTradeId document ${String(mark._id)} cannot reference survivor ${locatorKey(replacement)}`,
      );
    }
    await ctx.db.patch(mark._id, { sourceTradeId: replacement.id });
    patchedDocuments += 1;
  }
  return patchedDocuments;
}

async function applySurvivorPatches(
  ctx: MutationCtx,
  pairPlans: PlannedPair[],
): Promise<number> {
  let patched = 0;
  for (const plan of pairPlans) {
    if (Object.keys(plan.survivorPatch).length === 0) continue;
    if (plan.survivor.table === "trades") {
      await ctx.db.patch(
        plan.survivor.document._id,
        plan.survivorPatch as Partial<Doc<"trades">>,
      );
    } else {
      await ctx.db.patch(
        plan.survivor.document._id,
        plan.survivorPatch as Partial<Doc<"inboxTrades">>,
      );
    }
    patched += 1;
  }
  return patched;
}

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
  handler: async (ctx, args): Promise<ExecutionResult> => {
    let archiveAuditJson: string;
    try {
      archiveAuditJson = auditJsonFromArchiveJson(args.expectedArchiveJson);
    } catch {
      throw new ConvexError(
        "IBKR duplicate-fill repair refused: supplied archive payload is not valid JSON",
      );
    }
    if (archiveAuditJson !== args.expectedAuditJson) {
      throw new ConvexError(
        "IBKR duplicate-fill repair refused: supplied archive payload does not contain the approved audit payload",
      );
    }
    const expectedToken = `${ARCHIVE_FORMAT}:${await sha256Hex(args.expectedAuditJson)}`;
    if (expectedToken !== args.expectedAuditToken) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: supplied audit JSON hashes to ${expectedToken}, not approved token ${args.expectedAuditToken}`,
      );
    }
    const expectedArchiveHash = await sha256Hex(args.expectedArchiveJson);
    if (expectedArchiveHash !== args.archiveContentHash) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: supplied archive content hash changed from ${args.archiveContentHash} to ${expectedArchiveHash}`,
      );
    }

    const existingArchive = await ctx.db
      .query("ibkrDuplicateFillRepairArchives")
      .withIndex("by_owner_auditToken", (q) =>
        q
          .eq("ownerId", args.repairSpec.ownerId)
          .eq("auditToken", args.expectedAuditToken),
      )
      .unique();
    if (existingArchive) {
      throw new ConvexError(
        "IBKR duplicate-fill repair refused: this audit token has already been committed",
      );
    }

    const material = await snapshotMaterial(ctx, args.repairSpec);
    if (material.auditToken !== args.expectedAuditToken) {
      let expected: unknown = null;
      try {
        expected = JSON.parse(args.expectedAuditJson);
      } catch {
        throw new ConvexError(
          "IBKR duplicate-fill repair refused: approved audit JSON is not valid JSON",
        );
      }
      const actual = JSON.parse(material.auditJson) as unknown;
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: ${firstDifference(expected, actual) ?? `audit token changed from ${args.expectedAuditToken} to ${material.auditToken}`}`,
      );
    }
    if (material.refusalReasons.length > 0) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: ${material.refusalReasons.join("; ")}`,
      );
    }

    const storedArchive = await ctx.db.system.get(
      "_storage",
      args.archiveStorageId,
    );
    if (!storedArchive) {
      throw new ConvexError(
        "IBKR duplicate-fill repair refused: stored archive blob is missing",
      );
    }
    if (
      normalizeStorageSha256(storedArchive.sha256) !== args.archiveContentHash
    ) {
      throw new ConvexError(
        "IBKR duplicate-fill repair refused: stored archive blob content does not match the approved archive content hash",
      );
    }
    const effects = expectedEffects(material);
    const archiveId = await ctx.db.insert("ibkrDuplicateFillRepairArchives", {
      archiveFormat: ARCHIVE_FORMAT,
      auditToken: args.expectedAuditToken,
      contentHash: args.archiveContentHash,
      createdAt: Date.now(),
      deletedInboxTrades: effects.deletedInboxTrades,
      deletedTrades: effects.deletedTrades,
      ownerId: args.repairSpec.ownerId,
      patchedReferenceDocuments: effects.patchedReferenceDocuments,
      patchedSurvivors: effects.patchedSurvivors,
      storageId: args.archiveStorageId,
    });

    const patchedSurvivors = await applySurvivorPatches(
      ctx,
      material.pairPlans,
    );
    const patchedReferenceDocuments = await applyReferencePatches(
      ctx,
      material.pairPlans,
    );
    if (
      patchedSurvivors !== effects.patchedSurvivors ||
      patchedReferenceDocuments !== effects.patchedReferenceDocuments
    ) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: atomic patch counts changed from survivors=${effects.patchedSurvivors},references=${effects.patchedReferenceDocuments} to survivors=${patchedSurvivors},references=${patchedReferenceDocuments}`,
      );
    }
    for (const plan of material.pairPlans) {
      if (plan.deleted.table === "trades") {
        await ctx.db.delete(plan.deleted.document._id);
      } else {
        await ctx.db.delete(plan.deleted.document._id);
      }
    }

    return {
      archiveId,
      archiveStorageId: args.archiveStorageId,
      auditToken: args.expectedAuditToken,
      deletedInboxTrades: effects.deletedInboxTrades,
      deletedTrades: effects.deletedTrades,
      patchedReferenceDocuments,
      patchedSurvivors,
    };
  },
});

export const execute = internalAction({
  args: {
    expectedAuditJson: v.string(),
    expectedAuditToken: v.string(),
    repairSpec: repairSpecValidator,
  },
  returns: executionValidator,
  handler: async (ctx, args): Promise<ExecutionResult> => {
    const expectedToken = `${ARCHIVE_FORMAT}:${await sha256Hex(args.expectedAuditJson)}`;
    if (expectedToken !== args.expectedAuditToken) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: approved audit JSON hashes to ${expectedToken}, not supplied token ${args.expectedAuditToken}`,
      );
    }
    if (
      await ctx.runQuery(
        internal.ibkrDuplicateFillRepair.hasCommittedAuditToken,
        {
          auditToken: args.expectedAuditToken,
          ownerId: args.repairSpec.ownerId,
        },
      )
    ) {
      throw new ConvexError(
        "IBKR duplicate-fill repair refused: this audit token has already been committed",
      );
    }
    const payload: {
      archiveJson: string;
      auditJson: string;
      auditToken: string;
      contentHash: string;
      refusalReasons: string[];
      safeToExecute: boolean;
    } = await ctx.runQuery(
      internal.ibkrDuplicateFillRepair.getArchivePayload,
      args.repairSpec,
    );
    if (payload.auditToken !== args.expectedAuditToken) {
      const difference = firstDifference(
        JSON.parse(args.expectedAuditJson) as unknown,
        JSON.parse(payload.auditJson) as unknown,
      );
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: ${difference ?? `audit token changed from ${args.expectedAuditToken} to ${payload.auditToken}`}`,
      );
    }
    if (!payload.safeToExecute) {
      throw new ConvexError(
        `IBKR duplicate-fill repair refused: ${payload.refusalReasons.join("; ")}`,
      );
    }

    let archiveStorageId: Id<"_storage"> | undefined;
    try {
      archiveStorageId = await ctx.storage.store(
        new Blob([payload.archiveJson], { type: "application/json" }),
      );
      return await ctx.runMutation(internal.ibkrDuplicateFillRepair.commit, {
        archiveContentHash: payload.contentHash,
        archiveStorageId,
        expectedArchiveJson: payload.archiveJson,
        expectedAuditJson: args.expectedAuditJson,
        expectedAuditToken: args.expectedAuditToken,
        repairSpec: args.repairSpec,
      });
    } catch (error) {
      if (archiveStorageId) {
        let archiveWasCommitted = true;
        try {
          archiveWasCommitted = await ctx.runQuery(
            internal.ibkrDuplicateFillRepair.hasCommittedAuditToken,
            {
              auditToken: args.expectedAuditToken,
              ownerId: args.repairSpec.ownerId,
            },
          );
          if (!archiveWasCommitted) await ctx.storage.delete(archiveStorageId);
        } catch {
          // Keep a blob whose committed state cannot be proven.
        }
      }
      throw error;
    }
  },
});

export const getCommittedArchive = internalQuery({
  args: { auditToken: v.string(), ownerId: v.string() },
  returns: v.object({
    contentHash: v.string(),
    storageId: v.id("_storage"),
  }),
  handler: async (ctx, args) => {
    const archive = await ctx.db
      .query("ibkrDuplicateFillRepairArchives")
      .withIndex("by_owner_auditToken", (q) =>
        q.eq("ownerId", args.ownerId).eq("auditToken", args.auditToken),
      )
      .unique();
    if (!archive) {
      throw new ConvexError(
        "IBKR duplicate-fill repair post-check refused: no committed archive matches this owner and audit token",
      );
    }
    return { contentHash: archive.contentHash, storageId: archive.storageId };
  },
});

async function countInboundReferencesToIds(
  ctx: QueryCtx,
  ids: Set<string>,
): Promise<{ count: number; scannedCounts: Record<string, number> }> {
  const [checkIns, importTasks, marketDataFetchJobs, portfolioPriceMarks] =
    await Promise.all([
      ctx.db
        .query("checkIns")
        .withIndex("by_owner")
        .take(MAX_ROWS_PER_TABLE + 1),
      ctx.db
        .query("importTasks")
        .withIndex("by_owner")
        .take(MAX_ROWS_PER_TABLE + 1),
      ctx.db
        .query("marketDataFetchJobs")
        .withIndex("by_ownerId_and_status_and_updatedAt")
        .take(MAX_ROWS_PER_TABLE + 1),
      ctx.db
        .query("portfolioPriceMarks")
        .withIndex("by_ownerId_and_portfolioId_and_date")
        .take(MAX_ROWS_PER_TABLE + 1),
    ]);
  assertBounded(checkIns, "post-check checkIns reference scan");
  assertBounded(importTasks, "post-check importTasks reference scan");
  assertBounded(
    marketDataFetchJobs,
    "post-check marketDataFetchJobs reference scan",
  );
  assertBounded(
    portfolioPriceMarks,
    "post-check portfolioPriceMarks reference scan",
  );
  let count = 0;
  for (const checkIn of checkIns) {
    count += (checkIn.surfacedTradeIds ?? []).filter((id) =>
      ids.has(id),
    ).length;
  }
  for (const task of importTasks) {
    if (task.inboxTradeId && ids.has(String(task.inboxTradeId))) count += 1;
  }
  for (const job of marketDataFetchJobs) {
    count += job.sourceTradeIds.filter((id) => ids.has(String(id))).length;
  }
  for (const mark of portfolioPriceMarks) {
    if (ids.has(String(mark.sourceTradeId))) count += 1;
  }
  return {
    count,
    scannedCounts: {
      checkIns: checkIns.length,
      importTasks: importTasks.length,
      marketDataFetchJobs: marketDataFetchJobs.length,
      portfolioPriceMarks: portfolioPriceMarks.length,
    },
  };
}

export const verifyPostState = internalQuery({
  args: {
    deleted: v.array(locatorValidator),
    ownerId: v.string(),
    survivors: v.array(
      v.object({ locator: locatorValidator, expectedDocumentJson: v.string() }),
    ),
  },
  returns: v.object({
    candidateRowsScanned: v.object({
      inboxTrades: v.number(),
      trades: v.number(),
    }),
    deletedRowsRemaining: v.number(),
    duplicateGroupsRemaining: v.number(),
    inboundReferencesToDeletedRowsRemaining: v.number(),
    referenceRowsScanned: v.record(v.string(), v.number()),
    survivorsMatchingArchivedAfterState: v.number(),
  }),
  handler: async (ctx, args) => {
    const deletedRows = await Promise.all(
      args.deleted.map((locator) => ctx.db.get(locator.id)),
    );
    const survivorRows = await Promise.all(
      args.survivors.map(async ({ expectedDocumentJson, locator }) => ({
        document: await ctx.db.get(locator.id),
        expectedDocumentJson,
      })),
    );
    const ownerRows = await readOwnerCandidateRows(ctx, args.ownerId);
    const discovered = discoveredGroups(ownerRows.rows);
    const references = await countInboundReferencesToIds(
      ctx,
      new Set(args.deleted.map((locator) => String(locator.id))),
    );
    return {
      candidateRowsScanned: {
        inboxTrades: ownerRows.inboxTrades.length,
        trades: ownerRows.trades.length,
      },
      deletedRowsRemaining: deletedRows.filter((row) => row !== null).length,
      duplicateGroupsRemaining:
        discovered.keys.length + discovered.oversized.length,
      inboundReferencesToDeletedRowsRemaining: references.count,
      referenceRowsScanned: references.scannedCounts,
      survivorsMatchingArchivedAfterState: survivorRows.filter(
        ({ document, expectedDocumentJson }) =>
          document !== null &&
          canonicalJson(document) ===
            canonicalJson(JSON.parse(expectedDocumentJson) as unknown),
      ).length,
    };
  },
});

export const postCheck = internalAction({
  args: { auditToken: v.string(), ownerId: v.string() },
  returns: postCheckValidator,
  handler: async (ctx, args) => {
    const archive: { contentHash: string; storageId: Id<"_storage"> } =
      await ctx.runQuery(
        internal.ibkrDuplicateFillRepair.getCommittedArchive,
        args,
      );
    const blob = await ctx.storage.get(archive.storageId);
    const archiveText = blob ? await blob.text() : "";
    let parsed:
      | {
          pairs?: Array<{
            deleted?: { id?: string; table?: "trades" | "inboxTrades" };
            survivor?: { id?: string; table?: "trades" | "inboxTrades" };
            survivorAfterJson?: string;
          }>;
        }
      | undefined;
    try {
      parsed = archiveText ? JSON.parse(archiveText) : undefined;
    } catch {
      // The explicit archive checks report unreadable or corrupt content.
    }
    const archivedPairs = parsed?.pairs ?? [];
    const deleted = archivedPairs.flatMap((pair): Locator[] => {
      const row = pair.deleted;
      if (!row?.id || !row.table) return [];
      return row.table === "trades"
        ? [{ id: row.id as Id<"trades">, table: "trades" }]
        : [{ id: row.id as Id<"inboxTrades">, table: "inboxTrades" }];
    });
    const survivors = archivedPairs.flatMap(
      (pair): Array<{ locator: Locator; expectedDocumentJson: string }> => {
        const row = pair.survivor;
        if (!row?.id || !row.table || !pair.survivorAfterJson) return [];
        return [
          {
            expectedDocumentJson: pair.survivorAfterJson,
            locator:
              row.table === "trades"
                ? { id: row.id as Id<"trades">, table: "trades" }
                : {
                    id: row.id as Id<"inboxTrades">,
                    table: "inboxTrades",
                  },
          },
        ];
      },
    );
    const state: {
      candidateRowsScanned: { inboxTrades: number; trades: number };
      deletedRowsRemaining: number;
      duplicateGroupsRemaining: number;
      inboundReferencesToDeletedRowsRemaining: number;
      referenceRowsScanned: Record<string, number>;
      survivorsMatchingArchivedAfterState: number;
    } = await ctx.runQuery(internal.ibkrDuplicateFillRepair.verifyPostState, {
      deleted,
      ownerId: args.ownerId,
      survivors,
    });
    return {
      archiveContainsEveryDeletedDocument:
        deleted.length === EXPECTED_GROUP_COUNT &&
        deleted.every((locator) => archiveText.includes(String(locator.id))),
      archiveContentHashMatches:
        blob !== null && (await sha256Hex(archiveText)) === archive.contentHash,
      archiveReadable: blob !== null,
      auditToken: args.auditToken,
      candidateRowsScanned: state.candidateRowsScanned,
      deletedRowsExpected: EXPECTED_GROUP_COUNT,
      deletedRowsRemaining: state.deletedRowsRemaining,
      duplicateGroupsRemaining: state.duplicateGroupsRemaining,
      inboundReferenceFieldDenominator: [
        ...INBOUND_REFERENCE_FIELD_DENOMINATOR,
      ],
      inboundReferencesToDeletedRowsRemaining:
        state.inboundReferencesToDeletedRowsRemaining,
      referenceRowsScanned: state.referenceRowsScanned,
      survivorsExpected: EXPECTED_GROUP_COUNT,
      survivorsMatchingArchivedAfterState:
        state.survivorsMatchingArchivedAfterState,
    };
  },
});
