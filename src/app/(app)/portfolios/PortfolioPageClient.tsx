"use client";

import { ConvexError } from "convex/values";
import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { Alert, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import {
  APP_PAGE_TITLES,
  getPortfolioLinkTestId,
  getPortfolioRowTestId,
} from "../../../../shared/e2e/testIds";

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
    <div className="container mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-bold text-olive-12 md:text-3xl"
            data-testid={APP_PAGE_TITLES.portfolios}
          >
            Portfolios
          </h1>
          <p className="mt-1 text-sm text-olive-11">
            Capital-allocation overlays on your trades. Open a portfolio to
            review its allocation, equity, and campaign exposure.
          </p>
        </div>
      </div>

      {/* Inline create form */}
      <section className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
          className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <form.AppField name="name">
              {(field) => (
                <field.FieldInput
                  label="New portfolio"
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
          <Alert
            variant="error"
            className="mt-3"
            onDismiss={() => setErrorMessage(null)}
          >
            {errorMessage}
          </Alert>
        )}
      </section>

      {portfolios.length === 0 ? (
        <div className="rounded-lg border border-olive-6 bg-olive-2 p-6">
          <p className="text-sm font-medium text-olive-12">
            No portfolios yet
          </p>
          <p className="mt-1 text-sm text-olive-11">
            Create a portfolio above to start grouping trades for allocation
            and exposure review.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-6 bg-slate-2">
          <table className="w-full table-auto">
            <thead>
              <tr className="border-b border-slate-6">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-11 uppercase tracking-wide">
                  Name
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-11 uppercase tracking-wide">
                  Trades
                </th>
              </tr>
            </thead>
            <tbody>
              {portfolios.map((portfolio) => (
                <tr
                  key={portfolio._id}
                  className="border-b border-slate-6/60 last:border-b-0 hover:bg-slate-3"
                  data-testid={getPortfolioRowTestId(portfolio.name)}
                >
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                    <Link
                      href={`/portfolios/${portfolio._id}`}
                      className="text-slate-12 hover:text-blue-11 hover:underline"
                      aria-label={`View portfolio ${portfolio.name}`}
                      data-testid={getPortfolioLinkTestId(portfolio.name)}
                    >
                      {portfolio.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-sm whitespace-nowrap text-slate-11 tabular-nums">
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
