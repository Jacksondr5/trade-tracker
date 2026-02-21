# Trade Editing — Inline Edit Design

## Problem

The trades UI (`/trades`) displays trades in a table but provides no way to edit them. The backend `updateTrade` mutation already exists.

## Solution

Add inline editing to the trades table. Clicking an edit button on a row expands an inline form below the row. The form includes all editable fields and calls `updateTrade` on save.

## UX

- **Edit trigger**: Pencil icon button in a new "Actions" column at the end of each row.
- **Expandable form row**: Renders directly below the trade row being edited. Only one trade can be edited at a time.
- **Form fields** (compact horizontal layout):
  - Ticker, Trade Plan (dropdown), Side (select), Direction (select), Asset Type (select), Price, Quantity, Date/Time
  - Notes (textarea, full-width below the field row)
  - Save and Cancel buttons
- **Save**: Calls `updateTrade` mutation. On success, form closes. On error, inline error message.
- **Cancel**: Closes the form, discards changes.

## Components

### Modified: `src/app/trades/TradesPageClient.tsx`

- Add `editingTradeId` state (only one trade editable at a time)
- Add "Actions" column header and edit button per row
- When `editingTradeId` matches a trade, render the `EditTradeForm` in a `<tr>` spanning the full table width below that trade's row

### New: `src/app/trades/components/edit-trade-form.tsx`

- Inline edit form component with all trade fields
- Accepts trade data as initial values, plus `onSave` and `onCancel` callbacks
- Uses `useAppForm` with Zod validation (same pattern as imports edit form and new trade form)
- Trade plan dropdown uses the already-preloaded `tradePlans` data
- Calls `useMutation(api.trades.updateTrade)` on submit

## Backend

No changes needed. The existing `updateTrade` mutation accepts all fields as optional and patches only provided fields.
