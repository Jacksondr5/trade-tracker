"use client";

import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Loader2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  IMPORT_TASK_TRAY_TEST_IDS,
  getImportTaskCardTestId,
  getImportTaskDismissTestId,
  getImportTaskGoToTestId,
  getImportTaskRetryTestId,
} from "../../../shared/e2e/testIds";
import {
  registerImportMutations,
  runImportExtraction,
} from "~/lib/import-orchestrator";

type ImportTask = {
  _creationTime: number;
  _id: Id<"importTasks">;
  chartUrls?: string[];
  createdTradePlanId?: Id<"tradePlans">;
  error?: string;
  extractedData?: string;
  mode: "create" | "follow-up";
  ownerId: string;
  pastedText: string;
  sourceUrl?: string;
  status: "pending" | "processing" | "done" | "error";
  tradePlanId?: Id<"tradePlans">;
};

function TaskStatusIcon({ status }: { status: ImportTask["status"] }) {
  switch (status) {
    case "pending":
    case "processing":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-9" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-grass-9" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-9" />;
  }
}

function TaskCard({ task }: { task: ImportTask }) {
  const dismissTask = useMutation(api.importTasks.dismissImportTask);
  const retryTask = useMutation(api.importTasks.retryImportTask);

  const label =
    task.mode === "create" ? "New trade plan" : "Follow-up import";
  const preview = task.pastedText.slice(0, 60).trim();

  const handleRetry = async () => {
    await retryTask({ taskId: task._id });
    runImportExtraction({
      taskId: task._id,
      mode: task.mode,
      pastedText: task.pastedText,
    });
  };

  return (
    <div
      className="flex gap-2 rounded-md border border-olive-6 bg-olive-3 p-3"
      data-testid={getImportTaskCardTestId(task._id)}
    >
      <div className="flex-none pt-0.5">
        <TaskStatusIcon status={task.status} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-olive-12">{label}</span>
          <button
            type="button"
            aria-label="Dismiss"
            data-testid={getImportTaskDismissTestId(task._id)}
            className="rounded p-0.5 text-olive-10 hover:bg-olive-4 hover:text-olive-12"
            onClick={() => void dismissTask({ taskId: task._id })}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <p className="truncate text-xs text-olive-11">{preview}...</p>

        {task.status === "done" && task.createdTradePlanId && (
          <Link
            href={`/trade-plans/${task.createdTradePlanId}`}
            data-testid={getImportTaskGoToTestId(task._id)}
            className="inline-block text-xs font-medium text-blue-9 hover:underline"
          >
            Go to trade plan &rarr;
          </Link>
        )}

        {task.status === "error" && (
          <div className="space-y-1">
            <p className="text-xs text-red-9">
              {task.error ?? "Extraction failed"}
            </p>
            <button
              type="button"
              data-testid={getImportTaskRetryTestId(task._id)}
              className="text-xs font-medium text-blue-9 hover:underline"
              onClick={() => void handleRetry()}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ImportTaskTray({ compact }: { compact?: boolean }) {
  const tasks = useQuery(api.importTasks.listImportTasks) ?? [];
  const completeTask = useMutation(api.importTasks.completeImportTask);
  const failTask = useMutation(api.importTasks.failImportTask);

  useEffect(() => {
    registerImportMutations(completeTask, failTask);
  }, [completeTask, failTask]);

  if (tasks.length === 0) {
    return null;
  }

  const activeCount = tasks.filter(
    (t) => t.status === "pending" || t.status === "processing",
  ).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Import tasks (${tasks.length})`}
          data-testid={IMPORT_TASK_TRAY_TEST_IDS.trigger}
          className={`relative rounded-full border border-olive-6 bg-transparent text-olive-12 hover:bg-olive-3 ${
            compact ? "h-8 w-8 p-1.5" : "h-9 w-9 p-2"
          }`}
        >
          <ClipboardPaste className="h-full w-full" />
          {tasks.length > 0 && (
            <span
              className={`absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                activeCount > 0
                  ? "bg-blue-9 text-white"
                  : "bg-olive-8 text-olive-12"
              }`}
            >
              {tasks.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 space-y-2 p-3"
        data-testid={IMPORT_TASK_TRAY_TEST_IDS.content}
      >
        <h3 className="text-sm font-semibold text-olive-12">Imports</h3>
        {tasks.map((task) => (
          <TaskCard key={task._id} task={task as ImportTask} />
        ))}
      </PopoverContent>
    </Popover>
  );
}
