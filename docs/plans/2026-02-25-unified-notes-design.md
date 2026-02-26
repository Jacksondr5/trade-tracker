# Unified Notes Table Design

## Problem

The project has 3 separate note tables (`campaignNotes`, `tradePlanNotes`, `generalNotes`) plus an inline `notes` string field on trades. All share nearly identical schemas. Adding chart image URLs to notes would require duplicating the feature across all note types. Unifying into a single table simplifies both the backend and frontend.

## Decision: Nullable Foreign Keys on a Single Notes Table

Evaluated three approaches:

1. **Nullable FKs on the note row** (chosen) - Optional parent ID fields directly on each note
2. **Join table** - Separate `noteAssignments` table mapping notes to parents
3. **ID arrays on parents** - `noteIds` array on each parent object

Nullable FKs won because:
- Simplest queries (single index lookup, no joins)
- Typed `v.id()` references preserve Convex referential integrity
- Matches existing codebase patterns (e.g. `tradePlanId` on trades)
- Optional fields in Convex don't consume storage when absent
- Only 3 parent types; column count is not a real concern at this scale

## Schema

```typescript
notes: defineTable({
  content: v.string(),
  ownerId: v.string(),
  chartUrls: v.optional(v.array(v.string())),
  campaignId: v.optional(v.id("campaigns")),
  tradePlanId: v.optional(v.id("tradePlans")),
  tradeId: v.optional(v.id("trades")),
})
  .index("by_owner", ["ownerId"])
  .index("by_owner_campaignId", ["ownerId", "campaignId"])
  .index("by_owner_tradePlanId", ["ownerId", "tradePlanId"])
  .index("by_owner_tradeId", ["ownerId", "tradeId"])
```

- `chartUrls`: optional array of image URLs for trading chart screenshots
- General notes: all parent IDs absent, queried via `by_owner` index with filtering
- Runtime validation ensures at most one parent ID is set per note

## Backend API (`convex/notes.ts`)

**Queries:**
- `getNotesByCampaign(campaignId)` - uses `by_owner_campaignId` index
- `getNotesByTradePlan(tradePlanId)` - uses `by_owner_tradePlanId` index
- `getNotesByTrade(tradeId)` - uses `by_owner_tradeId` index (new)
- `getGeneralNotes()` - uses `by_owner` index, filters to notes with no parent IDs

**Mutations:**
- `addNote({ content, chartUrls?, campaignId?, tradePlanId?, tradeId? })` - validates at most one parent, trims content, returns noteId
- `updateNote({ noteId, content?, chartUrls? })` - updates specified fields; cannot change parent after creation

All functions use `ctx.auth.getUserIdentity()` for ownership, same as today.

## Frontend Changes

**NotesSection component:**
- Add `chartUrls` display (render images below note content)
- Add UI to attach chart URLs when creating/editing (text input + "add another" button)
- Inline image preview after entering a URL

**Page updates:**
- Campaign detail, trade plan detail, general notes pages switch from old APIs to `api.notes.*`
- Trade views gain a `NotesSection` (trades go from single inline string to full multi-note support)

## Two-Phase Deployment

### Phase 1 (PR 1): Add new, keep old
- Add `notes` table to schema alongside existing 3 note tables
- Create `convex/notes.ts` with all queries/mutations
- Update `NotesSection` to support `chartUrls`
- Update all frontend pages to use `api.notes.*`
- Add trade notes UI (NotesSection on trade views)
- Include migration script copying data from old tables + inline trade notes into new `notes` table
- Old tables, old Convex functions, and inline `trades.notes` field remain in schema (unused by frontend)

### Phase 2 (PR 2): Clean up old
- Remove `campaignNotes`, `tradePlanNotes`, `generalNotes` table definitions
- Remove `convex/campaignNotes.ts`, `convex/tradePlanNotes.ts`, `convex/generalNotes.ts`
- Remove `notes` field from `trades` table schema
- Remove migration script
