"use client";

import { useState } from "react";
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

  if (totalCount === 0) return null;

  const handleDeleteClick = () => {
    if (confirmDelete) {
      setConfirmDelete(false);
      onDeleteAll();
    } else {
      setConfirmDelete(true);
    }
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
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete
            ? `Delete all ${totalCount} trades`
            : "Delete all trades"}
        </Button>
      </div>
    </div>
  );
}
