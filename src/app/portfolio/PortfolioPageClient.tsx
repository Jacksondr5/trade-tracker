"use client";

import { ConvexError } from "convex/values";
import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { Alert, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";

const createPortfolioSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Portfolio name is required")
    .max(120, "Portfolio name must be 120 characters or less"),
});

export default function PortfolioPageClient({
  preloadedPortfolios,
}: {
  preloadedPortfolios: Preloaded<typeof api.portfolios.listPortfolios>;
}) {
  const portfolios = usePreloadedQuery(preloadedPortfolios);
  const createPortfolio = useMutation(api.portfolios.createPortfolio);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      name: "",
    },
    validators: {
      onChange: ({ value }) => {
        const result = createPortfolioSchema.safeParse(value);
        if (!result.success) {
          return result.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setErrorMessage(null);
      try {
        const parsed = createPortfolioSchema.parse(value);
        await createPortfolio({ name: parsed.name });
        formApi.reset();
      } catch (error) {
        setErrorMessage(
          error instanceof ConvexError
            ? typeof error.data === "string"
              ? error.data
              : "Failed to create portfolio"
            : error instanceof Error
              ? error.message
              : "Failed to create portfolio",
        );
      }
    },
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-slate-12 text-2xl font-bold">Portfolios</h1>
      </div>

      {/* Inline create form */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
          className="flex items-end gap-3"
        >
          <div className="flex-1">
            <form.AppField name="name">
              {(field) => (
                <field.FieldInput
                  label="New Portfolio"
                  maxLength={120}
                  placeholder="Portfolio name"
                />
              )}
            </form.AppField>
          </div>
          <form.AppForm>
            <form.SubmitButton
              dataTestId="create-portfolio-button"
              label="Create"
            />
          </form.AppForm>
        </form>
        {errorMessage && (
          <Alert variant="error" className="mt-2" onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        )}
      </div>

      {portfolios.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">No portfolios yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full table-auto">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Name
                </th>
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  Trade Count
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-slate-900">
              {portfolios.map((portfolio) => (
                <tr key={portfolio._id} className="hover:bg-slate-800/50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                    <Link
                      href={`/portfolio/${portfolio._id}`}
                      className="text-slate-12 hover:underline"
                      aria-label={`View portfolio ${portfolio.name}`}
                    >
                      {portfolio.name}
                    </Link>
                  </td>
                  <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-right text-sm">
                    {portfolio.tradeCount}
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
