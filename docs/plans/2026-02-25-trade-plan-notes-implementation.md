# Trade Plan Notes Migration & Detail Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace trade plan structured condition fields with a notes system and create a dedicated trade plan detail page.

**Architecture:** New `tradePlanNotes` table mirroring `campaignNotes`. Shared `NotesSection` UI component extracted from campaign detail page. New `/trade-plans/[id]` route following existing server/client component pattern. Migration function converts existing conditions into notes.

**Tech Stack:** Convex (backend/database), Next.js 15 App Router, TanStack React Form, Zod, Tailwind CSS, Lucide icons.

---

### Task 1: Create `tradePlanNotes` table in schema

**Files:**
- Modify: `convex/schema.ts`

**Step 1: Add tradePlanNotes table to schema**

In `convex/schema.ts`, add the new table after the `campaignNotes` definition (line 9). Insert:

```typescript
  tradePlanNotes: defineTable({
    content: v.string(),
    ownerId: v.string(),
    tradePlanId: v.id("tradePlans"),
  }).index("by_owner_tradePlanId", ["ownerId", "tradePlanId"]),
```

**Step 2: Verify schema compiles**

Run: `cd /home/jacksondr5/personal/repos/jacksondr5/trade-tracker && pnpm typecheck`
Expected: No errors (Convex generates types from schema).

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add tradePlanNotes table to schema"
```

---

### Task 2: Create `convex/tradePlanNotes.ts` backend

**Files:**
- Create: `convex/tradePlanNotes.ts`

Mirror `convex/campaignNotes.ts` but for trade plans.

**Step 1: Create the file**

Create `convex/tradePlanNotes.ts` with:

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const tradePlanNoteValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("tradePlanNotes"),
  content: v.string(),
  ownerId: v.string(),
  tradePlanId: v.id("tradePlans"),
});

export const addNote = mutation({
  args: {
    content: v.string(),
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.id("tradePlanNotes"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { tradePlanId, content } = args;

    const tradePlan = await ctx.db.get(tradePlanId);
    assertOwner(tradePlan, ownerId, "Trade plan not found");

    const noteId = await ctx.db.insert("tradePlanNotes", {
      content,
      ownerId,
      tradePlanId,
    });

    return noteId;
  },
});

export const updateNote = mutation({
  args: {
    content: v.string(),
    noteId: v.id("tradePlanNotes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const note = await ctx.db.get(args.noteId);
    assertOwner(note, ownerId, "Note not found");

    await ctx.db.patch(args.noteId, {
      content: args.content,
    });

    return null;
  },
});

export const getNotesByTradePlan = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.array(tradePlanNoteValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan || tradePlan.ownerId !== ownerId) {
      return [];
    }

    const notes = await ctx.db
      .query("tradePlanNotes")
      .withIndex("by_owner_tradePlanId", (q) =>
        q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
      )
      .collect();

    return notes.sort((a, b) => a._creationTime - b._creationTime);
  },
});
```

**Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors.

**Step 3: Commit**

```bash
git add convex/tradePlanNotes.ts
git commit -m "feat: add tradePlanNotes backend (addNote, updateNote, getNotesByTradePlan)"
```

---

### Task 3: Add `getTradePlan` query and `listTradesByTradePlan` query

**Files:**
- Modify: `convex/tradePlans.ts`
- Modify: `convex/trades.ts`

**Step 1: Add getTradePlan query to `convex/tradePlans.ts`**

Add at the end of the file:

```typescript
export const getTradePlan = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.union(tradePlanValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan || tradePlan.ownerId !== ownerId) {
      return null;
    }
    return tradePlan;
  },
});
```

**Step 2: Add listTradesByTradePlan query to `convex/trades.ts`**

Read `convex/trades.ts` to understand the existing trade validator and patterns, then add a query that uses the `by_owner_tradePlanId` index. The query should return trades for a specific trade plan, sorted by date descending. Use the same return validator as `listTrades`.

**Step 3: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors.

**Step 4: Commit**

```bash
git add convex/tradePlans.ts convex/trades.ts
git commit -m "feat: add getTradePlan and listTradesByTradePlan queries"
```

---

### Task 4: Create shared `NotesSection` component

**Files:**
- Create: `src/components/notes-section.tsx`

Extract the notes UI from `src/app/campaigns/[id]/CampaignDetailPageClient.tsx` (lines 503-599) into a reusable component.

**Step 1: Create the shared component**

Create `src/components/notes-section.tsx`:

```typescript
"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
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
  content: string;
}

interface NotesSectionProps {
  notes: Note[];
  onAddNote: (content: string) => Promise<void>;
  onUpdateNote: (noteId: string, content: string) => Promise<void>;
}

export function NotesSection({ notes, onAddNote, onUpdateNote }: NotesSectionProps) {
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

  const startEditingNote = (note: Note) => {
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
```

**Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/notes-section.tsx
git commit -m "feat: extract shared NotesSection component from campaign notes UI"
```

---

### Task 5: Refactor campaign detail page to use `NotesSection`

**Files:**
- Modify: `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`

**Step 1: Replace campaign notes UI with NotesSection**

In `CampaignDetailPageClient.tsx`:

1. Add import: `import { NotesSection } from "~/components/notes-section";`
2. Remove these state variables (they move into `NotesSection`):
   - `addNoteError`, `editNoteError`, `isAddingNote`, `editingNoteId`, `editingNoteContent`, `isSavingNote`
3. Remove the `noteSchema` const at the top of the file.
4. Remove the `noteForm` hook usage.
5. Remove the `startEditingNote` and `handleSaveNote` functions.
6. Keep the `handleAddNote` function but simplify it — it just calls `addNote({ campaignId, content })`.
7. Replace the entire notes `<section>` (lines 503-599) with:

```tsx
<NotesSection
  notes={campaignNotes}
  onAddNote={async (content) => {
    await addNote({ campaignId, content });
  }}
  onUpdateNote={async (noteId, content) => {
    await updateNote({ noteId: noteId as Id<"campaignNotes">, content });
  }}
/>
```

8. Remove unused imports: `z` (if no longer used), and `Pencil`, `Check`, `X` (if only used in notes section — check if trade plan section still uses them). Keep any icons still used by other sections.

**Step 2: Verify it compiles and lint passes**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/campaigns/[id]/CampaignDetailPageClient.tsx
git commit -m "refactor: use shared NotesSection in campaign detail page"
```

---

### Task 6: Remove condition fields from trade plan schema and backend

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/tradePlans.ts`

**Step 1: Update `tradePlanValidator` in `convex/tradePlans.ts`**

Remove these fields from the `tradePlanValidator` object (lines 17-19, 25):
- `entryConditions: v.string()`
- `exitConditions: v.string()`
- `instrumentNotes: v.optional(v.string())`
- `rationale: v.optional(v.string())`
- `targetConditions: v.string()`

**Step 2: Update `createTradePlan` mutation**

Remove from args: `entryConditions`, `exitConditions`, `targetConditions`, `instrumentNotes`, `rationale`.
Remove from the `ctx.db.insert` call: same fields.

After changes, the insert should only include: `campaignId`, `instrumentSymbol`, `instrumentType`, `name`, `ownerId`, `sortOrder`, `status`.

**Step 3: Update `updateTradePlan` mutation**

Remove from args: `entryConditions`, `exitConditions`, `targetConditions`, `instrumentNotes`, `rationale`.
Remove the corresponding `if (updates.xxx !== undefined)` blocks from the handler.

**Step 4: Update schema in `convex/schema.ts`**

Remove from the `tradePlans` table definition:
- `entryConditions: v.string()`
- `exitConditions: v.string()`
- `instrumentNotes: v.optional(v.string())`
- `rationale: v.optional(v.string())`
- `targetConditions: v.string()`

**Step 5: Verify it compiles**

Run: `pnpm typecheck`
Expected: Compilation errors in frontend files that reference the removed fields. This is expected — they will be fixed in Tasks 7 and 8.

**Step 6: Commit**

```bash
git add convex/schema.ts convex/tradePlans.ts
git commit -m "feat: remove condition/rationale fields from tradePlans schema and backend"
```

---

### Task 7: Simplify campaign detail trade plans section

**Files:**
- Modify: `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`

**Step 1: Simplify trade plans section**

Replace the trade plans section (the `<section>` that starts with "Trade Plans" heading, around lines 601-814) with a simplified version. Each plan card becomes a link to `/trade-plans/[planId]` showing just name, symbol, and status. Remove all inline editing of conditions.

Remove state variables no longer needed:
- `planEntryConditions`, `planExitConditions`, `planTargetConditions` (create form)
- `editingPlanId`, `editingPlanName`, `editingPlanInstrumentSymbol`, `editingPlanEntryConditions`, `editingPlanExitConditions`, `editingPlanTargetConditions`, `isSavingPlan`, `tradePlanEditError` (editing)

Remove functions no longer needed:
- `startEditingTradePlan`, `handleSaveTradePlan`

Simplify `handleCreateTradePlan` to only send `name`, `instrumentSymbol`, and `campaignId` (no conditions).

Simplify the create form to only have name and symbol inputs.

Each plan card should be a `<Link href={/trade-plans/${plan._id}}>` showing plan name, symbol, and status badge/dropdown. Keep the status dropdown for quick status changes.

**Step 2: Remove unused imports**

Remove the `updateTradePlan` mutation import if no longer used. Check if `Doc<"tradePlans">` is still needed.

**Step 3: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors for this file. May still have errors in `TradePlansPageClient.tsx` (fixed in Task 8).

**Step 4: Commit**

```bash
git add src/app/campaigns/[id]/CampaignDetailPageClient.tsx
git commit -m "refactor: simplify campaign trade plans section, link to detail page"
```

---

### Task 8: Simplify standalone trade plans page

**Files:**
- Modify: `src/app/trade-plans/TradePlansPageClient.tsx`

**Step 1: Simplify the create form**

Remove condition state variables: `entryConditions`, `exitConditions`, `targetConditions`.
Remove condition textareas from the form.
Update `handleCreate` to not send condition fields.

**Step 2: Simplify plan cards to link to detail page**

Each plan card should be a `<Link href={/trade-plans/${plan._id}}>` showing name, symbol, status badge, and close button. Remove the condition display (`<p>` tags for entry/exit/target).

**Step 3: Verify it compiles and lint passes**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/app/trade-plans/TradePlansPageClient.tsx
git commit -m "refactor: simplify trade plans page, link to detail page"
```

