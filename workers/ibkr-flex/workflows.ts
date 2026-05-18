import {
  ApplicationFailure,
  executeChild,
  proxyActivities,
  sleep,
} from "@temporalio/workflow";
import type { IbkrFlexActivities } from "./activities";
import type {
  BrokerageSyncReportType,
  DailyIbkrFlexBrokerageSyncWorkflowInput,
  DailyIbkrFlexBrokerageSyncWorkflowOutput,
  IbkrFlexBrokerageSyncWorkflowInput,
  IbkrFlexBrokerageSyncWorkflowOutput,
} from "./types";

const {
  beginBrokerageSyncRun,
  listDueIbkrConnections,
  markBrokerageSyncFailed,
  markBrokerageSyncSucceeded,
  markBrokerageSyncWaiting,
  pollAndIngestIbkrFlexStatement,
  recordIbkrFlexReference,
  resolvePriorBusinessDate,
  sendIbkrFlexRequest,
} = proxyActivities<IbkrFlexActivities>({
  retry: {
    initialInterval: "10 seconds",
    maximumAttempts: 3,
  },
  startToCloseTimeout: "2 minutes",
});

function pollDelayMs(args: {
  attempt: number;
  initialPollIntervalMs: number;
  maxPollIntervalMs: number;
}): number {
  return Math.min(
    args.maxPollIntervalMs,
    args.initialPollIntervalMs * 2 ** Math.max(0, args.attempt - 1),
  );
}

function nonRetryable(message: string): ApplicationFailure {
  return ApplicationFailure.nonRetryable(message, "IbkrFlexTerminalFailure");
}

export async function dailyIbkrFlexBrokerageSyncWorkflow(
  input: DailyIbkrFlexBrokerageSyncWorkflowInput = {},
): Promise<DailyIbkrFlexBrokerageSyncWorkflowOutput> {
  const reportDate = input.reportDate ?? (await resolvePriorBusinessDate());
  const connections = await listDueIbkrConnections();
  const results = await Promise.all(
    connections.map(async (connection) => {
      try {
        await executeChild(ibkrFlexBrokerageSyncWorkflow, {
          args: [
            {
              connectionId: connection._id,
              queryId: connection.queryId,
              reportDate,
              reportType: "activity",
            },
          ],
          workflowId: `ibkr-flex:${connection._id}:activity:${reportDate}`,
        });
        return "succeeded" as const;
      } catch {
        return "failed" as const;
      }
    }),
  );
  const runsSucceeded = results.filter(
    (result) => result === "succeeded",
  ).length;
  const runsFailed = results.length - runsSucceeded;
  return {
    connectionsPlanned: connections.length,
    reportDate,
    runsFailed,
    runsSucceeded,
    status:
      runsFailed === 0
        ? "succeeded"
        : runsSucceeded === 0
          ? "failed"
          : "partial",
  };
}

export async function ibkrFlexBrokerageSyncWorkflow(
  input: IbkrFlexBrokerageSyncWorkflowInput,
): Promise<IbkrFlexBrokerageSyncWorkflowOutput> {
  const reportType: BrokerageSyncReportType = input.reportType ?? "activity";
  const maxPollAttempts = input.maxPollAttempts ?? 24;
  const initialPollIntervalMs = input.initialPollIntervalMs ?? 60_000;
  const maxPollIntervalMs = input.maxPollIntervalMs ?? 15 * 60_000;

  const syncRun = await beginBrokerageSyncRun({
    connectionId: input.connectionId,
    queryId: input.queryId,
    reportDate: input.reportDate,
    reportType,
  });
  const queryId = input.queryId ?? syncRun.queryId;
  if (!queryId) {
    await markBrokerageSyncFailed({
      errorMessage: "IBKR query ID is required",
      failureType: "terminal",
      syncRunId: syncRun.syncRunId,
    });
    throw nonRetryable("IBKR query ID is required");
  }

  try {
    const { referenceCode } = await sendIbkrFlexRequest({
      queryId,
      reportDate: input.reportDate,
      reportType,
      syncRunId: syncRun.syncRunId,
    });
    await recordIbkrFlexReference({
      referenceCode,
      syncRunId: syncRun.syncRunId,
    });

    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
      const statement = await pollAndIngestIbkrFlexStatement({
        referenceCode,
        syncRunId: syncRun.syncRunId,
      });

      if (statement.status === "ready") {
        await markBrokerageSyncSucceeded(syncRun.syncRunId);
        return {
          attempts: attempt,
          cashSnapshotsWritten: statement.cashSnapshotsWritten,
          importedTrades: statement.importedTrades,
          positionSnapshotsWritten: statement.positionSnapshotsWritten,
          skippedDuplicateTrades: statement.skippedDuplicateTrades,
          status: "succeeded",
          syncRunId: syncRun.syncRunId,
        };
      }

      if (statement.status === "terminal_error") {
        const message = statement.errorCode
          ? `${statement.errorCode}: ${statement.errorMessage}`
          : statement.errorMessage;
        await markBrokerageSyncFailed({
          errorMessage: message,
          failureType: "terminal",
          syncRunId: syncRun.syncRunId,
        });
        throw nonRetryable(message);
      }

      await markBrokerageSyncWaiting(syncRun.syncRunId);
      if (attempt < maxPollAttempts) {
        await sleep(
          pollDelayMs({ attempt, initialPollIntervalMs, maxPollIntervalMs }),
        );
      }
    }

    const message = `IBKR Flex statement was not ready after ${maxPollAttempts} poll attempts`;
    await markBrokerageSyncFailed({
      errorMessage: message,
      failureType: "retryable",
      syncRunId: syncRun.syncRunId,
    });
    return {
      attempts: maxPollAttempts,
      cashSnapshotsWritten: 0,
      importedTrades: 0,
      positionSnapshotsWritten: 0,
      skippedDuplicateTrades: 0,
      status: "timed_out",
      syncRunId: syncRun.syncRunId,
    };
  } catch (error) {
    if (error instanceof ApplicationFailure && error.nonRetryable) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    await markBrokerageSyncFailed({
      errorMessage: message,
      failureType: "retryable",
      syncRunId: syncRun.syncRunId,
    });
    throw error;
  }
}
