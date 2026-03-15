"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StrategyEditor } from "~/components/ui/strategy-editor";
import { Alert } from "~/components/ui/alert";
import { api } from "~/convex/_generated/api";
import { APP_PAGE_TITLES } from "../../../../shared/e2e/testIds";

type SaveState = "idle" | "saving" | "saved";

export default function StrategyPageClient({
  preloadedDoc,
}: {
  preloadedDoc: Preloaded<typeof api.strategyDoc.get>;
}) {
  const doc = usePreloadedQuery(preloadedDoc);
  const saveDoc = useMutation(api.strategyDoc.save);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarkdownRef = useRef<string | null>(null);

  const flushPendingSave = useCallback(
    async (updateState = true) => {
      const pendingMarkdown = pendingMarkdownRef.current;
      if (pendingMarkdown === null) {
        return;
      }

      pendingMarkdownRef.current = null;
      if (updateState) {
        setSaveState("saving");
      }

      try {
        await saveDoc({ content: pendingMarkdown });
        if (updateState) {
          setSaveState("saved");
          savedTimerRef.current = setTimeout(() => {
            setSaveState("idle");
          }, 2000);
        }
      } catch (err) {
        if (updateState) {
          setError(err instanceof Error ? err.message : "Failed to save");
          setSaveState("idle");
        }
      }
    },
    [saveDoc],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      void flushPendingSave(false);
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, [flushPendingSave]);

  const handleUpdate = useCallback(
    (markdown: string) => {
      setError(null);
      pendingMarkdownRef.current = markdown;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }

      setSaveState("idle");

      debounceTimerRef.current = setTimeout(() => {
        void flushPendingSave();
      }, 1000);
    },
    [flushPendingSave],
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1
          className="text-2xl font-bold text-slate-12"
          data-testid={APP_PAGE_TITLES.strategy}
        >
          Strategy
        </h1>
        <div className="flex items-center gap-2 text-sm">
          {saveState === "saving" && (
            <span className="flex items-center gap-1 text-olive-11">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </span>
          )}
          {saveState === "saved" && (
            <span className="flex items-center gap-1 text-grass-9">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </div>

      {error && (
        <Alert
          variant="error"
          className="mb-4"
          onDismiss={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      <StrategyEditor
        initialContent={doc?.content ?? ""}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
