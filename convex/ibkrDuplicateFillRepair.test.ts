// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseIbkrEasternTimestamp } from "../shared/brokerage/ibkr-flex/time";
import { KNOWN_TRANSITION_EXTERNAL_ID_PAIRS } from "./ibkrDuplicateFillRepair";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

type Locator =
  | { id: Id<"trades">; table: "trades" }
  | { id: Id<"inboxTrades">; table: "inboxTrades" };

type RepairSpec = {
  ownerId: string;
  pairs: Array<{ first: Locator; second: Locator; survivor: Locator }>;
};

const ownerId = "owner-a";
const baseDate = parseIbkrEasternTimestamp("20260813;103000")!;
const transitionIds = [
  ["ARM", "00015e71.6a7e2fbf.01.01", "5523063596"],
  ["INTC", "00030e5e.6e4fb220.01.01", "5523042492"],
  ["TBBB", "0001ebd7.6a7dcc9e.01.01", "5523128204"],
  ["TXRH", "00024966.6a7dc56c.01.01", "5523594973"],
] as const;

async function seedRepair(args?: { references?: boolean }) {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const pairs: RepairSpec["pairs"] = [];
    const rowsByKind: Record<string, { deleted: Locator; survivor: Locator }> =
      {};
    const portfolioId = await ctx.db.insert("portfolios", {
      name: "Main",
      ownerId,
    });

    for (let index = 0; index < 25; index += 1) {
      const ticker = `C${String(index).padStart(2, "0")}`;
      const date = baseDate + index * 1_000;
      const price = 100 + index;
      const acceptedId = await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: "U1",
        date,
        direction: "long",
        externalId: `U1|${ticker}|20260813;10${String(30 + index).padStart(2, "0")}00|${price}|1`,
        fees: 0,
        ownerId,
        price,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        ticker,
      });
      const inboxId = await ctx.db.insert("inboxTrades", {
        assetType: "stock",
        brokerageAccountId: "U1",
        date,
        direction: "long",
        externalId: String(6_000_000_000 + index),
        fees: -1 - index / 100,
        orderType: "LMT",
        ownerId,
        price,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        status: "pending_review",
        taxes: index / 100,
        ticker,
        validationErrors: [],
        validationWarnings: [],
      });
      const survivor = { id: acceptedId, table: "trades" as const };
      const deleted = { id: inboxId, table: "inboxTrades" as const };
      pairs.push({ first: survivor, second: deleted, survivor });
      rowsByKind[`accepted-inbox-${index}`] = { deleted, survivor };
    }

    for (let index = 0; index < 2; index += 1) {
      const ticker = `A${index}`;
      const date = baseDate + (30 + index) * 1_000;
      const price = 200 + index;
      const csvId = await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: "U1",
        date,
        direction: "long",
        externalId: `U1|${ticker}|20260813;11000${index}|${price}|2`,
        fees: 0,
        ownerId,
        portfolioId,
        price,
        quantity: 2,
        side: "buy",
        source: "ibkr",
        ticker,
      });
      const orderId = await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: "U1",
        date,
        direction: "long",
        externalId: String(7_000_000_000 + index),
        fees: -2,
        orderType: "LMT",
        ownerId,
        price,
        quantity: 2,
        side: "buy",
        source: "ibkr",
        ticker,
      });
      const survivor = { id: orderId, table: "trades" as const };
      const deleted = { id: csvId, table: "trades" as const };
      pairs.push({ first: deleted, second: survivor, survivor });
      rowsByKind[`accepted-accepted-${index}`] = { deleted, survivor };
    }

    for (let index = 0; index < transitionIds.length; index += 1) {
      const [ticker, executionExternalId, orderExternalId] =
        transitionIds[index]!;
      const date = baseDate + (40 + index) * 1_000;
      const executionId = await ctx.db.insert("inboxTrades", {
        assetType: "stock",
        brokerageAccountId: "U1",
        date,
        direction: "long",
        externalId: executionExternalId,
        fees: -1,
        ownerId,
        price: 300 + index,
        quantity: 3,
        side: "buy",
        source: "ibkr",
        status: "pending_review",
        ticker,
        validationErrors: [],
        validationWarnings: ["legacy warning"],
      });
      const orderId = await ctx.db.insert("inboxTrades", {
        assetType: "stock",
        brokerageAccountId: "U1",
        date,
        direction: "long",
        externalId: orderExternalId,
        fees: -1,
        ownerId,
        price: 300 + index,
        quantity: 3,
        side: "buy",
        source: "ibkr",
        status: "pending_review",
        ticker,
        validationErrors: [],
        validationWarnings: [],
      });
      const survivor = { id: orderId, table: "inboxTrades" as const };
      const deleted = {
        id: executionId,
        table: "inboxTrades" as const,
      };
      pairs.push({ first: deleted, second: survivor, survivor });
      rowsByKind[`transition-${index}`] = { deleted, survivor };
    }

    if (args?.references) {
      const transition = rowsByKind["transition-0"]!;
      const accepted = rowsByKind["accepted-accepted-0"]!;
      await ctx.db.insert("checkIns", {
        date: "2026-08-13",
        kind: "mirror",
        ownerId,
        sentAt: 1,
        surfacedTradeIds: [
          String(transition.deleted.id),
          String(transition.survivor.id),
        ],
        window: "afternoon",
      });
      await ctx.db.insert("importTasks", {
        inboxTradeId: transition.deleted.id as Id<"inboxTrades">,
        mode: "create",
        ownerId,
        pastedText: "fixture",
        status: "done",
      });
      const runId = await ctx.db.insert("marketDataRefreshRuns", {
        ownerId,
        provider: "twelve_data",
        runDate: "2026-08-13",
        startedAt: 1,
        status: "completed",
        symbolsFailed: 0,
        symbolsRequested: 1,
        symbolsSucceeded: 1,
      });
      await ctx.db.insert("marketDataFetchJobs", {
        assetType: "stock",
        attempts: 1,
        createdAt: 1,
        estimatedCredits: 1,
        kind: "daily_snapshot",
        ownerId,
        provider: "twelve_data",
        runId,
        sourceTradeIds: [
          accepted.deleted.id as Id<"trades">,
          accepted.survivor.id as Id<"trades">,
        ],
        status: "completed",
        symbol: "A0",
        updatedAt: 1,
      });
      await ctx.db.insert("portfolioPriceMarks", {
        assetType: "stock",
        createdAt: 1,
        date: "2026-08-13",
        direction: "long",
        ownerId,
        portfolioId,
        price: 200,
        source: "last_trade",
        sourceTradeId: accepted.deleted.id as Id<"trades">,
        symbol: "A0",
        updatedAt: 1,
      });
    }
    return { pairs, portfolioId, rowsByKind };
  });
  return {
    spec: { ownerId, pairs: seeded.pairs } satisfies RepairSpec,
    ...seeded,
    t,
  };
}

