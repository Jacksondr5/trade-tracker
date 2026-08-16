// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

const ownerId = "owner-a";
const sourceUrl =
  "https://bravosresearch.com/news-feed/initiating-long-on-deere-company-de-potential-breakout/";
const preservedNoteContent = "Charts supporting rationale, entry, and target";

type RepairSpec = {
  generatedNoteId: Id<"notes">;
  generatedNotePlanId: Id<"tradePlans">;
  importTaskId: Id<"importTasks">;
  preservedNoteId: Id<"notes">;
  preservedNotePlanId: Id<"tradePlans">;
};

describe("audited Bravos dangling-reference repair", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  async function insertAuditedOrphans(): Promise<RepairSpec> {
    return await t.run(async (ctx) => {
      const generatedPlanId = await ctx.db.insert("tradePlans", {
        instrumentSymbol: "DE",
        name: "Deleted Bravos DE plan",
        ownerId,
        sourceUrl,
        status: "active",
      });
      const preservedPlanId = await ctx.db.insert("tradePlans", {
        instrumentSymbol: "DE",
        name: "Deleted chart note plan",
        ownerId,
        status: "active",
      });
      const generatedNoteId = await ctx.db.insert("notes", {
        content: `Imported from service post: ${sourceUrl}`,
        noteDate: 1,
        ownerId,
        tradePlanId: generatedPlanId,
      });
      const preservedNoteId = await ctx.db.insert("notes", {
        content: preservedNoteContent,
        noteDate: 2,
        ownerId,
        tradePlanId: preservedPlanId,
      });
      const importTaskId = await ctx.db.insert("importTasks", {
        createdTradePlanId: generatedPlanId,
        mode: "create",
        ownerId,
        pastedText: "Imported Deere recommendation",
        sourceUrl,
        status: "done",
      });
      await ctx.db.delete(generatedPlanId);
      await ctx.db.delete(preservedPlanId);
      return {
        generatedNoteId,
        generatedNotePlanId: generatedPlanId,
        importTaskId,
        preservedNoteId,
        preservedNotePlanId: preservedPlanId,
      };
    });
  }

  async function insertReviewItemReferencing(
    appliedNoteId: Id<"notes">,
  ): Promise<Id<"bravosReviewItems">> {
    return await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("bravosReviewItems", {
        appliedNoteId,
        canonicalSourceIdentity: "https://bravosresearch.com/test",
        classification: "follow_up",
        fetchSource: "direct_post_fetch",
        fetchedAt: now,
        imageUrls: [],
        lastFetchedAt: now,
        ownerId,
        proposedAction: {
          instrumentSymbol: "DE",
          kind: "create_trade_plan",
          name: "Generated note reference",
        },
        rawText: "Generated note reference",
        reviewState: "approved",
        sourceUrl: "https://bravosresearch.com/test",
      });
    });
  }

  async function getStoredArchivePayload(spec: RepairSpec) {
    const payload = await t.query(
      internal.bravosOrphanCleanup.getArchivePayload,
      spec,
    );
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(
        new Blob([payload.archiveJson], { type: "application/json" }),
      ),
    );
    return { payload, storageId };
  }

  it("reports exact per-document effects in dry-run mode without changing records", async () => {
    const spec = await insertAuditedOrphans();

    const result = await t.query(internal.bravosOrphanCleanup.inspect, spec);

    expect(result.safeToExecute).toBe(true);
    expect(result.archivalReferences).toEqual([]);
    expect(result.generatedNoteReferences).toEqual([]);
    expect(result.scannedReferenceFields).toEqual(
      expect.arrayContaining([
        "notes.tradePlanId",
        "notes.campaignId",
        "importTasks.tradePlanId",
        "importTasks.createdTradePlanId",
        "trades.tradePlanId",
        "inboxTrades.tradePlanId",
        "watchlist.tradePlanId",
        "watchlist.campaignId",
        "tradePlans.campaignId",
        "retrospectives.parentId",
        "bravosReviewItems.appliedTradePlanId",
        "bravosReviewItems.suggestedTradePlanId",
        "bravosReviewItems.proposedAction.targetTradePlanId",
        "bravosReviewItems.approvedAction.targetTradePlanId",
        "bravosReviewItems.appliedNoteId",
        "checkIns.noteIds[]",
      ]),
    );
    expect(result.scannedReferenceFields).toHaveLength(16);
    expect(result.expectedEffects).toEqual({
      clearedCreatedImportTaskPlanIds: 1,
      deletedGeneratedNotes: 1,
      detachedNotes: 1,
    });
    expect(result.danglingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentPreview: `Imported from service post: ${sourceUrl}`,
          documentId: String(spec.generatedNoteId),
          field: "tradePlanId",
          targetId: String(spec.generatedNotePlanId),
        }),
        expect.objectContaining({
          documentId: String(spec.importTaskId),
          field: "createdTradePlanId",
          targetId: String(spec.generatedNotePlanId),
        }),
        expect.objectContaining({
          contentPreview: preservedNoteContent,
          documentId: String(spec.preservedNoteId),
          field: "tradePlanId",
          targetId: String(spec.preservedNotePlanId),
        }),
      ]),
    );
    expect(
      await t.run((ctx) => ctx.db.get(spec.generatedNoteId)),
    ).not.toBeNull();
    expect(
      await t.run((ctx) => ctx.db.get(spec.preservedNoteId)),
    ).toMatchObject({
      tradePlanId: spec.preservedNotePlanId,
    });
    expect(await t.run((ctx) => ctx.db.get(spec.importTaskId))).toMatchObject({
      createdTradePlanId: spec.generatedNotePlanId,
    });
  });

  it("archives then atomically applies the three approved treatments and proves zero remaining references", async () => {
    const spec = await insertAuditedOrphans();
    const dryRun = await t.query(internal.bravosOrphanCleanup.inspect, spec);

    const result = await t.action(internal.bravosOrphanCleanup.execute, {
      expectedAuditToken: dryRun.auditToken,
      repairSpec: spec,
    });

    expect(result.effects).toEqual({
      clearedCreatedImportTaskPlanIds: 1,
      deletedGeneratedNotes: 1,
      detachedNotes: 1,
    });
    expect(await t.run((ctx) => ctx.db.get(spec.generatedNoteId))).toBeNull();
    expect(
      await t.run((ctx) => ctx.db.get(spec.importTaskId)),
    ).not.toHaveProperty("createdTradePlanId");
    expect(
      await t.run((ctx) => ctx.db.get(spec.preservedNoteId)),
    ).toMatchObject({
      content: preservedNoteContent,
      ownerId,
    });
    expect(
      await t.run((ctx) => ctx.db.get(spec.preservedNoteId)),
    ).not.toHaveProperty("tradePlanId");

    await expect(
      t.action(internal.bravosOrphanCleanup.postCheck, {
        auditToken: dryRun.auditToken,
      }),
    ).resolves.toMatchObject({
      archiveContainsDeletedGeneratedNote: true,
      archiveContainsDetachedNote: true,
      archiveContentHashMatches: true,
      archiveReadable: true,
      archivalReferencesPreserved: 2,
      auditToken: dryRun.auditToken,
      clearedImportTaskReferences: 1,
      danglingReferencesRemaining: 0,
      deletedGeneratedNotesRemaining: 0,
      detachedNotesVerified: 1,
      generatedNoteReferencesRemaining: 0,
    });

    const archiveText = await t.action(async (ctx) => {
      const blob = await ctx.storage.get(result.archiveStorageId);
      return blob ? await blob.text() : null;
    });
    const archive = JSON.parse(archiveText ?? "{}") as {
      documents?: { generatedNote?: { _id?: string; content?: string } };
    };
    expect(archive.documents?.generatedNote).toMatchObject({
      _id: String(spec.generatedNoteId),
      content: `Imported from service post: ${sourceUrl}`,
    });
  });

  it("refuses a stale audit token after one approved record is externally repaired", async () => {
    const spec = await insertAuditedOrphans();
    const dryRun = await t.query(internal.bravosOrphanCleanup.inspect, spec);
    await t.run((ctx) =>
      ctx.db.patch(spec.importTaskId, { createdTradePlanId: undefined }),
    );

    await expect(
      t.action(internal.bravosOrphanCleanup.execute, {
        expectedAuditToken: dryRun.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow("live data no longer matches the approved audit token");
    expect(
      await t.run((ctx) => ctx.db.get(spec.generatedNoteId)),
    ).not.toBeNull();
  });

  it.each([
    ["marker has appended prose", async (spec: RepairSpec) => {
      await t.run((ctx) =>
        ctx.db.patch(spec.generatedNoteId, {
          content: `Imported from service post: ${sourceUrl}\nJackson's commentary`,
        }),
      );
    }],
    ["owner identity changes", async (spec: RepairSpec) => {
      await t.run((ctx) =>
        ctx.db.patch(spec.preservedNoteId, { ownerId: "different-owner" }),
      );
    }],
    ["import task mode changes", async (spec: RepairSpec) => {
      await t.run((ctx) =>
        ctx.db.patch(spec.importTaskId, { mode: "follow-up" }),
      );
    }],
    ["import task status changes", async (spec: RepairSpec) => {
      await t.run((ctx) => ctx.db.patch(spec.importTaskId, { status: "error" }));
    }],
    ["import task source changes", async (spec: RepairSpec) => {
      await t.run((ctx) =>
        ctx.db.patch(spec.importTaskId, {
          sourceUrl: "https://bravosresearch.com/news-feed/another-post/",
        }),
      );
    }],
    ["preserved note content changes", async (spec: RepairSpec) => {
      await t.run((ctx) =>
        ctx.db.patch(spec.preservedNoteId, { content: "Different note" }),
      );
    }],
    ["import task gains a live trade-plan pointer", async (spec: RepairSpec) => {
      await t.run(async (ctx) => {
        const livePlanId = await ctx.db.insert("tradePlans", {
          instrumentSymbol: "DE",
          name: "Unexpected live plan",
          ownerId,
          status: "active",
        });
        await ctx.db.patch(spec.importTaskId, { tradePlanId: livePlanId });
      });
    }],
  ])("fails closed when %s", async (_name, mutate) => {
    const spec = await insertAuditedOrphans();
    await mutate(spec);
    const dryRun = await t.query(internal.bravosOrphanCleanup.inspect, spec);

    expect(dryRun.safeToExecute).toBe(false);
    await expect(
      t.action(internal.bravosOrphanCleanup.execute, {
        expectedAuditToken: dryRun.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow("no longer match the approved three-document repair");
    expect(
      await t.run((ctx) => ctx.db.get(spec.generatedNoteId)),
    ).not.toBeNull();
  });

  it("refuses a substituted dangling reference even when exactly three remain", async () => {
    const spec = await insertAuditedOrphans();
    await t.run(async (ctx) => {
      const replacementPlanId = await ctx.db.insert("tradePlans", {
        instrumentSymbol: "DE",
        name: "Substituted missing plan",
        ownerId,
        status: "active",
      });
      await ctx.db.patch(spec.importTaskId, {
        createdTradePlanId: replacementPlanId,
      });
      await ctx.db.delete(replacementPlanId);
    });

    const dryRun = await t.query(internal.bravosOrphanCleanup.inspect, spec);

    expect(dryRun.danglingReferences).toHaveLength(3);
    expect(dryRun.safeToExecute).toBe(false);
  });

  it.each([
    ["a Bravos review item", async (spec: RepairSpec) => {
      await insertReviewItemReferencing(spec.generatedNoteId);
    }],
    ["a check-in", async (spec: RepairSpec) => {
      await t.run((ctx) =>
        ctx.db.insert("checkIns", {
          date: "2026-08-16",
          kind: "mirror",
          noteIds: [spec.generatedNoteId],
          ownerId,
          sentAt: 1,
          window: "afternoon",
        }),
      );
    }],
  ])("refuses deletion when %s still references the generated note", async (_name, insertReference) => {
    const spec = await insertAuditedOrphans();
    await insertReference(spec);

    const dryRun = await t.query(internal.bravosOrphanCleanup.inspect, spec);

    expect(dryRun.safeToExecute).toBe(false);
    expect(dryRun.generatedNoteReferences).toEqual([
      expect.objectContaining({
        field: _name === "a Bravos review item" ? "appliedNoteId" : "noteIds",
      }),
    ]);
    await expect(
      t.action(internal.bravosOrphanCleanup.execute, {
        expectedAuditToken: dryRun.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow("no longer match the approved three-document repair");
    expect(
      await t.run((ctx) => ctx.db.get(spec.generatedNoteId)),
    ).not.toBeNull();
  });

  it("rejects direct commit calls with a stale token, hash, or archive blob", async () => {
    const spec = await insertAuditedOrphans();
    const { payload, storageId } = await getStoredArchivePayload(spec);
    const wrongStorageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["not the approved archive"])),
    );
    const commitArgs = {
      archiveContentHash: payload.contentHash,
      archiveStorageId: storageId,
      expectedAuditToken: payload.auditToken,
      repairSpec: spec,
    };

    await expect(
      t.mutation(internal.bravosOrphanCleanup.commit, {
        ...commitArgs,
        expectedAuditToken: "stale-token",
      }),
    ).rejects.toThrow("live data no longer matches the approved audit token");
    await expect(
      t.mutation(internal.bravosOrphanCleanup.commit, {
        ...commitArgs,
        archiveContentHash: "wrong-hash",
      }),
    ).rejects.toThrow("stored archive does not match the approved audit content");
    await expect(
      t.mutation(internal.bravosOrphanCleanup.commit, {
        ...commitArgs,
        archiveStorageId: wrongStorageId,
      }),
    ).rejects.toThrow("stored archive blob is missing or does not match");
    expect(
      await t.run((ctx) => ctx.db.get(spec.generatedNoteId)),
    ).not.toBeNull();
  });

  it("rejects direct commit when its exact three-document shape no longer holds", async () => {
    const spec = await insertAuditedOrphans();
    await t.run((ctx) =>
      ctx.db.patch(spec.generatedNoteId, {
        content: `Imported from service post: ${sourceUrl}\nJackson's commentary`,
      }),
    );
    const { payload, storageId } = await getStoredArchivePayload(spec);

    await expect(
      t.mutation(internal.bravosOrphanCleanup.commit, {
        archiveContentHash: payload.contentHash,
        archiveStorageId: storageId,
        expectedAuditToken: payload.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow("no longer match the approved three-document repair");
    expect(
      await t.run((ctx) => ctx.db.get(spec.generatedNoteId)),
    ).not.toBeNull();
  });

  it("reports an unreadable archive rather than claiming post-check success", async () => {
    const spec = await insertAuditedOrphans();
    const dryRun = await t.query(internal.bravosOrphanCleanup.inspect, spec);
    const result = await t.action(internal.bravosOrphanCleanup.execute, {
      expectedAuditToken: dryRun.auditToken,
      repairSpec: spec,
    });
    await t.action((ctx) => ctx.storage.delete(result.archiveStorageId));

    await expect(
      t.action(internal.bravosOrphanCleanup.postCheck, {
        auditToken: dryRun.auditToken,
      }),
    ).resolves.toMatchObject({
      archiveContentHashMatches: false,
      archiveReadable: false,
    });
  });

  it("fails closed when any additional operational dangling reference is present", async () => {
    const spec = await insertAuditedOrphans();
    await t.run(async (ctx) => {
      const missingPlanId = await ctx.db.insert("tradePlans", {
        instrumentSymbol: "MU",
        name: "Another deleted plan",
        ownerId,
        status: "active",
      });
      await ctx.db.insert("notes", {
        content: "Unapproved dangling note",
        noteDate: 3,
        ownerId,
        tradePlanId: missingPlanId,
      });
      await ctx.db.delete(missingPlanId);
    });

    const dryRun = await t.query(internal.bravosOrphanCleanup.inspect, spec);

    expect(dryRun.safeToExecute).toBe(false);
    expect(dryRun.danglingReferences).toHaveLength(4);
    await expect(
      t.action(internal.bravosOrphanCleanup.execute, {
        expectedAuditToken: dryRun.auditToken,
        repairSpec: spec,
      }),
    ).rejects.toThrow("no longer match the approved three-document repair");
    expect(
      await t.run((ctx) => ctx.db.get(spec.generatedNoteId)),
    ).not.toBeNull();
  });

  it("reports every direct and nested campaign or plan reference shape", async () => {
    const spec = await insertAuditedOrphans();
    await t.run(async (ctx) => {
      const missingCampaignId = await ctx.db.insert("campaigns", {
        name: "Deleted campaign",
        ownerId,
        status: "active",
        thesis: "No longer present",
      });
      await ctx.db.insert("tradePlans", {
        campaignId: missingCampaignId,
        instrumentSymbol: "MU",
        name: "Plan with deleted campaign",
        ownerId,
        status: "active",
      });
      const missingPlanId = await ctx.db.insert("tradePlans", {
        instrumentSymbol: "MU",
        name: "Deleted plan",
        ownerId,
        status: "active",
      });
      await ctx.db.insert("notes", {
        campaignId: missingCampaignId,
        content: "Campaign reference",
        noteDate: 10,
        ownerId,
      });
      await ctx.db.insert("notes", {
        content: "Plan reference",
        noteDate: 11,
        ownerId,
        tradePlanId: missingPlanId,
      });
      await ctx.db.insert("watchlist", {
        campaignId: missingCampaignId,
        itemType: "campaign",
        ownerId,
        watchedAt: 12,
      });
      await ctx.db.insert("watchlist", {
        itemType: "tradePlan",
        ownerId,
        tradePlanId: missingPlanId,
        watchedAt: 13,
      });
      await ctx.db.insert("importTasks", {
        mode: "follow-up",
        ownerId,
        pastedText: "Linked plan reference",
        status: "done",
        tradePlanId: missingPlanId,
      });
      await ctx.db.insert("importTasks", {
        createdTradePlanId: missingPlanId,
        mode: "create",
        ownerId,
        pastedText: "Created plan reference",
        status: "done",
      });
      await ctx.db.insert("trades", {
        assetType: "stock",
        date: 14,
        direction: "long",
        ownerId,
        price: 1,
        quantity: 1,
        side: "buy",
        ticker: "MU",
        tradePlanId: missingPlanId,
      });
      await ctx.db.insert("inboxTrades", {
        ownerId,
        source: "manual",
        status: "pending_review",
        ticker: "MU",
        tradePlanId: missingPlanId,
        validationErrors: [],
        validationWarnings: [],
      });
      await ctx.db.insert("retrospectives", {
        content: "Campaign retrospective",
        ownerId,
        parentId: missingCampaignId,
        parentKind: "campaign",
        updatedAt: 15,
      });
      await ctx.db.insert("retrospectives", {
        content: "Plan retrospective",
        ownerId,
        parentId: missingPlanId,
        parentKind: "tradePlan",
        updatedAt: 16,
      });
      const now = Date.now();
      await ctx.db.insert("bravosReviewItems", {
        appliedTradePlanId: missingPlanId,
        approvedAction: {
          content: "Approved action",
          kind: "note_only",
          targetTradePlanId: missingPlanId,
        },
        canonicalSourceIdentity: "https://bravosresearch.com/test",
        classification: "follow_up",
        fetchSource: "direct_post_fetch",
        fetchedAt: now,
        imageUrls: [],
        lastFetchedAt: now,
        ownerId,
        proposedAction: {
          fieldUpdates: [],
          kind: "apply_follow_up",
          targetTradePlanId: missingPlanId,
        },
        rawText: "Missing plan references",
        reviewState: "approved",
        sourceUrl: "https://bravosresearch.com/test",
        suggestedTradePlanId: missingPlanId,
      });
      await ctx.db.delete(missingCampaignId);
      await ctx.db.delete(missingPlanId);
    });

    const result = await t.query(internal.bravosOrphanCleanup.inspect, spec);

    expect(result.safeToExecute).toBe(false);
    expect(result.danglingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "tradePlans", field: "campaignId" }),
        expect.objectContaining({ table: "notes", field: "campaignId" }),
        expect.objectContaining({ table: "notes", field: "tradePlanId" }),
        expect.objectContaining({ table: "watchlist", field: "campaignId" }),
        expect.objectContaining({ table: "watchlist", field: "tradePlanId" }),
        expect.objectContaining({ table: "importTasks", field: "tradePlanId" }),
        expect.objectContaining({
          table: "importTasks",
          field: "createdTradePlanId",
        }),
        expect.objectContaining({ table: "trades", field: "tradePlanId" }),
        expect.objectContaining({ table: "inboxTrades", field: "tradePlanId" }),
        expect.objectContaining({ table: "retrospectives", field: "parentId" }),
        expect.objectContaining({
          table: "bravosReviewItems",
          field: "appliedTradePlanId",
        }),
        expect.objectContaining({
          table: "bravosReviewItems",
          field: "suggestedTradePlanId",
        }),
        expect.objectContaining({
          table: "bravosReviewItems",
          field: "proposedAction.targetTradePlanId",
        }),
        expect.objectContaining({
          table: "bravosReviewItems",
          field: "approvedAction.targetTradePlanId",
        }),
      ]),
    );
  });
});
