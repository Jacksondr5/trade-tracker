"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Alert, useAppForm } from "~/components/ui";
import { formatDate } from "~/lib/format";

const noteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
});

interface NotesSectionProps {
  notes: Array<{ _id: string; content: string; _creationTime: number }>;
  onAddNote: (content: string) => Promise<void>;
  onUpdateNote: (noteId: string, content: string) => Promise<void>;
}

export default function NotesSection({ notes, onAddNote, onUpdateNote }: NotesSectionProps) {
  const [addNoteError, setAddNoteError] = useState<string | null>(null);
  const [editNoteError, setEditNoteError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  const noteForm = useAppForm({
    defaultValues: {
      content: "",
    },
    validators: {
      onChange: ({ value }) => {
        const results = noteSchema.safeParse(value);
        if (!results.success) {
          return results.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setAddNoteError(null);
      setIsAddingNote(true);

      try {
        const parsed = noteSchema.parse(value);
        await onAddNote(parsed.content.trim());
        formApi.reset();
      } catch (error) {
        setAddNoteError(error instanceof Error ? error.message : "Failed to add note");
      } finally {
        setIsAddingNote(false);
      }
    },
  });

  const startEditingNote = (note: { _id: string; content: string }) => {
    setEditingNoteId(note._id);
    setEditingNoteContent(note.content);
    setEditNoteError(null);
  };

  const handleSaveNote = async () => {
    if (!editingNoteId) return;
    if (!editingNoteContent.trim()) {
      setEditNoteError("Note content is required");
      return;
    }

    setEditNoteError(null);
    setIsSavingNote(true);

    try {
      await onUpdateNote(editingNoteId, editingNoteContent.trim());
      setEditingNoteId(null);
      setEditingNoteContent("");
    } catch (error) {
      setEditNoteError(error instanceof Error ? error.message : "Failed to update note");
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
      <h2 className="mb-3 text-lg font-semibold text-slate-12">Notes</h2>

      {notes.length === 0 ? (
        <p className="mb-3 text-sm text-slate-11">No notes yet.</p>
      ) : (
        <div className="mb-4 space-y-2">
          {notes.map((note) => {
            const isEditing = editingNoteId === note._id;
            return (
              <div key={note._id} className="rounded border border-slate-600 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-11">{formatDate(note._creationTime)}</span>
                  {!isEditing && (
                    <button
                      type="button"
                      aria-label="Edit note"
                      title="Edit"
                      className="rounded p-1.5 text-slate-11 hover:text-slate-12 hover:bg-slate-700"
                      onClick={() => startEditingNote(note)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <>
                    <textarea
                      className="min-h-24 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
                      value={editingNoteContent}
                      onChange={(e) => setEditingNoteContent(e.target.value)}
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        aria-label="Save note"
                        title="Save"
                        className="rounded p-1.5 text-green-400 hover:bg-green-900/50 disabled:opacity-50"
                        onClick={() => void handleSaveNote()}
                        disabled={isSavingNote}
                      >
                        {isSavingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel editing"
                        title="Cancel"
                        className="rounded p-1.5 text-slate-11 hover:text-slate-12 hover:bg-slate-700"
                        onClick={() => {
                          setEditingNoteId(null);
                          setEditingNoteContent("");
                          setEditNoteError(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {editNoteError && (
                      <Alert variant="error" className="mt-2">
                        {editNoteError}
                      </Alert>
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-slate-11">{note.content}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addNoteError && <Alert variant="error" className="mb-2">{addNoteError}</Alert>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void noteForm.handleSubmit();
        }}
        className="space-y-2"
      >
        <noteForm.AppField name="content">
          {(field) => (
            <field.FieldTextarea
              label="Add note"
              placeholder="Add a note"
              rows={4}
            />
          )}
        </noteForm.AppField>
        <noteForm.AppForm>
          <noteForm.SubmitButton label={isAddingNote ? "Saving..." : "Add Note"} />
        </noteForm.AppForm>
      </form>
    </section>
  );
}