async function seedRepairWithUnapprovedPair() {
  const seeded = await seedRepair();
  await seeded.t.run(async (ctx) => {
    const identity = {
      assetType: "stock" as const,
      brokerageAccountId: "U1",
      date: baseDate + 90_000,
      direction: "long" as const,
      ownerId,
      price: 999,
      quantity: 1,
      side: "buy" as const,
      source: "ibkr" as const,
      ticker: "EXTRA",
    };
    await ctx.db.insert("trades", {
      ...identity,
      externalId: "U1|EXTRA|20260813;103130|999|1",
    });
    await ctx.db.insert("inboxTrades", {
      ...identity,
      externalId: "6999999999",
      status: "pending_review",
      validationErrors: [],
      validationWarnings: [],
    });
  });
  return seeded;
}

describe("IBKR duplicate-fill repair", () => {
  it("pins the exact four #158 transition external-ID mappings", () => {
    expect(KNOWN_TRANSITION_EXTERNAL_ID_PAIRS).toEqual([
      ["00015e71.6a7e2fbf.01.01", "5523063596"],
      ["00030e5e.6e4fb220.01.01", "5523042492"],
      ["0001ebd7.6a7dcc9e.01.01", "5523128204"],
      ["00024966.6a7dc56c.01.01", "5523594973"],
    ]);
  });

  it("refuses a transition pair whose order ID differs from its mapped counterpart", async () => {
    const { rowsByKind, spec, t } = await seedRepair();
    const transition = rowsByKind["transition-0"]!;
    await t.run((ctx) =>
      ctx.db.patch(transition.survivor.id as Id<"inboxTrades">, {
        externalId: "5523063597",
      }),
    );

    await expect(
      t.query(internal.ibkrDuplicateFillRepair.inspect, spec),
    ).rejects.toThrow(
      "transition mapping changed from 00015e71.6a7e2fbf.01.01->5523063596 to 00015e71.6a7e2fbf.01.01->5523063597",
    );
  });

  it("dry-runs the exact 31 supplied groups with per-document and reference evidence", async () => {
    const { spec, t } = await seedRepair({ references: true });
    const result = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );

    expect(result.safeToExecute).toBe(true);
    expect(result.pairKindCounts).toEqual({
      acceptedAccepted: 2,
      acceptedInbox: 25,
      transitionInbox: 4,
    });
    expect(result.pairs).toHaveLength(31);
    expect(result.pairs.every((pair) => pair.deleted.documentJson)).toBe(true);
    expect(result.pairsWithoutCanonicalOrderId).toEqual([]);
    expect(result.pairs[0]).toMatchObject({
      adoptedExternalId: expect.stringMatching(/^\d+$/),
      survivorCurrentExternalId: expect.any(String),
      survivorId: expect.any(String),
    });
    expect(result.inboundReferenceFieldDenominator).toEqual([
      "checkIns.surfacedTradeIds",
      "importTasks.inboxTradeId",
      "marketDataFetchJobs.sourceTradeIds",
      "portfolioPriceMarks.sourceTradeId",
    ]);
    expect(result.referenceRowsScanned).toEqual({
      checkIns: 1,
      importTasks: 1,
      marketDataFetchJobs: 1,
      portfolioPriceMarks: 1,
    });
    expect(result.fingerprintCoverage).toMatchObject({
      eligibleIbkrRows: 62,
      fingerprintableRows: 62,
      rowsEnumerated: { inboxTrades: 33, trades: 29 },
    });
    expect(
      Object.values(
        result.fingerprintCoverage.rowsExcludedFromFingerprint,
      ).every((count) => count === 0),
    ).toBe(true);
    expect(result.referenceObservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "repoint",
          field: "importTasks.inboxTradeId",
          referencedRole: "deleted",
        }),
        expect.objectContaining({
          action: "remove_duplicate",
          field: "marketDataFetchJobs.sourceTradeIds",
          referencedRole: "deleted",
        }),
      ]),
    );
  });

  it("archives, merges metadata, repoints references, deletes once, and independently post-checks", async () => {
    const { rowsByKind, spec, t } = await seedRepair({ references: true });
    const dryRun = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    const result = await t.action(internal.ibkrDuplicateFillRepair.execute, {
      expectedAuditJson: dryRun.auditJson,
      expectedAuditToken: dryRun.auditToken,
      repairSpec: spec,
    });

    expect(result).toMatchObject({
      auditToken: dryRun.auditToken,
      deletedInboxTrades: 29,
      deletedTrades: 2,
      patchedReferenceDocuments: 4,
      patchedSurvivors: 31,
    });
    const acceptedInbox = rowsByKind["accepted-inbox-0"]!;
    const acceptedAccepted = rowsByKind["accepted-accepted-0"]!;
    const transition = rowsByKind["transition-0"]!;
    const state = await t.run(async (ctx) => ({
      acceptedInboxDeleted: await ctx.db.get(acceptedInbox.deleted.id),
      acceptedInboxSurvivor: await ctx.db.get(acceptedInbox.survivor.id),
      acceptedAcceptedDeleted: await ctx.db.get(acceptedAccepted.deleted.id),
      acceptedAcceptedSurvivor: await ctx.db.get(acceptedAccepted.survivor.id),
      checkIns: await ctx.db.query("checkIns").collect(),
      importTasks: await ctx.db.query("importTasks").collect(),
      jobs: await ctx.db.query("marketDataFetchJobs").collect(),
      marks: await ctx.db.query("portfolioPriceMarks").collect(),
      transitionDeleted: await ctx.db.get(transition.deleted.id),
      transitionSurvivor: await ctx.db.get(transition.survivor.id),
    }));
    expect(state.acceptedInboxDeleted).toBeNull();
    expect(state.acceptedInboxSurvivor).toMatchObject({
      externalId: "6000000000",
      fees: -1,
      orderType: "LMT",
      taxes: 0,
    });
    expect(state.acceptedAcceptedDeleted).toBeNull();
    expect(state.acceptedAcceptedSurvivor?.portfolioId).toBeDefined();
    expect(state.transitionDeleted).toBeNull();
    expect(
      state.transitionSurvivor &&
        "validationWarnings" in state.transitionSurvivor
        ? state.transitionSurvivor.validationWarnings
        : undefined,
    ).toEqual(["legacy warning"]);
    expect(state.checkIns[0]?.surfacedTradeIds).toEqual([
      String(transition.survivor.id),
    ]);
    expect(state.importTasks[0]?.inboxTradeId).toBe(transition.survivor.id);
    expect(state.jobs[0]?.sourceTradeIds).toEqual([
      acceptedAccepted.survivor.id,
    ]);
    expect(state.marks[0]?.sourceTradeId).toBe(acceptedAccepted.survivor.id);

    await expect(
      t.action(internal.ibkrDuplicateFillRepair.postCheck, {
        auditToken: dryRun.auditToken,
        ownerId,
      }),
    ).resolves.toMatchObject({
      archiveDeletedDocumentSetMatchesApprovedAudit: true,
      archiveContentHashMatches: true,
      archiveReadable: true,
      deletedRowsExpected: 31,
      deletedRowsRemaining: 0,
      duplicateGroupsRemaining: 0,
      inboundReferencesToDeletedRowsRemaining: 0,
      survivorsExpected: 31,
      survivorsMatchingArchivedAfterState: 31,
    });
    await expect(
      t.action(internal.ibkrDuplicateFillRepair.execute, {
        expectedAuditJson: dryRun.auditJson,
        expectedAuditToken: dryRun.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow("this audit token has already been committed");
  });

  it("names the exact bound field that drifted after approval", async () => {
    const { rowsByKind, spec, t } = await seedRepair();
    const dryRun = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    const target = rowsByKind["accepted-inbox-0"]!.survivor;
    await t.run((ctx) => ctx.db.patch(target.id as Id<"trades">, { fees: 99 }));

    await expect(
      t.action(internal.ibkrDuplicateFillRepair.execute, {
        expectedAuditJson: dryRun.auditJson,
        expectedAuditToken: dryRun.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow(
      /audit\.pairs\[\d+\]\.survivor\.fees changed from 0 to 99/,
    );
  });

  it("refuses an approved pair whose timestamp drifts to midnight Eastern", async () => {
    const { rowsByKind, spec, t } = await seedRepair();
    const dryRun = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    const target = rowsByKind["accepted-inbox-0"]!.survivor;
    await t.run((ctx) =>
      ctx.db.patch(target.id as Id<"trades">, {
        date: parseIbkrEasternTimestamp("20260813")!,
      }),
    );

    await expect(
      t.action(internal.ibkrDuplicateFillRepair.execute, {
        expectedAuditJson: dryRun.auditJson,
        expectedAuditToken: dryRun.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow("is midnight Eastern");
  });

  it("refuses a survivor that violates the approved state-then-order policy", async () => {
    const { rowsByKind, spec, t } = await seedRepair();
    const target = rowsByKind["accepted-inbox-0"]!;
    const pair = spec.pairs.find(
      (candidate) => String(candidate.first.id) === String(target.survivor.id),
    )!;
    pair.survivor = target.deleted;
    await expect(
      t.query(internal.ibkrDuplicateFillRepair.inspect, spec),
    ).rejects.toThrow("survivor policy requires");
  });

  it("refuses an inbound reference that cannot point at the approved survivor table", async () => {
    const { rowsByKind, spec, t } = await seedRepair();
    const target = rowsByKind["accepted-inbox-0"]!;
    await t.run((ctx) =>
      ctx.db.insert("importTasks", {
        inboxTradeId: target.deleted.id as Id<"inboxTrades">,
        mode: "create",
        ownerId,
        pastedText: "fixture",
        status: "done",
      }),
    );

    const dryRun = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    expect(dryRun.safeToExecute).toBe(false);
    expect(dryRun.refusalReasons).toEqual([
      expect.stringContaining("importTasks.inboxTradeId"),
    ]);
  });

  it("names a newly added inbound reference after approval", async () => {
    const { rowsByKind, spec, t } = await seedRepair();
    const dryRun = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    const target = rowsByKind["transition-0"]!;
    await t.run((ctx) =>
      ctx.db.insert("checkIns", {
        date: "2026-08-13",
        kind: "mirror",
        ownerId,
        sentAt: 1,
        surfacedTradeIds: [String(target.deleted.id)],
        window: "afternoon",
      }),
    );

    await expect(
      t.action(internal.ibkrDuplicateFillRepair.execute, {
        expectedAuditJson: dryRun.auditJson,
        expectedAuditToken: dryRun.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow(/audit\.referenceObservations/);
  });

  it("refuses a direct commit when the stored archive blob is substituted", async () => {
    const { spec, t } = await seedRepair();
    const payload = await t.query(
      internal.ibkrDuplicateFillRepair.getArchivePayload,
      spec,
    );
    const wrongStorageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["substituted archive"])),
    );

    await expect(
      t.mutation(internal.ibkrDuplicateFillRepair.commit, {
        archiveContentHash: payload.contentHash,
        archiveStorageId: wrongStorageId,
        expectedArchiveJson: payload.archiveJson,
        expectedAuditJson: payload.auditJson,
        expectedAuditToken: payload.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow(
      "stored archive blob content does not match the approved archive content hash",
    );
    const target = spec.pairs[0]!.second;
    expect(await t.run((ctx) => ctx.db.get(target.id))).not.toBeNull();
  });

  it("refuses when an approved document disappears before execution", async () => {
    const { rowsByKind, spec, t } = await seedRepair();
    const dryRun = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    const target = rowsByKind["transition-0"]!.deleted;
    await t.run((ctx) => ctx.db.delete(target.id as Id<"inboxTrades">));

    await expect(
      t.action(internal.ibkrDuplicateFillRepair.execute, {
        expectedAuditJson: dryRun.auditJson,
        expectedAuditToken: dryRun.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow(/pair \d+ (first|second).* is missing/);
  });

  it("refuses a repair spec whose pair-count guard changes", async () => {
    const { spec, t } = await seedRepair();
    await expect(
      t.query(internal.ibkrDuplicateFillRepair.inspect, {
        ...spec,
        pairs: spec.pairs.slice(0, -1),
      }),
    ).rejects.toThrow("supplied pair count changed from 31 to 30");
  });

  it("refuses when one document appears in two supplied pairs", async () => {
    const { spec, t } = await seedRepair();
    const repeated = spec.pairs[0]!.first;
    spec.pairs[1] = {
      ...spec.pairs[1]!,
      first: repeated,
      survivor: repeated,
    };
    await expect(
      t.query(internal.ibkrDuplicateFillRepair.inspect, spec),
    ).rejects.toThrow("appears in more than one supplied pair");
  });

  it.each(["portfolioId", "tradePlanId"] as const)(
    "refuses conflicting %s metadata instead of dropping either value",
    async (field) => {
      const { rowsByKind, spec, t } = await seedRepair();
      const target = rowsByKind["accepted-accepted-0"]!;
      await t.run(async (ctx) => {
        if (field === "portfolioId") {
          const conflictingId = await ctx.db.insert("portfolios", {
            name: "Conflicting",
            ownerId,
          });
          await ctx.db.patch(target.survivor.id as Id<"trades">, {
            portfolioId: conflictingId,
          });
        } else {
          const firstId = await ctx.db.insert("tradePlans", {
            instrumentSymbol: "A0",
            name: "First",
            ownerId,
            status: "active",
          });
          const conflictingId = await ctx.db.insert("tradePlans", {
            instrumentSymbol: "A0",
            name: "Second",
            ownerId,
            status: "active",
          });
          await ctx.db.patch(target.deleted.id as Id<"trades">, {
            tradePlanId: firstId,
          });
          await ctx.db.patch(target.survivor.id as Id<"trades">, {
            tradePlanId: conflictingId,
          });
        }
      });
      await expect(
        t.query(internal.ibkrDuplicateFillRepair.inspect, spec),
      ).rejects.toThrow(`${field} conflicts between survivor`);
    },
  );

  it("reports both a supplied pair missing from discovery and its oversized fingerprint group", async () => {
    const { rowsByKind, spec, t } = await seedRepair();
    const target = rowsByKind["accepted-inbox-0"]!;
    await t.run(async (ctx) => {
      const existing = await ctx.db.get(target.deleted.id as Id<"inboxTrades">);
      await ctx.db.insert("inboxTrades", {
        assetType: existing!.assetType!,
        brokerageAccountId: existing!.brokerageAccountId,
        date: existing!.date,
        direction: existing!.direction,
        externalId: "6000000099",
        fees: existing!.fees,
        orderType: existing!.orderType,
        ownerId,
        price: existing!.price,
        quantity: existing!.quantity,
        side: existing!.side,
        source: "ibkr",
        status: "pending_review",
        taxes: existing!.taxes,
        ticker: existing!.ticker,
        validationErrors: [],
        validationWarnings: [],
      });
    });
    const result = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    expect(result.safeToExecute).toBe(false);
    expect(result.refusalReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "logical fingerprint scan found group(s) larger than two",
        ),
        expect.stringContaining(
          "supplied duplicate pair(s) no longer discovered",
        ),
      ]),
    );
  });

  it("refuses an unapproved discovered pair outside the exact supplied set", async () => {
    const { spec, t } = await seedRepairWithUnapprovedPair();
    const result = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    expect(result.safeToExecute).toBe(false);
    expect(result.refusalReasons).toEqual([
      expect.stringContaining("unapproved duplicate pair(s) discovered"),
    ]);
  });

  it("rejects an unsafe dry-run's own audit token through execute", async () => {
    const { rowsByKind, spec, t } = await seedRepairWithUnapprovedPair();
    const dryRun = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    expect(dryRun.safeToExecute).toBe(false);
    expect(dryRun.refusalReasons).toEqual([
      expect.stringContaining("unapproved duplicate pair(s) discovered"),
    ]);

    await expect(
      t.action(internal.ibkrDuplicateFillRepair.execute, {
        expectedAuditJson: dryRun.auditJson,
        expectedAuditToken: dryRun.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow("unapproved duplicate pair(s) discovered");
    expect(
      await t.run((ctx) =>
        ctx.db.get(
          rowsByKind["accepted-inbox-0"]!.deleted.id as Id<"inboxTrades">,
        ),
      ),
    ).not.toBeNull();
  });

  it("rejects an unsafe dry-run's own audit token through direct commit", async () => {
    const { rowsByKind, spec, t } = await seedRepairWithUnapprovedPair();
    const payload = await t.query(
      internal.ibkrDuplicateFillRepair.getArchivePayload,
      spec,
    );
    expect(payload.safeToExecute).toBe(false);
    expect(payload.refusalReasons).toEqual([
      expect.stringContaining("unapproved duplicate pair(s) discovered"),
    ]);
    const archiveStorageId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob([payload.archiveJson], { type: "application/json" }),
      ),
    );

    await expect(
      t.mutation(internal.ibkrDuplicateFillRepair.commit, {
        archiveContentHash: payload.contentHash,
        archiveStorageId,
        expectedArchiveJson: payload.archiveJson,
        expectedAuditJson: payload.auditJson,
        expectedAuditToken: payload.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow("unapproved duplicate pair(s) discovered");
    expect(
      await t.run((ctx) =>
        ctx.db.get(
          rowsByKind["accepted-inbox-0"]!.deleted.id as Id<"inboxTrades">,
        ),
      ),
    ).not.toBeNull();
  });

  it("refuses drift in the approved pair-kind denominator", async () => {
    const { rowsByKind, spec, t } = await seedRepair();
    const target = rowsByKind["accepted-inbox-0"]!;
    const replacementId = await t.run(async (ctx) => {
      const existing = await ctx.db.get(target.deleted.id as Id<"inboxTrades">);
      await ctx.db.delete(target.deleted.id as Id<"inboxTrades">);
      return await ctx.db.insert("trades", {
        assetType: existing!.assetType!,
        brokerageAccountId: existing!.brokerageAccountId,
        date: existing!.date!,
        direction: existing!.direction!,
        externalId: existing!.externalId,
        fees: existing!.fees,
        orderType: existing!.orderType,
        ownerId,
        price: existing!.price!,
        quantity: existing!.quantity!,
        side: existing!.side!,
        source: "ibkr",
        taxes: existing!.taxes,
        ticker: existing!.ticker!,
      });
    });
    const pair = spec.pairs.find(
      (candidate) => String(candidate.second.id) === String(target.deleted.id),
    )!;
    const replacement = { id: replacementId, table: "trades" as const };
    pair.second = replacement;
    pair.survivor = replacement;

    const result = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    expect(result.safeToExecute).toBe(false);
    expect(result.refusalReasons).toEqual(
      expect.arrayContaining([
        "accepted/accepted pair count changed from 2 to 3",
        "accepted/inbox pair count changed from 25 to 24",
      ]),
    );
  });

  it("prints the exact fingerprint denominator and every exclusion reason", async () => {
    const { spec, t } = await seedRepair();
    await t.run(async (ctx) => {
      const base = {
        assetType: "stock" as const,
        brokerageAccountId: "U1",
        date: baseDate + 100_000,
        direction: "long" as const,
        ownerId,
        price: 10,
        quantity: 1,
        side: "buy" as const,
        source: "ibkr" as const,
        ticker: "COVERAGE",
      };
      await ctx.db.insert("trades", {
        ...base,
        externalId: "coverage-midnight",
        date: parseIbkrEasternTimestamp("20260813")!,
      });
      await ctx.db.insert("trades", {
        ...base,
        assetType: "crypto",
        externalId: "coverage-crypto",
      });
      await ctx.db.insert("trades", {
        ...base,
        brokerageAccountId: undefined,
        externalId: "coverage-no-account",
      });
      await ctx.db.insert("trades", {
        ...base,
        externalId: "coverage-manual",
        source: "manual",
      });
    });
    const result = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    expect(result.fingerprintCoverage).toMatchObject({
      eligibleIbkrRows: 65,
      fingerprintableRows: 62,
      rowsEnumerated: { inboxTrades: 33, trades: 33 },
      rowsExcludedFromFingerprint: {
        midnight_eastern: 1,
        missing_brokerage_account: 1,
        non_ibkr_source: 0,
        non_stock_asset: 1,
      },
    });
  });

  it("binds the archive blob's deleted set to the approved audit record", async () => {
    const { spec, t } = await seedRepair();
    const dryRun = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    await t.action(internal.ibkrDuplicateFillRepair.execute, {
      expectedAuditJson: dryRun.auditJson,
      expectedAuditToken: dryRun.auditToken,
      repairSpec: spec,
    });
    const substitutedStorageId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob([JSON.stringify({ archiveFormat: "substituted", pairs: [] })]),
      ),
    );
    await t.run(async (ctx) => {
      const archive = await ctx.db
        .query("ibkrDuplicateFillRepairArchives")
        .withIndex("by_owner_auditToken", (q) =>
          q.eq("ownerId", ownerId).eq("auditToken", dryRun.auditToken),
        )
        .unique();
      await ctx.db.patch(archive!._id, { storageId: substitutedStorageId });
    });

    await expect(
      t.action(internal.ibkrDuplicateFillRepair.postCheck, {
        auditToken: dryRun.auditToken,
        ownerId,
      }),
    ).resolves.toMatchObject({
      archiveContentHashMatches: false,
      archiveDeletedDocumentSetMatchesApprovedAudit: false,
      archiveReadable: true,
    });
  });

  it("reports an unreadable archive without claiming post-check success", async () => {
    const { spec, t } = await seedRepair();
    const dryRun = await t.query(
      internal.ibkrDuplicateFillRepair.inspect,
      spec,
    );
    const result = await t.action(internal.ibkrDuplicateFillRepair.execute, {
      expectedAuditJson: dryRun.auditJson,
      expectedAuditToken: dryRun.auditToken,
      repairSpec: spec,
    });
    await t.action((ctx) => ctx.storage.delete(result.archiveStorageId));

    await expect(
      t.action(internal.ibkrDuplicateFillRepair.postCheck, {
        auditToken: dryRun.auditToken,
        ownerId,
      }),
    ).resolves.toMatchObject({
      archiveDeletedDocumentSetMatchesApprovedAudit: false,
      archiveContentHashMatches: false,
      archiveReadable: false,
    });
  });
});
