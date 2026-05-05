"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCw,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  type BadgeProps,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Doc, Id } from "~/convex/_generated/dataModel";
import { cn } from "~/lib/utils";
import {
  MARKET_DATA_HEALTH_TEST_IDS,
  getMarketDataHealthCoverageDayTestId,
  getMarketDataHealthCoverageRowTestId,
  getMarketDataHealthFailingJobRowTestId,
  getMarketDataHealthRecentRunRowTestId,
  getMarketDataHealthRequeueButtonTestId,
} from "../../../../../shared/e2e/testIds";
import { MarketDataTabs } from "../MarketDataTabs";

type RunStatus = Doc<"marketDataRefreshRuns">["status"];
type JobStatus = "pending" | "leased" | "failed";
type JobKind = Doc<"marketDataFetchJobs">["kind"];
type CoverageStatus = Doc<"portfolioDailyValuations">["priceCoverageStatus"];

const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  partial: "Partial",
  running: "Running",
};

const RUN_STATUS_VARIANT: Record<RunStatus, NonNullable<BadgeProps["variant"]>> =
  {
    completed: "success",
    failed: "danger",
    partial: "warning",
    running: "info",
  };

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  failed: "Failed",
  leased: "Leased",
  pending: "Pending",
};

const JOB_STATUS_FILTERS: Array<{ label: string; value: JobStatus }> = [
  { label: "Failed", value: "failed" },
  { label: "Pending", value: "pending" },
  { label: "Leased", value: "leased" },
];

const JOB_KIND_LABELS: Record<JobKind, string> = {
  daily_snapshot: "Daily",
  historical_backfill: "Backfill",
};

const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  complete: "Complete",
  missing: "Missing",
  partial: "Partial",
};

const COVERAGE_STATUS_CLASS: Record<CoverageStatus, string> = {
  complete: "bg-grass-9",
  missing: "bg-red-9",
  partial: "bg-amber-9",
};

const COVERAGE_DAYS = 30;

