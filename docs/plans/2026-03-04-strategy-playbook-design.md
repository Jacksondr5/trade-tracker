# Strategy Playbook Design

## Overview

A single-document markdown editor page where the user captures and iterates on their trading strategy. The page opens directly into an inline WYSIWYG editor (Tiptap) with auto-save. No toolbar — markdown syntax auto-formats in place.

## Requirements

- Single document per user (personal trading playbook)
- Inline WYSIWYG: type `## Heading` and it renders as a heading immediately
- No toolbar, no split preview — just the editor
- Auto-save (debounced) with save indicator
- Markdown features: headings, bold, italic, lists (ordered/unordered), blockquotes, horizontal rules, links, images, tables
- No code blocks needed
- Dark-mode only, styled with existing Radix color tokens

## Editor: Tiptap

Using Tiptap v3 (`@tiptap/react`) — headless ProseMirror-based editor with:
- Best React integration of available options
- Smallest bundle (tree-shakable, modular extensions)
- Inline markdown shortcuts via StarterKit input rules
- Full styling control (headless = no built-in CSS to override)

### Extensions

| Extension | Purpose |
|-----------|---------|
| `StarterKit` | Headings, bold, italic, bullet list, ordered list, blockquote, horizontal rule, history (undo/redo) |
| `@tiptap/extension-link` | Clickable/editable hyperlinks |
| `@tiptap/extension-image` | Embedded images via URL |
| `@tiptap/extension-table` | Markdown tables |
| `@tiptap/extension-table-row` | Table row support |
| `@tiptap/extension-table-cell` | Table cell support |
| `@tiptap/extension-table-header` | Table header cell support |
| `@tiptap/extension-placeholder` | Ghost text when document is empty |

### Markdown Serialization

Use `tiptap-markdown` (community extension) for converting between Tiptap's JSON document model and markdown strings. This handles:
- Loading: markdown string from Convex → Tiptap editor state
- Saving: Tiptap editor state → markdown string → Convex mutation

## Data Model

New `strategyDoc` table in Convex schema:

```typescript
strategyDoc: defineTable({
  content: v.string(),       // Markdown string
  ownerId: v.string(),       // Clerk user ID
  updatedAt: v.number(),     // Timestamp of last save
}).index("by_owner", ["ownerId"])
```

One row per user. Created on first visit with empty content.

### Convex Functions

| Function | Type | Description |
|----------|------|-------------|
| `strategyDoc.get` | Query | Get the user's strategy doc (returns `null` if none exists) |
| `strategyDoc.save` | Mutation | Upsert: create if not exists, update if exists. Sets `content` and `updatedAt`. |

## Page Structure

### Route: `/strategy`

Added to header nav between "Notes" and "Positions":
```text
Dashboard | Trades | Trade Plans | Campaigns | Notes | Strategy | Positions | Portfolios | Import | Accounts
```

### Files

| File | Purpose |
|------|---------|
| `src/app/strategy/page.tsx` | Server component — preloads strategy doc query |
| `src/app/strategy/StrategyPageClient.tsx` | Client component — Tiptap editor + auto-save logic |
| `src/components/ui/strategy-editor.tsx` | Tiptap editor component (reusable if needed later) |
| `convex/strategyDoc.ts` | Convex query + mutation |

### Page Layout

The page is minimal:
- Page title "Strategy" at top (matching other page headers)
- Save indicator (Saving.../Saved) — same pattern as campaign detail pages
- Full-width Tiptap editor below, filling available space
- Placeholder text when empty: "Start writing your trading strategy..."

## Editor Behavior

1. **Load**: Server component preloads query → client receives markdown string → Tiptap initializes with content via `tiptap-markdown`
2. **Edit**: User types → markdown shortcuts auto-format (e.g., `##` → heading, `**text**` → bold)
3. **Auto-save**: `onUpdate` fires on every change → debounced (1 second) Convex mutation saves markdown string
4. **Save indicator**: `"idle" | "saving" | "saved"` state machine (same pattern as `CampaignDetailPageClient.tsx`)
   - `idle`: no indicator shown
   - `saving`: "Saving..." with Loader2 spinner
   - `saved`: "Saved" with CheckCircle2 icon, auto-resets to idle after 2 seconds

## Styling

Editor content area scoped under `.tiptap` class:

| Element | Style |
|---------|-------|
| Editor container | `bg-olive-2 border border-olive-7 rounded-lg p-6` |
| Text | `text-olive-12` |
| Headings | `text-slate-12 font-bold` (h1: 2xl, h2: xl, h3: lg) |
| Links | `text-blue-9 underline hover:text-blue-10` |
| Blockquotes | `border-l-4 border-olive-6 pl-4 text-olive-11 italic` |
| Horizontal rules | `border-olive-6` |
| Tables | `border-collapse border border-olive-6`, cells with `border border-olive-6 p-2` |
| Images | `max-w-full rounded-lg` |
| Lists | Standard list styling with `text-olive-12` |
| Placeholder | `text-olive-8` |
| Focus | Standard focus ring on editor container |

## Dependencies to Add

```text
@tiptap/react
@tiptap/starter-kit
@tiptap/extension-link
@tiptap/extension-image
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-cell
@tiptap/extension-table-header
@tiptap/extension-placeholder
tiptap-markdown
```
