"use client";

import { NoteCard } from "./NoteCard";
import type { Note } from "./types";

interface NoteTimelineProps {
  notes: Note[];
  onDeleteNote: (noteId: string) => Promise<void>;
  onUpdateNote: (
    noteId: string,
    content: string,
    chartUrls?: string[],
  ) => Promise<void>;
  showContext: boolean;
  testIdPrefix: string;
}

export function NoteTimeline({
  notes,
  onDeleteNote,
  onUpdateNote,
  showContext,
  testIdPrefix,
}: NoteTimelineProps) {
  if (notes.length === 0) {
    return (
      <p
        className="py-6 text-center text-sm text-olive-10"
        data-testid={`${testIdPrefix}-notes-empty-state`}
      >
        No notes yet. Add your first note above.
      </p>
    );
  }

  return (
    <div
      className="divide-y divide-olive-4"
      data-testid={`${testIdPrefix}-notes-list`}
    >
      {notes.map((note) => (
        <NoteCard
          key={note._id}
          note={note}
          onDeleteNote={onDeleteNote}
          onUpdateNote={onUpdateNote}
          showContext={showContext}
          testIdPrefix={testIdPrefix}
        />
      ))}
    </div>
  );
}
