import {
  ApplicationFailure,
  executeChild,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import type { IbkrFlexActivities } from "./activities";
import type {
  BrokerageSyncReportType,
  DailyPortfolioPipelineWorkflowInput,
  DailyPortfolioPipelineWorkflowOutput,
  DailyIbkrFlexBrokerageSyncWorkflowInput,
  DailyIbkrFlexBrokerageSyncWorkflowOutput,
  IbkrFlexBrokerageSyncWorkflowInput,
  IbkrFlexBrokerageSyncWorkflowOutput,
  MarketDataDateWorkflowInput,
  MarketDataDateWorkflowOutput,
  PipelinePhaseSelection,
  PipelineSkipPolicy,
  PortfolioDateWorkflowInput,
  PortfolioDateWorkflowOutput,
  PortfolioPipelinePhaseStatus,
} from "./types";

const {
  beginBrokerageSyncRun,
  completePipelineRun,
  listDueIbkrConnections,
  listDailyPipelineOwners,
  markBrokerageSyncFailed,
  markBrokerageSyncSucceeded,
  markBrokerageSyncWaiting,
  pollAndIngestIbkrFlexStatement,
  computePortfolioValuations,
  completeMarketDataRun,
  finalizePipelineDate,
  fetchMarketPrice,
  planMarketDataJobs,
  prepareMarketDataRefresh,
  reconcileBrokerageDate,
  recordIbkrFlexReference,
  resolvePriorBusinessDate,
  sendIbkrFlexRequest,
  startPipelineDateRun,
  startPipelineRun,
  writeMarketDataResults,
} = proxyActivities<IbkrFlexActivities>({
  retry: {
    initialInterval: "10 seconds",
    maximumAttempts: 3,
  },
  startToCloseTimeout: "2 minutes",
});

const MARKET_DATA_RESULT_BATCH_SIZE = 25;
const DAILY_PIPELINE_OWNER_ID = "__daily__";
const DEFAULT_DAILY_PHASES: PipelinePhaseSelection = {
  computeValuations: true,
  reconcile: true,
  refreshMarketData: true,
  syncBrokerage: true,
};
const DEFAULT_DAILY_SKIP_POLICY: PipelineSkipPolicy = {
  forceBrokerageSync: false,
  forceMarketDataRefresh: false,
  forceReconciliation: false,
  forceValuationCompute: false,
};

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
  const allConnections = await listDueIbkrConnections();
  const connections = input.ownerId
    ? allConnections.filter(
        (connection) => connection.ownerId === input.ownerId,
      )
    : allConnections;
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

export async function dailyPortfolioPipelineWorkflow(
  input: DailyPortfolioPipelineWorkflowInput = {},
): Promise<DailyPortfolioPipelineWorkflowOutput> {
  const pipelineDate = await resolvePriorBusinessDate();
  const workflowId = workflowInfo().workflowId;
  const pipelineRun = await startPipelineRun({
    endDate: pipelineDate,
    mode: input.mode ?? "daily",
    ownerId: DAILY_PIPELINE_OWNER_ID,
    startDate: pipelineDate,
    temporalWorkflowId: workflowId,
  });
  const owners = await listDailyPipelineOwners();
  const results = await Promise.all(
    owners.map(async (owner) => {
      try {
        return await executeChild(portfolioDateWorkflow, {
          args: [
            {
              date: pipelineDate,
              mode: "daily",
              ownerId: owner.ownerId,
              phases: DEFAULT_DAILY_PHASES,
              pipelineRunId: pipelineRun.pipelineRunId,
              skipPolicy: DEFAULT_DAILY_SKIP_POLICY,
            },
          ],
          workflowId: `portfolio-date:${pipelineRun.pipelineRunId}:${owner.ownerId}:${pipelineDate}:daily`,
        });
      } catch {
        return {
          finalStatus: "failed",
        } as const;
      }
    }),
  );
  const datesSucceeded = results.filter(
    (result) => result.finalStatus === "succeeded",
  ).length;
  const datesPartial = results.filter(
    (result) => result.finalStatus === "partial",
  ).length;
  const datesSkipped = results.filter(
    (result) => result.finalStatus === "skipped",
  ).length;
  const datesFailed =
    results.length - datesSucceeded - datesPartial - datesSkipped;
  const completion = await completePipelineRun({
    aggregate: {
      datesFailed,
      datesPartial,
      datesSkipped,
      datesSucceeded,
    },
    pipelineRunId: pipelineRun.pipelineRunId,
  });

  return {
    ownerRunsFailed: datesFailed,
    ownerRunsStarted: owners.length,
    ownerRunsSucceeded: datesSucceeded,
    pipelineDate,
    pipelineRunId: pipelineRun.pipelineRunId,
    status:
      completion.status === "succeeded"
        ? "succeeded"
        : completion.status === "failed"
          ? "failed"
          : "partial",
  };
}

function phaseStatusFromMarketData(
  output: MarketDataDateWorkflowOutput,
): PortfolioPipelinePhaseStatus {
  return output.status;
}

function finalErrorMessage(errors: string[]): string | undefined {
  return errors.length === 0 ? undefined : errors.join("; ");
}

export async function portfolioDateWorkflow(
  input: PortfolioDateWorkflowInput,
): Promise<PortfolioDateWorkflowOutput> {
  const phases = input.phases ?? DEFAULT_DAILY_PHASES;
  const skipPolicy = input.skipPolicy ?? DEFAULT_DAILY_SKIP_POLICY;
  const dateRun = await startPipelineDateRun({
    date: input.date,
    mode: input.mode,
    ownerId: input.ownerId,
    pipelineRunId: input.pipelineRunId,
    temporalWorkflowId: workflowInfo().workflowId,
  });
  const errors: string[] = [];
  let brokerageStatus: PortfolioPipelinePhaseStatus = phases.syncBrokerage
    ? "failed"
    : "not_requested";
  let marketDataStatus: PortfolioPipelinePhaseStatus = phases.refreshMarketData
    ? "failed"
    : "not_requested";
  let reconciliationStatus: PortfolioPipelinePhaseStatus = phases.reconcile
    ? "blocked"
    : "not_requested";
  let valuationStatus: PortfolioPipelinePhaseStatus = phases.computeValuations
    ? "failed"
    : "not_requested";

  if (phases.syncBrokerage) {
    try {
      const brokerage = await executeChild(dailyIbkrFlexBrokerageSyncWorkflow, {
        args: [{ ownerId: input.ownerId, reportDate: input.date }],
        workflowId: `brokerage-sync:${dateRun.pipelineDateRunId}:${input.ownerId}:${input.date}:${input.mode}`,
      });
      brokerageStatus = brokerage.status;
    } catch (error) {
      brokerageStatus = "failed";
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (phases.refreshMarketData) {
    try {
      const marketData = await executeChild(marketDataDateWorkflow, {
        args: [
          {
            date: input.date,
            force: skipPolicy.forceMarketDataRefresh,
            ownerId: input.ownerId,
            pipelineDateRunId: dateRun.pipelineDateRunId,
            pipelineRunId: input.pipelineRunId,
          },
        ],
        workflowId: `market-data:${dateRun.pipelineDateRunId}:${input.ownerId}:${input.date}:${input.mode}`,
      });
      marketDataStatus = phaseStatusFromMarketData(marketData);
    } catch (error) {
      marketDataStatus = "failed";
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (phases.reconcile) {
    if (brokerageStatus === "failed") {
      reconciliationStatus = "blocked";
    } else {
      try {
        const reconciliation = await reconcileBrokerageDate({
          date: input.date,
          force: skipPolicy.forceReconciliation,
          ownerId: input.ownerId,
          pipelineDateRunId: dateRun.pipelineDateRunId,
        });
        reconciliationStatus = reconciliation.status;
      } catch (error) {
        reconciliationStatus = "failed";
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  if (phases.computeValuations) {
    try {
      const valuation = await computePortfolioValuations({
        date: input.date,
        force: skipPolicy.forceValuationCompute,
        ownerId: input.ownerId,
        pipelineDateRunId: dateRun.pipelineDateRunId,
      });
      valuationStatus = valuation.status;
    } catch (error) {
      valuationStatus = "failed";
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const finalized = await finalizePipelineDate({
    brokerageStatus,
    errorMessage: finalErrorMessage(errors),
    marketDataStatus,
    pipelineDateRunId: dateRun.pipelineDateRunId,
    reconciliationStatus,
    valuationStatus,
  });

  return {
    brokerageStatus,
    date: input.date,
    finalStatus: finalized.finalStatus,
    marketDataStatus,
    pipelineDateRunId: dateRun.pipelineDateRunId,
    reconciliationStatus,
    valuationStatus,
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

export async function marketDataDateWorkflow(
  input: MarketDataDateWorkflowInput,
): Promise<MarketDataDateWorkflowOutput> {
  const force = input.force ?? false;
  const budgetCredits = Math.max(1, input.budgetCredits ?? 8);
  const prepared = await prepareMarketDataRefresh({
    date: input.date,
    force,
    ownerId: input.ownerId,
    pipelineDateRunId: input.pipelineDateRunId,
  });

  if (!prepared.shouldRun || prepared.marketDataRunId === null) {
    return {
      marketDataRunId: prepared.marketDataRunId,
      status: "skipped",
      symbolsFailed: 0,
      symbolsRequested: 0,
      symbolsSucceeded: 0,
      trackedPriceMarksWritten: 0,
    };
  }

  const plan = await planMarketDataJobs({
    date: input.date,
    marketDataRunId: prepared.marketDataRunId,
    ownerId: input.ownerId,
  });
  let symbolsSucceeded = 0;
  let symbolsFailed = 0;
  const seenResultKeys = new Set<string>();
  let processingError: unknown = null;

  try {
    for (
      let index = 0;
      index < plan.providerJobs.length;
      index += budgetCredits
    ) {
      const jobs = plan.providerJobs.slice(index, index + budgetCredits);
      const results = await Promise.all(
        jobs.map((job) =>
          fetchMarketPrice({
            date: input.date,
            provider: job.provider,
            providerSymbol: job.providerSymbol,
          }),
        ),
      );

      for (
        let resultIndex = 0;
        resultIndex < results.length;
        resultIndex += MARKET_DATA_RESULT_BATCH_SIZE
      ) {
        const batch = results.slice(
          resultIndex,
          resultIndex + MARKET_DATA_RESULT_BATCH_SIZE,
        );
        const writeResult = await writeMarketDataResults({
          date: input.date,
          marketDataRunId: prepared.marketDataRunId,
          ownerId: input.ownerId,
          results: batch,
        });
        for (const processed of writeResult.processedResults) {
          const key = `${processed.provider}:${processed.providerSymbol}`;
          if (seenResultKeys.has(key)) {
            continue;
          }
          seenResultKeys.add(key);
          if (processed.status === "ok") {
            symbolsSucceeded += 1;
          } else {
            symbolsFailed += 1;
          }
        }
      }
    }
  } catch (error) {
    processingError = error;
  }

  const completion = await completeMarketDataRun({
    marketDataRunId: prepared.marketDataRunId,
    ownerId: input.ownerId,
    symbolsFailed,
    symbolsSucceeded,
  });

  if (processingError !== null) {
    throw processingError;
  }

  return {
    marketDataRunId: prepared.marketDataRunId,
    status: completion.status,
    symbolsFailed,
    symbolsRequested: plan.providerJobs.length,
    symbolsSucceeded,
    trackedPriceMarksWritten: plan.trackedPriceMarksWritten,
  };
}
