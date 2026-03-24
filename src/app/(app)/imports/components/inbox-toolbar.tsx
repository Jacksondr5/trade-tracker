"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui";

interface InboxToolbarProps {
  acceptableCount: number;
  isAccepting: boolean;
  isDeleting: boolean;
  missingPlanCount: number;
  needsReviewCount: number;
  onAcceptAll: () => Promise<void>;
  onDeleteAll: () => void;
  readyCount: number;
  totalCount: number;
}

type StatusColor = "bg-grass-9" | "bg-amber-9" | "bg-red-9";

function StatSegment({
  color,
  count,
  dataTestId,
  label,
}: {
  color: StatusColor;
  count: number;
  dataTestId: string;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm text-olive-11"
      data-testid={dataTestId}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {count} {label}
    </span>
  );
}

export function InboxToolbar({
  acceptableCount,
  isAccepting,
  isDeleting,
  missingPlanCount,
  needsReviewCount,
  onAcceptAll,
  onDeleteAll,
  readyCount,
  totalCount,
}: InboxToolbarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const resetConfirmDeleteTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    return () => {
      if (resetConfirmDeleteTimeoutRef.current) {
        clearTimeout(resetConfirmDeleteTimeoutRef.current);
      }
    };
  }, []);

  if (totalCount === 0) return null;

  const handleDeleteClick = () => {
    if (isDeleting) return;

    if (resetConfirmDeleteTimeoutRef.current) {
      clearTimeout(resetConfirmDeleteTimeoutRef.current);
      resetConfirmDeleteTimeoutRef.current = null;
    }

    if (confirmDelete) {
      setConfirmDelete(false);
      onDeleteAll();
    } else {
      setConfirmDelete(true);
      resetConfirmDeleteTimeoutRef.current = setTimeout(() => {
        setConfirmDelete(false);
        resetConfirmDeleteTimeoutRef.current = null;
      }, 3000);
    }
  };

  const handleDeleteBlur = () => {
    if (resetConfirmDeleteTimeoutRef.current) {
      clearTimeout(resetConfirmDeleteTimeoutRef.current);
    }

    resetConfirmDeleteTimeoutRef.current = setTimeout(() => {
      setConfirmDelete(false);
      resetConfirmDeleteTimeoutRef.current = null;
    }, 150);
  };

  return (
    <div
      className="rounded-lg border border-olive-6 bg-olive-2 px-4 py-3"
      data-testid="inbox-toolbar"
    >
      {/* Summary stats */}
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-2"
        data-testid="inbox-summary-strip"
      >
        <span
          className="text-sm font-medium text-olive-12"
          data-testid="inbox-summary-total"
        >
          {totalCount} {totalCount === 1 ? "trade" : "trades"} pending review
        </span>
        <span className="hidden h-4 w-px bg-olive-6 sm:inline-block" />
        <StatSegment
          color="bg-grass-9"
          count={readyCount}
          dataTestId="inbox-summary-ready"
          label="ready"
        />
        {missingPlanCount > 0 && (
          <StatSegment
            color="bg-amber-9"
            count={missingPlanCount}
            dataTestId="inbox-summary-missing-plan"
            label="missing trade plan"
          />
        )}
        {needsReviewCount > 0 && (
          <StatSegment
            color="bg-red-9"
            count={needsReviewCount}
            dataTestId="inbox-summary-needs-review"
            label="need review"
          />
        )}

        {/* Bulk actions — pushed right */}
        <div className="ml-auto flex gap-2">
          <Button
            dataTestId="accept-all-trades-button"
            disabled={acceptableCount === 0}
            isLoading={isAccepting}
            onClick={() => void onAcceptAll()}
          >
            Accept {acceptableCount} {acceptableCount === 1 ? "trade" : "trades"}
          </Button>
          <Button
            dataTestId="delete-all-trades-button"
            disabled={isDeleting}
            variant={confirmDelete ? "destructive" : "outline"}
            onClick={handleDeleteClick}
            onBlur={handleDeleteBlur}
          >
            {isDeleting
              ? "Deleting trades..."
              : confirmDelete
                ? `Delete all ${totalCount} trades`
                : "Delete all trades"}
          </Button>
        </div>
      </div>
    </div>
  );
}
