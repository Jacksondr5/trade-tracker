// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import batchWorkerSchema from "../node_modules/@convex-dev/batch-worker/dist/component/schema.js";
import workflowSchema from "../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../node_modules/@convex-dev/workpool/dist/component/schema.js";
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

function normalizeComponentModules(
  packageModules: Record<string, () => Promise<unknown>>,
  packageName: "workflow" | "workpool",
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
const batchWorkerModules = Object.fromEntries(
  Object.entries(
    (import.meta as ImportMetaWithGlob).glob(
      "../node_modules/@convex-dev/batch-worker/dist/component/**/*.js",
    ),
  ).map(([path, loader]) => [
    path.replace("../node_modules/@convex-dev/batch-worker/dist", "."),
    loader,
  ]),
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
    delete process.env.IBKR_FLEX_BASE_URL;
  });

  async function createConnection(): Promise<Id<"brokerageConnections">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("brokerageConnections", {
        accountId: "U1234567",
        createdAt: Date.now(),
        label: "IBKR Main",
        ownerId: "owner-a",
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
    expect(state.rawReports).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
});
