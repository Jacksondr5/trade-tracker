"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { NotesSection } from "~/components/notes";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { APP_PAGE_TITLES } from "../../../../shared/e2e/testIds";

export default function NotesPageClient({
  preloadedNotes,
}: {
  preloadedNotes: Preloaded<typeof api.notes.getGeneralNotes>;
}) {
  const notes = usePreloadedQuery(preloadedNotes);
  const addNote = useMutation(api.notes.addNote);
  const updateNote = useMutation(api.notes.updateNote);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1
        className="mb-6 text-3xl font-bold text-olive-12"
        data-testid={APP_PAGE_TITLES.notes}
      >
        Notes
      </h1>
      <NotesSection
        notes={notes}
        onAddNote={async (content, chartUrls) => {
          await addNote({ content, chartUrls });
        }}
        onUpdateNote={async (noteId, content, chartUrls) => {
          await updateNote({
            noteId: noteId as Id<"notes">,
            content,
            chartUrls,
          });
        }}
      />
    </div>
  );
}
