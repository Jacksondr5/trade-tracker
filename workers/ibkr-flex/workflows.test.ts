import { WorkflowFailedError } from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IbkrFlexActivities } from "./activities";
import {
  ibkrFlexBrokerageSyncWorkflow,
  marketDataDateWorkflow,
} from "./workflows";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

describe("ibkrFlexBrokerageSyncWorkflow", () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  async function runWorkflow(args: {
    activities: IbkrFlexActivities;
    workflowId: string;
  }) {
    const taskQueue = `${args.workflowId}-queue`;
    const worker = await Worker.create({
      activities: args.activities,
      connection: testEnv.nativeConnection,
      taskQueue,
      workflowsPath,
    });
    return await worker.runUntil(async () => {
      return await testEnv.client.workflow.execute(
        ibkrFlexBrokerageSyncWorkflow,
        {
          args: [
            {
              connectionId: "connection-1",
              initialPollIntervalMs: 1_000,
              maxPollAttempts: 3,
              queryId: "query-1",
              reportDate: "2026-05-14",
            },
          ],
          taskQueue,
          workflowId: args.workflowId,
        },
      );
    });
  }

  function baseActivities(
    overrides: Partial<IbkrFlexActivities> = {},
  ): IbkrFlexActivities {
    return {
      beginBrokerageSyncRun: async () => ({
        created: true,
        queryId: "query-1",
        syncRunId: "sync-run-1",
      }),
      listDueIbkrConnections: async () => [],
      markBrokerageSyncFailed: async () => undefined,
      markBrokerageSyncSucceeded: async () => undefined,
      markBrokerageSyncWaiting: async () => undefined,
      completeMarketDataRun: async () => ({ status: "succeeded" }),
      fetchMarketPrice: async (input) => ({
        close: 100,
        date: input.date,
        provider: input.provider,
        providerSymbol: input.providerSymbol,
        status: "ok",
      }),
      planMarketDataJobs: async () => ({
        providerJobs: [],
        trackedPriceMarksWritten: 0,
      }),
      pollAndIngestIbkrFlexStatement: async () => ({
        cashSnapshotsWritten: 1,
        importedTrades: 2,
        positionSnapshotsWritten: 3,
        skippedDuplicateTrades: 0,
        status: "ready",
      }),
      prepareMarketDataRefresh: async () => ({
        marketDataRunId: "market-data-run-1",
        shouldRun: true,
      }),
      recordIbkrFlexReference: async () => undefined,
      resolvePriorBusinessDate: async () => "2026-05-14",
      sendIbkrFlexRequest: async () => ({ referenceCode: "ref-1" }),
      writeMarketDataResults: async (input) => ({
        processedResults: input.results.map((result) => ({
          provider: result.provider,
          providerSymbol: result.providerSymbol,
          status: result.status,
        })),
        snapshotsWritten: input.results.length,
        symbolsFailed: input.results.filter((result) => result.status !== "ok")
          .length,
        symbolsSucceeded: input.results.filter(
          (result) => result.status === "ok",
        ).length,
      }),
      ...overrides,
    };
  }

  it("ingests a ready statement and marks the run succeeded", async () => {
    const calls: string[] = [];
    const result = await runWorkflow({
      activities: baseActivities({
        markBrokerageSyncSucceeded: async () => {
          calls.push("succeeded");
        },
      }),
      workflowId: "ibkr-ready",
    });

    expect(result).toMatchObject({
      attempts: 1,
      cashSnapshotsWritten: 1,
      importedTrades: 2,
      positionSnapshotsWritten: 3,
      status: "succeeded",
    });
    expect(calls).toEqual(["succeeded"]);
  });

  it("treats report not ready as durable waiting state", async () => {
    let pollCount = 0;
    const waitingCalls: string[] = [];
    const result = await runWorkflow({
      activities: baseActivities({
        markBrokerageSyncWaiting: async () => {
          waitingCalls.push("waiting");
        },
        pollAndIngestIbkrFlexStatement: async () => {
          pollCount += 1;
          if (pollCount === 1) {
            return {
              message: "statement is being prepared",
              status: "not_ready",
            };
          }
          return {
            cashSnapshotsWritten: 0,
            importedTrades: 1,
            positionSnapshotsWritten: 1,
            skippedDuplicateTrades: 0,
            status: "ready",
          };
        },
      }),
      workflowId: "ibkr-delayed-ready",
    });

    expect(result).toMatchObject({ attempts: 2, status: "succeeded" });
    expect(waitingCalls).toEqual(["waiting"]);
  });

  it("marks invalid token or query failures as terminal", async () => {
    const failures: string[] = [];
    await expect(
      runWorkflow({
        activities: baseActivities({
          markBrokerageSyncFailed: async (input) => {
            failures.push(`${input.failureType}:${input.errorMessage}`);
          },
          pollAndIngestIbkrFlexStatement: async () => ({
            errorCode: "1012",
            errorMessage: "Invalid token",
            status: "terminal_error",
          }),
        }),
        workflowId: "ibkr-terminal",
      }),
    ).rejects.toBeInstanceOf(WorkflowFailedError);

    expect(failures).toEqual(["terminal:1012: Invalid token"]);
  });

  it("returns timed_out when max poll attempts are exhausted", async () => {
    const failures: { errorMessage: string; failureType: string }[] = [];
    const result = await runWorkflow({
      activities: baseActivities({
        markBrokerageSyncFailed: async (input) => {
          failures.push({
            errorMessage: input.errorMessage,
            failureType: input.failureType,
          });
        },
        pollAndIngestIbkrFlexStatement: async () => ({
          message: "statement is being prepared",
          status: "not_ready",
        }),
      }),
      workflowId: "ibkr-timed-out",
    });

    expect(result.status).toBe("timed_out");
    expect(result.attempts).toBe(3);
    expect(failures).toHaveLength(1);
    expect(failures[0].failureType).toBe("retryable");
  });

  it("retries transient activity failures before succeeding", async () => {
    let attempts = 0;
    const result = await runWorkflow({
      activities: baseActivities({
        pollAndIngestIbkrFlexStatement: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary IBKR outage");
          return {
            cashSnapshotsWritten: 1,
            importedTrades: 1,
            positionSnapshotsWritten: 1,
            skippedDuplicateTrades: 0,
            status: "ready",
          };
        },
      }),
      workflowId: "ibkr-retryable",
    });

    expect(attempts).toBe(2);
    expect(result.status).toBe("succeeded");
  });
});

