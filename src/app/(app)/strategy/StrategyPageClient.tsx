"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StrategyEditor } from "~/components/ui/strategy-editor";
import { Alert } from "~/components/ui/alert";
import { api } from "~/convex/_generated/api";
import {
  APP_PAGE_TITLES,
  STRATEGY_TEST_IDS,
} from "../../../../shared/e2e/testIds";

type SaveState = "idle" | "saving" | "saved";

function formatLastUpdated(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export default function StrategyPageClient({
  preloadedDoc,
}: {
  preloadedDoc: Preloaded<typeof api.strategyDoc.get>;
}) {
  const doc = usePreloadedQuery(preloadedDoc);
  const saveDoc = useMutation(api.strategyDoc.save);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(() => !!doc?.content);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarkdownRef = useRef<string | null>(null);

  // Sync showEditor when doc loads with content
  useEffect(() => {
    if (doc?.content) {
      setShowEditor(true);
    }
  }, [doc?.content]);

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
          setError(
            err instanceof Error
              ? err.message
              : "Could not save strategy. Retry in a moment.",
          );
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

  const hasContent = !!doc?.content;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Document header */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4">
          <h1
            className="text-3xl font-bold text-olive-12"
            data-testid={APP_PAGE_TITLES.strategy}
          >
            Strategy
          </h1>
          <div
            className="flex items-center gap-2 text-sm"
            data-testid={STRATEGY_TEST_IDS.saveStatus}
          >
            {saveState === "saving" && (
              <span className="flex items-center gap-1.5 text-olive-11">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </span>
            )}
            {saveState === "saved" && (
              <span className="flex items-center gap-1.5 text-grass-9">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-olive-11">
          Your formal operating document for rules, allocations, and frameworks.
        </p>
        {doc?.updatedAt && (
          <p
            className="mt-1 text-xs text-olive-11"
            data-testid={STRATEGY_TEST_IDS.lastUpdated}
          >
            Last updated {formatLastUpdated(doc.updatedAt)}
          </p>
        )}
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

      {/* Empty state */}
      {!showEditor && !hasContent && (
        <div
          className="rounded-lg border border-olive-6 bg-olive-2 p-6"
          data-testid={STRATEGY_TEST_IDS.emptyState}
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-olive-3">
              <FileText className="h-5 w-5 text-olive-11" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-olive-12">
                No strategy document yet
              </h2>
              <p className="mt-1 text-sm text-olive-11">
                Document the rules, allocations, and frameworks that govern your
                trading. This becomes the durable reference behind campaigns and
                trade plans.
              </p>
              <button
                className="mt-4 rounded-md bg-grass-9 px-4 py-2 text-sm font-medium text-grass-1 hover:bg-grass-10"
                data-testid={STRATEGY_TEST_IDS.emptyStateCta}
                onClick={() => setShowEditor(true)}
              >
                Start writing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document surface */}
      {(showEditor || hasContent) && (
        <div
          className="overflow-hidden rounded-lg border border-olive-6 bg-olive-2"
          data-testid={STRATEGY_TEST_IDS.editor}
        >
          {/* Document top rule */}
          <div className="border-b border-olive-6 px-8 py-3">
            <span className="text-xs font-medium uppercase tracking-wide text-olive-11">
              Strategy Document
            </span>
          </div>
          {/* Editor body */}
          <div className="px-2 py-2">
            <StrategyEditor
              initialContent={doc?.content ?? ""}
              onUpdate={handleUpdate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
