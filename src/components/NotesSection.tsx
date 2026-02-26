"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  LineChart,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { z } from "zod";
import { Alert, Dialog, DialogContent, DialogTitle, useAppForm } from "~/components/ui";
import { formatDate } from "~/lib/format";

const noteSchema = z.object({
  content: z.string().trim().min(1, "Note content is required"),
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
        const urls = normalizeUrls(newChartUrls);
        await onAddNote(parsed.content, urls.length > 0 ? urls : undefined);
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

  const normalizeUrls = (urls: string[]) =>
    urls.map((u) => u.trim()).filter(Boolean);

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
      const urls = normalizeUrls(editingChartUrls);
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
                      <ChartCarousel urls={note.chartUrls} />
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

function ChartCarousel({ urls }: { urls: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.6;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <>
      <div className="group/carousel relative mt-2">
        {urls.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Scroll charts left"
              className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-900/80 p-1 text-slate-11 opacity-0 transition-opacity hover:text-slate-12 group-hover/carousel:opacity-100"
              onClick={() => scroll("left")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Scroll charts right"
              className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-900/80 p-1 text-slate-11 opacity-0 transition-opacity hover:text-slate-12 group-hover/carousel:opacity-100"
              onClick={() => scroll("right")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-none"
        >
          {urls.map((url, i) => (
            <button
              key={i}
              type="button"
              className="flex-none cursor-pointer"
              onClick={() => setLightboxIndex(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Chart ${i + 1}`}
                className="h-24 rounded border border-slate-600 object-cover transition-opacity hover:opacity-80"
              />
            </button>
          ))}
        </div>
      </div>

      {lightboxIndex !== null && (
        <ChartLightbox
          urls={urls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

function ChartLightbox({
  urls,
  initialIndex,
  onClose,
}: {
  urls: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft" && index > 0) {
        setIndex(index - 1);
      } else if (e.key === "ArrowRight" && index < urls.length - 1) {
        setIndex(index + 1);
      }
    },
    [index, urls.length],
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="flex max-h-[95dvh] max-w-[95dvw] items-center justify-center border-none bg-transparent p-0 shadow-none [&>button:last-child]:top-2 [&>button:last-child]:right-2 [&>button:last-child]:rounded-full [&>button:last-child]:bg-slate-900/80 [&>button:last-child]:p-2 [&>button:last-child]:opacity-100"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">
          Chart {index + 1} of {urls.length}
        </DialogTitle>
        {urls.length > 1 && index > 0 && (
          <button
            type="button"
            aria-label="Previous chart"
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-slate-900/80 p-2 text-slate-11 hover:text-slate-12"
            onClick={() => setIndex(index - 1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {urls.length > 1 && index < urls.length - 1 && (
          <button
            type="button"
            aria-label="Next chart"
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-slate-900/80 p-2 text-slate-11 hover:text-slate-12"
            onClick={() => setIndex(index + 1)}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[index]}
          alt={`Chart ${index + 1} of ${urls.length}`}
          className="max-h-[90dvh] max-w-[90dvw] rounded-lg object-contain"
        />

        {urls.length > 1 && (
          <div className="absolute bottom-4 flex gap-1.5">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to chart ${i + 1}`}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === index ? "bg-slate-12" : "bg-slate-11/40 hover:bg-slate-11/70"
                }`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
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
              aria-label={`Chart URL ${i + 1}`}
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
        aria-label="Add chart image"
        title="Add chart image"
        className="rounded p-1.5 text-slate-11 hover:bg-slate-700 hover:text-slate-12"
        onClick={addUrl}
      >
        <LineChart className="h-4 w-4" />
      </button>
    </div>
  );
}
