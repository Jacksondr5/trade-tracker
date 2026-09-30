"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Alert, Button, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import {
  getElementAsOfInputTestId,
  getElementKindInputTestId,
  getElementStatementInputTestId,
  getElementStatusSelectTestId,
  getElementSubmitButtonTestId,
  getEpisodeAddElementFormTestId,
} from "../../../shared/e2e/testIds";
import { getMutationErrorMessage } from "./format";
import type { ElementView } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const addElementSchema = z
  .object({
    asOf: z.string().trim(),
    kind: z.string().trim(),
    statement: z.string().trim().min(1, "Statement is required"),
    status: z.enum(["proposed", "agreed"]),
  })
  .superRefine((value, ctx) => {
    if (value.asOf && !DATE_PATTERN.test(value.asOf)) {
      ctx.addIssue({
        code: "custom",
        message: "Use YYYY-MM-DD",
        path: ["asOf"],
      });
    }
  });

const STATUS_OPTIONS = [
  { label: "Proposed", value: "proposed" },
  { label: "Agreed", value: "agreed" },
];

export function AddElementForm({
  episodeId,
  onClearSupersedes,
  supersedes,
}: {
  episodeId: Id<"episodes">;
  onClearSupersedes: () => void;
  supersedes: ElementView | null;
}) {
  const recordElement = useMutation(api.threads.recordElementFromApp);
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      asOf: "",
      kind: "",
      statement: "",
      status: "proposed" as "proposed" | "agreed",
    },
    validators: {
      onChange: ({ value }) => {
        const result = addElementSchema.safeParse(value);
        if (!result.success) {
          return result.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setError(null);
      try {
        const parsed = addElementSchema.parse(value);
        await recordElement({
          asOf: parsed.asOf || undefined,
          episodeId,
          kind: parsed.kind || undefined,
          statement: parsed.statement,
          status: parsed.status,
          supersedes: supersedes?.id,
          // A superseding element keeps the replaced element's typed value,
          // so a stop or level stays level-bearing for lifecycle inference.
          value: supersedes?.value ?? undefined,
        });
        formApi.reset();
        onClearSupersedes();
      } catch (caught) {
        setError(getMutationErrorMessage(caught, "Failed to add element"));
      }
    },
  });

  useEffect(() => {
    if (!supersedes) return;
    form.setFieldValue("statement", supersedes.statement);
    form.setFieldValue("kind", supersedes.kind ?? "");
    form.setFieldValue("asOf", supersedes.asOf ?? "");
    form.setFieldValue(
      "status",
      supersedes.status === "agreed" ? "agreed" : "proposed",
    );
    // Prefill only when the superseded element changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supersedes?.id]);

  return (
    <form
      className="space-y-3"
      data-testid={getEpisodeAddElementFormTestId(episodeId)}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <p className="text-sm font-semibold text-olive-12">
        {supersedes ? "Supersede element" : "Add element"}
      </p>
      {supersedes ? (
        <Alert variant="info">
          <span className="text-sm">Replaces: {supersedes.statement}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            dataTestId={`element-supersede-cancel-${episodeId}`}
            onClick={onClearSupersedes}
          >
            Cancel
          </Button>
        </Alert>
      ) : null}
      {error ? (
        <Alert
          variant="error"
          data-testid={`episode-add-element-error-${episodeId}`}
        >
          {error}
        </Alert>
      ) : null}
      <form.AppField name="statement">
        {(field) => (
          <field.FieldTextarea
            label="Statement"
            rows={2}
            dataTestId={getElementStatementInputTestId(episodeId)}
          />
        )}
      </form.AppField>
      <div className="grid gap-3 sm:grid-cols-3">
        <form.AppField name="status">
          {(field) => (
            <field.FieldSelect
              label="Status"
              options={STATUS_OPTIONS}
              dataTestId={getElementStatusSelectTestId(episodeId)}
            />
          )}
        </form.AppField>
        <form.AppField name="kind">
          {(field) => (
            <field.FieldInput
              label="Kind"
              placeholder="entry, stop, target…"
              dataTestId={getElementKindInputTestId(episodeId)}
            />
          )}
        </form.AppField>
        <form.AppField name="asOf">
          {(field) => (
            <field.FieldInput
              label="As of"
              type="date"
              dataTestId={getElementAsOfInputTestId(episodeId)}
            />
          )}
        </form.AppField>
      </div>
      <form.AppForm>
        <form.SubmitButton
          size="sm"
          label={supersedes ? "Supersede" : "Add element"}
          dataTestId={getElementSubmitButtonTestId(episodeId)}
        />
      </form.AppForm>
    </form>
  );
}
