"use client";

import React from "react";
import { Button } from "~/components/ui";

export function ImportSyncControls({
  isSyncing,
  onSyncNow,
}: {
  isSyncing: boolean;
  onSyncNow: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 p-4">
      <p className="text-sm text-slate-300">Run a manual sync to fetch latest executions.</p>
      <Button
        dataTestId="imports-sync-now"
        isLoading={isSyncing}
        onClick={onSyncNow}
        size="sm"
      >
        Sync now
      </Button>
    </div>
  );
}
