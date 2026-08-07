import {
  getStatus,
  WorkflowManager,
  start,
  type WorkflowId,
  vWorkflowId,
} from "@convex-dev/workflow";
import { v } from "convex/values";
import { internal, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  IbkrFlexClient,
  IbkrFlexTerminalError,
} from "../shared/brokerage/ibkr-flex/client";
import { parseIbkrFlexActivityXml } from "../shared/brokerage/ibkr-flex/parser";
import {
  getIbkrPollDelayMs,
  getNightlyKickoffDelayMs,
  getPriorBusinessDate,
} from "./lib/ibkrSchedule";

const DEFAULT_MAX_POLL_ATTEMPTS = 24;
const DEFAULT_INITIAL_POLL_INTERVAL_MS = 60_000;
const DEFAULT_MAX_POLL_INTERVAL_MS = 15 * 60_000;
const MAX_OPERATIONAL_ERROR_LENGTH = 1_000;

const actionRetry = {
  base: 2,
  initialBackoffMs: 10_000,
  maxAttempts: 3,
} as const;

const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: actionRetry,
    maxParallelism: 4,
    retryActionsByDefault: false,
  },
});

const terminalErrorValidator = v.object({
  errorMessage: v.string(),
  status: v.literal("terminal_error"),
});

const sendRequestResultValidator = v.union(
  v.object({
    referenceCode: v.string(),
    status: v.literal("requested"),
  }),
  terminalErrorValidator,
);

const pollResultValidator = v.union(
  v.object({
    message: v.optional(v.string()),
    status: v.literal("not_ready"),
  }),
  terminalErrorValidator,
  v.object({
    cashSnapshotsWritten: v.number(),
    importedTrades: v.number(),
    positionSnapshotsWritten: v.number(),
    skippedDuplicateTrades: v.number(),
    status: v.literal("ready"),
  }),
);

const connectionWorkflowResultValidator = v.object({
  attempts: v.number(),
  cashSnapshotsWritten: v.number(),
  importedTrades: v.number(),
  positionSnapshotsWritten: v.number(),
  skippedDuplicateTrades: v.number(),
  status: v.union(
    v.literal("succeeded"),
    v.literal("timed_out"),
    v.literal("failed_retryable"),
    v.literal("failed_terminal"),
  ),
  syncRunId: v.id("brokerageSyncRuns"),
});

const dailyWorkflowResultValidator = v.object({
  connectionsPlanned: v.number(),
  reportDate: v.string(),
  runsFailed: v.number(),
  runsSucceeded: v.number(),
  status: v.union(
    v.literal("succeeded"),
    v.literal("partial"),
    v.literal("failed"),
  ),
});

const workflowStatusValidator = v.union(
  v.object({ type: v.literal("canceled") }),
  v.object({ result: v.any(), type: v.literal("completed") }),
  v.object({ error: v.string(), type: v.literal("failed") }),
  v.object({ running: v.array(v.any()), type: v.literal("inProgress") }),
);

type ConnectionWorkflowResult = {
  attempts: number;
  cashSnapshotsWritten: number;
  importedTrades: number;
  positionSnapshotsWritten: number;
  skippedDuplicateTrades: number;
  status: "succeeded" | "timed_out" | "failed_retryable" | "failed_terminal";
  syncRunId: Id<"brokerageSyncRuns">;
};

type DailyWorkflowResult = {
  connectionsPlanned: number;
  reportDate: string;
  runsFailed: number;
  runsSucceeded: number;
  status: "succeeded" | "partial" | "failed";
};

type ActionConfig =
  | { baseUrl?: string; status: "ready"; token: string }
  | { errorMessage: string; status: "terminal_error" };

function getActionConfig(
  env: Record<string, string | undefined> = process.env,
): ActionConfig {
  const token = env.IBKR_FLEX_TOKEN?.trim();
  if (!token) {
    return {
      errorMessage:
        "IBKR Flex token is not configured in the Convex deployment environment",
      status: "terminal_error",
    };
  }

  const configuredBaseUrl = env.IBKR_FLEX_BASE_URL?.trim();
  if (!configuredBaseUrl) return { status: "ready", token };
  try {
    const url = new URL(configuredBaseUrl);
    if (url.protocol !== "https:") {
      return {
        errorMessage: "IBKR Flex base URL must use HTTPS",
        status: "terminal_error",
      };
    }
    return {
      baseUrl: configuredBaseUrl.replace(/\/+$/, ""),
      status: "ready",
      token,
    };
  } catch {
    return {
      errorMessage: "IBKR Flex base URL is invalid",
      status: "terminal_error",
    };
  }
}

