# Trade Plan Notes Migration & Detail Page

## Summary

Convert trade plans from structured condition fields (entryConditions, exitConditions, targetConditions, instrumentNotes, rationale) to a notes system matching campaign notes. Create a dedicated trade plan detail page at `/trade-plans/[id]`.

## Migration Strategy

This work is split into two PRs to safely migrate data before removing old fields.

### PR 1: Add notes support + migrate data

**Goal:** Introduce the `tradePlanNotes` table, backend functions, detail page, and UI — all while keeping the old condition fields in the schema. Run the migration to copy existing condition data into notes. After this PR is merged and the migration is run in production, the old fields are no longer read or written by the app.

**Data model additions:**

New table: `tradePlanNotes` (mirrors `campaignNotes`):

- `tradePlanId`: `v.id("tradePlans")` — required reference to parent plan
- `content`: `v.string()` — note text
- `ownerId`: `v.string()` — user who created the note
- Index: `by_owner_tradePlanId` on `["ownerId", "tradePlanId"]`

The old fields (`entryConditions`, `exitConditions`, `targetConditions`, `instrumentNotes`, `rationale`) remain in the `tradePlans` schema during this PR — they are not removed yet.

**Backend (Convex functions):**

New `convex/tradePlanNotes.ts` (mirrors `campaignNotes.ts`):

- `addNote(tradePlanId, content)` — validates plan exists & owned by user, inserts note
- `updateNote(noteId, content)` — validates note owned by user, patches content
- `getNotesByTradePlan(tradePlanId)` — returns notes sorted ascending by creation time

Changes to `convex/tradePlans.ts`:

- Stop reading/writing condition fields in `createTradePlan` and `updateTradePlan` (remove from args and handler logic, but leave schema fields in place)
- Remove condition fields from `tradePlanValidator`
- Add `getTradePlan(tradePlanId)` query returning a single trade plan

New `convex/migrations/tradePlanNotesMigration.ts` — one-time migration runnable via `npx convex run`:

- Iterates all existing trade plans
- For each plan with non-empty conditions, creates a `tradePlanNotes` entry combining:
  ```text
  Entry Conditions: <value>
  Exit Conditions: <value>
  Target Conditions: <value>
  Instrument Notes: <value>   (if present)
  ```

**Trade plan detail page:**

Route: `/trade-plans/[id]/page.tsx` (server) + `TradePlanDetailPageClient.tsx` (client)

Layout (matches campaign detail page pattern):

1. **Header** — Back link to `/trade-plans`, plan name
2. **Plan Info Card** — Editable name, symbol, status dropdown, campaign link (if linked), closed date (if closed)
3. **Notes Section** — Chronological list with inline edit, add note form at bottom
4. **Trades Section** — Table of trades linked to this plan (date, ticker, account, side, qty, price, P&L). "Add Trade" link. Trades without a `tradePlanId` remain valid (campaigns are strategic, trade plans are tactical) and simply do not appear in this table.

**Shared notes component:**

Extract notes UI into a reusable `NotesSection` component used by both campaign detail and trade plan detail pages. Props:

- `notes` array (with `_id`, `content`, `_creationTime`)
- `onAddNote(content)` callback
- `onUpdateNote(noteId, content)` callback
- Loading/error state management

**Changes to existing pages:**

Campaign detail page (`/campaigns/[id]`):

- Trade plans section: Remove inline condition editing. Each plan card becomes a link to `/trade-plans/[planId]` showing name, symbol, status.
- Notes section: Refactor to use shared `NotesSection` component.

Standalone trade plans page (`/trade-plans`):

- Remove condition fields from create form (just name + symbol)
- Each plan row links to `/trade-plans/[planId]`
- Remove inline condition display

### PR 2: Remove old condition fields

**Goal:** Clean up the old fields from the schema now that all data has been migrated and no code references them.

**Changes:**

- Remove `entryConditions`, `exitConditions`, `targetConditions`, `instrumentNotes`, `rationale` from the `tradePlans` table in `convex/schema.ts`
- Delete the migration file (`convex/migrations/tradePlanNotesMigration.ts`) since it has already been run
- Remove any remaining references to the old fields (types, dead code)
