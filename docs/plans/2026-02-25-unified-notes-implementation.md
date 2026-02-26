# Unified Notes Table Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify all note tables into a single `notes` table with chart URL support, and update all frontend pages to use the unified API.

**Architecture:** Single `notes` table with nullable FK columns (`campaignId`, `tradePlanId`, `tradeId`) replaces 3 separate note tables + inline `trades.notes` field. A shared `NotesSection` component handles display/editing for all note types with chart URL support. Two-phase deployment: Phase 1 adds new alongside old; Phase 2 removes old.

**Tech Stack:** Convex (backend/schema), Next.js 15 App Router, TanStack Form, Zod, TypeScript

**Important context:** This branch (`feature/unified-notes`) is based off `main`. The `feature/trade-plan-notes-2` branch (not merged) has a `NotesSection` component, `tradePlanNotes` table, and trade plan detail page. We will NOT merge that branch. Instead, we build the unified system from scratch, using that branch's code as reference. The trade plan detail page and `getTradePlan` query are new work needed here.

**No test framework** is configured. Verification is via `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

---

### Task 1: Add `notes` table to schema

**Files:**
- Modify: `convex/schema.ts:1-139`

**Step 1: Add the notes table definition**

Add after the `generalNotes` table definition (after line 20), before `campaigns`:

```typescript
  notes: defineTable({
    campaignId: v.optional(v.id("campaigns")),
    chartUrls: v.optional(v.array(v.string())),
    content: v.string(),
    ownerId: v.string(),
    tradeId: v.optional(v.id("trades")),
    tradePlanId: v.optional(v.id("tradePlans")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_campaignId", ["ownerId", "campaignId"])
    .index("by_owner_tradePlanId", ["ownerId", "tradePlanId"])
    .index("by_owner_tradeId", ["ownerId", "tradeId"]),
```

Keep all existing tables unchanged (old tables stay for Phase 1).

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS (schema addition is additive)

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add unified notes table to schema"
```

---

### Task 2: Create `convex/notes.ts` backend

**Files:**
- Create: `convex/notes.ts`

**Step 1: Write the unified notes backend**

Reference patterns from `convex/campaignNotes.ts` and `convex/generalNotes.ts`. The file needs:

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const noteValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("notes"),
  campaignId: v.optional(v.id("campaigns")),
  chartUrls: v.optional(v.array(v.string())),
  content: v.string(),
  ownerId: v.string(),
  tradeId: v.optional(v.id("trades")),
  tradePlanId: v.optional(v.id("tradePlans")),
});

function trimNoteContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Note content is required");
  }
  return trimmed;
}

function validateSingleParent(args: {
  campaignId?: string;
  tradePlanId?: string;
  tradeId?: string;
}) {
  const parentCount = [args.campaignId, args.tradePlanId, args.tradeId].filter(
    Boolean,
  ).length;
  if (parentCount > 1) {
    throw new Error("A note can only belong to one parent");
  }
}

