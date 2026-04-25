"use client";

import { useMutation, usePreloadedQuery, useQuery } from "convex/react";
import type { Preloaded } from "convex/react";
import { RefreshCw, Send, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Input,
  PaginationControls,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { DEFAULT_BRAVOS_REVIEW_PAGE_SIZE } from "~/lib/bravos/pagination";
import {
  APP_PAGE_TITLES,
  BRAVOS_REVIEW_TEST_IDS,
} from "../../../../../shared/e2e/testIds";
import {
  BravosReviewDetail,
  type BravosQueueRow,
  type BravosReviewItem,
  type BravosSyncRun,
  type BravosTradePlanOption,
} from "./components/bravos-review-detail";
import { BravosReviewList } from "./components/bravos-review-list";

function getRunTimestamp(run: BravosSyncRun): number {
  return run.completedAt ?? run.startedAt ?? run.requestedAt;
}

function getRowTimestamp(row: BravosQueueRow): number {
  if (row.type === "run") {
    return getRunTimestamp(row.run);
  }

  return Math.max(
    row.review.lastFetchedAt ?? 0,
    row.latestRun ? getRunTimestamp(row.latestRun) : 0,
  );
}

function shouldShowRunRow(
  run: BravosSyncRun,
  reviewByRunId: Map<string, BravosReviewItem>,
): boolean {
  if (!reviewByRunId.has(run._id)) {
    return true;
  }

  return (
    (run.kind === "listing_scan" || run.kind === "scheduled_scan") &&
    (run.status === "queued" || run.status === "processing")
  );
}

export default function BravosReviewPageClient({
  preloadedConnection,
  preloadedReviewItems,
  preloadedSummary,
  preloadedSyncRuns,
  preloadedTradePlans,
}: {
  preloadedConnection: Preloaded<typeof api.bravos.getBravosConnection>;
  preloadedReviewItems: Preloaded<typeof api.bravos.listBravosReviewItems>;
  preloadedSummary: Preloaded<typeof api.bravos.getBravosReviewSummary>;
  preloadedSyncRuns: Preloaded<typeof api.bravos.listRecentBravosSyncRuns>;
  preloadedTradePlans: Preloaded<typeof api.tradePlans.listOpenTradePlans>;
}) {
  const connection = usePreloadedQuery(preloadedConnection);
  const initialReviewItemsPage = usePreloadedQuery(preloadedReviewItems);
  const summary = usePreloadedQuery(preloadedSummary);
  const syncRuns = usePreloadedQuery(preloadedSyncRuns) as BravosSyncRun[];
  const tradePlans = usePreloadedQuery(
    preloadedTradePlans,
  ) as BravosTradePlanOption[];
  const approveReviewItem = useMutation(api.bravos.approveBravosReviewItem);
  const dismissReviewItem = useMutation(api.bravos.dismissBravosReviewItem);
  const requestListingScan = useMutation(api.bravos.requestBravosListingScan);
  const retrySyncRun = useMutation(api.bravos.retryBravosSyncRun);
  const saveListingUrl = useMutation(api.bravos.saveBravosListingUrl);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listingUrl, setListingUrl] = useState(connection?.listingUrl ?? "");
  const [sourceUrl, setSourceUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isSavingListingUrl, setIsSavingListingUrl] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);
  const [reviewCursor, setReviewCursor] = useState<string | null>(null);
  const [reviewCursorHistory, setReviewCursorHistory] = useState<
    Array<string | null>
  >([]);
  const [lastResolvedReviewItemsPage, setLastResolvedReviewItemsPage] =
    useState(initialReviewItemsPage);
  const [selectedTradePlanIds, setSelectedTradePlanIds] = useState<
    Record<string, string>
  >({});

  const isUsingInitialReviewItemsPage = reviewCursor === null;
  const queriedReviewItemsPage = useQuery(
    api.bravos.listBravosReviewItems,
    isUsingInitialReviewItemsPage
      ? "skip"
      : {
          paginationOpts: {
            cursor: reviewCursor,
            numItems: DEFAULT_BRAVOS_REVIEW_PAGE_SIZE,
          },
        },
  );
  const reviewItemsPage = isUsingInitialReviewItemsPage
    ? initialReviewItemsPage
    : queriedReviewItemsPage;

  useEffect(() => {
    if (reviewItemsPage) {
      setLastResolvedReviewItemsPage(reviewItemsPage);
    }
  }, [reviewItemsPage]);

  const displayedReviewItemsPage =
    reviewItemsPage ?? lastResolvedReviewItemsPage;
  const isLoadingReviewItemsPage = !reviewItemsPage;
  const reviewItems = displayedReviewItemsPage.page as BravosReviewItem[];
  const currentReviewPage = reviewCursorHistory.length + 1;

  const queueRows = useMemo(() => {
    const reviewByRunId = new Map<string, BravosReviewItem>();
    const typedSyncRuns = syncRuns as BravosSyncRun[];

    for (const reviewItem of reviewItems) {
      if (reviewItem.syncRunId) {
        reviewByRunId.set(reviewItem.syncRunId, reviewItem);
      }
    }

    const rows: BravosQueueRow[] = [
      ...reviewItems.map((review) => ({
        id: `review:${review._id}`,
        latestRun: review.syncRunId
          ? typedSyncRuns.find((run) => run._id === review.syncRunId)
          : undefined,
        review,
        type: "review" as const,
      })),
      ...typedSyncRuns
        .filter((run) => shouldShowRunRow(run, reviewByRunId))
        .map((run) => ({
          id: `run:${run._id}`,
          run,
          type: "run" as const,
        })),
    ];

    return rows.sort(
      (first, second) => getRowTimestamp(second) - getRowTimestamp(first),
    );
  }, [reviewItems, syncRuns]);

  const selectedRow = useMemo(() => {
    if (!selectedId) {
      return queueRows[0] ?? null;
    }
    return (
      queueRows.find((row) => row.id === selectedId) ?? queueRows[0] ?? null
    );
  }, [queueRows, selectedId]);

  const selectedTargetTradePlanId = useMemo(() => {
    if (selectedRow?.type !== "review") {
      return "";
    }

    const review = selectedRow.review;
    const selectedValue = selectedTradePlanIds[review._id];
    if (selectedValue !== undefined) {
      return selectedValue;
    }

    return findDefaultTradePlanId(review, tradePlans);
  }, [selectedRow, selectedTradePlanIds, tradePlans]);

  useEffect(() => {
    setListingUrl(connection?.listingUrl ?? "");
  }, [connection?.listingUrl]);

  const handlePreviousReviewPage = () => {
    if (reviewCursorHistory.length === 0) {
      return;
    }

    const nextCursorHistory = reviewCursorHistory.slice(0, -1);
    setSelectedId(null);
    setReviewCursor(reviewCursorHistory[reviewCursorHistory.length - 1]);
    setReviewCursorHistory(nextCursorHistory);
  };

  const handleNextReviewPage = () => {
    if (!reviewItemsPage || reviewItemsPage.isDone) {
      return;
    }

    setSelectedId(null);
    setReviewCursorHistory([...reviewCursorHistory, reviewCursor]);
    setReviewCursor(reviewItemsPage.continueCursor);
  };

  const handleConnect = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsConnecting(true);
    try {
      const response = await fetch("/api/bravos/connect", { method: "POST" });
      const data = (await response.json()) as {
        error?: string;
        liveViewUrl?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create Bravos login session");
      }
      setStatusMessage("Bravos login session created.");
      if (data.liveViewUrl) {
        window.open(data.liveViewUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to connect Bravos",
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleFetchPost = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsFetching(true);
    try {
      const response = await fetch("/api/bravos/fetch-post", {
        body: JSON.stringify({ sourceUrl }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to queue Bravos post fetch");
      }
      setSourceUrl("");
      setStatusMessage("Bravos post fetch queued.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to queue Bravos fetch",
      );
    } finally {
      setIsFetching(false);
    }
  };

  const handleSaveListingUrl = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSavingListingUrl(true);
    try {
      await saveListingUrl({ listingUrl });
      setStatusMessage("Bravos listing URL saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save listing URL",
      );
    } finally {
      setIsSavingListingUrl(false);
    }
  };

  const handleRunListingScan = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsScanning(true);
    try {
      await requestListingScan({ listingUrl });
      setStatusMessage("Bravos listing scan queued.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to queue listing scan",
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleApprove = async () => {
    if (selectedRow?.type !== "review") {
      return;
    }
    setIsApproving(true);
    setErrorMessage(null);
    try {
      await approveReviewItem({
        reviewItemId: selectedRow.review._id as Id<"bravosReviewItems">,
        selectedTradePlanId: selectedTargetTradePlanId
          ? (selectedTargetTradePlanId as Id<"tradePlans">)
          : undefined,
      });
      setStatusMessage("Bravos review item approved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to approve item",
      );
    } finally {
      setIsApproving(false);
    }
  };

  const handleDismiss = async () => {
    if (selectedRow?.type !== "review") {
      return;
    }
    setIsDismissing(true);
    setErrorMessage(null);
    try {
      await dismissReviewItem({
        reviewItemId: selectedRow.review._id as Id<"bravosReviewItems">,
      });
      setStatusMessage("Bravos review item dismissed.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to dismiss item",
      );
    } finally {
      setIsDismissing(false);
    }
  };

  const handleRetryRun = async (runId: string) => {
    setRetryingRunId(runId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await retrySyncRun({
        syncRunId: runId as Id<"bravosSyncRuns">,
      });
      setStatusMessage("Bravos run queued for retry.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to retry Bravos run",
      );
    } finally {
      setRetryingRunId(null);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pt-8 pb-28 md:pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-olive-12 text-3xl font-semibold"
            data-testid={APP_PAGE_TITLES.importsBravos}
          >
            Bravos Review
          </h1>
          <p className="text-olive-11 mt-2 max-w-3xl text-sm">
            Review captured Bravos posts before they create trade plans, update
            existing plans, or add notes.
          </p>
        </div>
      </div>

      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
      {statusMessage ? <Alert variant="success">{statusMessage}</Alert> : null}

      <Card data-testid={BRAVOS_REVIEW_TEST_IDS.syncCard}>
        <CardContent className="grid gap-5 md:grid-cols-[1fr_1.4fr]">
          <div>
            <div className="flex items-center gap-2">
              <Wifi className="text-olive-11 size-4" />
              <h2 className="text-olive-12 text-base font-medium">
                Bravos Sync
              </h2>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-olive-11">Connection</dt>
                <dd className="text-olive-12">
                  {connection?.status.replace("_", " ") ?? "not connected"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-olive-11">Ready</dt>
                <dd className="text-olive-12">{summary.readyCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-olive-11">Needs attention</dt>
                <dd className="text-olive-12">{summary.needsAttentionCount}</dd>
              </div>
            </dl>
            <Button
              className="mt-4"
              dataTestId={BRAVOS_REVIEW_TEST_IDS.connectButton}
              isLoading={isConnecting}
              onClick={handleConnect}
              type="button"
              variant="outline"
            >
              <RefreshCw className="size-4" />
              {connection?.status === "needs_reconnect"
                ? "Reconnect Bravos"
                : "Connect Bravos"}
            </Button>
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <label
                className="text-olive-12 text-sm font-medium"
                htmlFor="bravos-listing-url"
              >
                Listing URL
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  dataTestId={BRAVOS_REVIEW_TEST_IDS.listingUrlInput}
                  id="bravos-listing-url"
                  onChange={(event) => setListingUrl(event.target.value)}
                  placeholder="https://bravosresearch.com/category/portfolio-update/"
                  type="url"
                  value={listingUrl}
                />
                <Button
                  dataTestId={BRAVOS_REVIEW_TEST_IDS.saveListingUrlButton}
                  disabled={!listingUrl.trim()}
                  isLoading={isSavingListingUrl}
                  onClick={handleSaveListingUrl}
                  type="button"
                  variant="outline"
                >
                  Save
                </Button>
                <Button
                  dataTestId={BRAVOS_REVIEW_TEST_IDS.listingScanButton}
                  disabled={!listingUrl.trim()}
                  isLoading={isScanning}
                  onClick={handleRunListingScan}
                  type="button"
                >
                  <RefreshCw className="size-4" />
                  Run scan
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label
                className="text-olive-12 text-sm font-medium"
                htmlFor="bravos-post-url"
              >
                Fetch specific post
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  dataTestId={BRAVOS_REVIEW_TEST_IDS.fetchPostInput}
                  id="bravos-post-url"
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://..."
                  type="url"
                  value={sourceUrl}
                />
                <Button
                  dataTestId={BRAVOS_REVIEW_TEST_IDS.fetchPostButton}
                  disabled={!sourceUrl.trim()}
                  isLoading={isFetching}
                  onClick={handleFetchPost}
                  type="button"
                >
                  <Send className="size-4" />
                  Fetch
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <div className="space-y-3">
          <BravosReviewList
            onRetryRun={(runId) => void handleRetryRun(runId)}
            onSelect={setSelectedId}
            retryingRunId={retryingRunId}
            rows={queueRows}
            selectedId={selectedRow?.id ?? null}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-olive-11">
              Showing {reviewItems.length} review
              {reviewItems.length === 1 ? "" : "s"}
            </p>
            <PaginationControls
              currentPage={currentReviewPage}
              isLoading={isLoadingReviewItemsPage}
              nextDisabled={displayedReviewItemsPage.isDone}
              nextTestId={BRAVOS_REVIEW_TEST_IDS.paginationNext}
              onNext={handleNextReviewPage}
              onPrevious={handlePreviousReviewPage}
              previousDisabled={reviewCursorHistory.length === 0}
              previousTestId={BRAVOS_REVIEW_TEST_IDS.paginationPrev}
            />
          </div>
        </div>
        <BravosReviewDetail
          isApproving={isApproving}
          isDismissing={isDismissing}
          onApprove={handleApprove}
          onDismiss={handleDismiss}
          onRetryRun={(runId) => void handleRetryRun(runId)}
          onTargetTradePlanChange={(tradePlanId) => {
            if (selectedRow?.type !== "review") {
              return;
            }
            setSelectedTradePlanIds((current) => ({
              ...current,
              [selectedRow.review._id]: tradePlanId,
            }));
          }}
          retryingRunId={retryingRunId}
          row={selectedRow}
          selectedTargetTradePlanId={selectedTargetTradePlanId}
          tradePlans={tradePlans}
        />
      </div>
    </main>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findDefaultTradePlanId(
  review: BravosReviewItem,
  tradePlans: BravosTradePlanOption[],
): string {
  const explicitTarget = review.proposedAction.targetTradePlanId;
  if (
    explicitTarget &&
    tradePlans.some((tradePlan) => tradePlan._id === explicitTarget)
  ) {
    return explicitTarget;
  }

  const explicitSymbol = review.proposedAction.instrumentSymbol?.trim();
  if (explicitSymbol) {
    const matchedPlan = tradePlans.find(
      (tradePlan) =>
        tradePlan.instrumentSymbol.toUpperCase() ===
        explicitSymbol.toUpperCase(),
    );
    if (matchedPlan) {
      return matchedPlan._id;
    }
  }

  const searchableText = [review.sourceTitle, review.rawText]
    .filter(Boolean)
    .join(" ");
  const matchingPlan = [...tradePlans]
    .sort((first, second) => {
      return second.instrumentSymbol.length - first.instrumentSymbol.length;
    })
    .find((tradePlan) => {
      const symbol = tradePlan.instrumentSymbol.trim();
      if (!symbol) {
        return false;
      }
      return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(symbol)}([^A-Z0-9]|$)`, "i").test(
        searchableText,
      );
    });

  return matchingPlan?._id ?? "";
}
