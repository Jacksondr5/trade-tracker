"use client";

import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Alert, useAppForm } from "~/components/ui";
import { formatDate } from "~/lib/format";

const noteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
});

interface Note {
  _id: string;
  _creationTime: number;
  chartUrls?: string[];
  content: string;
}

interface NotesSectionProps {
  notes: Note[];
  onAddNote: (content: string, chartUrls?: string[]) => Promise<void>;
  onUpdateNote: (
    noteId: string,
    content: string,
    chartUrls?: string[],
  ) => Promise<void>;
}

export default function NotesSection({
  notes,
  onAddNote,
  onUpdateNote,
}: NotesSectionProps) {
  const [addNoteError, setAddNoteError] = useState<string | null>(null);
  const [editNoteError, setEditNoteError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [editingChartUrls, setEditingChartUrls] = useState<string[]>([]);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [newChartUrls, setNewChartUrls] = useState<string[]>([]);

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
        const urls = newChartUrls.filter((u) => u.trim());
        await onAddNote(parsed.content.trim(), urls.length > 0 ? urls : undefined);
        formApi.reset();
        setNewChartUrls([]);
      } catch (error) {
        setAddNoteError(
          error instanceof Error ? error.message : "Failed to add note",
        );
      } finally {
        setIsAddingNote(false);
      }
    },
  });

  const startEditingNote = (note: Note) => {
    setEditingNoteId(note._id);
    setEditingNoteContent(note.content);
    setEditingChartUrls(note.chartUrls ?? []);
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
      const urls = editingChartUrls.filter((u) => u.trim());
      await onUpdateNote(
        editingNoteId,
        editingNoteContent.trim(),
        urls.length > 0 ? urls : undefined,
      );
      setEditingNoteId(null);
      setEditingNoteContent("");
      setEditingChartUrls([]);
    } catch (error) {
      setEditNoteError(
        error instanceof Error ? error.message : "Failed to update note",
      );
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
              <div
                key={note._id}
                className="rounded border border-slate-600 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-11">
                    {formatDate(note._creationTime)}
                  </span>
                  {!isEditing && (
                    <button
                      type="button"
                      aria-label="Edit note"
                      title="Edit"
                      className="rounded p-1.5 text-slate-11 hover:bg-slate-700 hover:text-slate-12"
                      onClick={() => startEditingNote(note)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <>
                    <label htmlFor={`edit-note-${note._id}`} className="sr-only">
                      Edit note content
                    </label>
                    <textarea
                      id={`edit-note-${note._id}`}
                      className="min-h-24 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
                      value={editingNoteContent}
                      onChange={(e) => setEditingNoteContent(e.target.value)}
                    />
                    <ChartUrlInputs
                      urls={editingChartUrls}
                      onChange={setEditingChartUrls}
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
                        {isSavingNote ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel editing"
                        title="Cancel"
                        className="rounded p-1.5 text-slate-11 hover:bg-slate-700 hover:text-slate-12"
                        onClick={() => {
                          setEditingNoteId(null);
                          setEditingNoteContent("");
                          setEditingChartUrls([]);
                          setEditNoteError(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {editNoteError && (
                      <Alert variant="error" className="mt-2" onDismiss={() => setEditNoteError(null)}>
                        {editNoteError}
                      </Alert>
                    )}
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm text-slate-11">
                      {note.content}
                    </p>
                    {note.chartUrls && note.chartUrls.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {note.chartUrls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Chart ${i + 1}`}
                              className="max-h-64 rounded border border-slate-600"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addNoteError && (
        <Alert variant="error" className="mb-2" onDismiss={() => setAddNoteError(null)}>
          {addNoteError}
        </Alert>
      )}

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
        <ChartUrlInputs urls={newChartUrls} onChange={setNewChartUrls} />
        <noteForm.AppForm>
          <noteForm.SubmitButton
            label={isAddingNote ? "Saving..." : "Add Note"}
          />
        </noteForm.AppForm>
      </form>
    </section>
  );
}

function ChartUrlInputs({
  urls,
  onChange,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
}) {
  const addUrl = () => onChange([...urls, ""]);
  const removeUrl = (index: number) =>
    onChange(urls.filter((_, i) => i !== index));
  const updateUrl = (index: number, value: string) =>
    onChange(urls.map((u, i) => (i === index ? value : u)));

  return (
    <div className="mt-2 space-y-2">
      {urls.map((url, i) => (
        <div key={i} className="space-y-1">
          <div className="flex gap-2">
            <input
              type="url"
              className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-12 placeholder:text-slate-11"
              placeholder="Chart image URL"
              value={url}
              onChange={(e) => updateUrl(i, e.target.value)}
            />
            <button
              type="button"
              aria-label="Remove chart URL"
              title="Remove"
              className="rounded p-1.5 text-slate-11 hover:bg-slate-700 hover:text-red-400"
              onClick={() => removeUrl(i)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {url.trim() && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`Chart preview ${i + 1}`}
              className="max-h-48 rounded border border-slate-600"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
              onLoad={(e) => {
                (e.target as HTMLImageElement).style.display = "block";
              }}
            />
          )}
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-slate-11 hover:text-slate-12"
        onClick={addUrl}
      >
        <Plus className="h-3.5 w-3.5" />
        Add chart image
      </button>
    </div>
  );
}
