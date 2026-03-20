"use client";

import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Alert, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";

const retrospectiveSchema = z.object({
  retrospective: z.string(),
});

type SaveState = "idle" | "saving" | "saved";

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

  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const form = useAppForm({
    defaultValues: {
      retrospective: "",
    },
    validators: {
      onChange: () => {
        setError(null);
        if (saveState === "saved") {
          setSaveState("idle");
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setError(null);
      setSaveState("saving");

      try {
        const parsed = retrospectiveSchema.parse(value);
        const trimmedContent = parsed.retrospective.trim();
        await upsertRetrospective({
          content: trimmedContent,
          parentId,
          parentKind,
        });
        form.setFieldValue("retrospective", trimmedContent);
        setSaveState("saved");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save review",
        );
        setSaveState("idle");
      }
    },
  });

  useEffect(() => {
    if (retrospective !== undefined && !initialized) {
      form.setFieldValue("retrospective", retrospective?.content ?? "");
      setInitialized(true);
    }
  }, [retrospective, form, initialized]);

  const label = parentKindLabels[parentKind];

  return (
    <section
      className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4"
      data-testid={`${testIdPrefix}-retrospective-section`}
    >
      <h2 className="mb-3 text-lg font-semibold text-olive-12">
        {parentKind === "campaign" ? "Campaign" : "Trade Plan"} Review
      </h2>

      {!isClosed ? (
        <p className="text-sm text-olive-11">
          Review becomes available when the {label} is closed.
        </p>
      ) : (
        <>
          {!retrospective?.content?.trim() && (
            <p className="mb-3 text-sm text-olive-10">
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.AppField name="retrospective">
              {(field) => (
                <field.FieldTextarea
                  dataTestId={`${testIdPrefix}-retrospective-textarea`}
                  label={`${parentKind === "campaign" ? "Campaign" : "Trade Plan"} Review`}
                  rows={8}
                  placeholder="What worked, what didn't, and what would you do differently?"
                />
              )}
            </form.AppField>
            <div className="mt-2 flex items-center gap-3">
              <form.AppForm>
                <form.SubmitButton
                  dataTestId={`${testIdPrefix}-save-retrospective-button`}
                  label="Save review"
                />
              </form.AppForm>

              {saveState === "saving" && (
                <span className="flex items-center gap-1 text-sm text-olive-11">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              )}

              {saveState === "saved" && (
                <span className="flex items-center gap-1 text-sm text-grass-9">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
