"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StrategyEditor } from "~/components/ui/strategy-editor";
import { api } from "~/convex/_generated/api";

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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleUpdate = useCallback(
    (markdown: string) => {
      setError(null);

      // Clear any existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Clear any "saved" timer so we don't flash "Saved" while typing
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }

      setSaveState("idle");

      // Debounce: save 1 second after last keystroke
      debounceTimerRef.current = setTimeout(async () => {
        setSaveState("saving");
        try {
          await saveDoc({ content: markdown });
          setSaveState("saved");
          savedTimerRef.current = setTimeout(() => {
            setSaveState("idle");
          }, 2000);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to save",
          );
          setSaveState("idle");
        }
      }, 1000);
    },
    [saveDoc],
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-12">Strategy</h1>
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
          {error && (
            <span className="text-red-9">{error}</span>
          )}
        </div>
      </div>

      <StrategyEditor
        initialContent={doc?.content ?? ""}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
