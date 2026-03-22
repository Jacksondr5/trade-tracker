"use client";

import { NoteComposer } from "./NoteComposer";
import { NoteTimeline } from "./NoteTimeline";
import type { NotesSectionProps } from "./types";

export default function NotesSection({
  defaultShowEvidence = false,
  notes,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  showContext = false,
  testIdPrefix = "notes",
}: NotesSectionProps) {
  return (
    <section
      className="space-y-4"
      data-testid={`${testIdPrefix}-notes-section`}
    >
      <NoteComposer
        defaultShowEvidence={defaultShowEvidence}
        onAddNote={onAddNote}
        testIdPrefix={testIdPrefix}
      />
      <NoteTimeline
        notes={notes}
        onDeleteNote={onDeleteNote}
        onUpdateNote={onUpdateNote}
        showContext={showContext}
        testIdPrefix={testIdPrefix}
      />
    </section>
  );
}
