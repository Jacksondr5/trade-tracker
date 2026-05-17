// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isBrokerageIngestionRequestAuthorized } from "./http";
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
    expect(second).toEqual({ created: false, syncRunId: first.syncRunId });
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
});
