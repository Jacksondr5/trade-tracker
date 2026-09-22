"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { Alert, EmptyState, useAppForm } from "~/components/ui";
import { getMutationErrorMessage } from "~/components/threads";
import { api } from "~/convex/_generated/api";
import {
  APP_PAGE_TITLES,
  THREADS_INDEX_TEST_IDS,
  getThreadRowTestId,
} from "../../../../shared/e2e/testIds";

const openThreadSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9.\-]{1,12}$/, "Enter a ticker symbol"),
});

function OpenThreadForm() {
  const router = useRouter();
  const ensureThread = useMutation(api.threads.ensureThreadFromApp);
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { ticker: "" },
    validators: {
      onChange: ({ value }) => {
        const result = openThreadSchema.safeParse(value);
        if (!result.success) {
          return result.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const parsed = openThreadSchema.parse(value);
        const ticker = await ensureThread({ ticker: parsed.ticker });
        router.push(`/threads/${encodeURIComponent(ticker)}`);
      } catch (caught) {
        setError(getMutationErrorMessage(caught, "Failed to open thread"));
      }
    },
  });

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      data-testid="thread-open-form"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="ticker">
        {(field) => (
          <field.FieldInput
            label="Ticker"
            placeholder="NVDA"
            className="w-40"
            autoCapitalize="characters"
            dataTestId={THREADS_INDEX_TEST_IDS.openTickerInput}
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton
          label="Open thread"
          dataTestId={THREADS_INDEX_TEST_IDS.openSubmitButton}
        />
      </form.AppForm>
      {error ? (
        <Alert variant="error" className="basis-full">
          {error}
        </Alert>
      ) : null}
    </form>
  );
}

export default function ThreadsPageClient({
  preloadedThreads,
}: {
  preloadedThreads: Preloaded<typeof api.threads.listThreads>;
}) {
  const threads = usePreloadedQuery(preloadedThreads);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1
          className="text-2xl font-bold text-slate-12"
          data-testid={APP_PAGE_TITLES.threads}
        >
          Threads
        </h1>
        <OpenThreadForm />
      </div>

      {threads.length === 0 ? (
        <EmptyState
          dataTestId={THREADS_INDEX_TEST_IDS.emptyState}
          title="No threads yet"
          description="A thread is created for every ticker with a trade or a note. Open one above to start planning."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-6">
          <table className="w-full table-auto">
            <thead className="bg-slate-2">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-11">
                  Ticker
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-11">
                  Live
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-11">
                  Active
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-11">
                  Episodes
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-11">
                  Campaigns
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-6 bg-slate-1">
              {threads.map((thread) => (
                <tr
                  key={thread.id}
                  className="hover:bg-slate-3/40"
                  data-testid={getThreadRowTestId(thread.ticker)}
                >
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                    <Link
                      href={`/threads/${encodeURIComponent(thread.ticker)}`}
                      className="text-slate-12 hover:underline"
                      data-testid={`thread-link-${thread.ticker}`}
                    >
                      {thread.ticker}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-12 tabular-nums">
                    {thread.liveEpisodeCount}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-12 tabular-nums">
                    {thread.activeEpisodeCount}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-12 tabular-nums">
                    {thread.episodeCount}
                  </td>
                  <td className="px-4 py-3 text-sm text-olive-11">
                    {thread.campaigns.length === 0 ? (
                      <span className="text-slate-11">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-2">
                        {thread.campaigns.map((campaign) => (
                          <Link
                            key={campaign.id}
                            href={`/campaigns/${campaign.id}`}
                            className="text-blue-11 hover:underline"
                          >
                            {campaign.name}
                            {campaign.isBenchmark ? " (benchmark)" : ""}
                          </Link>
                        ))}
                      </span>
                    )}
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
