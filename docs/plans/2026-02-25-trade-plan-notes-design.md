# Trade Plan Notes Migration & Detail Page

## Summary

Convert trade plans from structured condition fields (entryConditions, exitConditions, targetConditions, instrumentNotes, rationale) to a notes system matching campaign notes. Create a dedicated trade plan detail page at `/trade-plans/[id]`.

## Data Model Changes

### New table: `tradePlanNotes`

Mirrors `campaignNotes`:

- `tradePlanId`: `v.id("tradePlans")` — required reference to parent plan
- `content`: `v.string()` — note text
- `ownerId`: `v.string()` — user who created the note
- Index: `by_owner_tradePlanId` on `["ownerId", "tradePlanId"]`

### Fields removed from `tradePlans`

- `entryConditions` (required string)
- `exitConditions` (required string)
- `targetConditions` (required string)
- `instrumentNotes` (optional string)
- `rationale` (optional string)

### Migration

A Convex migration function iterates all existing trade plans. For each one with non-empty conditions, creates a single `tradePlanNotes` entry combining all fields:

```
Entry Conditions: <value>
Exit Conditions: <value>
Target Conditions: <value>
Instrument Notes: <value>   (if present)
```

## Backend (Convex Functions)

### New: `convex/tradePlanNotes.ts`

Mirrors `campaignNotes.ts`:

- `addNote(tradePlanId, content)` — validates plan exists & owned by user, inserts note
- `updateNote(noteId, content)` — validates note owned by user, patches content
- `getNotesByTradePlan(tradePlanId)` — returns notes sorted ascending by creation time

### Changes to `convex/tradePlans.ts`

- Remove condition/notes/rationale fields from `createTradePlan` args and handler
- Remove same fields from `updateTradePlan` args and handler
- Remove same fields from `tradePlanValidator`
- Add `getTradePlan(tradePlanId)` query returning a single trade plan

### New: `convex/migrations/tradePlanNotesMigration.ts`

One-time migration runnable via `npx convex run`.

## Trade Plan Detail Page

### Route

`/trade-plans/[id]/page.tsx` (server) + `TradePlanDetailPageClient.tsx` (client)

### Layout (matches campaign detail page pattern)

1. **Header** — Back link to `/trade-plans`, plan name
2. **Plan Info Card** — Editable name, symbol, status dropdown, campaign link (if linked), closed date (if closed)
3. **Notes Section** — Chronological list with inline edit, add note form at bottom
4. **Trades Section** — Table of trades linked to this plan (date, ticker, account, side, qty, price, P&L). "Add Trade" link.

## Shared Notes Component

Extract notes UI into a reusable `NotesSection` component used by both campaign detail and trade plan detail pages. Props:

- `notes` array (with `_id`, `content`, `_creationTime`)
- `onAddNote(content)` callback
- `onUpdateNote(noteId, content)` callback
- Loading/error state management

## Changes to Existing Pages

### Campaign detail page (`/campaigns/[id]`)

- Trade plans section: Remove inline condition editing. Each plan card becomes a link to `/trade-plans/[planId]` showing name, symbol, status.
- Notes section: Refactor to use shared `NotesSection` component.

### Standalone trade plans page (`/trade-plans`)

- Remove condition fields from create form (just name + symbol)
- Each plan row links to `/trade-plans/[planId]`
- Remove inline condition display
