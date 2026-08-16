// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
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
const snapshotReference = "convex-snapshot:2026-08-16T12:00:00Z";

describe("plan-layer clean slate", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  async function seedPlanLayer() {
    return await t.run(async (ctx) => {
      const campaignId = await ctx.db.insert("campaigns", {
        name: "Precious metals",
        ownerId,
        status: "active",
        thesis: "Macro thesis",
      });
      const secondCampaignId = await ctx.db.insert("campaigns", {
        name: "Tech",
        ownerId,
        status: "active",
        thesis: "Second thesis",
      });
      const gldmPlanId = await ctx.db.insert("tradePlans", {
        campaignId,
        instrumentSymbol: "GLDM",
        name: "GLDM plan",
        ownerId,
        status: "watching",
      });
      const metaPlanId = await ctx.db.insert("tradePlans", {
        campaignId: secondCampaignId,
        instrumentSymbol: "META",
        name: "META plan",
        ownerId,
        status: "watching",
      });
      const muPlanId = await ctx.db.insert("tradePlans", {
        instrumentSymbol: "MU",
        name: "MU Bravos plan",
        ownerId,
        status: "watching",
      });
      const campaignNoteId = await ctx.db.insert("notes", {
        campaignId,
        content: "Campaign thesis in Jackson's own words.",
        noteDate: 100,
        ownerId,
        ticker: "STALE",
      });
      const planNoteId = await ctx.db.insert("notes", {
        content: "GLDM entry conditions Jackson wrote.",
        noteDate: 200,
        ownerId,
        tradePlanId: gldmPlanId,
      });
      const generatedNoteId = await ctx.db.insert("notes", {
        content: "Imported from service post: https://bravosresearch.com/mu",
        noteDate: 300,
        ownerId,
        tradePlanId: muPlanId,
      });
      const annotatedImportNoteId = await ctx.db.insert("notes", {
        content:
          "Imported from service post: https://bravosresearch.com/gldm\nJackson: wait for confirmation before entry.",
        noteDate: 250,
        ownerId,
        tradePlanId: gldmPlanId,
      });
      const urlLessGeneratedNoteId = await ctx.db.insert("notes", {
        content: "  Imported from service post  ",
        noteDate: 301,
        ownerId,
        tradePlanId: metaPlanId,
      });
      const parentlessNoteId = await ctx.db.insert("notes", {
        content: "Already parentless and outside this cleanup.",
        noteDate: 400,
        ownerId,
      });
      const gldmRetrospectiveId = await ctx.db.insert("retrospectives", {
        content: "GLDM retrospective opening line. I waited too long.",
        ownerId,
        parentId: gldmPlanId,
        parentKind: "tradePlan",
        updatedAt: 501,
      });
      const metaRetrospectiveId = await ctx.db.insert("retrospectives", {
        content: "META retrospective opening line. I sized correctly.",
        ownerId,
        parentId: metaPlanId,
        parentKind: "tradePlan",
        updatedAt: 502,
      });
      const campaignRetrospectiveId = await ctx.db.insert("retrospectives", {
        content: "Campaign retrospective opening line. I changed my mind.",
        ownerId,
        parentId: campaignId,
        parentKind: "campaign",
        updatedAt: 503,
      });
      const tradeId = await ctx.db.insert("trades", {
        assetType: "stock",
        date: 600,
        direction: "long",
        ownerId,
        price: 10,
        quantity: 1,
        side: "buy",
        ticker: "GLDM",
        tradePlanId: gldmPlanId,
      });
      const inboxTradeId = await ctx.db.insert("inboxTrades", {
        ownerId,
        source: "manual",
        status: "pending_review",
        ticker: "META",
        tradePlanId: metaPlanId,
        validationErrors: [],
        validationWarnings: [],
      });
      const importTaskId = await ctx.db.insert("importTasks", {
        createdTradePlanId: muPlanId,
        mode: "create",
        ownerId,
        pastedText: "Imported MU setup",
        status: "done",
        tradePlanId: gldmPlanId,
      });
      const planWatchlistId = await ctx.db.insert("watchlist", {
        itemType: "tradePlan",
        ownerId,
        tradePlanId: gldmPlanId,
        watchedAt: 700,
      });
      const campaignWatchlistId = await ctx.db.insert("watchlist", {
        campaignId,
        itemType: "campaign",
        ownerId,
        watchedAt: 701,
      });
      const reviewItemId = await ctx.db.insert("bravosReviewItems", {
        appliedNoteId: generatedNoteId,
        appliedTradePlanId: muPlanId,
        approvedAction: {
          fieldUpdates: [],
          kind: "apply_follow_up",
          targetTradePlanId: gldmPlanId,
        },
        canonicalSourceIdentity: "https://bravosresearch.com/mu",
        classification: "follow_up",
        fetchSource: "direct_post_fetch",
        fetchedAt: 800,
        imageUrls: [],
        lastFetchedAt: 800,
        ownerId,
        proposedAction: {
          content: "MU service note",
          kind: "note_only",
          targetTradePlanId: metaPlanId,
        },
        rawText: "MU service prose",
        reviewState: "approved",
        sourceUrl: "https://bravosresearch.com/mu",
        suggestedTradePlanId: metaPlanId,
      });
      const checkInId = await ctx.db.insert("checkIns", {
        date: "2026-08-16",
        kind: "briefing",
        noteIds: [generatedNoteId, urlLessGeneratedNoteId, parentlessNoteId],
        ownerId,
        sentAt: 900,
        window: "late_morning",
      });
      return {
        campaignId,
        campaignNoteId,
        campaignRetrospectiveId,
        campaignWatchlistId,
        checkInId,
        annotatedImportNoteId,
        generatedNoteId,
        gldmPlanId,
        gldmRetrospectiveId,
        importTaskId,
        inboxTradeId,
        metaPlanId,
        metaRetrospectiveId,
        parentlessNoteId,
        planNoteId,
        planWatchlistId,
        reviewItemId,
        tradeId,
        urlLessGeneratedNoteId,
      };
    });
  }

  it("dry-runs with exact counts and recognizable conservative-salvage previews", async () => {
    await seedPlanLayer();

    const result = await t.query(internal.planLayerCleanup.inspect, {
      ownerId,
    });

    expect(result.counts).toMatchObject({
      archiveDocuments: 12,
      bravosReviewItemsPatched: 1,
      campaignsDeleted: 2,
      checkInsPatched: 1,
      clearedAppliedReviewItemNoteIds: 1,
      clearedAppliedReviewItemPlanIds: 1,
      clearedApprovedActionTargets: 1,
      clearedCheckInNoteIds: 2,
      clearedCreatedImportTaskPlanIds: 1,
      clearedInboxTradePlanIds: 1,
      clearedLinkedImportTaskPlanIds: 1,
      clearedProposedActionTargets: 1,
      clearedSuggestedReviewItemPlanIds: 1,
      deletedGeneratedNotes: 2,
      deletedWatchlistItems: 2,
      importTasksPatched: 1,
      notesSalvagedFromCampaigns: 1,
      notesSalvagedFromTradePlans: 2,
      retrospectivesConverted: 3,
      tradePlansDeleted: 3,
      tradesUnlinked: 1,
    });
    expect(result.plannedWrites).toBe(24);
    expect(result.generatedImportNoteCandidateCount).toBe(2);
    expect(result.generatedImportNoteCandidatePreviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentPreview:
            "Imported from service post: https://bravosresearch.com/mu",
          ticker: "MU",
        }),
        expect.objectContaining({
          contentPreview: "Imported from service post",
          ticker: "META",
        }),
      ]),
    );
    expect(result.importMarkerNotesWithAdditionalProseSalvaged).toBe(1);
    expect(result.classificationNotice).toContain("negative-signal");
    expect(result.retrospectivePreviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ticker: "GLDM" }),
        expect.objectContaining({ ticker: "META" }),
        expect.objectContaining({ ticker: null }),
      ]),
    );
    expect(result.salvagedNotePreviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentPreview: "GLDM entry conditions Jackson wrote.",
          ticker: "GLDM",
        }),
      ]),
    );
    expect(
      await t.run((ctx) => ctx.db.query("tradePlans").collect()),
    ).toHaveLength(3);
  });

  it("archives then atomically clears the plan layer while retaining usable writing and trades", async () => {
    const seeded = await seedPlanLayer();
    const dryRun = await t.query(internal.planLayerCleanup.inspect, {
      ownerId,
    });

    const result = await t.action(internal.planLayerCleanup.execute, {
      expectedAuditToken: dryRun.auditToken,
      ownerId,
      productionSnapshotReference: snapshotReference,
    });

    expect(result.counts).toEqual(dryRun.counts);
    const archive = await t.run((ctx) => ctx.db.get(result.archiveId));
    expect(archive).toMatchObject({
      auditToken: dryRun.auditToken,
      contentHash: dryRun.auditToken.split(":")[1],
      productionSnapshotReference: snapshotReference,
    });
    const archiveText = await t.action(async (ctx) => {
      return await (await ctx.storage.get(result.archiveStorageId))?.text();
    });
    expect(archiveText).toContain("GLDM retrospective opening line");
    expect(archiveText).toContain("MU service prose");

    const state = await t.run(async (ctx) => ({
      campaigns: await ctx.db.query("campaigns").collect(),
      annotatedImportNote: await ctx.db.get(seeded.annotatedImportNoteId),
      campaignNote: await ctx.db.get(seeded.campaignNoteId),
      checkIn: await ctx.db.get(seeded.checkInId),
      generatedNote: await ctx.db.get(seeded.generatedNoteId),
      urlLessGeneratedNote: await ctx.db.get(seeded.urlLessGeneratedNoteId),
      importTask: await ctx.db.get(seeded.importTaskId),
      inboxTrade: await ctx.db.get(seeded.inboxTradeId),
      notes: await ctx.db.query("notes").collect(),
      planNote: await ctx.db.get(seeded.planNoteId),
      reviewItem: await ctx.db.get(seeded.reviewItemId),
      retrospectives: await ctx.db.query("retrospectives").collect(),
      trade: await ctx.db.get(seeded.tradeId),
      tradePlans: await ctx.db.query("tradePlans").collect(),
      watchlist: await ctx.db.query("watchlist").collect(),
    }));

    expect(state.campaigns).toEqual([]);
    expect(state.tradePlans).toEqual([]);
    expect(state.generatedNote).toBeNull();
    expect(state.urlLessGeneratedNote).toBeNull();
    expect(state.retrospectives).toEqual([]);
    expect(state.watchlist).toEqual([]);
    expect(state.trade).toMatchObject({ ticker: "GLDM" });
    expect(state.trade).not.toHaveProperty("tradePlanId");
    expect(state.inboxTrade).not.toHaveProperty("tradePlanId");
    expect(state.importTask).not.toHaveProperty("tradePlanId");
    expect(state.importTask).not.toHaveProperty("createdTradePlanId");
    expect(state.checkIn?.noteIds).toEqual([seeded.parentlessNoteId]);
    expect(state.reviewItem).not.toHaveProperty("appliedNoteId");
    expect(state.reviewItem).not.toHaveProperty("appliedTradePlanId");
    expect(state.reviewItem).not.toHaveProperty("suggestedTradePlanId");
    expect(state.reviewItem?.proposedAction).not.toHaveProperty(
      "targetTradePlanId",
    );
    expect(state.reviewItem?.approvedAction).not.toHaveProperty(
      "targetTradePlanId",
    );
    expect(state.planNote).toMatchObject({ ticker: "GLDM" });
    expect(state.planNote).not.toHaveProperty("campaignId");
    expect(state.planNote).not.toHaveProperty("tradePlanId");
    expect(state.annotatedImportNote).toMatchObject({ ticker: "GLDM" });
    expect(state.annotatedImportNote).not.toHaveProperty("tradePlanId");
    expect(state.campaignNote).not.toHaveProperty("campaignId");
    expect(state.campaignNote).not.toHaveProperty("ticker");
    expect(
      state.notes.filter((note) => note.origin === "retrospective"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ noteDate: 501, ticker: "GLDM" }),
        expect.objectContaining({ noteDate: 502, ticker: "META" }),
        expect.objectContaining({ noteDate: 503 }),
      ]),
    );
    expect(
      state.notes.find(
        (note) => note.origin === "retrospective" && note.noteDate === 503,
      ),
    ).not.toHaveProperty("ticker");

    await expect(
      t.action(internal.planLayerCleanup.postCheck, {
        auditToken: dryRun.auditToken,
        ownerId,
      }),
    ).resolves.toMatchObject({
      auditToken: dryRun.auditToken,
      archiveReadable: true,
      counts: {
        attachedNotesRemaining: 0,
        bravosReviewPlanReferencesRemaining: 0,
        campaignsRemaining: 0,
        checkInGeneratedNoteIdsRemaining: 0,
        importTaskPlanReferencesRemaining: 0,
        inboxTradePlanReferencesRemaining: 0,
        retrospectiveNotesRemaining: 3,
        retrospectivesRemaining: 0,
        salvagedNotesVerified: 3,
        tradePlanReferencesRemaining: 0,
        tradePlansRemaining: 0,
        tradesAfter: 1,
        tradesBefore: 1,
        watchlistPlanReferencesRemaining: 0,
      },
    });
  });

  it("fails closed when data changes after the approved dry-run", async () => {
    const seeded = await seedPlanLayer();
    const dryRun = await t.query(internal.planLayerCleanup.inspect, {
      ownerId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.gldmPlanId, {
        rationale: "changed after audit",
      });
    });

    await expect(
      t.action(internal.planLayerCleanup.execute, {
        expectedAuditToken: dryRun.auditToken,
        ownerId,
        productionSnapshotReference: snapshotReference,
      }),
    ).rejects.toThrow("live data no longer matches the approved audit token");
    expect(await t.run((ctx) => ctx.db.get(seeded.gldmPlanId))).not.toBeNull();
  });

  it("requires an explicit retained production-snapshot reference", async () => {
    const seeded = await seedPlanLayer();
    const dryRun = await t.query(internal.planLayerCleanup.inspect, {
      ownerId,
    });

    await expect(
      t.action(internal.planLayerCleanup.execute, {
        expectedAuditToken: dryRun.auditToken,
        ownerId,
        productionSnapshotReference: "  ",
      }),
    ).rejects.toThrow("retained production snapshot reference is required");
    expect(await t.run((ctx) => ctx.db.get(seeded.gldmPlanId))).not.toBeNull();
  });

  it("fails closed when an owner note has a parent outside the cleanup set", async () => {
    await t.run(async (ctx) => {
      const otherOwnerPlanId = await ctx.db.insert("tradePlans", {
        instrumentSymbol: "ORPHAN",
        name: "Other owner plan",
        ownerId: "owner-b",
        status: "watching",
      });
      await ctx.db.insert("notes", {
        content: "This must not be silently classified.",
        noteDate: 1,
        ownerId,
        tradePlanId: otherOwnerPlanId,
      });
    });

    await expect(
      t.query(internal.planLayerCleanup.inspect, { ownerId }),
    ).rejects.toThrow(
      /note .* references a campaign or trade plan outside the owner cleanup set/,
    );
  });
});