function operationalErrorMessage(error: unknown, token?: string): string {
  const original = error instanceof Error ? error.message : String(error);
  const redacted = token ? original.replaceAll(token, "[REDACTED]") : original;
  return redacted.slice(0, MAX_OPERATIONAL_ERROR_LENGTH);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const sendRequest = internalAction({
  args: { queryId: v.string() },
  returns: sendRequestResultValidator,
  handler: async (_ctx, args) => {
    const config = getActionConfig();
    if (config.status === "terminal_error") return config;
    const client = new IbkrFlexClient(config);
    try {
      const result = await client.sendRequest({ queryId: args.queryId });
      return { ...result, status: "requested" as const };
    } catch (error) {
      const errorMessage = operationalErrorMessage(error, config.token);
      if (error instanceof IbkrFlexTerminalError) {
        return { errorMessage, status: "terminal_error" as const };
      }
      throw new Error(errorMessage);
    }
  },
});

export const pollAndIngestStatement = internalAction({
  args: {
    referenceCode: v.string(),
    syncRunId: v.id("brokerageSyncRuns"),
  },
  returns: pollResultValidator,
  handler: async (ctx, args) => {
    const config = getActionConfig();
    if (config.status === "terminal_error") return config;
    const client = new IbkrFlexClient(config);

    let statement;
    try {
      statement = await client.getStatement(args.referenceCode);
    } catch (error) {
      throw new Error(operationalErrorMessage(error, config.token));
    }
    if (statement.status !== "ready") {
      if (statement.status === "terminal_error") {
        return {
          errorMessage: operationalErrorMessage(
            statement.errorCode
              ? `${statement.errorCode}: ${statement.errorMessage}`
              : statement.errorMessage,
            config.token,
          ),
          status: "terminal_error" as const,
        };
      }
      return statement;
    }

    const parseResult = parseIbkrFlexActivityXml(statement.rawXml);
    if (parseResult.errors.length > 0) {
      return {
        errorMessage:
          `IBKR Flex report could not be parsed: ${parseResult.errors.join("; ")}`.slice(
            0,
            MAX_OPERATIONAL_ERROR_LENGTH,
          ),
        status: "terminal_error" as const,
      };
    }

    const contentHash = await sha256Hex(statement.rawXml);
    const byteLength = new TextEncoder().encode(statement.rawXml).byteLength;
    let storageId: Id<"_storage"> | undefined;
    let rawReportId: Id<"brokerageRawReports"> | undefined;
    try {
      storageId = await ctx.storage.store(
        new Blob([statement.rawXml], { type: "application/xml" }),
      );
      rawReportId = await ctx.runMutation(
        internal.brokerageIngestion.storeRawReportReference,
        {
          byteLength,
          contentHash,
          storageId,
          syncRunId: args.syncRunId,
        },
      );
      const result: {
        cashSnapshotsWritten: number;
        importedTrades: number;
        positionSnapshotsWritten: number;
        skippedDuplicateTrades: number;
      } = await ctx.runMutation(
        internal.brokerageIngestion.ingestParsedFlexReport,
        {
          cashSnapshots: parseResult.cashSnapshots,
          errors: parseResult.errors,
          positionSnapshots: parseResult.positionSnapshots,
          syncRunId: args.syncRunId,
          trades: parseResult.trades,
          warnings: parseResult.warnings,
        },
      );
      return { ...result, status: "ready" as const };
    } catch (error) {
      if (storageId && rawReportId) {
        try {
          await ctx.runMutation(
            internal.brokerageIngestion.rollbackRawReportReference,
            { rawReportId, storageId, syncRunId: args.syncRunId },
          );
        } catch {}
      }
      if (storageId) {
        try {
          await ctx.storage.delete(storageId);
        } catch {}
      }
      throw new Error(operationalErrorMessage(error, config.token));
    }
  },
});

export const syncConnection = workflow
  .define({
    args: {
      connectionId: v.id("brokerageConnections"),
      initialPollIntervalMs: v.optional(v.number()),
      maxPollAttempts: v.optional(v.number()),
      maxPollIntervalMs: v.optional(v.number()),
      queryId: v.optional(v.string()),
      reportDate: v.string(),
      reportType: v.optional(v.literal("activity")),
    },
    returns: connectionWorkflowResultValidator,
  })
  .handler(async (step, args): Promise<ConnectionWorkflowResult> => {
    const reportType = args.reportType ?? "activity";
    const maxPollAttempts = Math.max(
      1,
      args.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
    );
    const initialPollIntervalMs = Math.max(
      0,
      args.initialPollIntervalMs ?? DEFAULT_INITIAL_POLL_INTERVAL_MS,
    );
    const maxPollIntervalMs = Math.max(
      initialPollIntervalMs,
      args.maxPollIntervalMs ?? DEFAULT_MAX_POLL_INTERVAL_MS,
    );
    const syncRun: {
      created: boolean;
      queryId: string;
      syncRunId: Id<"brokerageSyncRuns">;
    } = await step.runMutation(
      internal.brokerageIngestion.beginSyncRunForConnection,
      {
        connectionId: args.connectionId,
        reportDate: args.reportDate,
        reportType,
        ...(args.queryId === undefined ? {} : { queryId: args.queryId }),
      },
      { name: "begin brokerage sync run" },
    );

    let request;
    try {
      request = await step.runAction(
        internal.ibkrFlexWorkflow.sendRequest,
        { queryId: syncRun.queryId },
        { name: "send IBKR Flex request", retry: actionRetry },
      );
    } catch (error) {
      const errorMessage = operationalErrorMessage(error);
      await step.runMutation(
        internal.brokerageIngestion.markSyncRunFailed,
        {
          errorMessage,
          failureType: "retryable",
          syncRunId: syncRun.syncRunId,
        },
        { name: "record retryable request failure", unstableArgs: true },
      );
      return {
        attempts: 0,
        cashSnapshotsWritten: 0,
        importedTrades: 0,
        positionSnapshotsWritten: 0,
        skippedDuplicateTrades: 0,
        status: "failed_retryable",
        syncRunId: syncRun.syncRunId,
      };
    }

    if (request.status === "terminal_error") {
      await step.runMutation(
        internal.brokerageIngestion.markSyncRunFailed,
        {
          errorMessage: request.errorMessage,
          failureType: "terminal",
          syncRunId: syncRun.syncRunId,
        },
        { name: "record terminal request failure" },
      );
      return {
        attempts: 0,
        cashSnapshotsWritten: 0,
        importedTrades: 0,
        positionSnapshotsWritten: 0,
        skippedDuplicateTrades: 0,
        status: "failed_terminal",
        syncRunId: syncRun.syncRunId,
      };
    }

    await step.runMutation(
      internal.brokerageIngestion.markSyncRunRequested,
      {
        referenceCode: request.referenceCode,
        syncRunId: syncRun.syncRunId,
      },
      { name: "record IBKR Flex reference" },
    );

    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
      let statement;
      try {
        statement = await step.runAction(
          internal.ibkrFlexWorkflow.pollAndIngestStatement,
          {
            referenceCode: request.referenceCode,
            syncRunId: syncRun.syncRunId,
          },
          { name: `poll IBKR Flex statement ${attempt}`, retry: actionRetry },
        );
      } catch (error) {
        const errorMessage = operationalErrorMessage(error);
        await step.runMutation(
          internal.brokerageIngestion.markSyncRunFailed,
          {
            errorMessage,
            failureType: "retryable",
            syncRunId: syncRun.syncRunId,
          },
          { name: "record retryable polling failure", unstableArgs: true },
        );
        return {
          attempts: attempt,
          cashSnapshotsWritten: 0,
          importedTrades: 0,
          positionSnapshotsWritten: 0,
          skippedDuplicateTrades: 0,
          status: "failed_retryable",
          syncRunId: syncRun.syncRunId,
        };
      }

      if (statement.status === "ready") {
        await step.runMutation(
          internal.brokerageIngestion.markSyncRunSucceeded,
          { syncRunId: syncRun.syncRunId },
          { name: "complete brokerage sync run" },
        );
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
        await step.runMutation(
          internal.brokerageIngestion.markSyncRunFailed,
          {
            errorMessage: statement.errorMessage,
            failureType: "terminal",
            syncRunId: syncRun.syncRunId,
          },
          { name: "record terminal polling failure" },
        );
        return {
          attempts: attempt,
          cashSnapshotsWritten: 0,
          importedTrades: 0,
          positionSnapshotsWritten: 0,
          skippedDuplicateTrades: 0,
          status: "failed_terminal",
          syncRunId: syncRun.syncRunId,
        };
      }

      await step.runMutation(
        internal.brokerageIngestion.markSyncRunWaiting,
        { syncRunId: syncRun.syncRunId },
        { name: `record statement wait ${attempt}` },
      );
      if (attempt < maxPollAttempts) {
        await step.sleep(
          getIbkrPollDelayMs({
            attempt,
            initialPollIntervalMs,
            maxPollIntervalMs,
          }),
          { name: `IBKR Flex poll backoff ${attempt}` },
        );
      }
    }

    const errorMessage = `IBKR Flex statement was not ready after ${maxPollAttempts} poll attempts`;
    await step.runMutation(
      internal.brokerageIngestion.markSyncRunFailed,
      {
        errorMessage,
        failureType: "retryable",
        syncRunId: syncRun.syncRunId,
      },
      { name: "record polling cutoff" },
    );
    return {
      attempts: maxPollAttempts,
      cashSnapshotsWritten: 0,
      importedTrades: 0,
      positionSnapshotsWritten: 0,
      skippedDuplicateTrades: 0,
      status: "timed_out",
      syncRunId: syncRun.syncRunId,
    };
  });

