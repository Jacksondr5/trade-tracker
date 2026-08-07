// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import batchWorkerSchema from "../node_modules/@convex-dev/batch-worker/dist/component/schema.js";
import workflowSchema from "../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../node_modules/@convex-dev/workpool/dist/component/schema.js";
import { parseIbkrFlexActivityXml } from "../shared/brokerage/ibkr-flex/parser";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { storeAndIngestReadyStatement } from "./ibkrFlexWorkflow";
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

const requestedXml =
  "<FlexStatementResponse><Status>Success</Status><ReferenceCode>12345</ReferenceCode></FlexStatementResponse>";

describe("IBKR Flex Convex workflow", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 4, 15, 5, 0, 0));
    process.env.IBKR_FLEX_TOKEN = "deployment-secret-token";
    process.env.IBKR_FLEX_TOKEN_OWNER_ID = "owner-a";
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
    delete process.env.IBKR_FLEX_TOKEN;
    delete process.env.IBKR_FLEX_TOKEN_OWNER_ID;
    delete process.env.IBKR_FLEX_BASE_URL;
  });

  async function createConnection(
    ownerId = "owner-a",
  ): Promise<Id<"brokerageConnections">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("brokerageConnections", {
        accountId: "U1234567",
        createdAt: Date.now(),
        label: "IBKR Main",
        ownerId,
        queryId: "67890",
        source: "ibkr",
        status: "active",
        tokenLabel: "convex-env",
        updatedAt: Date.now(),
      });
    });
  }

  async function startWorkflow(maxPollAttempts = 1) {
    return await t.mutation(internal.ibkrFlexWorkflow.dailySync, {
      args: {
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
    await createConnection();
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
      status: "succeeded",
    });
    expect(state.inboxTrades).toHaveLength(1);
    expect(state.positionSnapshots[0]).toMatchObject({ marketValue: 1895 });
    expect(state.cashSnapshots).toHaveLength(1);
    expect(state.cashSnapshots[0]).toMatchObject({ rowKind: "currency" });
    expect(state.rawReports).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("joins an existing sync run without issuing a duplicate Flex request", async () => {
    await createConnection();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(requestedXml))
      .mockResolvedValueOnce(new Response(readyXml));
    vi.stubGlobal("fetch", fetchMock);

    const firstWorkflowId = await startWorkflow();
    const duplicateWorkflowId = await startWorkflow();
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

  it("fails terminally without making a request when the deployment secret is absent", async () => {
    await createConnection();
    delete process.env.IBKR_FLEX_TOKEN;
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
        "IBKR Flex token is not configured in the Convex deployment environment",
      status: "failed_terminal",
    });
    expect(state.connection).toMatchObject({
      connectionError:
        "IBKR Flex token is not configured in the Convex deployment environment",
      status: "error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the deployment credential owner is not configured", async () => {
    await createConnection();
    delete process.env.IBKR_FLEX_TOKEN_OWNER_ID;
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
        "IBKR Flex credential owner is not configured in the Convex deployment environment",
      status: "failed_terminal",
    });
    expect(state.connection).toMatchObject({
      connectionError:
        "IBKR Flex credential owner is not configured in the Convex deployment environment",
      status: "error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not use the deployment credential for a different owner", async () => {
    await createConnection("owner-b");
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
      status: "error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
