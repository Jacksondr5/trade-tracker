// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseIbkrEasternTimestamp } from "../shared/brokerage/ibkr-flex/time";
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

describe("IBKR duplicate-fill repair", () => {
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
      archiveContainsEveryDeletedDocument: true,
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
      archiveContainsEveryDeletedDocument: false,
      archiveContentHashMatches: false,
      archiveReadable: false,
    });
  });
});