---

### Task 9: Create trade plan detail page

**Files:**
- Create: `src/app/trade-plans/[id]/page.tsx`
- Create: `src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx`

**Step 1: Create server component**

Create `src/app/trade-plans/[id]/page.tsx` following the pattern from `src/app/campaigns/[id]/page.tsx`:

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
  const [preloadedTradePlan, preloadedNotes, preloadedTrades, preloadedAccountMappings] =
    await Promise.all([
      preloadQuery(api.tradePlans.getTradePlan, { tradePlanId }, { token }),
      preloadQuery(api.tradePlanNotes.getNotesByTradePlan, { tradePlanId }, { token }),
      preloadQuery(api.trades.listTradesByTradePlan, { tradePlanId }, { token }),
      preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    ]);

  return (
    <TradePlanDetailPageClient
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedNotes={preloadedNotes}
      preloadedTradePlan={preloadedTradePlan}
      preloadedTrades={preloadedTrades}
      tradePlanId={tradePlanId}
    />
  );
}
```

**Step 2: Create client component**

Create `src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx` following the campaign detail page pattern. Sections:

1. **Header**: Back link to `/trade-plans`, plan name
2. **Plan Info Card**: Editable name, editable symbol, status dropdown, campaign link (if linked), closed date
3. **Notes Section**: Use the shared `NotesSection` component
4. **Trades Section**: Table of linked trades (same pattern as campaign detail trades table)

The component should:
- Accept preloaded queries for trade plan, notes, trades, account mappings
- Use `useMutation` for `updateTradePlan`, `updateTradePlanStatus`, `tradePlanNotes.addNote`, `tradePlanNotes.updateNote`
- Follow the same state management patterns as campaign detail (useState for editable fields, SaveState for save indicators)
- Handle null trade plan (not found) with message and back link

**Step 3: Verify it compiles and lint passes**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/app/trade-plans/[id]/page.tsx src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx
git commit -m "feat: add trade plan detail page with notes and trades"
```

---

### Task 10: Create migration function

**Files:**
- Create: `convex/migrations/tradePlanNotesMigration.ts`

**Step 1: Create the migration**

Create `convex/migrations/tradePlanNotesMigration.ts`:

```typescript
import { internalMutation } from "../_generated/server";

export const migrateTradePlanConditionsToNotes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tradePlans = await ctx.db.query("tradePlans").collect();

    let migrated = 0;
    for (const plan of tradePlans) {
      const parts: string[] = [];

      // Access raw document fields that may still exist in DB
      const raw = plan as Record<string, unknown>;

      if (raw.entryConditions && typeof raw.entryConditions === "string") {
        parts.push(`Entry Conditions: ${raw.entryConditions}`);
      }
      if (raw.exitConditions && typeof raw.exitConditions === "string") {
        parts.push(`Exit Conditions: ${raw.exitConditions}`);
      }
      if (raw.targetConditions && typeof raw.targetConditions === "string") {
        parts.push(`Target Conditions: ${raw.targetConditions}`);
      }
      if (raw.instrumentNotes && typeof raw.instrumentNotes === "string") {
        parts.push(`Instrument Notes: ${raw.instrumentNotes}`);
      }

      if (parts.length > 0) {
        await ctx.db.insert("tradePlanNotes", {
          content: parts.join("\n"),
          ownerId: plan.ownerId,
          tradePlanId: plan._id,
        });
        migrated++;
      }
    }

    return { migrated, total: tradePlans.length };
  },
});
```

**Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors.

**Step 3: Commit**

```bash
git add convex/migrations/tradePlanNotesMigration.ts
git commit -m "feat: add migration to convert trade plan conditions to notes"
```

---

### Task 11: Final verification

**Step 1: Run full verification suite**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: All pass with no errors.

**Step 2: Verify no references to removed fields remain**

Search for any remaining references to the removed field names:
- `entryConditions` (should only appear in migration file)
- `exitConditions` (should only appear in migration file)
- `targetConditions` (should only appear in migration file)
- `instrumentNotes` (should only appear in migration file)
- `rationale` (should not appear anywhere)

**Step 3: Final commit if any cleanup needed**

If any cleanup was needed, commit with: `chore: cleanup remaining references to removed trade plan fields`
