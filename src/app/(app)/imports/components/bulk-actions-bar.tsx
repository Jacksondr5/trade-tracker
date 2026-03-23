"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui";

interface BulkActionsBarProps {
  isAccepting: boolean;
  onAcceptAll: () => Promise<void>;
  onDeleteAll: () => void;
  readyCount: number;
  totalCount: number;
}

export function BulkActionsBar({
  isAccepting,
  onAcceptAll,
  onDeleteAll,
  readyCount,
  totalCount,
}: BulkActionsBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const resetConfirmDeleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetConfirmDeleteTimeoutRef.current) {
        clearTimeout(resetConfirmDeleteTimeoutRef.current);
      }
    };
  }, []);

  if (totalCount === 0) return null;

  const handleDeleteClick = () => {
    if (resetConfirmDeleteTimeoutRef.current) {
      clearTimeout(resetConfirmDeleteTimeoutRef.current);
      resetConfirmDeleteTimeoutRef.current = null;
    }

    if (confirmDelete) {
      setConfirmDelete(false);
      onDeleteAll();
    } else {
      setConfirmDelete(true);
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
      className="flex items-center justify-between rounded-lg border border-olive-6 bg-olive-2 px-4 py-2"
      data-testid="bulk-actions-bar"
    >
      <span
        className="text-sm text-olive-11"
        data-testid="bulk-actions-ready-count"
      >
        {readyCount} of {totalCount} trades ready to accept
      </span>
      <div className="flex gap-2">
        <Button
          dataTestId="accept-all-trades-button"
          disabled={readyCount === 0}
          isLoading={isAccepting}
          onClick={() => void onAcceptAll()}
        >
          Accept {readyCount} {readyCount === 1 ? "trade" : "trades"}
        </Button>
        <Button
          dataTestId="delete-all-trades-button"
          variant={confirmDelete ? "destructive" : "outline"}
          onClick={handleDeleteClick}
          onBlur={handleDeleteBlur}
        >
          {confirmDelete
            ? `Delete all ${totalCount} trades`
            : "Delete all trades"}
        </Button>
      </div>
    </div>
  );
}
