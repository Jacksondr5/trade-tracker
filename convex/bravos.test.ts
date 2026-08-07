// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
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

describe("bravos review queue", () => {
  const ownerId = "owner-a";
  const workerSecret = "test-worker-secret";
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    process.env.BRAVOS_WORKER_SECRET = workerSecret;
    process.env.BRAVOS_WORKER_URL =
      "https://worker.test/api/internal/bravos/run";
    process.env.BRAVOS_DISABLE_DISPATCH_FOR_TESTS = "1";
    process.env.BRAVOS_ENABLED = "true";
    t = convexTest(schema, modules);
  });

  function asUser() {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  async function insertRun(args: {
    kind?: "direct_post_fetch" | "listing_scan" | "scheduled_scan";
    sourceUrl: string;
  }): Promise<Id<"bravosSyncRuns">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("bravosSyncRuns", {
        kind: args.kind ?? "direct_post_fetch",
        ownerId,
        requestedAt: Date.now(),
        requestedSourceUrl: args.sourceUrl,
        status: "queued",
      });
    });
  }

  async function insertTradePlan(args?: {
    name?: string;
    sourceUrl?: string;
  }): Promise<Id<"tradePlans">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("tradePlans", {
        instrumentSymbol: "QQQ",
        name: args?.name ?? "QQQ Bravos",
        ownerId,
        rationale: "Existing rationale",
        sourceUrl: args?.sourceUrl,
        status: "watching",
      });
    });
  }

  it("keeps dry runs and non-Bravos source URLs untouched", async () => {
    const bravosPlanId = await insertTradePlan({
      sourceUrl: "https://bravosresearch.com/post/1",
    });
    const manualPlanId = await insertTradePlan({
      name: "Other imported plan",
      sourceUrl: "https://example.com/post/1",
    });

    const dryRun = await t.mutation(
      internal.bravos.cleanupBravosPlansAndDerivedRecords,
      { cursor: null, dryRun: true, ownerId },
    );
    expect(dryRun).toMatchObject({
      bravosPlansInBatch: 1,
      deletedPlans: 0,
      eligiblePlans: 1,
      isDone: true,
    });
    expect(await t.run((ctx) => ctx.db.get(bravosPlanId))).not.toBeNull();

    const cleanup = await t.mutation(
      internal.bravos.cleanupBravosPlansAndDerivedRecords,
      { cursor: null, dryRun: false, ownerId },
    );
    expect(cleanup.deletedPlans).toBe(1);
    expect(await t.run((ctx) => ctx.db.get(bravosPlanId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(manualPlanId))).not.toBeNull();
  });

  it("reports dry-run effects and cleans Bravos-derived records without touching trades", async () => {
    const tradePlanId = await insertTradePlan({
      sourceUrl: "https://bravosresearch.com/post/2",
    });
    const {
      directNoteId,
      importTaskId,
      inboxTradeId,
      readyReviewId,
      reviewId,
      tradeId,
    } = await t.run(async (ctx) => {
      const now = Date.now();
      const tradeId = await ctx.db.insert("trades", {
        assetType: "stock",
        date: now,
        direction: "long",
        ownerId,
        price: 100,
        quantity: 1,
        side: "buy",
        ticker: "QQQ",
        tradePlanId,
      });
      const directNoteId = await ctx.db.insert("notes", {
        content: "Bravos review-derived note",
        noteDate: now,
        ownerId,
        tradePlanId,
      });
      await ctx.db.insert("notes", {
        content:
          "Imported from service post: https://bravosresearch.com/post/2",
        noteDate: now,
        ownerId,
        tradePlanId,
      });
      await ctx.db.insert("notes", {
        content: "Legacy Bravos follow-up output",
        noteDate: now,
        ownerId,
        tradePlanId,
      });
      const inboxTradeId = await ctx.db.insert("inboxTrades", {
        ownerId,
        source: "manual",
        status: "pending_review",
        tradePlanId,
        validationErrors: [],
        validationWarnings: [],
      });
      const importTaskId = await ctx.db.insert("importTasks", {
        createdTradePlanId: tradePlanId,
        extractedData: JSON.stringify({
          noteContent: "Legacy Bravos follow-up output\n",
        }),
        mode: "follow-up",
        ownerId,
        pastedText: "Bravos import",
        status: "done",
        tradePlanId,
      });
      const reviewId = await ctx.db.insert("bravosReviewItems", {
        approvedAction: {
          fieldUpdates: [],
          kind: "apply_follow_up",
          targetTradePlanId: tradePlanId,
        },
        approvedAt: now,
        appliedNoteId: directNoteId,
        appliedTradePlanId: tradePlanId,
        canonicalSourceIdentity: "https://bravosresearch.com/post/2",
        classification: "initiate",
        fetchSource: "direct_post_fetch",
        fetchedAt: now,
        imageUrls: [],
        lastFetchedAt: now,
        ownerId,
        proposedAction: {
          fieldUpdates: [],
          kind: "apply_follow_up",
          targetTradePlanId: tradePlanId,
        },
        rawText: "QQQ Bravos",
        reviewState: "approved",
        sourceUrl: "https://bravosresearch.com/post/2",
        suggestedTradePlanId: tradePlanId,
      });
      const readyReviewId = await ctx.db.insert("bravosReviewItems", {
        canonicalSourceIdentity: "https://bravosresearch.com/post/ready",
        classification: "initiate",
        fetchSource: "direct_post_fetch",
        fetchedAt: now,
        imageUrls: [],
        lastFetchedAt: now,
        ownerId,
        proposedAction: {
          instrumentSymbol: "QQQ",
          kind: "create_trade_plan",
          name: "Pending Bravos",
        },
        rawText: "Pending Bravos",
        reviewState: "ready",
        sourceUrl: "https://bravosresearch.com/post/ready",
      });
      return {
        directNoteId,
        importTaskId,
        inboxTradeId,
        readyReviewId,
        reviewId,
        tradeId,
      };
    });

    const dryRun = await t.mutation(
      internal.bravos.cleanupBravosPlansAndDerivedRecords,
      { cursor: null, dryRun: true, ownerId },
    );
    expect(dryRun).toMatchObject({
      clearedAppliedReviewItemNoteIds: 1,
      clearedAppliedReviewItemPlanIds: 1,
      clearedApprovedActionTargets: 1,
      clearedCreatedImportTaskPlanIds: 1,
      clearedInboxTradePlanIds: 1,
      clearedLinkedImportTaskPlanIds: 1,
      clearedProposedActionTargets: 1,
      clearedSuggestedReviewItemPlanIds: 1,
      deletedNotes: 3,
      deletedPlans: 0,
      deletedReadyReviewItems: 1,
      eligiblePlans: 1,
      patchedImportTasks: 1,
      patchedReviewItems: 1,
      unlinkedTrades: 1,
    });
    expect(await t.run((ctx) => ctx.db.get(tradePlanId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(tradeId))).toMatchObject({
      tradePlanId,
    });

    const cleanup = await t.mutation(
      internal.bravos.cleanupBravosPlansAndDerivedRecords,
      { cursor: null, dryRun: false, ownerId },
    );
    expect(cleanup.deletedPlans).toBe(1);
    expect(await t.run((ctx) => ctx.db.get(tradePlanId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(directNoteId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(tradeId))).not.toHaveProperty(
      "tradePlanId",
    );
    expect(await t.run((ctx) => ctx.db.get(inboxTradeId))).not.toHaveProperty(
      "tradePlanId",
    );
    const importTask = await t.run((ctx) => ctx.db.get(importTaskId));
    expect(importTask).not.toHaveProperty("createdTradePlanId");
    expect(importTask).not.toHaveProperty("tradePlanId");
    expect(await t.run((ctx) => ctx.db.get(readyReviewId))).toBeNull();
    const review = await t.run((ctx) => ctx.db.get(reviewId));
    expect(review).toMatchObject({
      approvedAction: { fieldUpdates: [], kind: "apply_follow_up" },
      proposedAction: { fieldUpdates: [], kind: "apply_follow_up" },
    });
    expect(review).not.toHaveProperty("appliedNoteId");
    expect(review).not.toHaveProperty("appliedTradePlanId");
    expect(review).not.toHaveProperty("suggestedTradePlanId");
  });

  it("refuses plans with unknown notes or user-content references", async () => {
    const tradePlanId = await insertTradePlan({
      sourceUrl: "https://bravosresearch.com/post/blocked",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("notes", {
        content: "Jackson note",
        noteDate: now,
        ownerId,
        tradePlanId,
      });
      await ctx.db.insert("retrospectives", {
        content: "Retrospective",
        ownerId,
        parentId: tradePlanId,
        parentKind: "tradePlan",
        updatedAt: now,
      });
      await ctx.db.insert("watchlist", {
        itemType: "tradePlan",
        ownerId,
        tradePlanId,
        watchedAt: now,
      });
    });

    const result = await t.mutation(
      internal.bravos.cleanupBravosPlansAndDerivedRecords,
      { cursor: null, dryRun: false, ownerId },
    );
    expect(result).toMatchObject({
      deletedPlans: 0,
      plansWithRetrospectives: 1,
      plansWithUnknownNotes: 1,
      plansWithWatchlistItems: 1,
    });
    expect(await t.run((ctx) => ctx.db.get(tradePlanId))).not.toBeNull();
  });

  it("processes Bravos cleanup pages to cursor termination", async () => {
    for (const index of Array.from({ length: 11 }, (_, value) => value)) {
      await insertTradePlan({
        name: `Bravos ${index}`,
        sourceUrl: `https://bravosresearch.com/post/${index}`,
      });
    }

    const firstPage = await t.mutation(
      internal.bravos.cleanupBravosPlansAndDerivedRecords,
      { cursor: null, dryRun: true, ownerId },
    );
    expect(firstPage).toMatchObject({ bravosPlansInBatch: 10, isDone: false });

    const secondPage = await t.mutation(
      internal.bravos.cleanupBravosPlansAndDerivedRecords,
      { cursor: firstPage.continueCursor, dryRun: true, ownerId },
    );
    expect(secondPage).toMatchObject({ bravosPlansInBatch: 1, isDone: true });
  });

  it("rejects direct scan requests while Bravos is deactivated", async () => {
    delete process.env.BRAVOS_ENABLED;

    await expect(
      asUser().mutation(api.bravos.requestBravosListingScan, {}),
    ).rejects.toThrow("Bravos import is deactivated");
  });

  it("creates one review item per canonical Bravos source identity", async () => {
    const syncRunId = await insertRun({
      sourceUrl: "https://example.com/post/1?utm_source=x",
    });

    const firstId = await t.mutation(api.bravos.upsertReviewItemForWorker, {
      classification: "initiate",
      fetchSource: "direct_post_fetch",
      imageUrls: [],
      proposedAction: {
        instrumentSymbol: "QQQ",
        kind: "create_trade_plan",
        name: "QQQ setup",
      },
      rawText: "QQQ setup",
      sourceUrl: "https://example.com/post/1?utm_source=x",
      syncRunId,
      workerSecret,
    });
    const secondId = await t.mutation(api.bravos.upsertReviewItemForWorker, {
      classification: "initiate",
      fetchSource: "direct_post_fetch",
      imageUrls: ["https://example.com/chart.png"],
      proposedAction: {
        instrumentSymbol: "QQQ",
        kind: "create_trade_plan",
        name: "QQQ setup refreshed",
      },
      rawText: "QQQ setup refreshed",
      sourceTitle: "QQQ Breakout Setup",
      sourceUrl: "https://example.com/post/1",
      syncRunId,
      workerSecret,
    });

    expect(secondId).toBe(firstId);
    const items = await asUser().query(api.bravos.listBravosReviewItems, {
      paginationOpts: {
        cursor: null,
        numItems: 25,
      },
    });
    expect(items.page).toHaveLength(1);
    expect(items.page[0]).toMatchObject({
      imageUrls: ["https://example.com/chart.png"],
      rawText: "QQQ setup refreshed",
      sourceTitle: "QQQ Breakout Setup",
    });
  });

  it("does not mutate trade plans until approval", async () => {
    const syncRunId = await insertRun({
      sourceUrl: "https://example.com/post/2",
    });
    await t.mutation(api.bravos.upsertReviewItemForWorker, {
      classification: "initiate",
      fetchSource: "direct_post_fetch",
      imageUrls: [],
      proposedAction: {
        instrumentSymbol: "AAPL",
        kind: "create_trade_plan",
        name: "AAPL setup",
      },
      rawText: "AAPL setup",
      sourceUrl: "https://example.com/post/2",
      syncRunId,
      workerSecret,
    });

    const plans = await t.run(async (ctx) => {
      return await ctx.db.query("tradePlans").take(10);
    });
    expect(plans).toEqual([]);
  });

  it("paginates Bravos review items", async () => {
    const syncRunId = await insertRun({
      sourceUrl: "https://example.com/post/2",
    });
    for (const index of [1, 2, 3]) {
      await t.mutation(api.bravos.upsertReviewItemForWorker, {
        classification: "initiate",
        fetchSource: "direct_post_fetch",
        imageUrls: [],
        proposedAction: {
          instrumentSymbol: "QQQ",
          kind: "create_trade_plan",
          name: `QQQ setup ${index}`,
        },
        rawText: `QQQ setup ${index}`,
        sourceUrl: `https://example.com/post/${index}`,
        syncRunId,
        workerSecret,
      });
    }

    const firstPage = await asUser().query(api.bravos.listBravosReviewItems, {
      paginationOpts: {
        cursor: null,
        numItems: 2,
      },
    });
    expect(firstPage.page).toHaveLength(2);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await asUser().query(api.bravos.listBravosReviewItems, {
      paginationOpts: {
        cursor: firstPage.continueCursor,
        numItems: 2,
      },
    });
    expect(secondPage.page).toHaveLength(1);
    expect(secondPage.isDone).toBe(true);
  });

  it("queues a listing scan with the saved listing URL", async () => {
    await asUser().mutation(api.bravos.saveBravosListingUrl, {
      listingUrl:
        "https://bravosresearch.com/category/portfolio-update/?utm_source=test",
    });
    await asUser().mutation(api.bravos.saveBravosBrowserbaseSession, {
      browserbaseContextId: "ctx_123",
      browserbaseSessionId: "session_123",
    });
    await asUser().mutation(api.bravos.markBravosBrowserbaseSessionSaved, {
      browserbaseSessionId: "session_123",
    });

    const syncRunId = await asUser().mutation(
      api.bravos.requestBravosListingScan,
      {},
    );

    const run = await t.run(async (ctx) => await ctx.db.get(syncRunId));
    expect(run).toMatchObject({
      kind: "listing_scan",
      ownerId,
      requestedSourceUrl:
        "https://bravosresearch.com/category/portfolio-update",
      status: "queued",
    });
  });

  it("filters already-known listing posts for the worker", async () => {
    const syncRunId = await insertRun({
      kind: "listing_scan",
      sourceUrl: "https://example.com/category/trade-alerts",
    });
    await t.mutation(api.bravos.upsertReviewItemForWorker, {
      classification: "initiate",
      fetchSource: "listing_scan",
      imageUrls: [],
      proposedAction: {
        instrumentSymbol: "QQQ",
        kind: "create_trade_plan",
        name: "QQQ setup",
      },
      rawText: "QQQ setup",
      sourceUrl: "https://example.com/post/1",
      syncRunId,
      workerSecret,
    });

    const unseen = await t.mutation(
      api.bravos.filterUnseenListingPostsForWorker,
      {
        posts: [
          {
            sourceUrl: "https://example.com/post/1",
          },
          {
            sourceUrl: "https://example.com/post/2?utm_source=test",
          },
        ],
        syncRunId,
        workerSecret,
      },
    );

    expect(unseen).toEqual([
      {
        sourceUrl: "https://example.com/post/2",
      },
    ]);
  });

  it("uses the source post date for follow-up field update prefixes", async () => {
    const tradePlanId = await insertTradePlan();
    const syncRunId = await insertRun({
      sourceUrl: "https://example.com/post/3",
    });
    const reviewItemId = await t.mutation(
      api.bravos.upsertReviewItemForWorker,
      {
        classification: "follow_up",
        fetchSource: "direct_post_fetch",
        imageUrls: [],
        proposedAction: {
          fieldUpdates: [
            { field: "rationale", text: "Raise stop after breakout." },
          ],
          kind: "apply_follow_up",
          targetTradePlanId: tradePlanId,
        },
        rawText: "QQQ update",
        sourcePostDate: "2026-04-10",
        sourceUrl: "https://example.com/post/3",
        syncRunId,
        workerSecret,
      },
    );

    await asUser().mutation(api.bravos.approveBravosReviewItem, {
      reviewItemId,
    });

    const plan = await t.run(async (ctx) => await ctx.db.get(tradePlanId));
    expect(plan?.rationale).toContain(
      "[2026-04-10] Raise stop after breakout.",
    );
  });

  it("marks the connection as needs_reconnect when auth fails", async () => {
    await asUser().mutation(api.bravos.saveBravosBrowserbaseSession, {
      browserbaseContextId: "ctx_123",
      browserbaseSessionId: "session_123",
    });
    const syncRunId = await insertRun({
      sourceUrl: "https://example.com/post/4",
    });

    await t.mutation(api.bravos.markRunErrorForWorker, {
      error: "Unauthorized on Bravos",
      markConnectionNeedsReconnect: true,
      syncRunId,
      workerSecret,
    });

    const connection = await asUser().query(api.bravos.getBravosConnection, {});
    expect(connection).toMatchObject({
      reconnectReason: "Unauthorized on Bravos",
      status: "needs_reconnect",
    });
  });

  it("blocks imports while a Bravos login session is waiting to be saved", async () => {
    await asUser().mutation(api.bravos.saveBravosListingUrl, {
      listingUrl: "https://example.com/category/trade-alerts",
    });
    await asUser().mutation(api.bravos.saveBravosBrowserbaseSession, {
      browserbaseContextId: "ctx_123",
      browserbaseSessionId: "session_123",
    });

    await expect(
      asUser().mutation(api.bravos.requestBravosListingScan, {}),
    ).rejects.toThrow("Save the Bravos login session before importing posts");

    await asUser().mutation(api.bravos.markBravosBrowserbaseSessionSaved, {
      browserbaseSessionId: "session_123",
    });

    const syncRunId = await asUser().mutation(
      api.bravos.requestBravosListingScan,
      {},
    );
    expect(syncRunId).toBeTruthy();
  });
});
