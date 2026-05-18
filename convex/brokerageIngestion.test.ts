// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  isBrokerageIngestionRequestAuthorized,
  validateBrokerageIngestFlexReportBody,
} from "./http";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

function stubTwelveDataResolutionFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const parsed = new URL(url);
      const symbol = parsed.searchParams.get("symbol")?.toUpperCase() ?? "";
      return new Response(
        JSON.stringify({
          data: [
            {
              country: "United States",
              currency: "USD",
              exchange: "NASDAQ",
              instrument_type: "Common Stock",
              symbol,
            },
          ],
          status: "ok",
        }),
        { status: 200 },
      );
    }),
  );
}

describe("brokerage ingestion", () => {
  const ownerId = "owner-a";
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    process.env.TWELVE_DATA_API_KEY = "test-key";
    process.env.BROKERAGE_INGESTION_TOKEN = "service-token";
    stubTwelveDataResolutionFetch();
    t = convexTest(schema, modules);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TWELVE_DATA_API_KEY;
    delete process.env.BROKERAGE_INGESTION_TOKEN;
  });

  function asUser() {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  async function createConnection(): Promise<Id<"brokerageConnections">> {
    return await asUser().mutation(
      api.brokerageIngestion.upsertIbkrConnection,
      {
        accountId: "U1234567",
        label: "IBKR Main",
        queryId: "123456",
        tokenLabel: "homelab-secret",
      },
    );
  }

  async function createPortfolio(): Promise<Id<"portfolios">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolios", {
        name: "Core",
        ownerId,
      });
    });
  }

  async function beginActivitySyncRun(
    connectionId: Id<"brokerageConnections">,
    reportDate = "2026-05-14",
  ): Promise<Id<"brokerageSyncRuns">> {
    const { syncRunId } = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate,
        reportType: "activity",
      },
    );
    return syncRunId;
  }

  async function insertAcceptedTrade(args: {
    brokerageAccountId?: string;
    direction?: "long" | "short";
    portfolioId?: Id<"portfolios">;
    quantity: number;
    side?: "buy" | "sell";
    ticker?: string;
  }): Promise<Id<"trades">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: args.brokerageAccountId ?? "U1234567",
        date: Date.UTC(2026, 4, 14, 16),
        direction: args.direction ?? "long",
        ownerId,
        portfolioId: args.portfolioId,
        price: 100,
        quantity: args.quantity,
        side: args.side ?? "buy",
        source: "ibkr",
        ticker: args.ticker ?? "AAPL",
      });
    });
  }

  async function ingestPositionSnapshots(
    syncRunId: Id<"brokerageSyncRuns">,
    positions: Array<{
      brokerageAccountId?: string;
      quantity: number;
      ticker?: string;
    }>,
  ) {
    return await t.mutation(
      internal.brokerageIngestion.ingestParsedFlexReport,
      {
        cashSnapshots: [],
        positionSnapshots: positions.map((position) => ({
          assetType: "stock" as const,
          brokerageAccountId: position.brokerageAccountId ?? "U1234567",
          quantity: position.quantity,
          reportDate: "2026-05-14",
          ticker: position.ticker ?? "AAPL",
        })),
        syncRunId,
        trades: [],
      },
    );
  }

  async function listOpenReconciliationIssues() {
    return await t.run(async (ctx) => {
      return (
        await ctx.db.query("brokerageReconciliationIssues").collect()
      ).filter((issue) => issue.ownerId === ownerId && issue.status === "open");
    });
  }

  it("upserts one IBKR connection metadata row for the authenticated user", async () => {
    const connectionId = await createConnection();
    const sameConnectionId = await asUser().mutation(
      api.brokerageIngestion.upsertIbkrConnection,
      {
        accountId: "U1234567",
        label: "IBKR Updated",
        queryId: "654321",
      },
    );
    const status = await asUser().query(
      api.brokerageIngestion.getBrokerageIngestionStatus,
      {},
    );

    expect(sameConnectionId).toBe(connectionId);
    expect(status.connections).toHaveLength(1);
    expect(status.connections[0]).toMatchObject({
      accountId: "U1234567",
      label: "IBKR Updated",
      queryId: "654321",
      source: "ibkr",
      status: "active",
    });
  });

  it("preserves existing IBKR credentials when omitted in upsert updates", async () => {
    const connectionId = await createConnection();

    await asUser().mutation(api.brokerageIngestion.upsertIbkrConnection, {
      label: "Renamed connection",
    });

    const status = await asUser().query(
      api.brokerageIngestion.getBrokerageIngestionStatus,
      {},
    );

    expect(status.connections).toHaveLength(1);
    expect(status.connections[0]).toMatchObject({
      _id: connectionId,
      label: "Renamed connection",
      queryId: "123456",
      status: "active",
    });
  });

  it("starts or reuses a sync run by connection, report type, report date, and query id", async () => {
    const connectionId = await createConnection();
    const first = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );
    const second = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );

    expect(first.created).toBe(true);
    expect(second).toEqual({
      created: false,
      queryId: "123456",
      syncRunId: first.syncRunId,
    });
  });

  it("blocks starting a sync run for paused connections", async () => {
    const connectionId = await createConnection();
    await asUser().mutation(api.brokerageIngestion.pauseBrokerageConnection, {
      connectionId,
    });

    await expect(
      t.mutation(internal.brokerageIngestion.beginSyncRunForConnection, {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      }),
    ).rejects.toThrowError("Brokerage connection is not active");
  });

  it("ingests parsed Flex reports idempotently into inbox trades and snapshots", async () => {
    const connectionId = await createConnection();
    const { syncRunId } = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );

    const payload = {
      cashSnapshots: [
        {
          brokerageAccountId: "U1234567",
          cash: 12500.25,
          currency: "usd",
          reportDate: "2026-05-14",
        },
      ],
      positionSnapshots: [
        {
          assetType: "stock" as const,
          brokerageAccountId: "U1234567",
          marketValue: 1895,
          quantity: 10,
          reportDate: "2026-05-14",
          ticker: "aapl",
        },
      ],
      syncRunId,
      trades: [
        {
          assetType: "stock" as const,
          brokerageAccountId: "U1234567",
          date: Date.UTC(2026, 4, 14, 9, 30, 5),
          direction: "long" as const,
          externalId: "0000e1.12345.01",
          fees: -1.25,
          price: 189.5,
          quantity: 10,
          side: "buy" as const,
          ticker: "aapl",
        },
      ],
    };

    const first = await t.mutation(
      internal.brokerageIngestion.ingestParsedFlexReport,
      payload,
    );
    const second = await t.mutation(
      internal.brokerageIngestion.ingestParsedFlexReport,
      payload,
    );
    const third = await t.mutation(
      internal.brokerageIngestion.ingestParsedFlexReport,
      payload,
    );
    const inboxTrades = await t.run(async (ctx) =>
      (await ctx.db.query("inboxTrades").collect()).filter(
        (trade) =>
          trade.ownerId === ownerId &&
          trade.source === "ibkr" &&
          trade.externalId === "0000e1.12345.01",
      ),
    );
    const positions = await t.run(async (ctx) =>
      (await ctx.db.query("brokeragePositionSnapshots").collect()).filter(
        (snapshot) => snapshot.syncRunId === syncRunId,
      ),
    );
    const cash = await t.run(async (ctx) =>
      (await ctx.db.query("brokerageCashSnapshots").collect()).filter(
        (snapshot) => snapshot.syncRunId === syncRunId,
      ),
    );
    const syncRun = await t.run(async (ctx) => await ctx.db.get(syncRunId));

    expect(first).toMatchObject({
      cashSnapshotsWritten: 1,
      importedTrades: 1,
      positionSnapshotsWritten: 1,
      skippedDuplicateTrades: 0,
    });
    expect(second).toMatchObject({
      cashSnapshotsWritten: 0,
      importedTrades: 0,
      positionSnapshotsWritten: 0,
      skippedDuplicateTrades: 1,
    });
    expect(third).toMatchObject({
      cashSnapshotsWritten: 0,
      importedTrades: 0,
      positionSnapshotsWritten: 0,
      skippedDuplicateTrades: 1,
    });
    expect(inboxTrades).toHaveLength(1);
    expect(inboxTrades[0]).toMatchObject({
      brokerageAccountId: "U1234567",
      source: "ibkr",
      ticker: "AAPL",
    });
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      quantity: 10,
      ticker: "AAPL",
    });
    expect(cash).toHaveLength(1);
    expect(cash[0]).toMatchObject({
      cash: 12500.25,
      currency: "USD",
    });
    expect(syncRun).toMatchObject({
      importedTrades: 1,
      positionSnapshotCount: 1,
      skippedDuplicateTrades: 1,
    });
  });

  it("does not open reconciliation issues when accepted positions match brokerage snapshots", async () => {
    const connectionId = await createConnection();
    const syncRunId = await beginActivitySyncRun(connectionId);
    await insertAcceptedTrade({ quantity: 10 });

    await ingestPositionSnapshots(syncRunId, [{ quantity: 10 }]);

    expect(await listOpenReconciliationIssues()).toHaveLength(0);
  });

  it("opens position reconciliation issues for brokerage quantity mismatches", async () => {
    const connectionId = await createConnection();
    const syncRunId = await beginActivitySyncRun(connectionId);
    await insertAcceptedTrade({ quantity: 10 });

    await ingestPositionSnapshots(syncRunId, [{ quantity: 8 }]);

    const openIssues = await listOpenReconciliationIssues();
    expect(openIssues).toHaveLength(1);
    expect(openIssues[0]).toMatchObject({
      actualQuantity: 8,
      brokerageAccountId: "U1234567",
      direction: "long",
      expectedQuantity: 10,
      issueType: "position_mismatch",
      status: "open",
      ticker: "AAPL",
    });
  });

  it("resolves open position reconciliation issues when later snapshots match", async () => {
    const connectionId = await createConnection();
    const syncRunId = await beginActivitySyncRun(connectionId);
    await insertAcceptedTrade({ quantity: 10 });
    await ingestPositionSnapshots(syncRunId, [{ quantity: 8 }]);

    await ingestPositionSnapshots(syncRunId, [{ quantity: 10 }]);

    const issues = await t.run(async (ctx) => {
      return await ctx.db.query("brokerageReconciliationIssues").collect();
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      issueType: "position_mismatch",
      status: "resolved",
    });
    expect(issues[0].resolvedAt).toEqual(expect.any(Number));
  });

  it("reports mismatched valuation freshness when open position issues exist", async () => {
    const portfolioId = await createPortfolio();
    const connectionId = await createConnection();
    const syncRunId = await beginActivitySyncRun(connectionId);
    await insertAcceptedTrade({ portfolioId, quantity: 10 });
    await ingestPositionSnapshots(syncRunId, [{ quantity: 8 }]);
    await t.mutation(internal.brokerageIngestion.markSyncRunSucceeded, {
      syncRunId,
    });

    const freshness = await asUser().query(
      api.portfolioAnalytics.getValuationFreshnessStatus,
      {
        date: "2026-05-14",
        portfolioId,
      },
    );

    expect(freshness).toEqual({
      date: "2026-05-14",
      status: "mismatched",
    });
  });

  it("reports stale valuation freshness when the expected sync has not succeeded", async () => {
    const portfolioId = await createPortfolio();
    await createConnection();

    const freshness = await asUser().query(
      api.portfolioAnalytics.getValuationFreshnessStatus,
      {
        date: "2026-05-14",
        portfolioId,
      },
    );

    expect(freshness).toEqual({
      date: "2026-05-14",
      status: "stale",
    });
  });

  it("reports pending review freshness for imported trades still in the inbox", async () => {
    const portfolioId = await createPortfolio();
    const connectionId = await createConnection();
    const syncRunId = await beginActivitySyncRun(connectionId);

    await t.mutation(internal.brokerageIngestion.ingestParsedFlexReport, {
      cashSnapshots: [],
      positionSnapshots: [],
      syncRunId,
      trades: [
        {
          assetType: "stock" as const,
          brokerageAccountId: "U1234567",
          date: Date.UTC(2026, 4, 14, 9, 30, 5),
          direction: "long" as const,
          externalId: "0000e1.pending",
          price: 189.5,
          quantity: 10,
          side: "buy" as const,
          ticker: "aapl",
        },
      ],
    });
    await t.mutation(internal.brokerageIngestion.markSyncRunSucceeded, {
      syncRunId,
    });

    const freshness = await asUser().query(
      api.portfolioAnalytics.getValuationFreshnessStatus,
      {
        date: "2026-05-14",
        portfolioId,
      },
    );

    expect(freshness.status).toBe("pending_review");
  });

  it("reports unmanaged valuation freshness without an active brokerage connection", async () => {
    const portfolioId = await createPortfolio();

    const freshness = await asUser().query(
      api.portfolioAnalytics.getValuationFreshnessStatus,
      {
        date: "2026-05-14",
        portfolioId,
      },
    );

    expect(freshness).toEqual({
      date: "2026-05-14",
      status: "unmanaged",
    });
  });

  it("updates sync run and connection status on success", async () => {
    const connectionId = await createConnection();
    const { syncRunId } = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );

    await t.mutation(internal.brokerageIngestion.markSyncRunRequested, {
      referenceCode: "REF123",
      syncRunId,
    });
    await t.mutation(internal.brokerageIngestion.markSyncRunSucceeded, {
      syncRunId,
    });

    const run = await t.run(async (ctx) => await ctx.db.get(syncRunId));
    const connection = await t.run(
      async (ctx) => await ctx.db.get(connectionId),
    );

    expect(run).toMatchObject({
      referenceCode: "REF123",
      status: "succeeded",
    });
    expect(connection).toMatchObject({
      status: "active",
    });
    expect(connection?.lastSuccessfulSyncAt).toEqual(expect.any(Number));
  });

  it("reuses existing raw report reference without creating extra metadata rows", async () => {
    const connectionId = await createConnection();
    const { syncRunId } = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );
    const storageIdA = await t.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["<FlexQueryResponse/>"], { type: "application/xml" }),
        ),
    );
    const storageIdB = await t.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["<FlexQueryResponse><Trades/></FlexQueryResponse>"], {
            type: "application/xml",
          }),
        ),
    );

    const firstRawReportId = await t.mutation(
      internal.brokerageIngestion.storeRawReportReference,
      {
        byteLength: 20,
        contentHash: "hash-a",
        storageId: storageIdA,
        syncRunId,
      },
    );
    const secondRawReportId = await t.mutation(
      internal.brokerageIngestion.storeRawReportReference,
      {
        byteLength: 43,
        contentHash: "hash-b",
        storageId: storageIdB,
        syncRunId,
      },
    );

    const syncRun = await t.run(async (ctx) => await ctx.db.get(syncRunId));
    const rawReport = await t.run(
      async (ctx) => await ctx.db.get(firstRawReportId),
    );

    expect(secondRawReportId).toBe(firstRawReportId);
    expect(syncRun?.rawReportId).toBe(firstRawReportId);
    expect(rawReport).toMatchObject({
      contentHash: "hash-a",
      storageId: storageIdA,
    });
  });

  it("rolls back raw report metadata when downstream ingestion fails", async () => {
    const connectionId = await createConnection();
    const { syncRunId } = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );
    const storageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["<FlexQueryResponse/>"], { type: "application/xml" }),
        ),
    );
    const rawReportId = await t.mutation(
      internal.brokerageIngestion.storeRawReportReference,
      {
        byteLength: 20,
        contentHash: "hash-a",
        storageId,
        syncRunId,
      },
    );

    await t.mutation(internal.brokerageIngestion.rollbackRawReportReference, {
      rawReportId,
      storageId,
      syncRunId,
    });

    const syncRun = await t.run(async (ctx) => await ctx.db.get(syncRunId));
    const rawReport = await t.run(async (ctx) => await ctx.db.get(rawReportId));

    expect(syncRun?.rawReportId).toBeUndefined();
    expect(rawReport).toBeNull();
  });

  it("rejects invalid service tokens before HTTP route work runs", () => {
    const unauthorized = new Request("https://convex.test", {
      headers: { authorization: "Bearer wrong" },
      method: "POST",
    });
    const authorized = new Request("https://convex.test", {
      headers: { authorization: "Bearer service-token" },
      method: "POST",
    });

    expect(isBrokerageIngestionRequestAuthorized(unauthorized)).toBe(false);
    expect(isBrokerageIngestionRequestAuthorized(authorized)).toBe(true);
  });

  it("validates nested Flex report HTTP payload fields by object keys", () => {
    const body = {
      cashSnapshots: [
        {
          brokerageAccountId: "U1234567",
          cash: 12500.25,
          currency: "USD",
          reportDate: "2026-05-14",
        },
      ],
      positionSnapshots: [
        {
          assetType: "stock",
          brokerageAccountId: "U1234567",
          marketValue: 1895,
          quantity: 10,
          reportDate: "2026-05-14",
          ticker: "AAPL",
        },
      ],
      rawXml: "<FlexQueryResponse/>",
      syncRunId: "sync-run-id",
      trades: [
        {
          assetType: "stock",
          brokerageAccountId: "U1234567",
          currency: "USD",
          date: Date.UTC(2026, 4, 14, 9, 30, 5),
          direction: "long",
          executionId: "exec-1",
          externalId: "0000e1.12345.01",
          fees: -1.25,
          orderType: "LMT",
          price: 189.5,
          quantity: 10,
          side: "buy",
          taxes: 0,
          ticker: "AAPL",
        },
      ],
      warnings: ["warning"],
    };

    expect(validateBrokerageIngestFlexReportBody(body)).toMatchObject({
      cashSnapshots: [{ brokerageAccountId: "U1234567" }],
      positionSnapshots: [{ assetType: "stock", ticker: "AAPL" }],
      rawXml: "<FlexQueryResponse/>",
      syncRunId: "sync-run-id",
      trades: [{ side: "buy", ticker: "AAPL" }],
      warnings: ["warning"],
    });
    expect(() =>
      validateBrokerageIngestFlexReportBody({
        ...body,
        trades: [{ ...body.trades[0], side: "hold" }],
      }),
    ).toThrow("trades[0].side must be one of");
  });
});