export const dailySync = workflow
  .define({
    args: {
      initialPollIntervalMs: v.optional(v.number()),
      maxPollAttempts: v.optional(v.number()),
      maxPollIntervalMs: v.optional(v.number()),
      reportDate: v.string(),
    },
    returns: dailyWorkflowResultValidator,
  })
  .handler(async (step, args): Promise<DailyWorkflowResult> => {
    const connections: Array<{
      _id: Id<"brokerageConnections">;
      ownerId: string;
      queryId: string;
      source: "ibkr";
    }> = await step.runQuery(
      internal.brokerageIngestion.listDueConnections,
      {},
      { name: "list due IBKR connections" },
    );
    const results = await Promise.all(
      connections.map(async (connection) => {
        try {
          return (await step.runWorkflow(
            internal.ibkrFlexWorkflow.syncConnection,
            {
              connectionId: connection._id,
              queryId: connection.queryId,
              reportDate: args.reportDate,
              reportType: "activity",
              ...(args.initialPollIntervalMs === undefined
                ? {}
                : { initialPollIntervalMs: args.initialPollIntervalMs }),
              ...(args.maxPollAttempts === undefined
                ? {}
                : { maxPollAttempts: args.maxPollAttempts }),
              ...(args.maxPollIntervalMs === undefined
                ? {}
                : { maxPollIntervalMs: args.maxPollIntervalMs }),
            },
            { name: `sync IBKR connection ${connection._id}` },
          )) as unknown as ConnectionWorkflowResult;
        } catch {
          return null;
        }
      }),
    );
    const runsSucceeded = results.filter(
      (result) => result?.status === "succeeded",
    ).length;
    const runsFailed = results.length - runsSucceeded;
    return {
      connectionsPlanned: connections.length,
      reportDate: args.reportDate,
      runsFailed,
      runsSucceeded,
      status:
        runsFailed === 0
          ? "succeeded"
          : runsSucceeded === 0
            ? "failed"
            : "partial",
    };
  });

