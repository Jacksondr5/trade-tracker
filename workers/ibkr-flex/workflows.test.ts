import { WorkflowFailedError } from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IbkrFlexActivities } from "./activities";
import { ibkrFlexBrokerageSyncWorkflow } from "./workflows";

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
      pollAndIngestIbkrFlexStatement: async () => ({
        cashSnapshotsWritten: 1,
        importedTrades: 2,
        positionSnapshotsWritten: 3,
        skippedDuplicateTrades: 0,
        status: "ready",
      }),
      recordIbkrFlexReference: async () => undefined,
      resolvePriorBusinessDate: async () => "2026-05-14",
      sendIbkrFlexRequest: async () => ({ referenceCode: "ref-1" }),
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