describe("marketDataDateWorkflow", () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  async function runMarketDataWorkflow(args: {
    activities: IbkrFlexActivities;
    workflowId: string;
  }) {
    const taskQueue = `${args.workflowId}-queue`;
    const worker = await Worker.create({
      activities: args.activities,
      connection: testEnv.nativeConnection,
      taskQueue,
      workflowsPath,
    });
    return await worker.runUntil(async () => {
      return await testEnv.client.workflow.execute(marketDataDateWorkflow, {
        args: [
          {
            budgetCredits: 2,
            date: "2026-05-14",
            force: true,
            ownerId: "owner-1",
            pipelineDateRunId: "date-run-1",
            pipelineRunId: "pipeline-run-1",
          },
        ],
        taskQueue,
        workflowId: args.workflowId,
      });
    });
  }

  function marketActivities(
    overrides: Partial<IbkrFlexActivities> = {},
  ): IbkrFlexActivities {
    return {
      beginBrokerageSyncRun: async () => ({
        created: true,
        queryId: "query-1",
        syncRunId: "sync-run-1",
      }),
      listDueIbkrConnections: async () => [],
      markBrokerageSyncFailed: async () => undefined,
      markBrokerageSyncSucceeded: async () => undefined,
      markBrokerageSyncWaiting: async () => undefined,
      completeMarketDataRun: async (input) => ({
        status:
          input.symbolsFailed === 0
            ? "succeeded"
            : input.symbolsSucceeded === 0
              ? "failed"
              : "partial",
      }),
      fetchMarketPrice: async (input) => ({
        close: input.providerSymbol === "AAPL" ? 190 : 420,
        date: input.date,
        provider: input.provider,
        providerSymbol: input.providerSymbol,
        status: "ok",
      }),
      planMarketDataJobs: async () => ({
        providerJobs: [
          {
            assetType: "stock",
            estimatedCredits: 1,
            provider: "twelve_data",
            providerSymbol: "AAPL",
            symbol: "AAPL",
          },
          {
            assetType: "stock",
            estimatedCredits: 1,
            provider: "twelve_data",
            providerSymbol: "MSFT",
            symbol: "MSFT",
          },
        ],
        trackedPriceMarksWritten: 1,
      }),
      pollAndIngestIbkrFlexStatement: async () => ({
        cashSnapshotsWritten: 0,
        importedTrades: 0,
        positionSnapshotsWritten: 0,
        skippedDuplicateTrades: 0,
        status: "ready",
      }),
      prepareMarketDataRefresh: async () => ({
        marketDataRunId: "market-data-run-1",
        shouldRun: true,
      }),
      recordIbkrFlexReference: async () => undefined,
      resolvePriorBusinessDate: async () => "2026-05-14",
      sendIbkrFlexRequest: async () => ({ referenceCode: "ref-1" }),
      writeMarketDataResults: async (input) => ({
        processedResults: input.results.map((result) => ({
          provider: result.provider,
          providerSymbol: result.providerSymbol,
          status: result.status,
        })),
        snapshotsWritten: input.results.length,
        symbolsFailed: input.results.filter((result) => result.status !== "ok")
          .length,
        symbolsSucceeded: input.results.filter(
          (result) => result.status === "ok",
        ).length,
      }),
      ...overrides,
    };
  }

  it("refreshes market prices for one explicit date", async () => {
    const result = await runMarketDataWorkflow({
      activities: marketActivities(),
      workflowId: "market-data-success",
    });

    expect(result).toEqual({
      marketDataRunId: "market-data-run-1",
      status: "succeeded",
      symbolsFailed: 0,
      symbolsRequested: 2,
      symbolsSucceeded: 2,
      trackedPriceMarksWritten: 1,
    });
  });

  it("stores missing prices as partial coverage instead of failing the workflow", async () => {
    const result = await runMarketDataWorkflow({
      activities: marketActivities({
        fetchMarketPrice: async (input) =>
          input.providerSymbol === "MSFT"
            ? {
                date: input.date,
                errorMessage: "No daily close returned for MSFT",
                provider: input.provider,
                providerSymbol: input.providerSymbol,
                status: "missing",
              }
            : {
                close: 190,
                date: input.date,
                provider: input.provider,
                providerSymbol: input.providerSymbol,
                status: "ok",
              },
      }),
      workflowId: "market-data-partial",
    });

    expect(result).toMatchObject({
      status: "partial",
      symbolsFailed: 1,
      symbolsRequested: 2,
      symbolsSucceeded: 1,
    });
  });

  it("reruns idempotently against the same date and provider symbols", async () => {
    const snapshotKeys = new Set<string>();
    const activities = marketActivities({
      writeMarketDataResults: async (input) => {
        for (const result of input.results) {
          snapshotKeys.add(
            `${result.provider}:${result.providerSymbol}:${result.date}`,
          );
        }
        return {
          processedResults: input.results.map((result) => ({
            provider: result.provider,
            providerSymbol: result.providerSymbol,
            status: result.status,
          })),
          snapshotsWritten: input.results.length,
          symbolsFailed: 0,
          symbolsSucceeded: input.results.length,
        };
      },
    });

    const first = await runMarketDataWorkflow({
      activities,
      workflowId: "market-data-idempotent-1",
    });
    const second = await runMarketDataWorkflow({
      activities,
      workflowId: "market-data-idempotent-2",
    });

    expect(first.status).toBe("succeeded");
    expect(second.status).toBe("succeeded");
    expect(snapshotKeys).toEqual(
      new Set(["twelve_data:AAPL:2026-05-14", "twelve_data:MSFT:2026-05-14"]),
    );
  });

  it("counts symbols idempotently when write responses include duplicate processed results", async () => {
    const result = await runMarketDataWorkflow({
      activities: marketActivities({
        writeMarketDataResults: async (input) => ({
          processedResults: input.results.flatMap((entry) => [
            {
              provider: entry.provider,
              providerSymbol: entry.providerSymbol,
              status: entry.status,
            },
            {
              provider: entry.provider,
              providerSymbol: entry.providerSymbol,
              status: entry.status,
            },
          ]),
          snapshotsWritten: input.results.length,
          symbolsFailed: 0,
          symbolsSucceeded: input.results.length * 2,
        }),
      }),
      workflowId: "market-data-idempotent-counts",
    });

    expect(result).toMatchObject({
      symbolsFailed: 0,
      symbolsRequested: 2,
      symbolsSucceeded: 2,
    });
  });

  it("finalizes run before surfacing processing errors", async () => {
    let completionCalls = 0;
    const completedWith: Array<{ failed: number; succeeded: number }> = [];

    await expect(
      runMarketDataWorkflow({
        activities: marketActivities({
          completeMarketDataRun: async (input) => {
            completionCalls += 1;
            completedWith.push({
              failed: input.symbolsFailed,
              succeeded: input.symbolsSucceeded,
            });
            return { status: "failed" };
          },
          fetchMarketPrice: async (input) => {
            if (input.providerSymbol === "MSFT") {
              throw new Error("provider timeout");
            }
            return {
              close: 190,
              date: input.date,
              provider: input.provider,
              providerSymbol: input.providerSymbol,
              status: "ok",
            };
          },
        }),
        workflowId: "market-data-finalize-on-error",
      }),
    ).rejects.toBeInstanceOf(WorkflowFailedError);

    expect(completionCalls).toBe(1);
    expect(completedWith).toEqual([{ failed: 0, succeeded: 0 }]);
  });
});