function formatTimestamp(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function formatRelativeShort(
  value: number | null | undefined,
  now: number,
): string {
  if (value === null || value === undefined) return "—";
  const diffSec = Math.round((now - value) / 1000);
  if (diffSec < 60) return diffSec <= 0 ? "just now" : `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d ago`;
}

function formatDuration(startedAt: number, completedAt: number | null): string {
  if (completedAt === null) return "—";
  const diffSec = Math.max(0, Math.round((completedAt - startedAt) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;
  return `${diffMin}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatDateLabel(isoDate: string): string {
  // Display ISO calendar dates as Mon Day so the strip stays compact, while
  // keeping the full date in tooltips (handled by the caller).
  const parsed = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function MarketDataHealthPageClient() {
  const summary = useQuery(api.marketDataHealth.getCurrentRunSummary, {});
  const recentRuns = useQuery(api.marketDataHealth.listRecentRefreshRuns, {
    limit: 14,
  });
  const coverage = useQuery(
    api.marketDataHealth.listValuationCoverageForOwner,
    { days: COVERAGE_DAYS },
  );

  const [jobStatusFilter, setJobStatusFilter] = useState<JobStatus>("failed");
  const failingJobs = useQuery(api.marketDataHealth.listFetchJobs, {
    status: jobStatusFilter,
    limit: 100,
  });

  const triggerDailyRefresh = useAction(
    api.marketDataHealth.triggerDailyRefresh,
  );
  const runWorkerTick = useAction(api.marketDataHealth.runWorkerTick);
  const requeueFetchJob = useMutation(api.marketDataHealth.requeueFetchJob);
  const triggerBackfill = useAction(
    api.marketData.backfillHistoricalPriceSnapshots,
  );

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<
    | "triggerDailyRefresh"
    | "runWorkerTick"
    | "triggerBackfill"
    | { kind: "requeue"; jobId: Id<"marketDataFetchJobs"> }
    | null
  >(null);

  const [backfillStartDate, setBackfillStartDate] = useState("");
  const [backfillEndDate, setBackfillEndDate] = useState("");
  const [fallbackNow] = useState(() => Date.now());

  const handleTriggerDailyRefresh = async () => {
    setActionError(null);
    setActionStatus(null);
    setActionPending("triggerDailyRefresh");
    try {
      const result = await triggerDailyRefresh();
      setActionStatus(
        `Queued ${result.jobsQueued} job${result.jobsQueued === 1 ? "" : "s"} for ${result.runDate}.`,
      );
    } catch (error) {
      setActionError(describeError(error, "Failed to trigger refresh."));
    } finally {
      setActionPending(null);
    }
  };

  const handleRunWorkerTick = async () => {
    setActionError(null);
    setActionStatus(null);
    setActionPending("runWorkerTick");
    try {
      const result = await runWorkerTick({});
      setActionStatus(
        `Worker processed ${result.jobsProcessed} job${result.jobsProcessed === 1 ? "" : "s"} (${result.jobsSucceeded} succeeded, ${result.jobsFailed} failed).`,
      );
    } catch (error) {
      setActionError(describeError(error, "Worker tick failed."));
    } finally {
      setActionPending(null);
    }
  };

  const handleTriggerBackfill = async () => {
    if (!backfillEndDate) {
      setActionStatus(null);
      setActionError("Pick an end date for the backfill.");
      return;
    }
    setActionError(null);
    setActionStatus(null);
    setActionPending("triggerBackfill");
    try {
      const result = await triggerBackfill({
        startDate: backfillStartDate || undefined,
        endDate: backfillEndDate,
      });
      setActionStatus(
        `Queued ${result.jobsQueued} backfill job${result.jobsQueued === 1 ? "" : "s"} for ${result.startDate ?? "?"} → ${result.endDate}.`,
      );
    } catch (error) {
      setActionError(describeError(error, "Failed to queue backfill."));
    } finally {
      setActionPending(null);
    }
  };

  const handleRequeueJob = async (jobId: Id<"marketDataFetchJobs">) => {
    setActionError(null);
    setActionStatus(null);
    setActionPending({ kind: "requeue", jobId });
    try {
      await requeueFetchJob({ jobId });
      setActionStatus("Job re-queued. The worker picks it up on the next tick.");
    } catch (error) {
      setActionError(describeError(error, "Failed to re-queue job."));
    } finally {
      setActionPending(null);
    }
  };

  const isAnyTopLevelActionPending =
    actionPending === "triggerDailyRefresh" ||
    actionPending === "runWorkerTick" ||
    actionPending === "triggerBackfill";

  const isLoading =
    summary === undefined ||
    recentRuns === undefined ||
    coverage === undefined;
  const failingJobsLoading = failingJobs === undefined;

  const serverNow = summary?.serverNow ?? fallbackNow;

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <div className="space-y-1">
        <h1
          className="text-2xl font-bold text-slate-12"
          data-testid={MARKET_DATA_HEALTH_TEST_IDS.pageTitle}
        >
          Market Data Health
        </h1>
        <p className="text-sm text-slate-11">
          Daily refresh activity, in-flight jobs, and per-portfolio coverage.
          Use this page to diagnose missing prices and partial valuations.
        </p>
      </div>

      <MarketDataTabs />

      {actionError ? (
        <Alert
          variant="error"
          data-testid={MARKET_DATA_HEALTH_TEST_IDS.actionError}
          onDismiss={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      ) : null}
      {actionStatus ? (
        <Alert
          variant="success"
          data-testid={MARKET_DATA_HEALTH_TEST_IDS.actionStatus}
          onDismiss={() => setActionStatus(null)}
        >
          {actionStatus}
        </Alert>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-slate-11">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading market data health…
          </CardContent>
        </Card>
      ) : (
        <>
          <LatestRunSection latestRun={summary.latestRun} now={serverNow} />
          <InFlightSection counters={summary.counters} />
          <RecentRunsSection runs={recentRuns} />
          <FailingJobsSection
            currentStatus={jobStatusFilter}
            isLoading={failingJobsLoading}
            jobs={failingJobs ?? []}
            now={serverNow}
            onRequeue={handleRequeueJob}
            onStatusChange={setJobStatusFilter}
            requeuePendingJobId={
              actionPending !== null && typeof actionPending === "object"
                ? actionPending.jobId
                : null
            }
          />
          <CoverageSection coverage={coverage} />
          <TriggersSection
            backfillEndDate={backfillEndDate}
            backfillPending={actionPending === "triggerBackfill"}
            backfillStartDate={backfillStartDate}
            isAnyPending={isAnyTopLevelActionPending}
            onBackfill={handleTriggerBackfill}
            onChangeBackfillEndDate={setBackfillEndDate}
            onChangeBackfillStartDate={setBackfillStartDate}
            onTriggerDailyRefresh={handleTriggerDailyRefresh}
            onRunWorkerTick={handleRunWorkerTick}
            triggerDailyPending={actionPending === "triggerDailyRefresh"}
            workerTickPending={actionPending === "runWorkerTick"}
          />
        </>
      )}
    </div>
  );
}

interface LatestRunSectionProps {
  latestRun: {
    _id: Id<"marketDataRefreshRuns">;
    completedAt: number | null;
    errorMessage: string | null;
    isBackfill: boolean;
    runDate: string;
    startedAt: number;
    status: RunStatus;
    symbolsFailed: number;
    symbolsRequested: number;
    symbolsSucceeded: number;
  } | null;
  now: number;
}

function LatestRunSection({ latestRun, now }: LatestRunSectionProps) {
  if (latestRun === null) {
    return (
      <Card data-testid={MARKET_DATA_HEALTH_TEST_IDS.latestRunSection}>
        <CardHeader>
          <CardTitle>Latest run</CardTitle>
          <CardDescription>
            The nightly planner runs around 9:00 PM Eastern. The first run will
            appear here once it executes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            dataTestId={MARKET_DATA_HEALTH_TEST_IDS.noRunsState}
            title="No runs yet"
            description="No market data refresh has run for this account."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid={MARKET_DATA_HEALTH_TEST_IDS.latestRunSection}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <CardTitle className="flex items-center gap-2">
              Latest run
              <Badge
                variant={RUN_STATUS_VARIANT[latestRun.status]}
                data-testid={MARKET_DATA_HEALTH_TEST_IDS.latestRunStatus}
              >
                {RUN_STATUS_LABELS[latestRun.status]}
              </Badge>
              <Badge variant="neutral">
                {latestRun.isBackfill ? "Backfill" : "Daily"}
              </Badge>
            </CardTitle>
            <CardDescription>
              {latestRun.isBackfill
                ? `Range ${latestRun.runDate.replace(":", " → ")}`
                : `Run date ${latestRun.runDate}`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RunStatBlock
          label="Started"
          value={formatTimestamp(latestRun.startedAt)}
          subValue={formatRelativeShort(latestRun.startedAt, now)}
          testId={MARKET_DATA_HEALTH_TEST_IDS.latestRunStartedAt}
        />
        <RunStatBlock
          label={latestRun.completedAt === null ? "Running for" : "Completed"}
          value={
            latestRun.completedAt === null
              ? formatRelativeShort(latestRun.startedAt, now)
              : formatTimestamp(latestRun.completedAt)
          }
          subValue={
            latestRun.completedAt === null
              ? "In progress"
              : `Duration ${formatDuration(latestRun.startedAt, latestRun.completedAt)}`
          }
          testId={MARKET_DATA_HEALTH_TEST_IDS.latestRunCompletedAt}
        />
        <RunStatBlock
          label="Succeeded"
          value={`${latestRun.symbolsSucceeded} / ${latestRun.symbolsRequested}`}
          subValue="symbols priced"
        />
        <RunStatBlock
          label="Failed"
          value={String(latestRun.symbolsFailed)}
          subValue={
            latestRun.symbolsFailed === 0
              ? "no failures"
              : "see Failing jobs below"
          }
          tone={latestRun.symbolsFailed === 0 ? undefined : "danger"}
        />
        {latestRun.errorMessage ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <p
              className="rounded-md border border-red-7 bg-red-3/40 p-3 text-sm text-red-12"
              data-testid={MARKET_DATA_HEALTH_TEST_IDS.latestRunErrorMessage}
            >
              {latestRun.errorMessage}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RunStatBlock({
  label,
  value,
  subValue,
  testId,
  tone,
}: {
  label: string;
  value: string;
  subValue?: string;
  testId?: string;
  tone?: "danger";
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-slate-11">
        {label}
      </div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "danger" ? "text-red-11" : "text-slate-12",
        )}
        data-testid={testId}
      >
        {value}
      </div>
      {subValue ? (
        <div className="text-xs text-slate-11">{subValue}</div>
      ) : null}
    </div>
  );
}

interface InFlightSectionProps {
  counters: {
    failedTotal: number;
    leased: number;
    pending: number;
    stuckLeases: number;
  };
}

function InFlightSection({ counters }: InFlightSectionProps) {
  return (
    <Card data-testid={MARKET_DATA_HEALTH_TEST_IDS.inFlightSection}>
      <CardHeader>
        <CardTitle>In-flight</CardTitle>
        <CardDescription>
          Worker leases up to 8 credits per tick and runs every two minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CounterBlock
          icon={<Clock className="h-4 w-4 text-blue-11" />}
          label="Pending"
          value={counters.pending}
          testId={MARKET_DATA_HEALTH_TEST_IDS.inFlightPending}
        />
        <CounterBlock
          icon={<RotateCw className="h-4 w-4 text-blue-11" />}
          label="Leased"
          value={counters.leased}
          testId={MARKET_DATA_HEALTH_TEST_IDS.inFlightLeased}
        />
        <CounterBlock
          icon={<AlertTriangle className="h-4 w-4 text-amber-11" />}
          label="Stuck leases"
          value={counters.stuckLeases}
          tone={counters.stuckLeases > 0 ? "warning" : undefined}
          testId={MARKET_DATA_HEALTH_TEST_IDS.inFlightStuck}
        />
        <CounterBlock
          icon={<XCircle className="h-4 w-4 text-red-11" />}
          label="Failed (open)"
          value={counters.failedTotal}
          tone={counters.failedTotal > 0 ? "danger" : undefined}
          testId={MARKET_DATA_HEALTH_TEST_IDS.inFlightFailedTotal}
        />
      </CardContent>
    </Card>
  );
}

function CounterBlock({
  icon,
  label,
  value,
  tone,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "warning" | "danger";
  testId: string;
}) {
  return (
    <div className="rounded-md border border-olive-6 bg-olive-2 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-11">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "danger"
            ? "text-red-11"
            : tone === "warning"
              ? "text-amber-11"
              : "text-slate-12",
        )}
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  );
}

interface RecentRunsSectionProps {
  runs: ReadonlyArray<{
    _id: Id<"marketDataRefreshRuns">;
    completedAt: number | null;
    errorMessage: string | null;
    isBackfill: boolean;
    runDate: string;
    startedAt: number;
    status: RunStatus;
    symbolsFailed: number;
    symbolsRequested: number;
    symbolsSucceeded: number;
  }>;
}

function RecentRunsSection({ runs }: RecentRunsSectionProps) {
  return (
    <Card data-testid={MARKET_DATA_HEALTH_TEST_IDS.recentRunsSection}>
      <CardHeader>
        <CardTitle>Recent runs</CardTitle>
        <CardDescription>
          Last {runs.length} refresh runs across all kinds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <EmptyState
            dataTestId={MARKET_DATA_HEALTH_TEST_IDS.recentRunsEmpty}
            title="No refresh runs yet"
            description="Once the planner runs the first time, you'll see history here."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-6">
            <table
              className="w-full table-auto"
              data-testid={MARKET_DATA_HEALTH_TEST_IDS.recentRunsTable}
            >
              <thead className="bg-slate-3">
                <tr>
                  <Th>Run date</Th>
                  <Th>Kind</Th>
                  <Th>Status</Th>
                  <Th>Started</Th>
                  <Th>Duration</Th>
                  <Th>Succeeded</Th>
                  <Th>Failed</Th>
                  <Th>Error</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-6 bg-slate-2">
                {runs.map((run) => (
                  <tr
                    key={run._id}
                    data-testid={getMarketDataHealthRecentRunRowTestId(run._id)}
                    className="hover:bg-slate-3/40"
                  >
                    <Td className="font-mono text-slate-12">{run.runDate}</Td>
                    <Td>
                      <Badge variant="neutral">
                        {run.isBackfill ? "Backfill" : "Daily"}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge variant={RUN_STATUS_VARIANT[run.status]}>
                        {RUN_STATUS_LABELS[run.status]}
                      </Badge>
                    </Td>
                    <Td>{formatTimestamp(run.startedAt)}</Td>
                    <Td>{formatDuration(run.startedAt, run.completedAt)}</Td>
                    <Td className="font-mono">
                      {run.symbolsSucceeded} / {run.symbolsRequested}
                    </Td>
                    <Td
                      className={cn(
                        "font-mono",
                        run.symbolsFailed > 0 ? "text-red-11" : undefined,
                      )}
                    >
                      {run.symbolsFailed}
                    </Td>
                    <Td className="max-w-[18rem] text-xs">
                      <span
                        className="line-clamp-2 break-words"
                        title={run.errorMessage ?? undefined}
                      >
                        {run.errorMessage ?? "—"}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FailingJobsSectionProps {
  currentStatus: JobStatus;
  isLoading: boolean;
  jobs: ReadonlyArray<{
    _id: Id<"marketDataFetchJobs">;
    assetType: "crypto" | "stock";
    attempts: number;
    completedAt: number | null;
    errorMessage: string | null;
    isStuck: boolean;
    kind: JobKind;
    runId: Id<"marketDataRefreshRuns">;
    sourceTradeIds: Id<"trades">[];
    status: JobStatus | "completed";
    symbol: string;
    updatedAt: number;
  }>;
  now: number;
  onRequeue: (jobId: Id<"marketDataFetchJobs">) => Promise<void> | void;
  onStatusChange: (status: JobStatus) => void;
  requeuePendingJobId: Id<"marketDataFetchJobs"> | null;
}

function FailingJobsSection({
  currentStatus,
  isLoading,
  jobs,
  now,
  onRequeue,
  onStatusChange,
  requeuePendingJobId,
}: FailingJobsSectionProps) {
  return (
    <Card data-testid={MARKET_DATA_HEALTH_TEST_IDS.failingJobsSection}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle>Jobs</CardTitle>
            <CardDescription>
              Drill into individual symbol fetches. Re-queue failed jobs to
              retry on the next worker tick.
            </CardDescription>
          </div>
          <div className="flex gap-1 rounded-md border border-olive-6 bg-olive-2 p-1">
            {JOB_STATUS_FILTERS.map((option) => {
              const isActive = option.value === currentStatus;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onStatusChange(option.value)}
                  aria-pressed={isActive}
                  data-testid={`market-data-health-jobs-filter-${option.value}`}
                  className={cn(
                    "rounded px-3 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-blue-9 text-blue-1"
                      : "text-slate-11 hover:bg-olive-4 hover:text-slate-12",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-11">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading jobs…
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            dataTestId={MARKET_DATA_HEALTH_TEST_IDS.failingJobsEmpty}
            title={`No ${JOB_STATUS_LABELS[currentStatus].toLowerCase()} jobs`}
            description={
              currentStatus === "failed"
                ? "Every fetch job either succeeded or is still in flight."
                : currentStatus === "pending"
                  ? "No jobs are waiting for the worker."
                  : "No jobs are currently leased."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-6">
            <table
              className="w-full table-auto"
              data-testid={MARKET_DATA_HEALTH_TEST_IDS.failingJobsTable}
            >
              <thead className="bg-slate-3">
                <tr>
                  <Th>Symbol</Th>
                  <Th>Asset</Th>
                  <Th>Kind</Th>
                  <Th>Attempts</Th>
                  <Th>Updated</Th>
                  <Th>Source trades</Th>
                  <Th>Error</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-6 bg-slate-2">
                {jobs.map((job) => {
                  const isPending = requeuePendingJobId === job._id;
                  return (
                    <tr
                      key={job._id}
                      data-testid={getMarketDataHealthFailingJobRowTestId(job._id)}
                      className="hover:bg-slate-3/40"
                    >
                      <Td className="font-mono text-slate-12">
                        <Link
                          className="text-slate-12 underline underline-offset-2 hover:text-blue-11"
                          href="/market-data"
                        >
                          {job.symbol}
                        </Link>
                      </Td>
                      <Td>
                        <Badge variant="neutral">{job.assetType}</Badge>
                      </Td>
                      <Td>
                        <Badge variant="neutral">
                          {JOB_KIND_LABELS[job.kind]}
                        </Badge>
                      </Td>
                      <Td className="font-mono">{job.attempts}</Td>
                      <Td>
                        <span title={formatTimestamp(job.updatedAt)}>
                          {formatRelativeShort(job.updatedAt, now)}
                        </span>
                        {job.isStuck ? (
                          <Badge variant="warning" className="ml-2">
                            Stuck
                          </Badge>
                        ) : null}
                      </Td>
                      <Td className="font-mono">{job.sourceTradeIds.length}</Td>
                      <Td className="max-w-[20rem] text-xs">
                        <span
                          className="line-clamp-2 break-words"
                          title={job.errorMessage ?? undefined}
                        >
                          {job.errorMessage ?? "—"}
                        </span>
                      </Td>
                      <Td className="text-right">
                        {job.status === "failed" ? (
                          <Button
                            dataTestId={getMarketDataHealthRequeueButtonTestId(
                              job._id,
                            )}
                            size="sm"
                            variant="outline"
                            isLoading={isPending}
                            disabled={isPending}
                            onClick={() => void onRequeue(job._id)}
                          >
                            Re-queue
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-11">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CoverageSectionProps {
  coverage: ReadonlyArray<{
    portfolioId: Id<"portfolios">;
    portfolioName: string;
    rows: ReadonlyArray<{
      date: string;
      missingSymbols: string[];
      status: CoverageStatus;
    }>;
  }>;
}

function CoverageSection({ coverage }: CoverageSectionProps) {
  return (
    <Card data-testid={MARKET_DATA_HEALTH_TEST_IDS.coverageSection}>
      <CardHeader>
        <CardTitle>Per-portfolio coverage</CardTitle>
        <CardDescription>
          Last {COVERAGE_DAYS} days of valuation coverage by portfolio. Hover
          a cell to see missing symbols.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {coverage.length === 0 ? (
          <EmptyState
            dataTestId={MARKET_DATA_HEALTH_TEST_IDS.coverageEmpty}
            title="No portfolios"
            description="Create a portfolio to see per-day valuation coverage here."
          />
        ) : (
          <div className="space-y-4">
            <CoverageLegend />
            {coverage.map((row) => (
              <div
                key={row.portfolioId}
                data-testid={getMarketDataHealthCoverageRowTestId(
                  row.portfolioId,
                )}
                className="space-y-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/portfolios/${row.portfolioId}`}
                    className="text-sm font-medium text-slate-12 underline underline-offset-2 hover:text-blue-11"
                  >
                    {row.portfolioName}
                  </Link>
                  <span className="text-xs text-slate-11">
                    {row.rows.length} day{row.rows.length === 1 ? "" : "s"} of
                    coverage
                  </span>
                </div>
                {row.rows.length === 0 ? (
                  <p className="rounded-md border border-olive-6 bg-olive-2 p-3 text-xs text-slate-11">
                    No daily valuations computed yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {row.rows.map((day) => {
                      const tooltip =
                        day.status === "complete"
                          ? `${formatDateLabel(day.date)} • ${COVERAGE_STATUS_LABELS[day.status]}`
                          : `${formatDateLabel(day.date)} • ${COVERAGE_STATUS_LABELS[day.status]}${day.missingSymbols.length > 0 ? ` • Missing: ${day.missingSymbols.join(", ")}` : ""}`;
                      return (
                        <span
                          key={day.date}
                          title={tooltip}
                          aria-label={tooltip}
                          data-testid={getMarketDataHealthCoverageDayTestId(
                            row.portfolioId,
                            day.date,
                          )}
                          className={cn(
                            "h-6 w-3 rounded-sm",
                            COVERAGE_STATUS_CLASS[day.status],
                          )}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CoverageLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-11">
      <LegendSwatch className="bg-grass-9" label="Complete" />
      <LegendSwatch className="bg-amber-9" label="Partial" />
      <LegendSwatch className="bg-red-9" label="Missing" />
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-sm", className)} />
      {label}
    </span>
  );
}

interface TriggersSectionProps {
  backfillEndDate: string;
  backfillPending: boolean;
  backfillStartDate: string;
  isAnyPending: boolean;
  onBackfill: () => Promise<void> | void;
  onChangeBackfillEndDate: (value: string) => void;
  onChangeBackfillStartDate: (value: string) => void;
  onRunWorkerTick: () => Promise<void> | void;
  onTriggerDailyRefresh: () => Promise<void> | void;
  triggerDailyPending: boolean;
  workerTickPending: boolean;
}

function TriggersSection({
  backfillEndDate,
  backfillPending,
  backfillStartDate,
  isAnyPending,
  onBackfill,
  onChangeBackfillEndDate,
  onChangeBackfillStartDate,
  onRunWorkerTick,
  onTriggerDailyRefresh,
  triggerDailyPending,
  workerTickPending,
}: TriggersSectionProps) {
  return (
    <Card data-testid={MARKET_DATA_HEALTH_TEST_IDS.triggersSection}>
      <CardHeader>
        <CardTitle>Manual triggers</CardTitle>
        <CardDescription>
          Use these for debugging. The nightly planner and 2-minute worker
          fire automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            dataTestId={
              MARKET_DATA_HEALTH_TEST_IDS.triggerDailyRefreshButton
            }
            variant="outline"
            isLoading={triggerDailyPending}
            disabled={isAnyPending}
            onClick={() => void onTriggerDailyRefresh()}
          >
            <RefreshCw className="h-4 w-4" />
            Trigger daily refresh
          </Button>
          <Button
            dataTestId={MARKET_DATA_HEALTH_TEST_IDS.runWorkerTickButton}
            variant="outline"
            isLoading={workerTickPending}
            disabled={isAnyPending}
            onClick={() => void onRunWorkerTick()}
          >
            <CheckCircle2 className="h-4 w-4" />
            Run worker tick now
          </Button>
        </div>
        <div className="rounded-md border border-olive-6 bg-olive-2 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-12">
            Historical backfill
          </h3>
          <p className="mb-3 text-xs text-slate-11">
            Queue historical price fetches for every symbol on your trades. If
            start date is empty the backfill begins at the earliest trade.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs text-slate-11">
              <span>Start date</span>
              <Input
                type="date"
                dataTestId={MARKET_DATA_HEALTH_TEST_IDS.backfillStartDate}
                value={backfillStartDate}
                onChange={(event) =>
                  onChangeBackfillStartDate(event.target.value)
                }
                className="dark-date-input"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-11">
              <span>End date</span>
              <Input
                type="date"
                dataTestId={MARKET_DATA_HEALTH_TEST_IDS.backfillEndDate}
                value={backfillEndDate}
                onChange={(event) =>
                  onChangeBackfillEndDate(event.target.value)
                }
                className="dark-date-input"
              />
            </label>
            <Button
              dataTestId={MARKET_DATA_HEALTH_TEST_IDS.backfillSubmit}
              isLoading={backfillPending}
              disabled={isAnyPending || !backfillEndDate}
              onClick={() => void onBackfill()}
            >
              Queue backfill
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left text-xs font-medium text-slate-11",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn("whitespace-nowrap px-3 py-2 text-sm text-slate-11", className)}
    >
      {children}
    </td>
  );
}
