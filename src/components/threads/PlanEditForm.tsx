"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { Alert, Button, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { getEpisodePlanSaveTestId } from "../../../shared/e2e/testIds";
import { getMutationErrorMessage } from "./format";
import {
  PLAN_SECTION_LABELS,
  PLAN_SECTION_ORDER,
  type PlanLine,
  type PlanSections,
} from "./types";

type SectionKey = keyof PlanSections;
type PlanFormValues = Record<SectionKey, string>;

function toFormValues(sections: PlanSections | null): PlanFormValues {
  const values = {} as PlanFormValues;
  for (const key of PLAN_SECTION_ORDER) {
    values[key] = (sections?.[key] ?? []).map((line) => line.text).join("\n");
  }
  return values;
}

/** Non-empty lines; a line whose text matches a checkpoint line keeps its citations and value. */
export function toPlanSections(
  values: PlanFormValues,
  checkpoint: PlanSections | null,
): PlanSections {
  const sections = {} as PlanSections;
  for (const key of PLAN_SECTION_ORDER) {
    const existing = checkpoint?.[key] ?? [];
    sections[key] = values[key]
      .split("\n")
      .map((text) => text.trim())
      .filter((text) => text.length > 0)
      .map((text): PlanLine => {
        const match = existing.find((line) => line.text === text);
        if (!match) return { text };
        const line: PlanLine = { text };
        if (match.asOf !== undefined) line.asOf = match.asOf;
        if (match.elementId !== undefined) line.elementId = match.elementId;
        if (match.noteId !== undefined) line.noteId = match.noteId;
        if (match.value !== undefined) line.value = match.value;
        return line;
      });
  }
  return sections;
}

export function PlanEditForm({
  checkpoint,
  episodeId,
  onCancel,
  onSaved,
}: {
  checkpoint: PlanSections | null;
  episodeId: Id<"episodes">;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const savePlanVersion = useMutation(api.threads.savePlanVersionFromApp);
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: toFormValues(checkpoint),
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await savePlanVersion({
          episodeId,
          sections: toPlanSections(value, checkpoint),
        });
        onSaved();
      } catch (caught) {
        setError(getMutationErrorMessage(caught, "Failed to save checkpoint"));
      }
    },
  });

  return (
    <form
      className="space-y-3 rounded-md border border-olive-6 bg-olive-3 p-4"
      data-testid={`episode-plan-form-${episodeId}`}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <p className="text-sm font-semibold text-olive-12">New checkpoint</p>
      <p className="text-sm text-olive-11">
        One line per row. Saving creates a new endorsed version.
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {PLAN_SECTION_ORDER.map((key) => (
          <form.AppField key={key} name={key}>
            {(field) => (
              <field.FieldTextarea
                label={PLAN_SECTION_LABELS[key]}
                rows={3}
                dataTestId={`episode-plan-${key}-input-${episodeId}`}
              />
            )}
          </form.AppField>
        ))}
      </div>
      <div className="flex gap-2">
        <form.AppForm>
          <form.SubmitButton
            size="sm"
            label="Save checkpoint"
            dataTestId={getEpisodePlanSaveTestId(episodeId)}
          />
        </form.AppForm>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          dataTestId={`episode-plan-cancel-${episodeId}`}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
