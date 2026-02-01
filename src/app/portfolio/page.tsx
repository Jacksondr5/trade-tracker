"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { z } from "zod";
import { Card, useAppForm } from "~/components/ui";
import { api } from "../../../convex/_generated/api";

const snapshotSchema = z.object({
  cashBalance: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  totalValue: z.string().min(1, "Total value is required"),
});

type SnapshotFormData = z.infer<typeof snapshotSchema>;

function getDefaultDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

export default function PortfolioPage() {
  const snapshots = useQuery(api.portfolioSnapshots.listSnapshots);
  const createSnapshot = useMutation(api.portfolioSnapshots.createSnapshot);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      cashBalance: "",
      date: getDefaultDate(),
      totalValue: "",
    } satisfies SnapshotFormData,
    validators: {
      onChange: ({ value }) => {
        const results = snapshotSchema.safeParse(value);
        if (!results.success) {
          return results.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      setErrorMessage(null);
      try {
        const parsed = snapshotSchema.parse(value);
        await createSnapshot({
          cashBalance: parsed.cashBalance
            ? parseFloat(parsed.cashBalance)
            : undefined,
          date: new Date(parsed.date).getTime(),
          totalValue: parseFloat(parsed.totalValue),
        });
        setSuccessMessage("Portfolio snapshot saved!");
        form.reset();
        setTimeout(() => {
          setSuccessMessage(null);
        }, 3000);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to save portfolio snapshot";
        setErrorMessage(message);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">Portfolio</h1>

      {successMessage && (
        <div className="text-slate-12 mb-4 rounded-md bg-green-900/50 p-4">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="text-slate-12 mb-4 flex items-center justify-between rounded-md bg-red-900/50 p-4">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-slate-12 ml-4 hover:text-white"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      <Card className="mb-8 bg-slate-800 p-6">
        <h2 className="text-slate-12 mb-4 text-lg font-semibold">
          Add Snapshot
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <form.AppField name="date">
                {(field) => (
                  <div className="grid w-full items-center gap-1.5">
                    <label
                      htmlFor={field.name}
                      className="text-slate-12 text-sm font-medium"
                    >
                      Date
                    </label>
                    <input
                      type="date"
                      id={field.name}
                      data-testid={`${field.name}-input`}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      className="text-slate-12 h-9 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>
                )}
              </form.AppField>

              <form.AppField name="totalValue">
                {(field) => (
                  <field.FieldInput
                    label="Total Value"
                    type="number"
                    placeholder="0.00"
                  />
                )}
              </form.AppField>

              <form.AppField name="cashBalance">
                {(field) => (
                  <field.FieldInput
                    label="Cash Balance (optional)"
                    type="number"
                    placeholder="0.00"
                  />
                )}
              </form.AppField>
            </div>

            <div className="flex justify-end">
              <form.AppForm>
                <form.SubmitButton
                  label={isSubmitting ? "Saving..." : "Add Snapshot"}
                />
              </form.AppForm>
            </div>
          </div>
        </form>
      </Card>

      <h2 className="text-slate-12 mb-4 text-lg font-semibold">
        Snapshot History
      </h2>

      {snapshots === undefined ? (
        <div className="text-slate-11">Loading snapshots...</div>
      ) : snapshots.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">No portfolio snapshots yet.</p>
          <p className="text-slate-11 mt-2 text-sm">
            Add your first snapshot above to start tracking your portfolio
            value.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full table-auto">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Date
                </th>
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  Total Value
                </th>
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  Cash Balance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-slate-900">
              {snapshots.map((snapshot) => (
                <tr
                  key={snapshot._id}
                  className="hover:bg-slate-800/50"
                  data-testid={`snapshot-row-${snapshot._id}`}
                >
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm">
                    {formatDate(snapshot.date)}
                  </td>
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm font-medium">
                    {formatCurrency(snapshot.totalValue)}
                  </td>
                  <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-right text-sm">
                    {snapshot.cashBalance !== undefined
                      ? formatCurrency(snapshot.cashBalance)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
