"use client";

import {
  Preloaded,
  useMutation,
  usePreloadedQuery,
  useQuery,
} from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { NotesSection } from "~/components/notes";
import { EpisodeCard, getMutationErrorMessage } from "~/components/threads";
import { Alert, Button, EmptyState } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import {
  APP_PAGE_TITLES,
  THREAD_PAGE_TEST_IDS,
} from "../../../../../shared/e2e/testIds";

export default function ThreadPageClient({
  preloadedThread,
  ticker,
}: {
  preloadedThread: Preloaded<typeof api.threads.getThreadPage>;
  ticker: string;
}) {
  const page = usePreloadedQuery(preloadedThread);
  const threadId = page?.thread.id;
  const threadNotes = useQuery(
    api.notes.getNotesByThread,
    threadId ? { threadId } : "skip",
  );
  const openEpisode = useMutation(api.threads.openEpisodeFromApp);
  const addNote = useMutation(api.notes.addNote);
  const updateNote = useMutation(api.notes.updateNote);
  const deleteNote = useMutation(api.notes.deleteNote);
  const [error, setError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  if (!page) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1
          className="mb-6 text-2xl font-bold text-slate-12"
          data-testid={APP_PAGE_TITLES.thread}
        >
          {ticker}
        </h1>
        <EmptyState
          dataTestId="thread-missing"
          title="No thread for this ticker"
          description="Open the thread from the Threads page."
          ctaHref="/threads"
          ctaLabel="Go to threads"
        />
      </div>
    );
  }

  const { thread } = page;

  async function handleOpenEpisode() {
    setError(null);
    setIsOpening(true);
    try {
      await openEpisode({ ticker: thread.ticker });
    } catch (caught) {
      setError(getMutationErrorMessage(caught, "Failed to open episode"));
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold text-slate-12"
            data-testid={APP_PAGE_TITLES.thread}
          >
            {thread.ticker}
          </h1>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-olive-11">
            {thread.campaigns.length === 0 ? (
              <span>No campaign links</span>
            ) : (
              thread.campaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.id}`}
                  className="text-blue-11 hover:underline"
                  data-testid={`thread-campaign-link-${campaign.id}`}
                >
                  {campaign.name}
                  {campaign.isBenchmark ? " (benchmark)" : ""}
                </Link>
              ))
            )}
          </div>
        </div>
        <Button
          dataTestId={THREAD_PAGE_TEST_IDS.openEpisodeButton}
          isLoading={isOpening}
          onClick={() => void handleOpenEpisode()}
        >
          New episode
        </Button>
      </div>

      {error ? (
        <Alert
          variant="error"
          className="mb-4"
          data-testid="thread-error"
          onDismiss={() => setError(null)}
        >
          {error}
        </Alert>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-olive-12">Live episodes</h2>
        {page.liveEpisodes.length === 0 ? (
          <EmptyState
            dataTestId="thread-live-empty-state"
            title="No live episodes"
            description="Start a new episode to plan an engagement with this instrument."
            ctaLabel="New episode"
            ctaTestId="thread-live-empty-state-cta"
            onCtaClick={() => void handleOpenEpisode()}
          />
        ) : (
          <div className="space-y-4">
            {page.liveEpisodes.map((resolved) => (
              <EpisodeCard key={resolved.episode.id} resolved={resolved} />
            ))}
          </div>
        )}
      </section>

      {page.shelvedEpisodes.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-olive-12">Shelved</h2>
          <div className="space-y-4">
            {page.shelvedEpisodes.map((resolved) => (
              <EpisodeCard
                key={resolved.episode.id}
                resolved={resolved}
                defaultCollapsed
              />
            ))}
          </div>
        </section>
      ) : null}

      {page.history.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-olive-12">History</h2>
          <div className="space-y-4">
            {page.history.map((resolved) => (
              <EpisodeCard
                key={resolved.episode.id}
                resolved={resolved}
                defaultCollapsed
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <h2 className="mb-3 text-lg font-semibold text-olive-12">Thread Notes</h2>
        <NotesSection
          defaultShowEvidence
          testIdPrefix="thread"
          notes={threadNotes ?? []}
          onAddNote={async (content, noteDate, chartUrls) => {
            await addNote({ threadId: thread.id, content, noteDate, chartUrls });
          }}
          onDeleteNote={async (noteId) => {
            await deleteNote({ noteId: noteId as Id<"notes"> });
          }}
          onUpdateNote={async (noteId, content, noteDate, chartUrls) => {
            await updateNote({
              noteId: noteId as Id<"notes">,
              content,
              noteDate,
              chartUrls,
            });
          }}
        />
      </section>
    </div>
  );
}
