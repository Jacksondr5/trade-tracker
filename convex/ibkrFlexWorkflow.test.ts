// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import batchWorkerSchema from "../node_modules/@convex-dev/batch-worker/dist/component/schema.js";
import workflowSchema from "../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../node_modules/@convex-dev/workpool/dist/component/schema.js";
import { parseIbkrFlexActivityXml } from "../shared/brokerage/ibkr-flex/parser";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { encryptBrokerageToken } from "./brokerageSecrets";
import {
  reportCompletenessError,
  retainIncompleteReport,
  storeAndIngestReadyStatement,
} from "./ibkrFlexWorkflow";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

function normalizeComponentModules(
  packageModules: Record<string, () => Promise<unknown>>,
  packageName: "batch-worker" | "workflow" | "workpool",
): Record<string, () => Promise<unknown>> {
  return Object.fromEntries(
    Object.entries(packageModules).map(([path, loader]) => [
      path.replace(`../node_modules/@convex-dev/${packageName}/dist`, "."),
      loader,
    ]),
  );
}

const workflowModules = normalizeComponentModules(
  (import.meta as ImportMetaWithGlob).glob(
    "../node_modules/@convex-dev/workflow/dist/component/**/*.js",
  ),
  "workflow",
);
const workpoolModules = normalizeComponentModules(
  (import.meta as ImportMetaWithGlob).glob(
    "../node_modules/@convex-dev/workpool/dist/component/**/*.js",
  ),
  "workpool",
);
const batchWorkerModules = normalizeComponentModules(
  (import.meta as ImportMetaWithGlob).glob(
    "../node_modules/@convex-dev/batch-worker/dist/component/**/*.js",
  ),
  "batch-worker",
);

const readyXml = `
  <FlexQueryResponse>
    <FlexStatements>
      <FlexStatement accountId="U1234567" toDate="20260514">
        <Trades>
          <Trade accountId="U1234567" assetCategory="STK" symbol="AAPL" dateTime="20260514;093005" buySell="BUY" openCloseIndicator="O" quantity="10" tradePrice="189.50" ibExecID="exec-1" currency="USD" />
          <Order accountId="U1234567" assetCategory="STK" symbol="AAPL" dateTime="20260514;093005" buySell="BUY" openCloseIndicator="O" quantity="10" tradePrice="189.50" ibOrderID="order-1" currency="USD" />
        </Trades>
        <OpenPositions>
          <OpenPosition accountId="U1234567" assetCategory="STK" symbol="AAPL" position="10" positionValue="1895.00" currency="USD" />
        </OpenPositions>
        <CashReport>
          <CashReportCurrency accountId="U1234567" currency="USD" endingCash="12500.25" />
        </CashReport>
      </FlexStatement>
    </FlexStatements>
  </FlexQueryResponse>
`;

const multiAccountReadyXml = `
  <FlexQueryResponse>
    <FlexStatements count="2">
      <FlexStatement accountId="U1111111" toDate="20260514">
        <Trades></Trades>
        <OpenPositions></OpenPositions>
        <CashReport>
          <CashReportCurrency accountId="U1111111" currency="BASE_SUMMARY" endingCash="75.00" />
        </CashReport>
      </FlexStatement>
      <FlexStatement accountId="U2222222" toDate="20260514">
        <Trades>
          <AssetSummary accountId="U2222222" assetCategory="STK" symbol="" quantity="0" tradePrice="" currency="USD" />
          <Trade accountId="U2222222" assetCategory="STK" symbol="MSFT" dateTime="20260514;103012" buySell="SELL" openCloseIndicator="C" quantity="-2" tradePrice="420.00" ibExecID="exec-2" currency="USD" />
          <Order accountId="U2222222" assetCategory="STK" symbol="MSFT" dateTime="20260514;103012" buySell="SELL" openCloseIndicator="C" quantity="-2" tradePrice="420.00" ibOrderID="order-2" currency="USD" />
        </Trades>
        <OpenPositions>
          <OpenPosition accountId="U2222222" assetCategory="STK" symbol="MSFT" position="3" positionValue="1260.00" currency="USD" />
        </OpenPositions>
        <CashReport>
          <CashReportCurrency accountId="U2222222" currency="BASE_SUMMARY" endingCash="725.00" />
        </CashReport>
      </FlexStatement>
    </FlexStatements>
  </FlexQueryResponse>
`;

const requestedXml =
  "<FlexStatementResponse><Status>Success</Status><ReferenceCode>12345</ReferenceCode></FlexStatementResponse>";
const changedReadyXml = readyXml.replace(
  "<FlexStatements>",
  '<FlexStatements count="1">',
);
const encryptionKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function tokenAwareFlexFetch(
  reportForToken: (token: string) => string,
): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const token = url.searchParams.get("t");
    if (!token) throw new Error("Missing test Flex token");
    if (url.pathname.endsWith("/SendRequest")) {
      return new Response(
        `<FlexStatementResponse><Status>Success</Status><ReferenceCode>${token}</ReferenceCode></FlexStatementResponse>`,
      );
    }
    if (url.pathname.endsWith("/GetStatement")) {
      return new Response(reportForToken(token));
    }
    throw new Error(`Unexpected Flex URL: ${url}`);
  });
}

