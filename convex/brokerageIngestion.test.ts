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
        expectedAccountIds: { kind: "set", value: ["U1234567"] },
        label: { kind: "set", value: "IBKR Main" },
        queryId: "123456",
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
    reportDate = "2026-05-14",
  ) {
    return await t.mutation(
      internal.brokerageIngestion.ingestParsedFlexReport,
      {
        cashSnapshots: [],
        positionSnapshots: positions.map((position) => ({
          assetType: "stock" as const,
          brokerageAccountId: position.brokerageAccountId ?? "U1234567",
          quantity: position.quantity,
          reportDate,
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
        expectedAccountIds: {
          kind: "set",
          value: [" u1234567 ", "U7654321", "U1234567"],
        },
        label: { kind: "set", value: "IBKR Updated" },
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
      expectedAccountIds: ["U1234567", "U7654321"],
      label: "IBKR Updated",
      queryId: "654321",
      source: "ibkr",
      status: "active",
    });
    const storedConnection = await t.run(async (ctx) =>
      ctx.db.get(connectionId),
    );
    expect(storedConnection).toMatchObject({
      expectedAccountIds: ["U1234567", "U7654321"],
    });
    expect(storedConnection).not.toHaveProperty("accountId");
  });

  it("preserves existing IBKR credentials when omitted in upsert updates", async () => {
    const connectionId = await createConnection();

    await asUser().mutation(api.brokerageIngestion.upsertIbkrConnection, {
      label: { kind: "set", value: "Renamed connection" },
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

  it("clears optional connection metadata only through explicit patches", async () => {
    const connectionId = await createConnection();

    await asUser().mutation(api.brokerageIngestion.upsertIbkrConnection, {
      expectedAccountIds: { kind: "clear" },
      label: { kind: "clear" },
    });

    const connection = await t.run(async (ctx) => ctx.db.get(connectionId));
    expect(connection).toMatchObject({
      queryId: "123456",
      status: "active",
    });
    expect(connection).not.toHaveProperty("accountId");
    expect(connection).not.toHaveProperty("expectedAccountIds");
    expect(connection).not.toHaveProperty("label");
  });

  it("rejects empty metadata set patches instead of treating them as clears", async () => {
    await createConnection();

    await expect(
      asUser().mutation(api.brokerageIngestion.upsertIbkrConnection, {
        label: { kind: "set", value: "   " },
      }),
    ).rejects.toThrow("Label cannot be empty");
    await expect(
      asUser().mutation(api.brokerageIngestion.upsertIbkrConnection, {
        expectedAccountIds: { kind: "set", value: [] },
      }),
    ).rejects.toThrow("Expected account IDs cannot be empty");
  });

  it("returns the operational details needed to review brokerage ingestion", async () => {
    const connectionId = await createConnection();
    const tokenExpiresAt = Date.UTC(2026, 11, 31, 23, 59, 59, 999);
    await asUser().mutation(api.brokerageIngestion.upsertIbkrConnection, {
      tokenExpiresAt,
    });
    const syncRunId = await beginActivitySyncRun(connectionId);

    await t.run(async (ctx) => {
      await ctx.db.insert("inboxTrades", {
        assetType: "stock",
        brokerageAccountId: "U1234567",
        date: Date.UTC(2026, 4, 14, 16),
        direction: "long",
        externalId: "ibkr-execution-1",
        ownerId,
        price: 100,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        status: "pending_review",
        ticker: "AAPL",
        validationErrors: [],
        validationWarnings: [],
      });
      await ctx.db.insert("inboxTrades", {
        externalId: "manual-trade-1",
        ownerId,
        source: "manual",
        status: "pending_review",
        validationErrors: [],
        validationWarnings: [],
      });
      await ctx.db.insert("brokerageReconciliationIssues", {
        actualQuantity: 2,
        assetType: "stock",
        brokerageAccountId: "U1234567",
        connectionId,
        createdAt: Date.UTC(2026, 4, 15, 6),
        direction: "long",
        expectedQuantity: 1,
        issueType: "position_mismatch",
        message:
          "Brokerage reports 2 U1234567 AAPL long; local accepted trades expect 1",
        ownerId,
        reportDate: "2026-05-14",
        severity: "warning",
        status: "open",
        syncRunId,
        ticker: "AAPL",
        updatedAt: Date.UTC(2026, 4, 15, 6),
      });
    });

    await t.mutation(internal.brokerageIngestion.markSyncRunFailed, {
      errorMessage: "IBKR rejected the Flex token",
      failureType: "terminal",
      syncRunId,
    });

    const status = await asUser().query(
      api.brokerageIngestion.getBrokerageIngestionStatus,
      {},
    );

    expect(status.connections[0]).toMatchObject({
      connectionError: "IBKR rejected the Flex token",
      tokenExpiresAt,
    });
    expect(status.latestFailedSync).toMatchObject({
      errorMessage: "IBKR rejected the Flex token",
      reportDate: "2026-05-14",
      status: "failed_terminal",
    });
    expect(status.pendingImportedTradeCount).toBe(1);
    expect(status.hasMoreOpenIssues).toBe(false);
    expect(status.hasMorePendingImportedTrades).toBe(false);
    expect(status.openIssueCount).toBe(1);
    expect(status.openIssues).toEqual([
      expect.objectContaining({
        message:
          "Brokerage reports 2 U1234567 AAPL long; local accepted trades expect 1",
        reportDate: "2026-05-14",
        severity: "warning",
      }),
    ]);
  });

  it("selects the newest retryable or terminal failure by update time", async () => {
    const connectionId = await createConnection();
    const [retryableId] = await t.run(async (ctx) => {
      const baseRun = {
        connectionId,
        importedTrades: 0,
        ownerId,
        positionSnapshotCount: 0,
        queryId: "123456",
        reconciliationIssueCount: 0,
        reportType: "activity" as const,
        requestedAt: 1,
        skippedDuplicateTrades: 0,
        source: "ibkr" as const,
      };
      const retryableId = await ctx.db.insert("brokerageSyncRuns", {
        ...baseRun,
        errorMessage: "Temporary service error",
        reportDate: "2026-05-13",
        status: "failed_retryable",
        updatedAt: 2,
      });
      await ctx.db.insert("brokerageSyncRuns", {
        ...baseRun,
        errorMessage: "Token expired",
        reportDate: "2026-05-14",
        status: "failed_terminal",
        updatedAt: 3,
      });
      return [retryableId] as const;
    });

    const terminalIsNewest = await asUser().query(
      api.brokerageIngestion.getBrokerageIngestionStatus,
      {},
    );
    expect(terminalIsNewest.latestFailedSync).toMatchObject({
      errorMessage: "Token expired",
      status: "failed_terminal",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(retryableId, { updatedAt: 4 });
    });
    const retryableIsNewest = await asUser().query(
      api.brokerageIngestion.getBrokerageIngestionStatus,
      {},
    );
    expect(retryableIsNewest.latestFailedSync).toMatchObject({
      errorMessage: "Temporary service error",
      status: "failed_retryable",
    });
  });

  it("marks the open issue count as capped when more than 100 exist", async () => {
    const connectionId = await createConnection();
    const syncRunId = await beginActivitySyncRun(connectionId);
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index++) {
        await ctx.db.insert("brokerageReconciliationIssues", {
          connectionId,
          createdAt: index,
          issueType: "position_mismatch",
          message: `Issue ${index}`,
          ownerId,
          reportDate: "2026-05-14",
          severity: "warning",
          status: "open",
          syncRunId,
          updatedAt: index,
        });
      }
    });

    const status = await asUser().query(
      api.brokerageIngestion.getBrokerageIngestionStatus,
      {},
    );

    expect(status.hasMoreOpenIssues).toBe(true);
    expect(status.openIssueCount).toBe(100);
    expect(status.openIssues).toHaveLength(10);
    expect(status.openIssues[0]?.message).toBe("Issue 100");
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
      ownerId: "owner-a",
      queryId: "123456",
      syncRunId: first.syncRunId,
    });
  });

  it.each(["failed_retryable", "failed_terminal"] as const)(
    "requeues an existing %s sync run for a fresh attempt",
    async (status) => {
      const connectionId = await createConnection();
      const first = await t.mutation(
        internal.brokerageIngestion.beginSyncRunForConnection,
        {
          connectionId,
          reportDate: "2026-05-14",
          reportType: "activity",
        },
      );
      await t.run(async (ctx) => {
        await ctx.db.patch(first.syncRunId, {
          completedAt: Date.now(),
          errorMessage: "previous failure",
          referenceCode: "stale-reference",
          status,
        });
      });

      const retry = await t.mutation(
        internal.brokerageIngestion.beginSyncRunForConnection,
        {
          connectionId,
          reportDate: "2026-05-14",
          reportType: "activity",
        },
      );
      const syncRun = await t.run(async (ctx) => ctx.db.get(first.syncRunId));

      expect(retry).toEqual({
        created: true,
        ownerId,
        queryId: "123456",
        syncRunId: first.syncRunId,
      });
      expect(syncRun).toMatchObject({ status: "queued" });
      expect(syncRun).not.toHaveProperty("completedAt");
      expect(syncRun).not.toHaveProperty("errorMessage");
      expect(syncRun).not.toHaveProperty("referenceCode");
    },
  );

  it("force-requeues a succeeded sync run while the default path reuses it", async () => {
    const connectionId = await createConnection();
    const first = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );
    const storageId = await t.action(async (ctx) =>
      ctx.storage.store(new Blob(["old report"])),
    );
    const rawReportId = await t.mutation(
      internal.brokerageIngestion.storeRawReportReference,
      {
        byteLength: 10,
        contentHash: "old-hash",
        storageId,
        syncRunId: first.syncRunId,
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(first.syncRunId, {
        completedAt: Date.now(),
        importedTrades: 3,
        positionSnapshotCount: 4,
        reconciliationIssueCount: 5,
        referenceCode: "stale-reference",
        skippedDuplicateTrades: 6,
        status: "succeeded",
      });
    });

    await expect(
      t.mutation(internal.brokerageIngestion.beginSyncRunForConnection, {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      }),
    ).resolves.toMatchObject({ created: false, syncRunId: first.syncRunId });

    await expect(
      t.mutation(internal.brokerageIngestion.beginSyncRunForConnection, {
        connectionId,
        force: true,
        reportDate: "2026-05-14",
        reportType: "activity",
      }),
    ).resolves.toMatchObject({
      created: true,
      previousRawReportId: rawReportId,
      syncRunId: first.syncRunId,
    });
    const requeuedRun = await t.run(async (ctx) => ctx.db.get(first.syncRunId));
    expect(requeuedRun).toMatchObject({
      importedTrades: 0,
      positionSnapshotCount: 0,
      reconciliationIssueCount: 0,
      skippedDuplicateTrades: 0,
      status: "queued",
    });
    expect(requeuedRun).not.toHaveProperty("rawReportId");
    expect(requeuedRun).not.toHaveProperty("completedAt");
    expect(requeuedRun).not.toHaveProperty("referenceCode");
  });

  it.each([
    "queued",
    "requesting",
    "waiting_for_statement",
    "processing",
  ] as const)(
    "does not force-reclaim an in-progress %s sync run",
    async (status) => {
      const connectionId = await createConnection();
      const first = await t.mutation(
        internal.brokerageIngestion.beginSyncRunForConnection,
        {
          connectionId,
          reportDate: "2026-05-14",
          reportType: "activity",
        },
      );
      await t.run(async (ctx) => {
        await ctx.db.patch(first.syncRunId, { status });
      });

      await expect(
        t.mutation(internal.brokerageIngestion.beginSyncRunForConnection, {
          connectionId,
          force: true,
          reportDate: "2026-05-14",
          reportType: "activity",
        }),
      ).resolves.toMatchObject({ created: false, syncRunId: first.syncRunId });
      await expect(
        t.run(async (ctx) => ctx.db.get(first.syncRunId)),
      ).resolves.toMatchObject({ status });
    },
  );

  it("force-requeues a succeeded run and reactivates its errored connection", async () => {
    const connectionId = await createConnection();
    const first = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(first.syncRunId, {
        completedAt: Date.now(),
        status: "succeeded",
      });
      await ctx.db.patch(connectionId, {
        connectionError: "Earlier completeness failure",
        status: "error",
      });
    });

    await expect(
      t.mutation(internal.brokerageIngestion.beginSyncRunForConnection, {
        connectionId,
        force: true,
        reportDate: "2026-05-14",
        reportType: "activity",
      }),
    ).resolves.toMatchObject({ created: true, syncRunId: first.syncRunId });
    await expect(
      t.run(async (ctx) => ctx.db.get(connectionId)),
    ).resolves.toMatchObject({ status: "active" });
  });

  it("force-starts a new report date for an errored connection", async () => {
    const connectionId = await createConnection();
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, {
        connectionError: "Earlier report was incomplete",
        status: "error",
      });
    });

    await expect(
      t.mutation(internal.brokerageIngestion.beginSyncRunForConnection, {
        connectionId,
        force: true,
        reportDate: "2026-05-15",
        reportType: "activity",
      }),
    ).resolves.toMatchObject({ created: true, ownerId, queryId: "123456" });
    const state = await t.run(async (ctx) => ({
      connection: await ctx.db.get(connectionId),
      syncRuns: await ctx.db.query("brokerageSyncRuns").collect(),
    }));
    expect(state.connection).toMatchObject({ status: "active" });
    expect(state.connection).not.toHaveProperty("connectionError");
    expect(state.syncRuns).toHaveLength(1);
    expect(state.syncRuns[0]).toMatchObject({
      reportDate: "2026-05-15",
      status: "queued",
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
          rowKind: "currency" as const,
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

  it("ingests multiple brokerage accounts from one report under one connection", async () => {
    const connectionId = await createConnection();
    const syncRunId = await beginActivitySyncRun(connectionId);

    const result = await t.mutation(
      internal.brokerageIngestion.ingestParsedFlexReport,
      {
        cashSnapshots: [
          {
            brokerageAccountId: "U1111111",
            cash: 75,
            currency: "BASE_SUMMARY",
            reportDate: "2026-05-14",
            rowKind: "base_summary",
          },
          {
            brokerageAccountId: "U1111111",
            cash: -0.01,
            currency: "JPY",
            reportDate: "2026-05-14",
            rowKind: "currency",
          },
          {
            brokerageAccountId: "U1111111",
            cash: 75,
            currency: "USD",
            reportDate: "2026-05-14",
            rowKind: "currency",
          },
          {
            brokerageAccountId: "U2222222",
            cash: 725,
            currency: "BASE_SUMMARY",
            reportDate: "2026-05-14",
            rowKind: "base_summary",
          },
        ],
        positionSnapshots: [
          {
            assetType: "stock",
            brokerageAccountId: "U1111111",
            quantity: 1,
            reportDate: "2026-05-14",
            ticker: "AAPL",
          },
          {
            assetType: "stock",
            brokerageAccountId: "U2222222",
            quantity: 2,
            reportDate: "2026-05-14",
            ticker: "AAPL",
          },
        ],
        syncRunId,
        trades: [],
      },
    );
    const snapshots = await t.run(async (ctx) => ({
      cash: await ctx.db.query("brokerageCashSnapshots").collect(),
      positions: await ctx.db.query("brokeragePositionSnapshots").collect(),
    }));

    expect(result).toMatchObject({
      cashSnapshotsWritten: 4,
      positionSnapshotsWritten: 2,
    });
    expect(
      snapshots.cash.map((snapshot) => snapshot.brokerageAccountId).sort(),
    ).toEqual(["U1111111", "U1111111", "U1111111", "U2222222"]);
    expect(
      snapshots.cash.filter((snapshot) => snapshot.rowKind === "base_summary"),
    ).toHaveLength(2);
    expect(
      snapshots.cash.filter((snapshot) => snapshot.rowKind === "currency"),
    ).toHaveLength(2);
    expect(
      snapshots.positions.map((snapshot) => snapshot.brokerageAccountId).sort(),
    ).toEqual(["U1111111", "U2222222"]);
    expect(
      [...snapshots.cash, ...snapshots.positions].every(
        (snapshot) => snapshot.connectionId === connectionId,
      ),
    ).toBe(true);
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

  it("keeps one persistent discrepancy across report dates", async () => {
    const connectionId = await createConnection();
    const firstSyncRunId = await beginActivitySyncRun(
      connectionId,
      "2026-05-14",
    );
    await insertAcceptedTrade({ quantity: 10 });
    await ingestPositionSnapshots(
      firstSyncRunId,
      [{ quantity: 8 }],
      "2026-05-14",
    );
    const [firstIssue] = await listOpenReconciliationIssues();

    const secondSyncRunId = await beginActivitySyncRun(
      connectionId,
      "2026-05-15",
    );
    await ingestPositionSnapshots(
      secondSyncRunId,
      [{ quantity: 8 }],
      "2026-05-15",
    );

    const issues = await t.run(async (ctx) =>
      ctx.db.query("brokerageReconciliationIssues").collect(),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      _id: firstIssue?._id,
      issueType: "position_mismatch",
      reportDate: "2026-05-15",
      status: "open",
      syncRunId: secondSyncRunId,
    });
  });

  it("resolves an earlier missing position when it returns on a later date", async () => {
    const connectionId = await createConnection();
    const firstSyncRunId = await beginActivitySyncRun(
      connectionId,
      "2026-05-14",
    );
    await insertAcceptedTrade({ quantity: 10 });
    await ingestPositionSnapshots(firstSyncRunId, [], "2026-05-14");

    const secondSyncRunId = await beginActivitySyncRun(
      connectionId,
      "2026-05-15",
    );
    await ingestPositionSnapshots(
      secondSyncRunId,
      [{ quantity: 10 }],
      "2026-05-15",
    );

    const issues = await t.run(async (ctx) =>
      ctx.db.query("brokerageReconciliationIssues").collect(),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      issueType: "missing_brokerage_position",
      status: "resolved",
      syncRunId: secondSyncRunId,
    });
    expect(issues[0].resolvedAt).toEqual(expect.any(Number));
  });

  it("supersedes corrected issue types without clearing unrelated discrepancies", async () => {
    const connectionId = await createConnection();
    const firstSyncRunId = await beginActivitySyncRun(
      connectionId,
      "2026-05-14",
    );
    await insertAcceptedTrade({ quantity: 10, ticker: "AAPL" });
    await insertAcceptedTrade({ quantity: 5, ticker: "AA" });
    await ingestPositionSnapshots(firstSyncRunId, [], "2026-05-14");

    const secondSyncRunId = await beginActivitySyncRun(
      connectionId,
      "2026-05-15",
    );
    await ingestPositionSnapshots(
      secondSyncRunId,
      [{ quantity: 8, ticker: "AAPL" }],
      "2026-05-15",
    );

    const issues = await t.run(async (ctx) =>
      ctx.db.query("brokerageReconciliationIssues").collect(),
    );
    const openIssues = issues.filter((issue) => issue.status === "open");
    expect(openIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueType: "missing_brokerage_position",
          reportDate: "2026-05-15",
          ticker: "AA",
        }),
        expect.objectContaining({
          issueType: "position_mismatch",
          reportDate: "2026-05-15",
          ticker: "AAPL",
        }),
      ]),
    );
    expect(openIssues).toHaveLength(2);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueType: "missing_brokerage_position",
          status: "resolved",
          ticker: "AAPL",
        }),
      ]),
    );
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

    await expect(
      t.mutation(internal.brokerageIngestion.rollbackRawReportReference, {
        rawReportId,
        storageId,
        syncRunId,
      }),
    ).resolves.toBe(true);

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
          rowKind: "currency",
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
      cashSnapshots: [{ brokerageAccountId: "U1234567", rowKind: "currency" }],
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
    expect(() =>
      validateBrokerageIngestFlexReportBody({
        ...body,
        cashSnapshots: [{ ...body.cashSnapshots[0], rowKind: "aggregate" }],
      }),
    ).toThrow("cashSnapshots[0].rowKind must be one of");
  });
});
