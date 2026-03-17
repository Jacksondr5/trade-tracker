"use client";

import { useState } from "react";
import { z } from "zod";
import { Alert, useAppForm } from "~/components/ui";
import { EvidenceUrlInputs } from "./EvidenceUrlInputs";

const noteSchema = z.object({
  content: z.string().trim().min(1, "Note content is required"),
});

function normalizeUrls(urls: string[]) {
  return urls.map((u) => u.trim()).filter(Boolean);
}

interface NoteComposerProps {
  onAddNote: (content: string, chartUrls?: string[]) => Promise<void>;
  testIdPrefix: string;
}

export function NoteComposer({ onAddNote, testIdPrefix }: NoteComposerProps) {
  const [addNoteError, setAddNoteError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [chartUrls, setChartUrls] = useState<string[]>([]);

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
        const urls = normalizeUrls(chartUrls);
        await onAddNote(parsed.content, urls.length > 0 ? urls : undefined);
        formApi.reset();
        setChartUrls([]);
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
    <div className="rounded-lg border border-olive-6 bg-olive-3 p-4">
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
        className="space-y-3"
        data-testid={`${testIdPrefix}-add-note-form`}
      >
        <noteForm.AppField name="content">
          {(field) => (
            <field.FieldTextarea
              label="Add note"
              placeholder="Capture a thought, observation, or decision..."
              rows={3}
              dataTestId={`${testIdPrefix}-add-note-textarea`}
            />
          )}
        </noteForm.AppField>
        <EvidenceUrlInputs urls={chartUrls} onChange={setChartUrls} />
        <div className="flex justify-end">
          <noteForm.AppForm>
            <noteForm.SubmitButton
              dataTestId={`${testIdPrefix}-add-note-button`}
              label={isAddingNote ? "Saving..." : "Add note"}
            />
          </noteForm.AppForm>
        </div>
      </form>
    </div>
  );
}