describe("IBKR Flex Convex workflow", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 4, 15, 5, 0, 0));
    process.env.BROKERAGE_TOKEN_ENCRYPTION_KEY = encryptionKey;
    t = convexTest(schema, modules);
    t.registerComponent("workflow", workflowSchema, workflowModules);
    t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
    t.registerComponent(
      "workflow/workpool/batchWorker",
      batchWorkerSchema,
      batchWorkerModules,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.BROKERAGE_TOKEN_ENCRYPTION_KEY;
    delete process.env.IBKR_FLEX_BASE_URL;
  });

  async function createConnection(
    ownerId = "owner-a",
    token: string | null = `${ownerId}-secret-token`,
    expectedAccountIds?: string[],
  ): Promise<Id<"brokerageConnections">> {
    const connectionId = await t.run(async (ctx) => {
      return await ctx.db.insert("brokerageConnections", {
        createdAt: Date.now(),
        expectedAccountIds,
        label: "IBKR Main",
        ownerId,
        queryId: "67890",
        source: "ibkr",
        status: "active",
        updatedAt: Date.now(),
      });
    });
    if (token) {
      const encrypted = await encryptBrokerageToken(token, {
        connectionId,
        ownerId,
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("brokerageConnectionSecrets", {
          ...encrypted,
          connectionId,
          ownerId,
          updatedAt: Date.now(),
        });
      });
    }
    return connectionId;
  }

  async function startWorkflow(
    maxPollAttempts = 1,
    force?: boolean,
    connectionId?: Id<"brokerageConnections">,
  ) {
    return await t.mutation(internal.ibkrFlexWorkflow.dailySync, {
      args: {
        ...(connectionId === undefined ? {} : { connectionId }),
        ...(force === undefined ? {} : { force }),
        initialPollIntervalMs: 1_000,
        maxPollAttempts,
        maxPollIntervalMs: 1_000,
        reportDate: "2026-05-14",
      },
      startAsync: true,
    });
  }

  async function finishWorkflow() {
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  }

  it("durably requests, retrieves, stores, ingests, and completes a report", async () => {
    await createConnection("owner-a", "owner-a-secret-token", ["U1234567"]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));
    vi.stubGlobal("fetch", fetchMock);

    const workflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: {
        connectionsPlanned: 1,
        reportDate: "2026-05-14",
        runsFailed: 0,
        runsSucceeded: 1,
        status: "succeeded",
      },
      type: "completed",
    });
    const state = await t.run(async (ctx) => ({
      cashSnapshots: await ctx.db.query("brokerageCashSnapshots").collect(),
      inboxTrades: await ctx.db.query("inboxTrades").collect(),
      positionSnapshots: await ctx.db
        .query("brokeragePositionSnapshots")
        .collect(),
      rawReports: await ctx.db.query("brokerageRawReports").collect(),
      syncRuns: await ctx.db.query("brokerageSyncRuns").collect(),
    }));
    expect(state.syncRuns).toHaveLength(1);
    expect(state.syncRuns[0]).toMatchObject({
      importedTrades: 1,
      referenceCode: "12345",
      skippedLogicalDuplicateTrades: 0,
      status: "succeeded",
    });
    expect(state.inboxTrades).toHaveLength(1);
    expect(state.positionSnapshots[0]).toMatchObject({ marketValue: 1895 });
    expect(state.cashSnapshots).toHaveLength(1);
    expect(state.cashSnapshots[0]).toMatchObject({ rowKind: "currency" });
    expect(state.rawReports).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("persists cross-scheme suppression visibility through the full Flex workflow", async () => {
    await createConnection("owner-a", "owner-a-secret-token", ["U1234567"]);
    const parsed = parseIbkrFlexActivityXml(readyXml);
    const flexTrade = parsed.trades[0]!;
    await t.run((ctx) =>
      ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: flexTrade.brokerageAccountId,
        date: flexTrade.date,
        direction: flexTrade.direction,
        externalId: `U1234567|AAPL|20260514;093005|${flexTrade.price}|${flexTrade.quantity}`,
        ownerId: "owner-a",
        price: flexTrade.price,
        quantity: flexTrade.quantity,
        side: flexTrade.side,
        source: "ibkr",
        ticker: flexTrade.ticker,
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(requestedXml))
        .mockResolvedValueOnce(new Response(readyXml)),
    );

    await startWorkflow();
    await finishWorkflow();
    const state = await t.run(async (ctx) => ({
      inboxTrades: await ctx.db.query("inboxTrades").collect(),
      syncRuns: await ctx.db.query("brokerageSyncRuns").collect(),
    }));

    expect(state.syncRuns).toHaveLength(1);
    expect(state.syncRuns[0]).toMatchObject({
      importedTrades: 0,
      skippedDuplicateTrades: 1,
      skippedLogicalDuplicateTrades: 1,
      status: "succeeded",
    });
    expect(state.inboxTrades).toHaveLength(0);
  });

  it("skips completeness validation when expected accounts are unset", async () => {
    await createConnection();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(requestedXml))
        .mockResolvedValueOnce(new Response(readyXml)),
    );

    const workflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: { runsFailed: 0, runsSucceeded: 1, status: "succeeded" },
      type: "completed",
    });
  });

  it("compares expected and reported account IDs case-insensitively", () => {
    expect(
      reportCompletenessError({
        expectedAccountIds: [" u1234567 "],
        reportAccountIds: ["U1234567"],
      }),
    ).toBeUndefined();
    expect(
      reportCompletenessError({
        expectedAccountIds: ["u7654321"],
        reportAccountIds: ["U1234567"],
      }),
    ).toBe(
      "Report is missing expected account(s): u7654321. Report contained: U1234567.",
    );
  });

  it("retains the raw report but skips ingestion and reconciliation when an expected account is missing", async () => {
    const connectionId = await createConnection(
      "owner-a",
      "owner-a-secret-token",
      ["U1234567", "U7654321"],
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: "U7654321",
        date: Date.UTC(2026, 4, 14, 16),
        direction: "long",
        ownerId: "owner-a",
        price: 100,
        quantity: 19,
        side: "buy",
        source: "ibkr",
        ticker: "MSFT",
      });
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(requestedXml))
        .mockResolvedValueOnce(new Response(readyXml)),
    );

    const workflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: { runsFailed: 1, runsSucceeded: 0, status: "failed" },
      type: "completed",
    });
    const state = await t.run(async (ctx) => ({
      cashSnapshots: await ctx.db.query("brokerageCashSnapshots").collect(),
      connection: await ctx.db.get(connectionId),
      inboxTrades: await ctx.db.query("inboxTrades").collect(),
      positionSnapshots: await ctx.db
        .query("brokeragePositionSnapshots")
        .collect(),
      rawReports: await ctx.db.query("brokerageRawReports").collect(),
      reconciliationIssues: await ctx.db
        .query("brokerageReconciliationIssues")
        .collect(),
      syncRuns: await ctx.db.query("brokerageSyncRuns").collect(),
    }));
    expect(state.syncRuns).toHaveLength(1);
    expect(state.syncRuns[0]).toMatchObject({
      errorMessage:
        "Report is missing expected account(s): U7654321. Report contained: U1234567.",
      importedTrades: 0,
      positionSnapshotCount: 0,
      reconciliationIssueCount: 0,
      status: "failed_terminal",
    });
    expect(state.connection).toMatchObject({ status: "active" });
    expect(state.inboxTrades).toEqual([]);
    expect(state.positionSnapshots).toEqual([]);
    expect(state.cashSnapshots).toEqual([]);
    expect(state.reconciliationIssues).toEqual([]);
    expect(state.rawReports).toHaveLength(1);
    expect(state.rawReports[0]).toMatchObject({
      byteLength: new TextEncoder().encode(readyXml).byteLength,
      syncRunId: state.syncRuns[0]?._id,
    });
    expect(state.rawReports[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps completeness failures terminal when raw-report storage also fails", async () => {
    const connectionId = await createConnection();
    const { syncRunId } = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );

    const result = await t.action(async (ctx) =>
      retainIncompleteReport(
        ctx,
        {
          completenessError:
            "Report is missing expected account(s): U7654321. Report contained: U1234567.",
          rawXml: readyXml,
          reusedPreviousRawReport: false,
          syncRunId,
          token: "redacted-token",
        },
        async () => {
          throw new Error("storage unavailable");
        },
      ),
    );

    expect(result).toEqual({
      errorMessage:
        "Report is missing expected account(s): U7654321. Report contained: U1234567. Raw report storage failed: storage unavailable",
      status: "terminal_error",
    });
  });

  it("accepts a multi-account report when every expected account is present", async () => {
    await createConnection("owner-a", "owner-a-secret-token", [
      "U1111111",
      "U2222222",
    ]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(requestedXml))
        .mockResolvedValueOnce(new Response(multiAccountReadyXml)),
    );

    const workflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: { runsFailed: 0, runsSucceeded: 1, status: "succeeded" },
      type: "completed",
    });
    const state = await t.run(async (ctx) => ({
      cashSnapshots: await ctx.db.query("brokerageCashSnapshots").collect(),
      inboxTrades: await ctx.db.query("inboxTrades").collect(),
      positionSnapshots: await ctx.db
        .query("brokeragePositionSnapshots")
        .collect(),
      syncRuns: await ctx.db.query("brokerageSyncRuns").collect(),
    }));
    expect(state.inboxTrades).toHaveLength(1);
    expect(state.inboxTrades[0]?.validationWarnings).toEqual([]);
    expect(state.positionSnapshots).toHaveLength(1);
    expect(state.cashSnapshots).toHaveLength(2);
    expect(state.syncRuns[0]?.warnings).toEqual([
      "No OpenPositions section found",
    ]);
  });

  it("never persists the plaintext token in workflow arguments or step results", async () => {
    const plaintextToken = "journal-regression-secret-token";
    await createConnection("owner-a", plaintextToken);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(requestedXml))
        .mockResolvedValueOnce(new Response(readyXml)),
    );

    await startWorkflow();
    await finishWorkflow();

    const workflows = await t.query(components.workflow.workflow.list, {
      order: "asc",
      paginationOpts: { cursor: null, numItems: 100 },
    });
    expect(workflows.page.length).toBeGreaterThan(0);
    const steps = await Promise.all(
      workflows.page.map((entry) =>
        t.query(components.workflow.workflow.listSteps, {
          order: "asc",
          paginationOpts: { cursor: null, numItems: 100 },
          workflowId: entry.workflowId,
        }),
      ),
    );

    expect(steps.flatMap((entry) => entry.page).length).toBeGreaterThan(0);
    expect(JSON.stringify({ steps, workflows })).not.toContain(plaintextToken);
  });

  it("joins an existing sync run without issuing a duplicate Flex request", async () => {
    await createConnection();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));
    vi.stubGlobal("fetch", fetchMock);

    const firstWorkflowId = await startWorkflow(24);
    const duplicateWorkflowId = await startWorkflow(24);
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, {
        workflowId: firstWorkflowId,
      }),
    ).resolves.toMatchObject({
      result: { runsFailed: 0, runsSucceeded: 1, status: "succeeded" },
      type: "completed",
    });
    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, {
        workflowId: duplicateWorkflowId,
      }),
    ).resolves.toMatchObject({
      result: { runsFailed: 0, runsSucceeded: 1, status: "succeeded" },
      type: "completed",
    });
    const syncRuns = await t.run(async (ctx) =>
      ctx.db.query("brokerageSyncRuns").collect(),
    );
    expect(syncRuns).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds a stranded in-flight join by the caller poll budget", async () => {
    const connectionId = await createConnection();
    const { syncRunId } = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const workflowId = await startWorkflow(1);
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: { runsFailed: 1, runsSucceeded: 0, status: "failed" },
      type: "completed",
    });
    await expect(
      t.run(async (ctx) => ctx.db.get(syncRunId)),
    ).resolves.toMatchObject({ status: "queued" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the run retryable after transient request retries are exhausted", async () => {
    await createConnection();
    const fetchMock = vi.fn().mockRejectedValue(new Error("temporary outage"));
    vi.stubGlobal("fetch", fetchMock);

    const workflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: { runsFailed: 1, status: "failed" },
      type: "completed",
    });
    const [syncRun] = await t.run(async (ctx) =>
      ctx.db.query("brokerageSyncRuns").collect(),
    );
    expect(syncRun).toMatchObject({
      errorMessage: "temporary outage",
      status: "failed_retryable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a failed-retryable run without creating a duplicate run", async () => {
    await createConnection();
    const fetchMock = vi.fn().mockRejectedValue(new Error("temporary outage"));
    vi.stubGlobal("fetch", fetchMock);

    await startWorkflow();
    await finishWorkflow();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));

    const retryWorkflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, {
        workflowId: retryWorkflowId,
      }),
    ).resolves.toMatchObject({
      result: { runsFailed: 0, runsSucceeded: 1, status: "succeeded" },
      type: "completed",
    });
    const syncRuns = await t.run(async (ctx) =>
      ctx.db.query("brokerageSyncRuns").collect(),
    );
    expect(syncRuns).toHaveLength(1);
    expect(syncRuns[0]).toMatchObject({ status: "succeeded" });
    expect(syncRuns[0]).not.toHaveProperty("errorMessage");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses an identical raw report on a non-forced retryable requeue", async () => {
    await createConnection("owner-a", "owner-a-secret-token", ["U1234567"]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));
    vi.stubGlobal("fetch", fetchMock);

    await startWorkflow();
    await finishWorkflow();
    const [firstRun] = await t.run(async (ctx) =>
      ctx.db.query("brokerageSyncRuns").collect(),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(firstRun!._id, {
        completedAt: Date.now(),
        errorMessage: "Retry after a downstream interruption",
        status: "failed_retryable",
      });
    });

    fetchMock
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));
    const retryWorkflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, {
        workflowId: retryWorkflowId,
      }),
    ).resolves.toMatchObject({
      result: { runsFailed: 0, runsSucceeded: 1, status: "succeeded" },
      type: "completed",
    });
    const state = await t.run(async (ctx) => ({
      cashSnapshots: await ctx.db.query("brokerageCashSnapshots").collect(),
      inboxTrades: await ctx.db.query("inboxTrades").collect(),
      positionSnapshots: await ctx.db
        .query("brokeragePositionSnapshots")
        .collect(),
      rawReports: await ctx.db.query("brokerageRawReports").collect(),
      syncRuns: await ctx.db.query("brokerageSyncRuns").collect(),
    }));
    expect(state.syncRuns).toHaveLength(1);
    expect(state.syncRuns[0]).toMatchObject({
      importedTrades: 0,
      positionSnapshotCount: 0,
      skippedDuplicateTrades: 1,
      status: "succeeded",
    });
    expect(state.syncRuns[0]?.rawReportId).toBe(state.rawReports[0]?._id);
    expect(state.rawReports).toHaveLength(1);
    expect(state.inboxTrades).toHaveLength(1);
    expect(state.positionSnapshots).toHaveLength(1);
    expect(state.cashSnapshots).toHaveLength(1);
  });

  it("force-reruns a succeeded date and repoints the audit artifact without duplicating state", async () => {
    const connectionId = await createConnection(
      "owner-a",
      "owner-a-secret-token",
      ["U1234567"],
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));
    vi.stubGlobal("fetch", fetchMock);

    await startWorkflow();
    await finishWorkflow();
    const firstState = await t.run(async (ctx) => ({
      issueIds: (
        await ctx.db.query("brokerageReconciliationIssues").collect()
      ).map((issue) => issue._id),
      rawReports: await ctx.db.query("brokerageRawReports").collect(),
    }));
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, {
        connectionError: "Earlier completeness failure",
        status: "error",
      });
    });

    fetchMock
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(changedReadyXml));
    const forcedWorkflowId = await startWorkflow(1, true);
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, {
        workflowId: forcedWorkflowId,
      }),
    ).resolves.toMatchObject({
      result: { runsFailed: 0, runsSucceeded: 1, status: "succeeded" },
      type: "completed",
    });
    const state = await t.run(async (ctx) => ({
      cashSnapshots: await ctx.db.query("brokerageCashSnapshots").collect(),
      inboxTrades: await ctx.db.query("inboxTrades").collect(),
      positionSnapshots: await ctx.db
        .query("brokeragePositionSnapshots")
        .collect(),
      rawReports: await ctx.db.query("brokerageRawReports").collect(),
      reconciliationIssues: await ctx.db
        .query("brokerageReconciliationIssues")
        .collect(),
      syncRuns: await ctx.db.query("brokerageSyncRuns").collect(),
      connection: await ctx.db.get(connectionId),
    }));
    expect(state.syncRuns).toHaveLength(1);
    expect(state.syncRuns[0]).toMatchObject({
      importedTrades: 0,
      positionSnapshotCount: 0,
      skippedDuplicateTrades: 1,
      status: "succeeded",
    });
    expect(state.connection).toMatchObject({ status: "active" });
    expect(state.inboxTrades).toHaveLength(1);
    expect(state.positionSnapshots).toHaveLength(1);
    expect(state.cashSnapshots).toHaveLength(1);
    expect(state.rawReports).toHaveLength(2);
    const currentRawReport = state.rawReports.find(
      (rawReport) => rawReport._id === state.syncRuns[0]?.rawReportId,
    );
    expect(currentRawReport).toMatchObject({
      byteLength: new TextEncoder().encode(changedReadyXml).byteLength,
    });
    expect(currentRawReport?.contentHash).not.toBe(
      firstState.rawReports[0]?.contentHash,
    );
    expect(state.reconciliationIssues.map((issue) => issue._id)).toEqual(
      firstState.issueIds,
    );
    expect(state.reconciliationIssues).toHaveLength(firstState.issueIds.length);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("clears prior outcome counters when a forced requeue fails completeness", async () => {
    const connectionId = await createConnection(
      "owner-a",
      "owner-a-secret-token",
      ["U1234567"],
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));
    vi.stubGlobal("fetch", fetchMock);

    await startWorkflow();
    await finishWorkflow();
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, {
        expectedAccountIds: ["U1234567", "U7654321"],
      });
    });
    fetchMock
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(changedReadyXml));

    const workflowId = await startWorkflow(1, true, connectionId);
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: { runsFailed: 1, runsSucceeded: 0, status: "failed" },
      type: "completed",
    });
    const [syncRun] = await t.run(async (ctx) =>
      ctx.db.query("brokerageSyncRuns").collect(),
    );
    expect(syncRun).toMatchObject({
      errorMessage:
        "Report is missing expected account(s): U7654321. Report contained: U1234567.",
      importedTrades: 0,
      positionSnapshotCount: 0,
      reconciliationIssueCount: 0,
      skippedDuplicateTrades: 0,
      status: "failed_terminal",
    });
  });

  it("scopes force recovery to one connection and preserves sibling state", async () => {
    const targetConnectionId = await createConnection(
      "owner-a",
      "target-token",
      ["U1234567"],
    );
    const siblingConnectionId = await createConnection(
      "owner-a",
      "sibling-token",
      ["U1234567"],
    );
    let changedTargetReport = false;
    const fetchMock = tokenAwareFlexFetch((token) =>
      token === "target-token" && changedTargetReport
        ? changedReadyXml
        : readyXml,
    );
    vi.stubGlobal("fetch", fetchMock);

    await startWorkflow();
    await finishWorkflow();
    const before = await t.run(async (ctx) => {
      const siblingRun = (
        await ctx.db.query("brokerageSyncRuns").collect()
      ).find((run) => run.connectionId === siblingConnectionId);
      return { siblingRun };
    });
    expect(before.siblingRun).toMatchObject({ status: "succeeded" });

    const unrelatedErrorConnectionId = await createConnection(
      "owner-a",
      "unrelated-error-token",
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(targetConnectionId, {
        connectionError: "Target needs recovery",
        status: "error",
      });
      await ctx.db.patch(unrelatedErrorConnectionId, {
        connectionError: "Unrelated failure",
        status: "error",
      });
    });
    changedTargetReport = true;
    fetchMock.mockClear();

    const workflowId = await startWorkflow(1, true, targetConnectionId);
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: {
        connectionsPlanned: 1,
        runsFailed: 0,
        runsSucceeded: 1,
        status: "succeeded",
      },
      type: "completed",
    });
    const after = await t.run(async (ctx) => {
      const syncRuns = await ctx.db.query("brokerageSyncRuns").collect();
      return {
        siblingConnection: await ctx.db.get(siblingConnectionId),
        siblingRun: syncRuns.find(
          (run) => run.connectionId === siblingConnectionId,
        ),
        targetConnection: await ctx.db.get(targetConnectionId),
        unrelatedErrorConnection: await ctx.db.get(unrelatedErrorConnectionId),
      };
    });
    expect(after.siblingRun).toEqual(before.siblingRun);
    expect(after.siblingConnection).toMatchObject({ status: "active" });
    expect(after.targetConnection).toMatchObject({ status: "active" });
    expect(after.unrelatedErrorConnection).toMatchObject({
      connectionError: "Unrelated failure",
      status: "error",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([input]) =>
        String(input).includes("t=target-token"),
      ),
    ).toBe(true);
  });

  it("preserves date-wide force behavior when connection scope is omitted", async () => {
    const firstConnectionId = await createConnection("owner-a", "first-token", [
      "U1234567",
    ]);
    const secondConnectionId = await createConnection(
      "owner-a",
      "second-token",
      ["U1234567"],
    );
    let changedReports = false;
    const fetchMock = tokenAwareFlexFetch(() =>
      changedReports ? changedReadyXml : readyXml,
    );
    vi.stubGlobal("fetch", fetchMock);

    await startWorkflow();
    await finishWorkflow();
    const beforeRawReportIds = await t.run(async (ctx) =>
      Object.fromEntries(
        (await ctx.db.query("brokerageSyncRuns").collect()).map((run) => [
          run.connectionId,
          run.rawReportId,
        ]),
      ),
    );
    changedReports = true;
    fetchMock.mockClear();

    const workflowId = await startWorkflow(1, true);
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: {
        connectionsPlanned: 2,
        runsFailed: 0,
        runsSucceeded: 2,
        status: "succeeded",
      },
      type: "completed",
    });
    const runs = await t.run(async (ctx) =>
      ctx.db.query("brokerageSyncRuns").collect(),
    );
    expect(runs).toHaveLength(2);
    for (const connectionId of [firstConnectionId, secondConnectionId]) {
      const run = runs.find(
        (candidate) => candidate.connectionId === connectionId,
      );
      expect(run).toMatchObject({ status: "succeeded" });
      expect(run?.rawReportId).not.toBe(beforeRawReportIds[connectionId]);
    }
    const forcedTokens = fetchMock.mock.calls.map(([input]) =>
      new URL(String(input)).searchParams.get("t"),
    );
    expect(new Set(forcedTokens)).toEqual(
      new Set(["first-token", "second-token"]),
    );
  });

  it("fails visibly when a scoped connection is not eligible", async () => {
    const connectionId = await createConnection();
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, { status: "paused" });
    });

    const workflowId = await startWorkflow(1, true, connectionId);
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      error: expect.stringContaining(
        `No eligible IBKR connection matched ${connectionId}`,
      ),
      type: "failed",
    });
  });

  it("rejects an operator-scoped connection ID that does not resolve", async () => {
    const connectionId = await createConnection();
    await t.run(async (ctx) => {
      await ctx.db.delete(connectionId);
    });

    await expect(
      t.mutation(internal.ibkrFlexWorkflow.startManualSync, {
        connectionId,
        force: true,
        reportDate: "2026-05-14",
      }),
    ).rejects.toThrow(`IBKR connection ${connectionId} was not found.`);
  });

  it("keeps scheduled sync skip-if-succeeded behavior unchanged", async () => {
    const connectionId = await createConnection("owner-a", "scheduled-token", [
      "U1234567",
    ]);
    const { syncRunId } = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(syncRunId, {
        completedAt: Date.now(),
        status: "succeeded",
      });
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      t.mutation(internal.ibkrFlexWorkflow.dispatchNightlySync, {}),
    ).resolves.toEqual({ delayMs: 0, reportDate: "2026-05-14" });
    await finishWorkflow();

    const state = await t.run(async (ctx) => ({
      connection: await ctx.db.get(connectionId),
      syncRuns: await ctx.db.query("brokerageSyncRuns").collect(),
    }));
    expect(state.syncRuns).toHaveLength(1);
    expect(state.syncRuns[0]).toMatchObject({
      _id: syncRunId,
      status: "succeeded",
    });
    expect(state.connection).toMatchObject({ status: "active" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces an identical cached report instead of succeeding a forced re-sync", async () => {
    await createConnection("owner-a", "owner-a-secret-token", ["U1234567"]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));
    vi.stubGlobal("fetch", fetchMock);

    await startWorkflow();
    await finishWorkflow();

    fetchMock
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));
    const forcedWorkflowId = await startWorkflow(1, true);
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, {
        workflowId: forcedWorkflowId,
      }),
    ).resolves.toMatchObject({
      result: { runsFailed: 1, runsSucceeded: 0, status: "failed" },
      type: "completed",
    });
    const state = await t.run(async (ctx) => ({
      cashSnapshots: await ctx.db.query("brokerageCashSnapshots").collect(),
      inboxTrades: await ctx.db.query("inboxTrades").collect(),
      positionSnapshots: await ctx.db
        .query("brokeragePositionSnapshots")
        .collect(),
      rawReports: await ctx.db.query("brokerageRawReports").collect(),
      reconciliationIssues: await ctx.db
        .query("brokerageReconciliationIssues")
        .collect(),
      syncRuns: await ctx.db.query("brokerageSyncRuns").collect(),
    }));
    expect(state.syncRuns).toHaveLength(1);
    expect(state.syncRuns[0]).toMatchObject({
      errorMessage:
        "Forced re-sync returned an identical report (IBKR served a cached statement). Regenerate it by editing the Flex query, or wait for the reporting period to roll over.",
      importedTrades: 0,
      positionSnapshotCount: 0,
      reconciliationIssueCount: 0,
      skippedDuplicateTrades: 0,
      status: "failed_terminal",
    });
    expect(state.inboxTrades).toHaveLength(1);
    expect(state.positionSnapshots).toHaveLength(1);
    expect(state.cashSnapshots).toHaveLength(1);
    expect(state.rawReports).toHaveLength(1);
    expect(state.syncRuns[0]?.rawReportId).toBe(state.rawReports[0]?._id);
    expect(state.reconciliationIssues).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("removes the raw report reference and blob when ingestion fails", async () => {
    const connectionId = await createConnection();
    const { syncRunId } = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        queryId: "67890",
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );
    const parseResult = parseIbkrFlexActivityXml(readyXml);
    let storedStorageId: Id<"_storage"> | undefined;

    await expect(
      t.action(async (ctx) => {
        return await storeAndIngestReadyStatement(
          ctx,
          {
            parseResult,
            rawXml: readyXml,
            syncRunId,
            token: "deployment-secret-token",
          },
          async (_ctx, _args, storedRawReport) => {
            storedStorageId = storedRawReport.storageId;
            throw new Error("forced ingestion failure");
          },
        );
      }),
    ).rejects.toThrow("forced ingestion failure");

    const state = await t.run(async (ctx) => ({
      rawReports: await ctx.db.query("brokerageRawReports").collect(),
      syncRun: await ctx.db.get(syncRunId),
    }));
    expect(state.rawReports).toEqual([]);
    expect(state.syncRun?.rawReportId).toBeUndefined();
    expect(storedStorageId).toBeDefined();
    await expect(
      t.action(async (ctx) => await ctx.storage.get(storedStorageId!)),
    ).resolves.toBeNull();
  });

  it("retains the raw-report blob when reference rollback fails", async () => {
    const connectionId = await createConnection();
    const { syncRunId } = await t.mutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId,
        queryId: "67890",
        reportDate: "2026-05-14",
        reportType: "activity",
      },
    );
    const parseResult = parseIbkrFlexActivityXml(readyXml);
    let storedStorageId: Id<"_storage"> | undefined;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      t.action(async (ctx) => {
        return await storeAndIngestReadyStatement(
          ctx,
          {
            parseResult,
            rawXml: readyXml,
            syncRunId,
            token: "deployment-secret-token",
          },
          async (_ctx, _args, storedRawReport) => {
            storedStorageId = storedRawReport.storageId;
            throw new Error("forced ingestion failure");
          },
          async () => {
            throw new Error("forced rollback failure");
          },
        );
      }),
    ).rejects.toThrow("forced ingestion failure");

    const state = await t.run(async (ctx) => ({
      rawReports: await ctx.db.query("brokerageRawReports").collect(),
      syncRun: await ctx.db.get(syncRunId),
    }));
    expect(state.rawReports).toHaveLength(1);
    expect(state.syncRun?.rawReportId).toBe(state.rawReports[0]?._id);
    expect(storedStorageId).toBeDefined();
    await expect(
      t.action(
        async (ctx) => (await ctx.storage.get(storedStorageId!)) !== null,
      ),
    ).resolves.toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      "IBKR Flex raw report rollback failed",
      "forced rollback failure",
    );
  });

  it("marks the run retryable when the report misses its polling cutoff", async () => {
    await createConnection();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(requestedXml))
        .mockResolvedValueOnce(
          new Response(
            "<FlexStatementResponse><ErrorCode>1019</ErrorCode><ErrorMessage>Statement generation in progress</ErrorMessage></FlexStatementResponse>",
          ),
        ),
    );

    const workflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: { runsFailed: 1, status: "failed" },
      type: "completed",
    });
    const [syncRun] = await t.run(async (ctx) =>
      ctx.db.query("brokerageSyncRuns").collect(),
    );
    expect(syncRun).toMatchObject({
      errorMessage: "IBKR Flex statement was not ready after 1 poll attempts",
      status: "failed_retryable",
    });
  });

  it("fails terminally without making a request when no secret is stored", async () => {
    await createConnection("owner-a", null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const workflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: { runsFailed: 1, status: "failed" },
      type: "completed",
    });
    const state = await t.run(async (ctx) => ({
      connection: (await ctx.db.query("brokerageConnections").collect())[0],
      syncRun: (await ctx.db.query("brokerageSyncRuns").collect())[0],
    }));
    expect(state.syncRun).toMatchObject({
      errorMessage: "No IBKR credential is configured for this connection.",
      status: "failed_terminal",
    });
    expect(state.connection).toMatchObject({
      connectionError: "No IBKR credential is configured for this connection.",
      status: "active",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the encryption key is not configured", async () => {
    await createConnection();
    delete process.env.BROKERAGE_TOKEN_ENCRYPTION_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const workflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, { workflowId }),
    ).resolves.toMatchObject({
      result: { runsFailed: 1, status: "failed" },
      type: "completed",
    });
    const state = await t.run(async (ctx) => ({
      connection: (await ctx.db.query("brokerageConnections").collect())[0],
      syncRun: (await ctx.db.query("brokerageSyncRuns").collect())[0],
    }));
    expect(state.syncRun).toMatchObject({
      errorMessage:
        "Brokerage token encryption key version 1 is not configured",
      status: "failed_terminal",
    });
    expect(state.connection).toMatchObject({
      connectionError:
        "Brokerage token encryption key version 1 is not configured",
      status: "active",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a terminally failed run after credential configuration is fixed", async () => {
    const connectionId = await createConnection("owner-a", null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await startWorkflow();
    await finishWorkflow();
    expect(fetchMock).not.toHaveBeenCalled();

    const encrypted = await encryptBrokerageToken("replacement-token", {
      connectionId,
      ownerId: "owner-a",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("brokerageConnectionSecrets", {
        ...encrypted,
        connectionId,
        ownerId: "owner-a",
        updatedAt: Date.now(),
      });
      await ctx.db.patch(connectionId, { status: "active" });
    });
    fetchMock
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));

    const retryWorkflowId = await startWorkflow();
    await finishWorkflow();

    await expect(
      t.query(internal.ibkrFlexWorkflow.getWorkflowStatus, {
        workflowId: retryWorkflowId,
      }),
    ).resolves.toMatchObject({
      result: { runsFailed: 0, runsSucceeded: 1, status: "succeeded" },
      type: "completed",
    });
    const state = await t.run(async (ctx) => ({
      connection: await ctx.db.get(connectionId),
      syncRuns: await ctx.db.query("brokerageSyncRuns").collect(),
    }));
    expect(state.syncRuns).toHaveLength(1);
    expect(state.syncRuns[0]).toMatchObject({ status: "succeeded" });
    expect(state.syncRuns[0]).not.toHaveProperty("errorMessage");
    expect(state.connection).toMatchObject({
      status: "active",
    });
    expect(state.connection).not.toHaveProperty("connectionError");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the credential stored for each connection owner", async () => {
    const ownerAConnectionId = await createConnection("owner-a", "token-a");
    const ownerBConnectionId = await createConnection("owner-b", "token-b");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(requestedXml);
    });
    vi.stubGlobal("fetch", fetchMock);

    await t.action(internal.ibkrFlexWorkflow.sendRequest, {
      connectionId: ownerAConnectionId,
      ownerId: "owner-a",
      queryId: "111",
    });
    await t.action(internal.ibkrFlexWorkflow.sendRequest, {
      connectionId: ownerBConnectionId,
      ownerId: "owner-b",
      queryId: "222",
    });

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([
      expect.stringContaining("t=token-a"),
      expect.stringContaining("t=token-b"),
    ]);
  });

  it("fails terminally when the owner does not match the connection", async () => {
    const connectionId = await createConnection("owner-a", "token-a");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await t.action(internal.ibkrFlexWorkflow.sendRequest, {
      connectionId,
      ownerId: "owner-b",
      queryId: "111",
    });

    expect(result).toMatchObject({
      errorMessage: "No IBKR credential is configured for this connection.",
      status: "terminal_error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
