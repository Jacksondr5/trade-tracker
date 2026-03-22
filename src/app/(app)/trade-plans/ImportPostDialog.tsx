"use client";

import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog";
import { EvidenceCarousel } from "~/components/notes/EvidenceCarousel";
import { Alert } from "~/components/ui";
import { IMPORT_POST_DIALOG_TEST_IDS } from "../../../../shared/e2e/testIds";
import { runImportExtraction } from "~/lib/import-orchestrator";

type ImportMode = "create" | "follow-up";

interface ImportPostDialogProps {
  mode: ImportMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradePlanId?: Id<"tradePlans">;
}

export function ImportPostDialog({
  mode,
  open,
  onOpenChange,
  tradePlanId,
}: ImportPostDialogProps) {
  const [pastedText, setPastedText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [chartUrls, setChartUrls] = useState<string[]>([""]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createImportTask = useMutation(api.importTasks.createImportTask);

  const resetState = useCallback(() => {
    setPastedText("");
    setSourceUrl("");
    setChartUrls([""]);
    setSubmitError(null);
    setIsSubmitting(false);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetState();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, resetState],
  );

  const handleImport = async () => {
    if (!pastedText.trim() || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    const normalizedUrls = chartUrls.map((u) => u.trim()).filter(Boolean);

    try {
      const taskId = await createImportTask({
        mode,
        pastedText: pastedText.trim(),
        sourceUrl: sourceUrl.trim() || undefined,
        chartUrls: normalizedUrls.length > 0 ? normalizedUrls : undefined,
        tradePlanId: mode === "follow-up" ? tradePlanId : undefined,
      });

      runImportExtraction({
        taskId,
        mode,
        pastedText: pastedText.trim(),
      });

      handleOpenChange(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to queue import",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto"
        data-testid={IMPORT_POST_DIALOG_TEST_IDS.dialog}
      >
        <DialogTitle>
          {mode === "create"
            ? "Import trade plan from post"
            : "Import follow-up post"}
        </DialogTitle>
        <DialogDescription>
          {mode === "create"
            ? "Paste the service's initiate post text. AI will extract trade plan fields."
            : "Paste the follow-up post text. AI will extract updates and create a note."}
        </DialogDescription>

        <div className="mt-4 space-y-4">
          {/* Paste textarea */}
          <div>
            <label
              htmlFor="import-paste-text"
              className="mb-1 block text-sm font-medium text-olive-12"
            >
              Post text
            </label>
            <textarea
              id="import-paste-text"
              data-testid={IMPORT_POST_DIALOG_TEST_IDS.pasteTextarea}
              className="w-full rounded-md border border-olive-7 bg-transparent px-3 py-2 text-sm text-olive-12 placeholder:text-slate-11 focus:ring-2 focus:ring-blue-8 focus:outline-none"
              rows={6}
              placeholder="Paste the service post here..."
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
            />
          </div>

          {/* Source URL (create mode only) */}
          {mode === "create" && (
            <div>
              <label
                htmlFor="import-source-url"
                className="mb-1 block text-sm font-medium text-olive-12"
              >
                Source URL <span className="text-olive-11">(optional)</span>
              </label>
              <input
                id="import-source-url"
                type="url"
                data-testid={IMPORT_POST_DIALOG_TEST_IDS.sourceUrlInput}
                className="w-full rounded-md border border-olive-7 bg-transparent px-3 py-2 text-sm text-olive-12 placeholder:text-slate-11 focus:ring-2 focus:ring-blue-8 focus:outline-none"
                placeholder="Link to original post"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </div>
          )}

          {/* Chart image URLs — always visible */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-olive-12">
                Chart images <span className="text-olive-11">(optional)</span>
              </label>
              <button
                type="button"
                aria-label="Add chart image URL"
                className="rounded-md border border-olive-7 px-2 py-1 text-xs text-olive-11 hover:bg-olive-4 hover:text-olive-12"
                onClick={() => setChartUrls((prev) => [...prev, ""])}
              >
                + Add URL
              </button>
            </div>
            {chartUrls.map((url, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="url"
                  aria-label={`Chart URL ${i + 1}`}
                  className="flex-1 rounded-md border border-olive-7 bg-transparent px-3 py-1.5 text-sm text-olive-12 placeholder:text-slate-11 focus:ring-2 focus:ring-blue-8 focus:outline-none"
                  placeholder="Chart image URL"
                  value={url}
                  onChange={(e) =>
                    setChartUrls((prev) =>
                      prev.map((u, j) => (j === i ? e.target.value : u)),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove chart URL ${i + 1}`}
                  className="rounded p-1.5 text-olive-10 hover:bg-olive-4 hover:text-red-9"
                  onClick={() =>
                    setChartUrls((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  &times;
                </button>
              </div>
            ))}
            {chartUrls.filter((u) => u.trim()).length > 0 && (
              <EvidenceCarousel urls={chartUrls.filter((u) => u.trim())} />
            )}
          </div>

          {/* Submit error */}
          {submitError && (
            <Alert variant="error" onDismiss={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          {/* Import button */}
          <button
            type="button"
            data-testid={IMPORT_POST_DIALOG_TEST_IDS.processButton}
            disabled={!pastedText.trim() || isSubmitting}
            onClick={() => void handleImport()}
            className="rounded-md bg-blue-9 px-4 py-2 text-sm font-medium text-white hover:bg-blue-10 disabled:opacity-50"
          >
            {isSubmitting ? "Importing..." : "Import"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
