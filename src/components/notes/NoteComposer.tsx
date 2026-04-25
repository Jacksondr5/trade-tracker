"use client";

import { useState } from "react";
import { z } from "zod";
import {
  getNoteComposerDateInputTestId,
  getNoteComposerFormTestId,
  getNoteComposerSubmitButtonTestId,
  getNoteComposerTextareaTestId,
} from "../../../shared/e2e/testIds";
import { Alert, useAppForm } from "~/components/ui";
import { parseDateTimeLocalValue, toDateTimeLocalValue } from "./date";
import { EvidenceUrlInputs } from "./EvidenceUrlInputs";

const noteSchema = z.object({
  content: z.string().trim().min(1, "Note content is required"),
});

function normalizeUrls(urls: string[]) {
  return urls.map((u) => u.trim()).filter(Boolean);
}

interface NoteComposerProps {
  defaultShowEvidence?: boolean;
  onAddNote: (
    content: string,
    noteDate: number,
    chartUrls?: string[],
  ) => Promise<void>;
  testIdPrefix: string;
}

export function NoteComposer({
  defaultShowEvidence = false,
  onAddNote,
  testIdPrefix,
}: NoteComposerProps) {
  const [addNoteError, setAddNoteError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [chartUrls, setChartUrls] = useState<string[]>(
    defaultShowEvidence ? [""] : [],
  );
  const [noteDateInput, setNoteDateInput] = useState(() =>
    toDateTimeLocalValue(Date.now()),
  );

  const noteForm = useAppForm({
    defaultValues: {
      content: "",
    },
    validators: {
      onChange: ({ value }) => {
        const results = noteSchema.safeParse(value);
        if (!results.success) {
          return results.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setAddNoteError(null);
      setIsAddingNote(true);

      try {
        const parsed = noteSchema.parse(value);
        const noteDate = parseDateTimeLocalValue(noteDateInput);
        const urls = normalizeUrls(chartUrls);
        await onAddNote(
          parsed.content,
          noteDate,
          urls.length > 0 ? urls : undefined,
        );
        formApi.reset();
        setNoteDateInput(toDateTimeLocalValue(Date.now()));
        setChartUrls(defaultShowEvidence ? [""] : []);
      } catch (error) {
        setAddNoteError(
          error instanceof Error ? error.message : "Failed to add note",
        );
      } finally {
        setIsAddingNote(false);
      }
    },
  });

  return (
    <div className="border-l-2 border-olive-8 py-3 pl-4">
      {addNoteError && (
        <Alert
          variant="error"
          className="mb-3"
          onDismiss={() => setAddNoteError(null)}
        >
          {addNoteError}
        </Alert>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void noteForm.handleSubmit();
        }}
        className="space-y-2"
        data-testid={getNoteComposerFormTestId(testIdPrefix)}
      >
        <noteForm.AppField name="content">
          {(field) => (
            <field.FieldTextarea
              label="Add note"
              placeholder="Capture a thought, observation, or decision..."
              rows={2}
              dataTestId={getNoteComposerTextareaTestId(testIdPrefix)}
            />
          )}
        </noteForm.AppField>
        <div className="grid w-full max-w-xs items-center gap-1.5">
          <label
            htmlFor={`${testIdPrefix}-add-note-date`}
            className="text-sm font-medium text-olive-11"
          >
            Note date
          </label>
          <input
            id={`${testIdPrefix}-add-note-date`}
            type="datetime-local"
            data-testid={getNoteComposerDateInputTestId(testIdPrefix)}
            className="h-9 rounded-md border border-olive-7 bg-transparent px-3 py-2 text-sm text-olive-12 focus:ring-2 focus:ring-blue-8 focus:outline-none"
            value={noteDateInput}
            onChange={(event) => setNoteDateInput(event.target.value)}
          />
        </div>
        <EvidenceUrlInputs urls={chartUrls} onChange={setChartUrls} />
        <div className="flex items-center justify-between">
          <EvidenceUrlInputs.AddButton
            urls={chartUrls}
            onChange={setChartUrls}
          />
          <noteForm.AppForm>
            <noteForm.SubmitButton
              dataTestId={getNoteComposerSubmitButtonTestId(testIdPrefix)}
              label={isAddingNote ? "Saving..." : "Add note"}
              size="sm"
              variant="outline"
            />
          </noteForm.AppForm>
        </div>
      </form>
    </div>
  );
}
