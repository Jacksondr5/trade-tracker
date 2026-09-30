"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { z } from "zod";
import { Alert, Button, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { getEpisodePlanSaveTestId } from "../../../shared/e2e/testIds";
import { getMutationErrorMessage } from "./format";
import type { PlanEditSession } from "./planEditSession";
import {
  PLAN_SECTION_LABELS,
  PLAN_SECTION_ORDER,
  type PlanLine,
  type PlanSections,
} from "./types";

type SectionKey = keyof PlanSections;
type PlanFormValues = Record<SectionKey, string>;

const MAX_LINES_PER_SECTION = 25;
const MAX_LINE_LENGTH = 1000;

function nonEmptyLines(value: string): string[] {
  return value
    .split("\n")
    .map((text) => text.trim())
    .filter((text) => text.length > 0);
}

const sectionTextSchema = z
  .string()
  .refine((value) => nonEmptyLines(value).length <= MAX_LINES_PER_SECTION, {
    message: `At most ${MAX_LINES_PER_SECTION} lines`,
  })
  .refine(
    (value) => nonEmptyLines(value).every((line) => line.length <= MAX_LINE_LENGTH),
    { message: `Each line must be ${MAX_LINE_LENGTH} characters or fewer` },
  );

const planFormSchema = z.object({
  entry: sectionTextSchema,
  stop: sectionTextSchema,
  targets: sectionTextSchema,
  scenarios: sectionTextSchema,
  structure: sectionTextSchema,
  size: sectionTextSchema,
});

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
    sections[key] = nonEmptyLines(values[key]).map((text): PlanLine => {
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

function isConflictError(error: unknown): boolean {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    data.code === "CONFLICT"
  );
}

export function PlanEditForm({
  episodeId,
  onCancel,
  onReload,
  onSaved,
  session,
}: {
  episodeId: Id<"episodes">;
  onCancel: () => void;
  onReload: () => void;
  onSaved: () => void;
  session: PlanEditSession;
}) {
  const savePlanVersion = useMutation(api.threads.savePlanVersionFromApp);
  const [error, setError] = useState<string | null>(null);
  // Snapshot taken when the session opened; live query updates do not touch it.
  const { baseVersionNumber, baselineSections: checkpoint, observedRevision } =
    session;

  const form = useAppForm({
    defaultValues: toFormValues(checkpoint),
    validators: {
      onChange: ({ value }) => {
        const result = planFormSchema.safeParse(value);
        if (!result.success) {
          return result.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = planFormSchema.safeParse(value);
      if (!parsed.success) return;
      try {
        await savePlanVersion({
          baseVersionNumber,
          episodeId,
          observedRevision,
          sections: toPlanSections(parsed.data, checkpoint),
        });
        onSaved();
      } catch (caught) {
        const message = getMutationErrorMessage(
          caught,
          "Failed to save checkpoint",
        );
        // The Reload button sits right below, so a conflict needs no extra
        // instruction; the server message already says what changed.
        setError(
          isConflictError(caught)
            ? "The plan changed while you were editing. Reload to start from the latest version."
            : message,
        );
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
      {session.draftVersionNumber !== null ? (
        <p
          className="text-sm text-amber-11"
          data-testid={`episode-plan-draft-note-${episodeId}`}
        >
          An unendorsed draft v{session.draftVersionNumber} exists; saving
          creates a new endorsed version after it.
        </p>
      ) : null}
      {error ? (
        <Alert variant="error" data-testid={`episode-plan-error-${episodeId}`}>
          {error}
        </Alert>
      ) : null}
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
          dataTestId={`episode-plan-reload-${episodeId}`}
          onClick={onReload}
        >
          Reload
        </Button>
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
