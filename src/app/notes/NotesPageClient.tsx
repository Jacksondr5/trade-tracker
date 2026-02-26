"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import NotesSection from "~/components/NotesSection";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";

export default function NotesPageClient({
  preloadedNotes,
}: {
  preloadedNotes: Preloaded<typeof api.notes.getGeneralNotes>;
}) {
  const notes = usePreloadedQuery(preloadedNotes);
  const addNote = useMutation(api.notes.addNote);
  const updateNote = useMutation(api.notes.updateNote);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-slate-12">Notes</h1>
      <NotesSection
        notes={notes}
        onAddNote={async (content, chartUrls) => {
          await addNote({ content, chartUrls });
        }}
        onUpdateNote={async (noteId, content, chartUrls) => {
          await updateNote({ noteId: noteId as Id<"notes">, content, chartUrls });
        }}
      />
    </div>
  );
}