export const addNote = mutation({
  args: {
    campaignId: v.optional(v.id("campaigns")),
    chartUrls: v.optional(v.array(v.string())),
    content: v.string(),
    tradeId: v.optional(v.id("trades")),
    tradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: v.id("notes"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const content = trimNoteContent(args.content);
    validateSingleParent(args);

    // Verify parent exists and is owned by user
    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      assertOwner(campaign, ownerId, "Campaign not found");
    }
    if (args.tradePlanId) {
      const tradePlan = await ctx.db.get(args.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }
    if (args.tradeId) {
      const trade = await ctx.db.get(args.tradeId);
      assertOwner(trade, ownerId, "Trade not found");
    }

    return await ctx.db.insert("notes", {
      campaignId: args.campaignId,
      chartUrls: args.chartUrls,
      content,
      ownerId,
      tradeId: args.tradeId,
      tradePlanId: args.tradePlanId,
    });
  },
});

export const updateNote = mutation({
  args: {
    chartUrls: v.optional(v.array(v.string())),
    content: v.optional(v.string()),
    noteId: v.id("notes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const note = await ctx.db.get(args.noteId);
    assertOwner(note, ownerId, "Note not found");

    const patch: Record<string, unknown> = {};
    if (args.content !== undefined) {
      patch.content = trimNoteContent(args.content);
    }
    if (args.chartUrls !== undefined) {
      patch.chartUrls = args.chartUrls;
    }

    await ctx.db.patch(args.noteId, patch);
    return null;
  },
});

export const getNotesByCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) return [];

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner_campaignId", (q) =>
        q.eq("ownerId", ownerId).eq("campaignId", args.campaignId),
      )
      .collect();

    return notes.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const getNotesByTradePlan = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan || tradePlan.ownerId !== ownerId) return [];

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner_tradePlanId", (q) =>
        q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
      )
      .collect();

    return notes.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const getNotesByTrade = query({
  args: {
    tradeId: v.id("trades"),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const trade = await ctx.db.get(args.tradeId);
    if (!trade || trade.ownerId !== ownerId) return [];

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner_tradeId", (q) =>
        q.eq("ownerId", ownerId).eq("tradeId", args.tradeId),
      )
      .collect();

    return notes.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const getGeneralNotes = query({
  args: {},
  returns: v.array(noteValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);

    const allOwnerNotes = await ctx.db
      .query("notes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("asc")
      .collect();

    return allOwnerNotes.filter(
      (n) => !n.campaignId && !n.tradePlanId && !n.tradeId,
    );
  },
});
```

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add convex/notes.ts
git commit -m "feat: add unified notes queries and mutations"
```

---

### Task 3: Create `NotesSection` component with chart URL support

**Files:**
- Create: `src/components/NotesSection.tsx`

**Step 1: Create the NotesSection component**

This component handles display, add, and edit for notes with chart URLs. Based on the pattern from the `feature/trade-plan-notes-2` branch's `NotesSection`, extended with `chartUrls`.

```typescript
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
                    <textarea
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
                      <Alert variant="error" className="mt-2">
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
        <Alert variant="error" className="mb-2">
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
```

**Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/NotesSection.tsx
git commit -m "feat: add NotesSection component with chart URL support"
```

---

### Task 4: Add `getTradePlan` query to `convex/tradePlans.ts`

**Files:**
- Modify: `convex/tradePlans.ts`

**Step 1: Add the getTradePlan query**

Add after the existing `sortTradePlansByOrderThenNewest` function block and before `createTradePlan` (around line 69):

```typescript
export const getTradePlan = query({
  args: { tradePlanId: v.id("tradePlans") },
  returns: v.union(tradePlanValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan || tradePlan.ownerId !== ownerId) return null;
    return tradePlan;
  },
});
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add convex/tradePlans.ts
git commit -m "feat: add getTradePlan query"
```

---

### Task 5: Update campaign detail page to use unified notes

**Files:**
- Modify: `src/app/campaigns/[id]/page.tsx:19`
- Modify: `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`

**Step 1: Update the server page preload**

In `src/app/campaigns/[id]/page.tsx`, change line 19 from:
```typescript
preloadQuery(api.campaignNotes.getNotesByCampaign, { campaignId }, { token }),
```
to:
```typescript
preloadQuery(api.notes.getNotesByCampaign, { campaignId }, { token }),
```

Also update the import usage if `api.campaignNotes` is referenced.

**Step 2: Rewrite CampaignDetailPageClient notes section**

In `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`:

1. Add import for `NotesSection`:
```typescript
import NotesSection from "~/components/NotesSection";
```

2. Change the `preloadedCampaignNotes` prop type from:
```typescript
preloadedCampaignNotes: Preloaded<typeof api.campaignNotes.getNotesByCampaign>;
```
to:
```typescript
preloadedCampaignNotes: Preloaded<typeof api.notes.getNotesByCampaign>;
```

3. Change the mutations from:
```typescript
const addNote = useMutation(api.campaignNotes.addNote);
const updateNote = useMutation(api.campaignNotes.updateNote);
```
to:
```typescript
const addNote = useMutation(api.notes.addNote);
const updateNote = useMutation(api.notes.updateNote);
```

4. Remove all inline note state variables (lines 87-92):
- `addNoteError`, `editNoteError`, `isAddingNote`, `editingNoteId`, `editingNoteContent`, `isSavingNote`

5. Remove the `noteSchema`, `noteForm`, `startEditingNote`, `handleAddNote`, `handleSaveNote` functions/hooks.

6. Replace the entire notes `<section>` (lines 503-599) with:
```typescript
<NotesSection
  notes={campaignNotes}
  onAddNote={async (content, chartUrls) => {
    await addNote({ campaignId, content, chartUrls });
  }}
  onUpdateNote={async (noteId, content, chartUrls) => {
    await updateNote({ noteId: noteId as Id<"notes">, content, chartUrls });
  }}
/>
```

**Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/campaigns/[id]/page.tsx src/app/campaigns/[id]/CampaignDetailPageClient.tsx
git commit -m "feat: update campaign detail to use unified notes"
```

---

### Task 6: Create trade plan detail page

**Files:**
- Create: `src/app/trade-plans/[id]/page.tsx`
- Create: `src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx`

**Step 1: Create server component**

Create `src/app/trade-plans/[id]/page.tsx`:

```typescript
import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import TradePlanDetailPageClient from "./TradePlanDetailPageClient";

export default async function TradePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tradePlanId = id as Id<"tradePlans">;

  const token = await getConvexTokenOrThrow();
  const [preloadedTradePlan, preloadedNotes, preloadedAllTrades, preloadedAccountMappings] =
    await Promise.all([
      preloadQuery(api.tradePlans.getTradePlan, { tradePlanId }, { token }),
      preloadQuery(api.notes.getNotesByTradePlan, { tradePlanId }, { token }),
      preloadQuery(api.trades.listTrades, {}, { token }),
      preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    ]);

  return (
    <TradePlanDetailPageClient
      tradePlanId={tradePlanId}
      preloadedTradePlan={preloadedTradePlan}
      preloadedNotes={preloadedNotes}
      preloadedAllTrades={preloadedAllTrades}
      preloadedAccountMappings={preloadedAccountMappings}
    />
  );
}
```

**Step 2: Create client component**

Create `src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx`. This is a new page based on the pattern from `feature/trade-plan-notes-2` branch but using `api.notes.*`:

```typescript
"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "~/components/ui";
import NotesSection from "~/components/NotesSection";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { formatCurrency } from "~/lib/format";

type TradePlanStatus = "idea" | "watching" | "active" | "closed";
type SaveState = "idle" | "saving" | "saved";

export default function TradePlanDetailPageClient({
  tradePlanId,
  preloadedTradePlan,
  preloadedNotes,
  preloadedAllTrades,
  preloadedAccountMappings,
}: {
  tradePlanId: Id<"tradePlans">;
  preloadedTradePlan: Preloaded<typeof api.tradePlans.getTradePlan>;
  preloadedNotes: Preloaded<typeof api.notes.getNotesByTradePlan>;
  preloadedAllTrades: Preloaded<typeof api.trades.listTrades>;
  preloadedAccountMappings: Preloaded<typeof api.accountMappings.listAccountMappings>;
}) {
  const tradePlan = usePreloadedQuery(preloadedTradePlan);
  const notes = usePreloadedQuery(preloadedNotes);
  const allTrades = usePreloadedQuery(preloadedAllTrades);
  const accountMappings = usePreloadedQuery(preloadedAccountMappings);

  const addNote = useMutation(api.notes.addNote);
  const updateNoteM = useMutation(api.notes.updateNote);
  const updateTradePlan = useMutation(api.tradePlans.updateTradePlan);
  const updateTradePlanStatus = useMutation(api.tradePlans.updateTradePlanStatus);

  const trades = useMemo(
    () => allTrades.filter((t) => t.tradePlanId === tradePlanId),
    [allTrades, tradePlanId],
  );

  const accountNameByAccountId = useMemo(() => {
    const map = new Map<string, string>();
    for (const mapping of accountMappings) {
      map.set(mapping.accountId, mapping.friendlyName);
    }
    return map;
  }, [accountMappings]);

  const [planName, setPlanName] = useState("");
  const [planNameInitialized, setPlanNameInitialized] = useState(false);
  const [planNameError, setPlanNameError] = useState<string | null>(null);
  const [planNameSaveState, setPlanNameSaveState] = useState<SaveState>("idle");

  const [instrumentSymbol, setInstrumentSymbol] = useState("");
  const [instrumentSymbolInitialized, setInstrumentSymbolInitialized] = useState(false);
  const [instrumentSymbolError, setInstrumentSymbolError] = useState<string | null>(null);
  const [instrumentSymbolSaveState, setInstrumentSymbolSaveState] = useState<SaveState>("idle");

  const [statusError, setStatusError] = useState<string | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  useEffect(() => {
    if (tradePlan && !planNameInitialized) {
      setPlanName(tradePlan.name);
      setPlanNameInitialized(true);
    }
  }, [tradePlan, planNameInitialized]);

  useEffect(() => {
    if (tradePlan && !instrumentSymbolInitialized) {
      setInstrumentSymbol(tradePlan.instrumentSymbol);
      setInstrumentSymbolInitialized(true);
    }
  }, [tradePlan, instrumentSymbolInitialized]);

  const handleSaveName = async () => {
    setPlanNameError(null);
    setPlanNameSaveState("saving");
    const trimmed = planName.trim();
    if (!trimmed) {
      setPlanNameError("Name is required");
      setPlanNameSaveState("idle");
      return;
    }
    try {
      await updateTradePlan({ tradePlanId, name: trimmed });
      setPlanName(trimmed);
      setPlanNameSaveState("saved");
    } catch (error) {
      setPlanNameError(error instanceof Error ? error.message : "Failed to save name");
      setPlanNameSaveState("idle");
    }
  };

  const handleSaveSymbol = async () => {
    setInstrumentSymbolError(null);
    setInstrumentSymbolSaveState("saving");
    const trimmed = instrumentSymbol.trim().toUpperCase();
    if (!trimmed) {
      setInstrumentSymbolError("Symbol is required");
      setInstrumentSymbolSaveState("idle");
      return;
    }
    try {
      await updateTradePlan({ tradePlanId, instrumentSymbol: trimmed });
      setInstrumentSymbol(trimmed);
      setInstrumentSymbolSaveState("saved");
    } catch (error) {
      setInstrumentSymbolError(error instanceof Error ? error.message : "Failed to save symbol");
      setInstrumentSymbolSaveState("idle");
    }
  };

  const handleStatusChange = async (status: TradePlanStatus) => {
    setStatusError(null);
    setIsChangingStatus(true);
    try {
      await updateTradePlanStatus({ tradePlanId, status });
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setIsChangingStatus(false);
    }
  };

  if (tradePlan === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-slate-11">Trade plan not found.</p>
        <Link href="/trade-plans" className="mt-4 inline-block text-blue-400 hover:underline">
          Back to trade plans
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <Link href="/trade-plans" className="mb-2 inline-block text-sm text-slate-11 hover:text-slate-12">
        &larr; Back to Trade Plans
      </Link>

      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex-1 space-y-3">
            <div>
              <label htmlFor="plan-name" className="mb-1 block text-xs uppercase tracking-wide text-slate-11">
                Plan Name
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="plan-name"
                  maxLength={120}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xl font-bold text-slate-12"
                  value={planName}
                  onChange={(e) => {
                    setPlanName(e.target.value);
                    setPlanNameError(null);
                    if (planNameSaveState === "saved") setPlanNameSaveState("idle");
                  }}
                />
                <button
                  type="button"
                  className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600"
                  onClick={() => void handleSaveName()}
                  disabled={planNameSaveState === "saving"}
                >
                  Save Name
                </button>
              </div>
              {planNameError && <Alert variant="error" className="mt-2">{planNameError}</Alert>}
              {planNameSaveState === "saving" && (
                <span className="mt-2 flex items-center gap-1 text-sm text-slate-11">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              )}
              {planNameSaveState === "saved" && (
                <span className="mt-2 flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>

            <div>
              <label htmlFor="plan-symbol" className="mb-1 block text-xs uppercase tracking-wide text-slate-11">
                Instrument Symbol
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="plan-symbol"
                  maxLength={20}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12 sm:w-40"
                  value={instrumentSymbol}
                  onChange={(e) => {
                    setInstrumentSymbol(e.target.value);
                    setInstrumentSymbolError(null);
                    if (instrumentSymbolSaveState === "saved") setInstrumentSymbolSaveState("idle");
                  }}
                />
                <button
                  type="button"
                  className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600"
                  onClick={() => void handleSaveSymbol()}
                  disabled={instrumentSymbolSaveState === "saving"}
                >
                  Save Symbol
                </button>
              </div>
              {instrumentSymbolError && <Alert variant="error" className="mt-2">{instrumentSymbolError}</Alert>}
              {instrumentSymbolSaveState === "saving" && (
                <span className="mt-2 flex items-center gap-1 text-sm text-slate-11">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              )}
              {instrumentSymbolSaveState === "saved" && (
                <span className="mt-2 flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>
          </div>

          <div className="w-44">
            <label htmlFor="plan-status" className="mb-1 block text-xs uppercase tracking-wide text-slate-11">
              Status
            </label>
            <select
              id="plan-status"
              value={tradePlan.status}
              disabled={isChangingStatus}
              onChange={(e) => void handleStatusChange(e.target.value as TradePlanStatus)}
              className="h-9 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-slate-12 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="idea">Idea</option>
              <option value="watching">Watching</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {tradePlan.status === "closed" && tradePlan.closedAt && (
          <p className="text-xs text-slate-11">Closed {new Date(tradePlan.closedAt).toLocaleDateString("en-US")}</p>
        )}

        {tradePlan.campaignId && (
          <p className="mt-2 text-sm text-slate-11">
            Campaign:{" "}
            <Link href={`/campaigns/${tradePlan.campaignId}`} className="text-blue-400 hover:underline">
              View Campaign
            </Link>
          </p>
        )}

        {statusError && <Alert variant="error" className="mt-3">{statusError}</Alert>}
      </div>

      <NotesSection
        notes={notes}
        onAddNote={async (content, chartUrls) => {
          await addNote({ tradePlanId, content, chartUrls });
        }}
        onUpdateNote={async (noteId, content, chartUrls) => {
          await updateNoteM({ noteId: noteId as Id<"notes">, content, chartUrls });
        }}
      />

      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-12">Trades</h2>
          <Link href="/trades/new" className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600">
            Add Trade
          </Link>
        </div>

        {trades.length === 0 ? (
          <p className="text-sm text-slate-11">No trades linked to this plan yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-11">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Ticker</th>
                  <th className="px-2 py-2">Account</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Price</th>
                  <th className="px-2 py-2">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade._id} className="border-b border-slate-700/60">
                    <td className="px-2 py-2 text-slate-11">{new Date(trade.date).toLocaleDateString("en-US")}</td>
                    <td className="px-2 py-2 text-slate-12">{trade.ticker}</td>
                    <td className="px-2 py-2 text-slate-11">
                      {trade.brokerageAccountId ? accountNameByAccountId.get(trade.brokerageAccountId) ?? trade.brokerageAccountId : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-slate-11">{trade.side}</td>
                    <td className="px-2 py-2 text-slate-11">{trade.quantity}</td>
                    <td className="px-2 py-2 text-slate-11">{formatCurrency(trade.price)}</td>
                    <td className="px-2 py-2">
                      {trade.realizedPL === null ? (
                        <span className="text-slate-11">{"\u2014"}</span>
                      ) : (
                        <span className={trade.realizedPL >= 0 ? "text-green-400" : "text-red-400"}>
                          {trade.realizedPL >= 0 ? "+" : ""}
                          {formatCurrency(trade.realizedPL)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

**Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/trade-plans/[id]/page.tsx src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx
git commit -m "feat: add trade plan detail page with unified notes"
```

---

### Task 7: Update general notes page to use unified notes

**Files:**
- Modify: `src/app/notes/page.tsx`
- Modify: `src/app/notes/NotesPageClient.tsx`

**Step 1: Update server page**

In `src/app/notes/page.tsx`, change `api.generalNotes.getNotes` to `api.notes.getGeneralNotes`:

```typescript
import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import NotesPageClient from "./NotesPageClient";

export default async function NotesPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedNotes = await preloadQuery(
    api.notes.getGeneralNotes,
    {},
    { token },
  );

  return <NotesPageClient preloadedNotes={preloadedNotes} />;
}
```

**Step 2: Rewrite NotesPageClient to use NotesSection**

Replace the entire component to use `NotesSection` and `api.notes.*`:

```typescript
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
```

**Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/notes/page.tsx src/app/notes/NotesPageClient.tsx
git commit -m "feat: update general notes page to use unified notes"
```

---

### Task 8: Create migration script

**Files:**
- Create: `convex/migrations/unifiedNotesMigration.ts`

**Step 1: Write migration**

```typescript
import { internalMutation } from "../_generated/server";

export const migrate = internalMutation({
  args: {},
  handler: async (ctx) => {
    let migrated = 0;

    // Migrate campaign notes
    const campaignNotes = await ctx.db.query("campaignNotes").collect();
    for (const note of campaignNotes) {
      await ctx.db.insert("notes", {
        campaignId: note.campaignId,
        content: note.content,
        ownerId: note.ownerId,
      });
      migrated++;
    }
    console.log(`Migrated ${migrated} campaign notes`);

    // Migrate trade plan notes
    let tradePlanCount = 0;
    const tradePlanNotes = await ctx.db.query("tradePlanNotes").collect();
    for (const note of tradePlanNotes) {
      await ctx.db.insert("notes", {
        content: note.content,
        ownerId: note.ownerId,
        tradePlanId: note.tradePlanId,
      });
      tradePlanCount++;
    }
    console.log(`Migrated ${tradePlanCount} trade plan notes`);
    migrated += tradePlanCount;

    // Migrate general notes
    let generalCount = 0;
    const generalNotes = await ctx.db.query("generalNotes").collect();
    for (const note of generalNotes) {
      await ctx.db.insert("notes", {
        content: note.content,
        ownerId: note.ownerId,
      });
      generalCount++;
    }
    console.log(`Migrated ${generalCount} general notes`);
    migrated += generalCount;

    // Migrate inline trade notes
    let tradeCount = 0;
    const trades = await ctx.db.query("trades").collect();
    for (const trade of trades) {
      if (trade.notes && trade.notes.trim()) {
        await ctx.db.insert("notes", {
          content: trade.notes.trim(),
          ownerId: trade.ownerId,
          tradeId: trade._id,
        });
        tradeCount++;
      }
    }
    console.log(`Migrated ${tradeCount} inline trade notes`);
    migrated += tradeCount;

    console.log(`Total migrated: ${migrated} notes`);
  },
});
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add convex/migrations/unifiedNotesMigration.ts
git commit -m "feat: add unified notes migration script"
```

---

### Task 9: Final verification

**Step 1: Run all checks**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: All PASS

**Step 2: Fix any issues found**

If any step fails, fix and re-run.

---

## Phase 2 (separate future PR): Clean up old

This is a follow-up PR after Phase 1 is deployed and migration has been confirmed:

1. Remove `campaignNotes`, `tradePlanNotes`, `generalNotes` table definitions from `convex/schema.ts`
2. Delete `convex/campaignNotes.ts`
3. Delete `convex/tradePlanNotes.ts`
4. Delete `convex/generalNotes.ts`
5. Remove `notes` field from `trades` table in `convex/schema.ts`
6. Remove `notes` from `tradeValidator` and `tradeWithPLValidator` in `convex/trades.ts`
7. Remove `notes` args from `createTrade` and `updateTrade` mutations in `convex/trades.ts`
8. Delete `convex/migrations/unifiedNotesMigration.ts`
9. Delete `convex/migrations/tradePlanNotesMigration.ts` (if still present)
10. Verify: `pnpm lint && pnpm typecheck && pnpm build`
