"use client";

import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  Alert,
  Badge,
  ConfirmDeleteButton,
  useAppForm,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { capitalize, formatCurrency } from "~/lib/format";
import {
  PORTFOLIO_CASH_LEDGER_TEST_IDS,
  getCashLedgerCancelButtonTestId,
  getCashLedgerDeleteButtonTestId,
  getCashLedgerDeleteTooltipTestId,
  getCashLedgerEditButtonTestId,
  getCashLedgerRowTestId,
  getCashLedgerSaveButtonTestId,
} from "../../../../../shared/e2e/testIds";

type EntryType = "deposit" | "withdrawal" | "correction";

const ENTRY_TYPE_OPTIONS: { label: string; value: EntryType }[] = [
  { label: "Deposit", value: "deposit" },
  { label: "Withdrawal", value: "withdrawal" },
  { label: "Correction", value: "correction" },
];

const amountSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .refine((value) => Number.isFinite(Number(value)), {
    message: "Amount must be a number",
  })
  .refine((value) => Number(value) !== 0, {
    message: "Amount must be non-zero",
  });

const dateSchema = z
  .string()
  .trim()
  .min(1, "Date is required")
  .refine((value) => !Number.isNaN(parseDateString(value)), {
    message: "Date is required",
  });

const noteSchema = z
  .string()
  .max(500, "Note must be 500 characters or fewer")
  .optional();

const entryTypeSchema = z.enum(["deposit", "withdrawal", "correction"]);

const addEntrySchema = z.object({
  "cash-ledger-amount": amountSchema,
  "cash-ledger-date": dateSchema,
  "cash-ledger-entry-type": entryTypeSchema,
  "cash-ledger-note": noteSchema,
});

const editEntrySchema = z.object({
  "cash-ledger-edit-amount": amountSchema,
  "cash-ledger-edit-date": dateSchema,
  "cash-ledger-edit-entry-type": entryTypeSchema,
  "cash-ledger-edit-note": noteSchema,
});

function parseDateString(value: string): number {
  // Treat date-only inputs as midday UTC to avoid timezone drift.
  return new Date(`${value}T12:00:00Z`).getTime();
}

