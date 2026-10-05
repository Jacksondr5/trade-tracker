"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { z } from "zod";
import { Alert, Button, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import {
  getElementDropEvidenceInputTestId,
  getElementDropSubmitTestId,
} from "../../../shared/e2e/testIds";
import { getMutationErrorMessage } from "./format";

const dropSchema = z.object({
  evidence: z.string().trim().min(1, "Evidence is required to drop an element"),
});

export function DropElementForm({
  elementId,
  onCancel,
  onDone,
}: {
  elementId: Id<"planElements">;
  onCancel: () => void;
  onDone: () => void;
}) {
  const setElementStatus = useMutation(api.threads.setElementStatusFromApp);
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { evidence: "" },
    validators: {
      onChange: ({ value }) => {
        const result = dropSchema.safeParse(value);
        if (!result.success) {
          return result.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const parsed = dropSchema.parse(value);
        await setElementStatus({
          elementId,
          evidence: parsed.evidence,
          status: "dropped",
        });
        onDone();
      } catch (caught) {
        setError(getMutationErrorMessage(caught, "Failed to drop element"));
      }
    },
  });

  return (
    <form
      className="mt-2 space-y-2 rounded-md border border-olive-6 bg-olive-1 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {error ? <Alert variant="error">{error}</Alert> : null}
      <form.AppField name="evidence">
        {(field) => (
          <field.FieldInput
            label="Evidence of withdrawal"
            placeholder="Said so on 2026-09-20; omitted from checkpoint v3"
            dataTestId={getElementDropEvidenceInputTestId(elementId)}
          />
        )}
      </form.AppField>
      <div className="flex gap-2">
        <form.AppForm>
          <form.SubmitButton
            size="sm"
            variant="destructive"
            label="Drop element"
            dataTestId={getElementDropSubmitTestId(elementId)}
          />
        </form.AppForm>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          dataTestId={`element-drop-cancel-${elementId}`}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
