"use client";

import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  getCancelNoteButtonTestId,
  getDeleteNoteButtonTestId,
  getEditNoteButtonTestId,
  getEditNoteTextareaTestId,
  getNoteContentTestId,
  getNoteContextLinkTestId,
  getNoteContextTextTestId,
  getNoteDateTestId,
  getNoteRowTestId,
  getSaveNoteButtonTestId,
} from "../../../shared/e2e/testIds";
import { Alert } from "~/components/ui";
import { formatDate } from "~/lib/format";
import { EvidenceCarousel } from "./EvidenceCarousel";
import { EvidenceUrlInputs } from "./EvidenceUrlInputs";
import type { Note } from "./types";

interface NoteCardProps {
  note: Note;
  onDeleteNote: (noteId: string) => Promise<void>;
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
  onDeleteNote,
  onUpdateNote,
  showContext,
  testIdPrefix,
}: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editChartUrls, setEditChartUrls] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      data-testid={getNoteRowTestId(testIdPrefix, note._id)}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <time
          className="text-xs font-medium text-olive-10"
          data-testid={getNoteDateTestId(testIdPrefix, note._id)}
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
                data-testid={getNoteContextLinkTestId(testIdPrefix, note._id)}
              >
                {note.contextLabel ?? note.contextKind ?? "Note"}
              </Link>
            ) : (
              <span
                className="text-xs font-medium text-olive-10"
                data-testid={getNoteContextTextTestId(testIdPrefix, note._id)}
              >
                {note.contextLabel ?? note.contextKind ?? "Note"}
              </span>
            )}
          </>
        )}

        {!isEditing && (
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              aria-label="Edit note"
              title="Edit"
              className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12"
              data-testid={getEditNoteButtonTestId(testIdPrefix, note._id)}
              onClick={startEditing}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete note"
              title="Delete"
              className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-red-9 disabled:opacity-50"
              data-testid={getDeleteNoteButtonTestId(testIdPrefix, note._id)}
              disabled={isDeleting}
              onClick={async () => {
                setIsDeleting(true);
                setDeleteError(null);
                try {
                  await onDeleteNote(note._id);
                } catch (error) {
                  setDeleteError(
                    error instanceof Error
                      ? error.message
                      : "Failed to delete note",
                  );
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-1.5">
          <label htmlFor={`edit-note-${note._id}`} className="sr-only">
            Edit note content
          </label>
          <textarea
            id={`edit-note-${note._id}`}
            data-testid={getEditNoteTextareaTestId(testIdPrefix, note._id)}
            className="min-h-20 w-full rounded-md border border-olive-7 bg-transparent px-3 py-2 text-sm text-olive-12 focus:ring-2 focus:ring-blue-8 focus:outline-none"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
          <EvidenceUrlInputs urls={editChartUrls} onChange={setEditChartUrls} />
          <div className="flex items-center gap-1.5">
            <EvidenceUrlInputs.AddButton
              urls={editChartUrls}
              onChange={setEditChartUrls}
            />
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Save note"
                title="Save"
                className="rounded p-1 text-grass-9 hover:bg-grass-3 disabled:opacity-50"
                data-testid={getSaveNoteButtonTestId(testIdPrefix, note._id)}
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
                aria-disabled={isSaving}
                title="Cancel"
                className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-olive-10"
                data-testid={getCancelNoteButtonTestId(testIdPrefix, note._id)}
                onClick={() => {
                  if (isSaving) {
                    return;
                  }
                  cancelEditing();
                }}
                disabled={isSaving}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
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
        <div className="flex gap-4">
          <p
            className="min-w-0 flex-1 text-sm whitespace-pre-wrap text-olive-12"
            data-testid={getNoteContentTestId(testIdPrefix, note._id)}
          >
            {note.content}
          </p>
          {note.chartUrls && note.chartUrls.length > 0 && (
            <div className="flex-none">
              <EvidenceCarousel urls={note.chartUrls} />
            </div>
          )}
        </div>
      )}
      {deleteError && (
        <Alert
          variant="error"
          className="mt-2"
          onDismiss={() => setDeleteError(null)}
        >
          {deleteError}
        </Alert>
      )}
    </article>
  );
}
