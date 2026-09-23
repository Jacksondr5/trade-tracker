// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import { validateRecordElementsBody, validateUpsertCampaignBody } from "./http";
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
const token = "counterpart-token";

describe("counterpart planning surface", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
    process.env.COUNTERPART_TOKEN = token;
    process.env.COUNTERPART_OWNER_ID = ownerId;
  });

  afterEach(() => {
    delete process.env.COUNTERPART_TOKEN;
    delete process.env.COUNTERPART_OWNER_ID;
  });

  async function post(path: string, body: unknown) {
    const response = await t.fetch(`/internal/counterpart/${path}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON envelope under test
    return { json: (await response.json()) as any, status: response.status };
  }

  it("validates write bodies", () => {
    expect(() =>
      validateRecordElementsBody({ actor: "counterpart", elements: [] }),
    ).toThrow(/non-empty/);
    expect(() =>
      validateRecordElementsBody({
        actor: "counterpart",
        elements: [{ author: "user", statement: "x", status: "agreed" }],
      }),
    ).toThrow(/Exactly one/);
    expect(() =>
      validateRecordElementsBody({
        actor: "counterpart",
        elements: [{ author: "user", statement: "x", status: "dropped" }],
        episodeId: "e",
      }),
    ).toThrow(/status/);
    expect(() =>
      validateUpsertCampaignBody({ actor: "counterpart" }),
    ).toThrow(/name is required/);
  });

  it("walks the full flow over HTTP with idempotent retries and conflicts", async () => {
    const swing = await t.run((ctx) =>
      ctx.db.insert("portfolios", { name: "Swing", ownerId }),
    );

    const campaign = await post("upsert-campaign", {
      actor: "counterpart",
      benchmarkTicker: "smh",
      linkedTickers: ["MU", "BE"],
      name: "Semiconductor & AI",
      operationId: "camp-1",
      thesis: "Anticipatory entries sized small until SMH confirms.",
    });
    expect(campaign.status).toBe(200);
    expect(campaign.json.data.campaign.benchmarkTicker).toBe("SMH");
    expect(campaign.json.data.campaign.linkedTickers).toEqual(["BE", "MU"]);
    const campaignId = campaign.json.data.campaign.id as string;

    const rule = await post("record-elements", {
      actor: "counterpart",
      campaignId,
      elements: [
        {
          author: "user",
          kind: "rule",
          statement: "Adds require sector confirmation",
          status: "agreed",
        },
      ],
    });
    expect(rule.status).toBe(200);
    const gateId = rule.json.data.elements[0].id as string;

    const opened = await post("open-episode", {
      actor: "counterpart",
      campaignId,
      operationId: "open-1",
      portfolioId: swing,
      ticker: "be",
    });
    expect(opened.status).toBe(200);
    expect(opened.json.data.episode.lifecycle).toBe("idea");
    expect(opened.json.data.episode.campaignId).toBe(campaignId);
    const episodeId = opened.json.data.episode.id as string;
    const replay = await post("open-episode", {
      actor: "counterpart",
      campaignId,
      operationId: "open-1",
      portfolioId: swing,
      ticker: "be",
    });
    expect(replay.json.data).toEqual({ ...opened.json.data, replayed: true });

    const missingAsOf = await post("record-elements", {
      actor: "counterpart",
      elements: [
        {
          author: "user",
          statement: "Stop $240",
          status: "agreed",
          value: { amount: 240, provenance: "user_reported", scope: "per_share", unit: "usd" },
        },
      ],
      episodeId,
    });
    expect(missingAsOf.status).toBe(400);
    expect(missingAsOf.json.error.code).toBe("VALIDATION");

    const recorded = await post("record-elements", {
      actor: "counterpart",
      elements: [
        {
          asOf: "2026-09-09",
          author: "user",
          kind: "entry",
          statement: "Continuation after reclaiming the long-term channel at $255",
          status: "agreed",
        },
        {
          asOf: "2026-09-09",
          author: "counterpart",
          kind: "analysis",
          statement: "2.16R to $346 from $273.51 with a $240 stop",
          status: "proposed",
          value: {
            amount: 2.16,
            provenance: "hypothetical",
            scope: "position",
            unit: "ratio",
          },
        },
      ],
      episodeId,
      operationId: "rec-1",
    });
    expect(recorded.status).toBe(200);
    expect(recorded.json.data.elements).toHaveLength(2);

    const exempt = await post("set-episode-campaign", {
      campaignId,
      episodeId,
      exemptedCampaignElementIds: [gateId],
    });
    expect(exempt.status).toBe(200);
    expect(exempt.json.data.episode.campaignElementExemptions).toEqual([gateId]);

    const drafted = await post("draft-plan-version", {
      actor: "counterpart",
      episodeId,
      operationId: "draft-1",
      sections: {
        entry: [{ elementId: recorded.json.data.elements[0].id, text: "Filled 17 @ 273.36", asOf: "2026-09-09" }],
        scenarios: [{ text: "Exempt from the SMH gate" }],
        size: [{ text: "3% allocation, 17 shares", asOf: "2026-09-09" }],
        stop: [{ text: "$240 broker backstop", asOf: "2026-09-09" }],
        structure: [],
        targets: [{ text: "$346 prior ATH", asOf: "2026-09-09" }],
      },
    });
    expect(drafted.status).toBe(200);
    expect(drafted.json.data.version.versionNumber).toBe(1);
    expect(drafted.json.data.version.endorsed).toBe(false);

    const wrongVersion = await post("endorse-plan-version", {
      actor: "counterpart",
      episodeId,
      versionNumber: 3,
    });
    expect(wrongVersion.status).toBe(409);
    expect(wrongVersion.json.error.code).toBe("CONFLICT");

    const endorsed = await post("endorse-plan-version", {
      actor: "counterpart",
      episodeId,
      versionNumber: 1,
    });
    expect(endorsed.status).toBe(200);
    expect(endorsed.json.data.version.endorsedBy).toBe("user");

    const context = await post("episode-context", { episodeId });
    expect(context.status).toBe(200);
    expect(context.json.data.episode.lifecycle).toBe("watching");
    expect(context.json.data.checkpoint.versionNumber).toBe(1);
    expect(context.json.data.itemsSinceCheckpoint).toEqual([]);
    expect(
      context.json.data.openProposals.map(
        (item: { author: string; beforeCheckpoint: boolean }) => [
          item.author,
          item.beforeCheckpoint,
        ],
      ),
    ).toEqual([["counterpart", true]]);
    expect(context.json.data.campaignRules.applicable).toEqual([]);
    expect(context.json.data.campaignRules.exempted).toHaveLength(1);
    expect(context.json.data.valuation.freshness.status).toBe("unavailable");
    expect(context.json.data.positionFreshness).toEqual({
      latestAttemptStatus: null,
      latestSuccessfulStatementDate: null,
    });

    const thread = await post("thread-context", { ticker: "BE" });
    expect(thread.status).toBe(200);
    expect(thread.json.data.thread.campaigns).toEqual([
      { id: campaignId, isBenchmark: false, name: "Semiconductor & AI" },
    ]);
    expect(thread.json.data.liveEpisodes).toHaveLength(1);

    const missing = await post("thread-context", { ticker: "NOPE" });
    expect(missing.status).toBe(404);

    const desk = await post("desk-context", {});
    expect(desk.status).toBe(200);
    expect(desk.json.data.groups[0].campaign.benchmark.ticker).toBe("SMH");
    expect(desk.json.data.groups[0].rows[0].checkpoint.stop[0].text).toBe(
      "$240 broker backstop",
    );

    const shelved = await post("shelve-episode", { actor: "counterpart", episodeId, shelved: true });
    expect(shelved.status).toBe(200);
    expect(shelved.json.data.episode.shelvedAt).not.toBeNull();

    const campaigns = await post("list-campaigns", {});
    expect(campaigns.json.data.campaigns[0].elements).toHaveLength(1);

    const history = await post("episode-elements", { episodeId, numItems: 1 });
    expect(history.status).toBe(200);
    expect(history.json.data.items).toHaveLength(1);
    expect(history.json.data.hasMore).toBe(true);
    const rest = await post("episode-elements", {
      cursor: history.json.data.nextCursor,
      episodeId,
      numItems: 50,
    });
    expect(rest.json.data.hasMore).toBe(false);
    expect(rest.json.data.items).toHaveLength(1);

    const version = await post("plan-version", { episodeId, versionNumber: 1 });
    expect(version.status).toBe(200);
    expect(version.json.data.version.sections.stop[0].text).toBe("$240 broker backstop");
    expect((await post("plan-version", { episodeId, versionNumber: 9 })).status).toBe(404);
  });

  it("reports reconciliation issue state, sync summary, and valuation in portfolio context", async () => {
    const now = Date.UTC(2026, 8, 22, 16, 0, 0);
    await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("brokerageConnections", {
        createdAt: now,
        ownerId,
        source: "ibkr",
        status: "active",
        updatedAt: now,
      });
      const successRun = await ctx.db.insert("brokerageSyncRuns", {
        completedAt: now - 86_400_000,
        connectionId,
        importedTrades: 2,
        ownerId,
        positionSnapshotCount: 2,
        queryId: "q",
        reconciliationIssueCount: 1,
        reportDate: "2026-09-21",
        reportType: "activity",
        requestedAt: now - 90_000_000,
        skippedDuplicateTrades: 0,
        source: "ibkr",
        startedAt: now - 90_000_000,
        status: "succeeded",
        updatedAt: now - 86_400_000,
      });
      await ctx.db.insert("brokerageSyncRuns", {
        completedAt: now,
        connectionId,
        errorMessage: "Flex statement not ready\n    at somewhere deep",
        importedTrades: 0,
        ownerId,
        positionSnapshotCount: 0,
        queryId: "q",
        reconciliationIssueCount: 0,
        reportDate: "2026-09-22",
        reportType: "activity",
        requestedAt: now,
        skippedDuplicateTrades: 0,
        source: "ibkr",
        startedAt: now,
        status: "failed_retryable",
        updatedAt: now,
      });
      await ctx.db.insert("brokeragePositionSnapshots", {
        assetType: "stock",
        brokerageAccountId: "U1",
        connectionId,
        createdAt: now,
        currency: "USD",
        marketValue: 4_000,
        ownerId,
        quantity: 17,
        reportDate: "2026-09-21",
        syncRunId: successRun,
        ticker: "BE",
      });
      await ctx.db.insert("brokeragePositionSnapshots", {
        assetType: "stock",
        brokerageAccountId: "U1",
        connectionId,
        createdAt: now,
        ownerId,
        quantity: 10,
        reportDate: "2026-09-21",
        syncRunId: successRun,
        ticker: "TSM",
      });
      // The Flex parser labels base totals BASE_SUMMARY; the account's
      // currency comes from the per-currency rows.
      await ctx.db.insert("brokerageCashSnapshots", {
        brokerageAccountId: "U1",
        cash: 1_000,
        connectionId,
        createdAt: now,
        currency: "BASE_SUMMARY",
        ownerId,
        reportDate: "2026-09-21",
        rowKind: "base_summary",
        syncRunId: successRun,
      });
      await ctx.db.insert("brokerageCashSnapshots", {
        brokerageAccountId: "U1",
        cash: 1_000,
        connectionId,
        createdAt: now,
        currency: "USD",
        ownerId,
        reportDate: "2026-09-21",
        rowKind: "currency",
        syncRunId: successRun,
      });
      await ctx.db.insert("brokeragePositionSnapshots", {
        assetType: "stock",
        brokerageAccountId: "U1",
        connectionId,
        createdAt: now,
        currency: "JPY",
        marketValue: 9_999,
        ownerId,
        quantity: 3,
        reportDate: "2026-09-21",
        syncRunId: successRun,
        ticker: "SONY",
      });
      await ctx.db.insert("portfolios", { name: "Unvalued", ownerId });
      await ctx.db.insert("brokerageReconciliationIssues", {
        connectionId,
        createdAt: now - 200_000,
        issueType: "missing_local_position",
        lastRecheckedAt: now - 100_000,
        message: "Brokerage reports 20 NVDA long but no local position",
        ownerId,
        reportDate: "2026-09-21",
        severity: "warning",
        status: "open",
        syncRunId: successRun,
        ticker: "NVDA",
        updatedAt: now - 100_000,
      });
      await ctx.db.insert("brokerageReconciliationIssues", {
        connectionId,
        createdAt: now - 500_000,
        issueType: "cash_mismatch",
        lastRecheckedAt: now - 100_000,
        message: "resolved earlier",
        ownerId,
        reportDate: "2026-09-20",
        resolvedAt: now - 100_000,
        severity: "info",
        status: "resolved",
        syncRunId: successRun,
        updatedAt: now - 100_000,
      });
      const portfolioId = await ctx.db.insert("portfolios", { name: "Swing", ownerId });
      await ctx.db.insert("portfolioDailyValuations", {
        cashBalance: 900,
        computedAt: now,
        date: "2026-09-19",
        marketValue: 3_500,
        missingSymbols: ["TSM"],
        ownerId,
        portfolioId,
        priceCoverageStatus: "partial",
        totalEquity: 4_400,
      });
    });

    const context = await t.query(internal.counterpart.getPortfolioContext, {
      now,
      ownerId,
    });
    expect(context.sync.latestAttempt).toMatchObject({
      failure: { retryable: true, summary: "Flex statement not ready" },
      reportDate: "2026-09-22",
      status: "failed_retryable",
    });
    expect(context.sync.latestSuccessfulStatement).toMatchObject({
      importedTrades: 2,
      reportDate: "2026-09-21",
    });
    expect(context.reconciliation).toHaveLength(1);
    expect(context.reconciliation[0]).toMatchObject({
      detectedAt: now - 200_000,
      lastRecheckedAt: now - 100_000,
      resolvedAt: null,
      state: "active",
      ticker: "NVDA",
    });
    expect(context.recentlyResolvedReconciliation).toHaveLength(1);
    expect(context.recentlyResolvedReconciliation[0]).toMatchObject({
      resolvedAt: now - 100_000,
      state: "resolved",
    });
    expect(context.valuation.brokerReported).toMatchObject({
      basis: "broker_reported",
      cash: 1_000,
      completeness: "partial",
      currency: "USD",
      equity: 5_000,
      marketValue: 4_000,
      missingCash: false,
      missingMarks: ["TSM"],
      pricedPositions: 1,
      totalPositions: 3,
      unsupportedCurrencyMarks: ["SONY"],
    });
    expect(context.valuation.reconstructed).toMatchObject({
      asOfDate: "2026-09-19",
      basis: "reconstructed",
      completeness: "partial",
      equity: 4_400,
      missingMarks: ["TSM"],
      missingPortfolios: ["Unvalued"],
    });
    const daily = await t.query(internal.counterpart.getDailyContext, { now, ownerId });
    expect(daily.valuation.brokerReported?.equity).toBe(5_000);
    expect(daily.recentlyResolvedReconciliation).toHaveLength(1);
    expect(context.valuation.freshness).toEqual({
      ageDays: 1,
      latestAttemptStatus: "failed_retryable",
      latestSuccessfulStatementDate: "2026-09-21",
      status: "current",
    });
  });
});
