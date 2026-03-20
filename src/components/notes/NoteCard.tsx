"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "~/components/ui";
import { formatDate } from "~/lib/format";
import { EvidenceCarousel } from "./EvidenceCarousel";
import { EvidenceUrlInputs } from "./EvidenceUrlInputs";
import type { Note } from "./types";

interface NoteCardProps {
  note: Note;
  onUpdateNote: (
    noteId: string,
    content: string,
    chartUrls?: string[],
  ) => Promise<void>;
  showContext: boolean;
  testIdPrefix: string;
}

export function NoteCard({
  note,
  onUpdateNote,
  showContext,
  testIdPrefix,
}: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editChartUrls, setEditChartUrls] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    setIsEditing(true);
    setEditContent(note.content);
    setEditChartUrls(note.chartUrls ?? []);
    setEditError(null);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditContent("");
    setEditChartUrls([]);
    setEditError(null);
  };

  const handleSave = async () => {
    if (!editContent.trim()) {
      setEditError("Note content is required");
      return;
    }

    setEditError(null);
    setIsSaving(true);

    try {
      const urls = editChartUrls.map((u) => u.trim()).filter(Boolean);
      await onUpdateNote(
        note._id,
        editContent.trim(),
        urls.length > 0 ? urls : undefined,
      );
      setIsEditing(false);
      setEditContent("");
      setEditChartUrls([]);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Failed to update note",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article
      className="group relative border-l-2 border-olive-6 py-3 pl-4"
      data-testid={`${testIdPrefix}-note-row-${note._id}`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <time
          className="text-xs font-medium text-olive-10"
          data-testid={`${testIdPrefix}-note-date-${note._id}`}
          dateTime={new Date(note._creationTime).toISOString()}
        >
          {formatDate(note._creationTime)}
        </time>

        {showContext && (
          <>
            <span className="text-olive-6">&middot;</span>
            {note.contextHref ? (
              <Link
                href={note.contextHref}
                className="text-xs font-medium text-olive-10 hover:text-olive-12 hover:underline"
                data-testid={`${testIdPrefix}-note-context-link-${note._id}`}
              >
                {note.contextLabel ?? note.contextKind ?? "Note"}
              </Link>
            ) : (
              <span
                className="text-xs font-medium text-olive-10"
                data-testid={`${testIdPrefix}-note-context-text-${note._id}`}
              >
                {note.contextLabel ?? note.contextKind ?? "Note"}
              </span>
            )}
          </>
        )}

        {!isEditing && (
          <button
            type="button"
            aria-label="Edit note"
            title="Edit"
            className="ml-auto rounded p-1 text-olive-10 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-olive-4 hover:text-olive-12 focus-visible:opacity-100"
            data-testid={`${testIdPrefix}-edit-note-button-${note._id}`}
            onClick={startEditing}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-1.5">
          <label htmlFor={`edit-note-${note._id}`} className="sr-only">
            Edit note content
          </label>
          <textarea
            id={`edit-note-${note._id}`}
            data-testid={`${testIdPrefix}-edit-note-textarea-${note._id}`}
            className="min-h-20 w-full rounded-sm border-b border-olive-6 bg-transparent px-0 py-1 text-sm text-olive-12 focus:border-olive-8 focus:outline-none"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
          <EvidenceUrlInputs urls={editChartUrls} onChange={setEditChartUrls} />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Save note"
              title="Save"
              className="rounded p-1 text-grass-9 hover:bg-grass-3 disabled:opacity-50"
              data-testid={`${testIdPrefix}-save-note-button-${note._id}`}
              onClick={() => void handleSave()}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              aria-label="Cancel editing"
              title="Cancel"
              className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12"
              data-testid={`${testIdPrefix}-cancel-note-button-${note._id}`}
              onClick={cancelEditing}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {editError && (
            <Alert
              variant="error"
              className="mt-2"
              onDismiss={() => setEditError(null)}
            >
              {editError}
            </Alert>
          )}
        </div>
      ) : (
        <>
          <p
            className="text-sm whitespace-pre-wrap text-olive-12"
            data-testid={`${testIdPrefix}-note-content-${note._id}`}
          >
            {note.content}
          </p>
          {note.chartUrls && note.chartUrls.length > 0 && (
            <EvidenceCarousel urls={note.chartUrls} />
          )}
        </>
      )}
    </article>
  );
}