function formatDateForInput(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateOnly(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string" ? error.data : fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function entryTypeBadgeVariant(
  entryType: EntryType,
): "success" | "warning" | "info" {
  switch (entryType) {
    case "deposit":
      return "success";
    case "withdrawal":
      return "warning";
    case "correction":
      return "info";
  }
}

interface CashLedgerEntry {
  _id: Id<"portfolioCashLedgerEntries">;
  amount: number;
  date: number;
  entryType: EntryType;
  note?: string;
}

export default function PortfolioCashLedgerSection({
  portfolioId,
}: {
  portfolioId: Id<"portfolios">;
}) {
  const entries = useQuery(
    api.portfolioCashLedger.listPortfolioCashLedgerEntries,
    { portfolioId },
  );
  const createEntry = useMutation(
    api.portfolioCashLedger.createPortfolioCashLedgerEntry,
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [defaultDate] = useState(() => formatDateForInput(Date.now()));

  const form = useAppForm({
    defaultValues: {
      "cash-ledger-amount": "",
      "cash-ledger-date": defaultDate,
      "cash-ledger-entry-type": "deposit" as EntryType,
      "cash-ledger-note": "",
    },
    validators: {
      onChange: ({ value }) => {
        const result = addEntrySchema.safeParse(value);
        if (!result.success) {
          return result.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setErrorMessage(null);
      try {
        const parsed = addEntrySchema.parse(value);
        await createEntry({
          amount: Number(parsed["cash-ledger-amount"]),
          date: parseDateString(parsed["cash-ledger-date"]),
          entryType: parsed["cash-ledger-entry-type"],
          note: parsed["cash-ledger-note"],
          portfolioId,
        });
        formApi.reset();
        formApi.setFieldValue(
          "cash-ledger-date",
          formatDateForInput(Date.now()),
        );
      } catch (error) {
        setErrorMessage(describeError(error, "Failed to add ledger entry"));
      }
    },
  });

  const totalCash = entries?.reduce((sum, entry) => sum + entry.amount, 0) ?? 0;

  return (
    <section
      className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4"
      data-testid={PORTFOLIO_CASH_LEDGER_TEST_IDS.section}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-12">Cash Ledger</h2>
        {entries && entries.length > 0 && (
          <span className="text-sm text-slate-11">
            Net cash {formatCurrency(totalCash)}
          </span>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
      >
        <form.AppField name="cash-ledger-amount">
          {(field) => (
            <field.FieldInput
              label="Amount"
              inputMode="decimal"
              placeholder="e.g. 10000 or -2500"
            />
          )}
        </form.AppField>
        <form.AppField name="cash-ledger-entry-type">
          {(field) => (
            <field.FieldSelect
              label="Entry Type"
              options={ENTRY_TYPE_OPTIONS}
            />
          )}
        </form.AppField>
        <form.AppField name="cash-ledger-date">
          {(field) => <field.FieldInput label="Date" type="date" />}
        </form.AppField>
        <form.AppField name="cash-ledger-note">
          {(field) => (
            <field.FieldInput
              label="Note"
              placeholder="Optional"
              maxLength={500}
            />
          )}
        </form.AppField>
        <div className="flex items-end">
          <form.AppForm>
            <form.SubmitButton
              dataTestId={PORTFOLIO_CASH_LEDGER_TEST_IDS.addSubmitButton}
              label="Add"
            />
          </form.AppForm>
        </div>
      </form>

      {errorMessage && (
        <Alert
          variant="error"
          className="mb-3"
          data-testid={PORTFOLIO_CASH_LEDGER_TEST_IDS.errorAlert}
          onDismiss={() => setErrorMessage(null)}
        >
          {errorMessage}
        </Alert>
      )}

      {entries === undefined ? (
        <p className="text-sm text-slate-11">Loading entries…</p>
      ) : entries.length === 0 ? (
        <p
          className="text-sm text-slate-11"
          data-testid={PORTFOLIO_CASH_LEDGER_TEST_IDS.emptyState}
        >
          No cash ledger entries yet. Record an initial deposit to start
          tracking cash.
        </p>
      ) : (
        <ul
          className="divide-y divide-slate-700/60"
          data-testid={PORTFOLIO_CASH_LEDGER_TEST_IDS.list}
        >
          {entries.map((entry) => (
            <CashLedgerRow key={entry._id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CashLedgerRow({ entry }: { entry: CashLedgerEntry }) {
  const updateEntry = useMutation(
    api.portfolioCashLedger.updatePortfolioCashLedgerEntry,
  );
  const deleteEntry = useMutation(
    api.portfolioCashLedger.deletePortfolioCashLedgerEntry,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const getEditFormValues = () => ({
    "cash-ledger-edit-amount": String(entry.amount),
    "cash-ledger-edit-date": formatDateForInput(entry.date),
    "cash-ledger-edit-entry-type": entry.entryType,
    "cash-ledger-edit-note": entry.note ?? "",
  });

  const form = useAppForm({
    defaultValues: getEditFormValues(),
    validators: {
      onChange: ({ value }) => {
        const result = editEntrySchema.safeParse(value);
        if (!result.success) {
          return result.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setErrorMessage(null);
      try {
        const parsed = editEntrySchema.parse(value);
        await updateEntry({
          amount: Number(parsed["cash-ledger-edit-amount"]),
          date: parseDateString(parsed["cash-ledger-edit-date"]),
          entryId: entry._id,
          entryType: parsed["cash-ledger-edit-entry-type"],
          note: parsed["cash-ledger-edit-note"] ?? "",
        });
        setIsEditing(false);
      } catch (error) {
        setErrorMessage(describeError(error, "Failed to update ledger entry"));
      }
    },
  });

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    form.reset(getEditFormValues());
  }, [entry, form, isEditing]);

  const handleDelete = async () => {
    setErrorMessage(null);
    setIsDeleting(true);
    try {
      await deleteEntry({ entryId: entry._id });
    } catch (error) {
      setErrorMessage(describeError(error, "Failed to delete ledger entry"));
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <li className="py-3" data-testid={getCashLedgerRowTestId(entry._id)}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
        >
          <form.AppField name="cash-ledger-edit-amount">
            {(field) => (
              <field.FieldInput label="Amount" inputMode="decimal" />
            )}
          </form.AppField>
          <form.AppField name="cash-ledger-edit-entry-type">
            {(field) => (
              <field.FieldSelect
                label="Entry Type"
                options={ENTRY_TYPE_OPTIONS}
              />
            )}
          </form.AppField>
          <form.AppField name="cash-ledger-edit-date">
            {(field) => <field.FieldInput label="Date" type="date" />}
          </form.AppField>
          <form.AppField name="cash-ledger-edit-note">
            {(field) => (
              <field.FieldInput
                label="Note"
                placeholder="Optional"
                maxLength={500}
              />
            )}
          </form.AppField>
          <div className="flex items-end gap-1">
            <form.Subscribe
              selector={(state) => [state.isSubmitting, state.canSubmit]}
            >
              {([isSubmitting, canSubmit]) => (
                <button
                  type="submit"
                  data-testid={getCashLedgerSaveButtonTestId(entry._id)}
                  disabled={!canSubmit || isSubmitting}
                  className="flex h-9 w-9 items-center justify-center rounded border border-grass-7 text-grass-9 hover:bg-grass-3 disabled:opacity-50"
                  title="Save"
                  aria-label="Save"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </button>
              )}
            </form.Subscribe>
            <button
              type="button"
              data-testid={getCashLedgerCancelButtonTestId(entry._id)}
              onClick={() => {
                setErrorMessage(null);
                form.reset(getEditFormValues());
                setIsEditing(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded border border-slate-600 text-slate-11 hover:bg-slate-700 hover:text-slate-12"
              title="Cancel"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </form>
        {errorMessage && (
          <Alert
            variant="error"
            className="mt-2"
            onDismiss={() => setErrorMessage(null)}
          >
            {errorMessage}
          </Alert>
        )}
      </li>
    );
  }

  const amountIsNegative = entry.amount < 0;

  return (
    <li
      className="flex flex-wrap items-center gap-3 py-3"
      data-testid={getCashLedgerRowTestId(entry._id)}
    >
      <span className="w-24 shrink-0 text-sm text-slate-11">
        {formatDateOnly(entry.date)}
      </span>
      <Badge variant={entryTypeBadgeVariant(entry.entryType)}>
        {capitalize(entry.entryType)}
      </Badge>
      <span
        className={
          amountIsNegative
            ? "min-w-[7rem] text-right font-mono text-sm text-red-10"
            : "min-w-[7rem] text-right font-mono text-sm text-grass-10"
        }
      >
        {formatCurrency(entry.amount)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-11">
        {entry.note ?? ""}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          data-testid={getCashLedgerEditButtonTestId(entry._id)}
          onClick={() => {
            form.reset(getEditFormValues());
            setIsEditing(true);
          }}
          className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-11 hover:bg-slate-700 hover:text-slate-12"
        >
          Edit
        </button>
        <ConfirmDeleteButton
          dataTestId={getCashLedgerDeleteButtonTestId(entry._id)}
          tooltipTestId={getCashLedgerDeleteTooltipTestId(entry._id)}
          isDeleting={isDeleting}
          onConfirm={handleDelete}
        />
      </div>
      {errorMessage && (
        <Alert
          variant="error"
          className="mt-2 w-full"
          onDismiss={() => setErrorMessage(null)}
        >
          {errorMessage}
        </Alert>
      )}
    </li>
  );
}
