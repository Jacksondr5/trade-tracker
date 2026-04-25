import { Button } from "~/components/ui";
import {
  BRAVOS_REVIEW_TEST_IDS,
  getBravosRunRetryTestId,
} from "../../../../../../shared/e2e/testIds";
import type { BravosQueueRow, BravosSyncRun } from "./bravos-review-detail";

function getRowStatus(row: BravosQueueRow): string {
  return row.type === "review" ? row.review.reviewState : row.run.status;
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getRowStatusClassName(status: string): string {
  if (status === "ready" || status === "done") {
    return "border-grass-7 bg-grass-3 text-grass-12";
  }
  if (status === "error" || status === "failed" || status === "needs_attention") {
    return "border-red-7 bg-red-3 text-red-12";
  }
  if (status === "processing") {
    return "border-blue-7 bg-blue-3 text-blue-12";
  }
  return "border-amber-7 bg-amber-3 text-amber-12";
}

function getRowTitle(row: BravosQueueRow): string {
  if (row.type === "review") {
    return row.review.sourceTitle ?? row.review.sourceUrl;
  }

  return row.run.requestedSourceUrl ?? formatLabel(row.run.kind);
}

function getRowMeta(row: BravosQueueRow): string {
  if (row.type === "review") {
    return [
      row.review.sourceTitle ? row.review.sourceUrl : null,
      row.review.classification ? formatLabel(row.review.classification) : null,
      row.review.sourcePostDate,
      row.latestRun ? `Latest run ${formatLabel(row.latestRun.status)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return row.run.error ?? formatLabel(row.run.kind);
}

function getRetryableRun(row: BravosQueueRow): BravosSyncRun | null {
  if (row.type === "run") {
    return row.run.status === "done" ? null : row.run;
  }

  if (!row.latestRun || row.latestRun.status === "done") {
    return null;
  }

  return row.latestRun;
}

export function BravosReviewList({
  onRetryRun,
  onSelect,
  retryingRunId,
  rows,
  selectedId,
}: {
  onRetryRun: (runId: string) => void;
  onSelect: (id: string) => void;
  retryingRunId: string | null;
  rows: BravosQueueRow[];
  selectedId: string | null;
}) {
  return (
    <div
      className="border-olive-4 bg-olive-2 overflow-hidden rounded-md border"
      data-testid={BRAVOS_REVIEW_TEST_IDS.list}
    >
      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-olive-12 text-sm font-medium">
            No Bravos queue items yet
          </p>
          <p className="text-olive-11 mt-1 text-sm">
            Queued fetches and review items will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-olive-4 divide-y">
          {rows.map((row) => {
            const status = getRowStatus(row);
            const retryableRun = getRetryableRun(row);
            return (
              <li
                className={
                  selectedId === row.id ? "bg-olive-3" : "hover:bg-olive-3/70"
                }
                key={row.id}
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <button
                    className="min-w-0 flex-1 text-left"
                    data-testid={`bravos-queue-item-${row.id}`}
                    onClick={() => onSelect(row.id)}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="text-olive-12 block truncate text-sm font-medium">
                          {getRowTitle(row)}
                        </span>
                        <span className="text-olive-11 mt-1 block line-clamp-2 text-xs">
                          {getRowMeta(row)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${getRowStatusClassName(
                          status,
                        )}`}
                      >
                        {formatLabel(status)}
                      </span>
                    </span>
                  </button>
                  {retryableRun ? (
                    <Button
                      dataTestId={getBravosRunRetryTestId(retryableRun._id)}
                      isLoading={retryingRunId === retryableRun._id}
                      onClick={() => onRetryRun(retryableRun._id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
