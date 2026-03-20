"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";

interface RetrospectiveSectionProps {
  isClosed: boolean;
  parentId: Id<"campaigns"> | Id<"tradePlans">;
  parentKind: "campaign" | "tradePlan";
  testIdPrefix: string;
}

const parentKindLabels: Record<"campaign" | "tradePlan", string> = {
  campaign: "campaign",
  tradePlan: "trade plan",
};

export function RetrospectiveSection({
  isClosed,
  parentId,
  parentKind,
  testIdPrefix,
}: RetrospectiveSectionProps) {
  const retrospective = useQuery(api.retrospectives.getRetrospective, {
    parentId,
  });
  const upsertRetrospective = useMutation(
    api.retrospectives.upsertRetrospective,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const hasContent = Boolean(retrospective?.content?.trim());

  const startEditing = () => {
    setIsEditing(true);
    setEditContent(retrospective?.content ?? "");
    setError(null);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditContent("");
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);

    try {
      const trimmed = editContent.trim();
      await upsertRetrospective({
        content: trimmed,
        parentId,
        parentKind,
      });
      setIsEditing(false);
      setEditContent("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save review",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-enter edit mode when closed with no content yet
  useEffect(() => {
    if (isClosed && retrospective !== undefined && !hasContent && !isEditing) {
      startEditing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClosed, retrospective, hasContent]);

  const label = parentKindLabels[parentKind];

  return (
    <section
      className="group mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4"
      data-testid={`${testIdPrefix}-retrospective-section`}
    >
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-olive-12">
          {parentKind === "campaign" ? "Campaign" : "Trade Plan"} Review
        </h2>
        {isClosed && hasContent && !isEditing && (
          <button
            type="button"
            aria-label="Edit review"
            title="Edit"
            className="rounded p-1 text-olive-10 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-olive-4 hover:text-olive-12 focus-visible:opacity-100"
            data-testid={`${testIdPrefix}-edit-retrospective-button`}
            onClick={startEditing}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!isClosed ? (
        <p className="text-sm text-olive-11">
          Review becomes available when the {label} is closed.
        </p>
      ) : isEditing ? (
        <div className="space-y-1.5">
          {!hasContent && (
            <p className="mb-2 text-sm text-olive-10">
              Capture what you learned while it&apos;s fresh.
            </p>
          )}
          {error && (
            <Alert
              variant="error"
              className="mb-2"
              onDismiss={() => setError(null)}
            >
              {error}
            </Alert>
          )}
          <label
            htmlFor={`${testIdPrefix}-retrospective-textarea`}
            className="sr-only"
          >
            {parentKind === "campaign" ? "Campaign" : "Trade Plan"} Review
          </label>
          <textarea
            id={`${testIdPrefix}-retrospective-textarea`}
            data-testid={`${testIdPrefix}-retrospective-textarea`}
            className="min-h-20 w-full rounded-md border border-olive-7 bg-transparent px-3 py-2 text-sm text-olive-12 focus:ring-2 focus:ring-blue-8 focus:outline-none"
            rows={8}
            placeholder="What worked, what didn't, and what would you do differently?"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
          <div className="flex items-center gap-1.5">
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Save review"
                title="Save"
                className="rounded p-1 text-grass-9 hover:bg-grass-3 disabled:opacity-50"
                data-testid={`${testIdPrefix}-save-retrospective-button`}
                onClick={() => void handleSave()}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
              {hasContent && (
                <button
                  type="button"
                  aria-label="Cancel editing"
                  title="Cancel"
                  className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid={`${testIdPrefix}-cancel-retrospective-button`}
                  onClick={() => {
                    if (isSaving) return;
                    cancelEditing();
                  }}
                  disabled={isSaving}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap text-olive-12">
          {retrospective?.content}
        </p>
      )}
    </section>
  );
}