async function startDailySync(
  ctx: Parameters<typeof start>[0],
  reportDate: string,
): Promise<WorkflowId> {
  return await start(
    ctx,
    internal.ibkrFlexWorkflow.dailySync,
    { reportDate },
    { startAsync: true },
  );
}

export const startScheduledSync = internalMutation({
  args: { reportDate: v.string() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    return await startDailySync(ctx, args.reportDate);
  },
});

export const dispatchNightlySync = internalMutation({
  args: {},
  returns: v.object({ delayMs: v.number(), reportDate: v.string() }),
  handler: async (ctx): Promise<{ delayMs: number; reportDate: string }> => {
    const now = Date.now();
    const delayMs = getNightlyKickoffDelayMs(now);
    const reportDate = getPriorBusinessDate(now);
    if (delayMs === 0) {
      await startDailySync(ctx, reportDate);
    } else {
      await ctx.scheduler.runAfter(
        delayMs,
        internal.ibkrFlexWorkflow.startScheduledSync,
        { reportDate },
      );
    }
    return { delayMs, reportDate };
  },
});

export const startManualSync = internalMutation({
  args: { reportDate: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    return await startDailySync(
      ctx,
      args.reportDate ?? getPriorBusinessDate(Date.now()),
    );
  },
});

export const getWorkflowStatus = internalQuery({
  args: { workflowId: vWorkflowId },
  returns: workflowStatusValidator,
  handler: async (ctx, args) => {
    return await getStatus(ctx, components.workflow, args.workflowId);
  },
});
