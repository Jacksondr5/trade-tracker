# Trade Editing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add inline editing to the trades table so users can edit any trade directly from the `/trades` page.

**Architecture:** A new `EditTradeForm` component renders inside an expanded table row below the trade being edited. `TradesPageClient` manages which trade is being edited via state. The existing `updateTrade` Convex mutation handles persistence — no backend changes needed.

**Tech Stack:** React, TanStack React Form (`useAppForm`), Zod validation, Convex `useMutation`, Tailwind CSS

---

## Task 1: Create the EditTradeForm Component

**Files:**
- Create: `src/app/trades/components/edit-trade-form.tsx`

**Step 1: Create the edit trade form component**

Create `src/app/trades/components/edit-trade-form.tsx` with the following content. This is a compact inline form that accepts initial trade values, a list of trade plans for the dropdown, and callbacks for save/cancel.

Key design decisions:
- All form values are strings (matching the new-trade form and imports edit form patterns)
- `tradePlanId` is a string (empty string = no plan, otherwise a Convex ID)
- `notes` field is included (unlike the imports edit form)
- The form calls `updateTrade` mutation directly rather than taking an `onSave` callback, since it needs the trade ID
- Uses `useAppForm` with Zod validation matching the new-trade form's schema

```tsx
"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { z } from "zod";
import { Button, Card, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";

interface TradePlanOption {
  _id: Id<"tradePlans">;
  instrumentSymbol: string;
  name: string;
  status: string;
}

export interface EditTradeFormValues {
  assetType: "stock" | "crypto";
  date: string;
  direction: "long" | "short";
  notes: string;
  price: string;
  quantity: string;
  side: "buy" | "sell";
  ticker: string;
  tradePlanId: string;
}

interface EditTradeFormProps {
  initialValues: EditTradeFormValues;
  onCancel: () => void;
  onSaved: () => void;
  tradeId: Id<"trades">;
  tradePlans: TradePlanOption[];
}

const editTradeSchema = z.object({
  assetType: z.enum(["stock", "crypto"]),
  date: z.string().min(1, "Date is required"),
  direction: z.enum(["long", "short"]),
  notes: z.string().optional(),
  price: z.string().min(1, "Price is required"),
  quantity: z.string().min(1, "Quantity is required"),
  side: z.enum(["buy", "sell"]),
  ticker: z.string().min(1, "Ticker is required"),
  tradePlanId: z.string().optional(),
});

export function EditTradeForm({
  initialValues,
  onCancel,
  onSaved,
  tradeId,
  tradePlans,
}: EditTradeFormProps) {
  const updateTrade = useMutation(api.trades.updateTrade);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: initialValues satisfies EditTradeFormValues,
    validators: {
      onChange: ({ value }) => {
        const results = editTradeSchema.safeParse(value);
        if (!results.success) {
          return results.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setErrorMessage(null);
      try {
        const parsed = editTradeSchema.parse(value);
        await updateTrade({
          assetType: parsed.assetType,
          date: new Date(parsed.date).getTime(),
          direction: parsed.direction,
          notes: parsed.notes || undefined,
          price: parseFloat(parsed.price),
          quantity: parseFloat(parsed.quantity),
          side: parsed.side,
          ticker: parsed.ticker.toUpperCase(),
          tradeId,
          tradePlanId: parsed.tradePlanId
            ? (parsed.tradePlanId as Id<"tradePlans">)
            : undefined,
        });
        onSaved();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to update trade";
        setErrorMessage(message);
      }
    },
  });

  return (
    <Card className="bg-slate-800 p-4">
      <h3 className="text-slate-12 mb-3 text-sm font-semibold">Edit Trade</h3>
      {errorMessage && (
        <div className="text-slate-12 mb-3 flex items-center justify-between rounded-md bg-red-900/50 p-3 text-sm">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-slate-12 ml-4 hover:text-white"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <form.AppField name="ticker">
              {(field) => (
                <field.FieldInput
                  label="Ticker"
                  type="text"
                  className="w-[140px]"
                />
              )}
            </form.AppField>
            <form.AppField name="tradePlanId">
              {(field) => (
                <field.FieldSelect
                  label="Trade Plan"
                  className="w-[200px]"
                  placeholder="No trade plan"
                  options={tradePlans.map((tp) => ({
                    label: `${tp.name} (${tp.instrumentSymbol}) [${tp.status}]`,
                    value: tp._id,
                  }))}
                />
              )}
            </form.AppField>
            <form.AppField name="side">
              {(field) => (
                <field.FieldSelect
                  label="Side"
                  className="w-[100px]"
                  options={[
                    { label: "Buy", value: "buy" },
                    { label: "Sell", value: "sell" },
                  ]}
                />
              )}
            </form.AppField>
            <form.AppField name="direction">
              {(field) => (
                <field.FieldSelect
                  label="Direction"
                  className="w-[110px]"
                  options={[
                    { label: "Long", value: "long" },
                    { label: "Short", value: "short" },
                  ]}
                />
              )}
            </form.AppField>
            <form.AppField name="assetType">
              {(field) => (
                <field.FieldSelect
                  label="Asset Type"
                  className="w-[110px]"
                  options={[
                    { label: "Stock", value: "stock" },
                    { label: "Crypto", value: "crypto" },
                  ]}
                />
              )}
            </form.AppField>
            <form.AppField name="price">
              {(field) => (
                <field.FieldInput
                  label="Price"
                  type="number"
                  step="any"
                  className="w-[120px]"
                />
              )}
            </form.AppField>
            <form.AppField name="quantity">
              {(field) => (
                <field.FieldInput
                  label="Quantity"
                  type="number"
                  step="any"
                  className="w-[120px]"
                />
              )}
            </form.AppField>
            <form.AppField name="date">
              {(field) => (
                <field.FieldInput
                  label="Date"
                  type="datetime-local"
                  className="w-[200px]"
                />
              )}
            </form.AppField>
          </div>
          <form.AppField name="notes">
            {(field) => (
              <field.FieldTextarea
                label="Notes (optional)"
                placeholder="Add any notes about this trade..."
                rows={2}
              />
            )}
          </form.AppField>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              dataTestId="cancel-edit-button"
              variant="outline"
              className="h-9"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <form.AppForm>
              <form.SubmitButton
                dataTestId="save-edit-button"
                label="Save"
                className="h-9"
              />
            </form.AppForm>
          </div>
        </div>
      </form>
    </Card>
  );
}
```

**Step 2: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS (no type errors from the new file)

**Step 3: Commit**

```bash
git add src/app/trades/components/edit-trade-form.tsx
git commit -m "feat: add EditTradeForm component for inline trade editing"
```

---

## Task 2: Integrate Inline Editing into TradesPageClient

**Files:**
- Modify: `src/app/trades/TradesPageClient.tsx`

**Step 1: Add imports, state, and helper function**

At the top of `TradesPageClient.tsx`, add these imports:

```tsx
import { useMutation } from "convex/react";
import { useState } from "react";
import type { Id } from "~/convex/_generated/dataModel";
import { EditTradeForm } from "./components/edit-trade-form";
import type { EditTradeFormValues } from "./components/edit-trade-form";
```

Inside the `TradesPageClient` component function, add this state and helper:

```tsx
const [editingTradeId, setEditingTradeId] = useState<Id<"trades"> | null>(null);
```

Add a helper function to convert a trade's date (epoch ms) to a `datetime-local` string:

```tsx
function formatDateForInput(epochMs: number): string {
  const d = new Date(epochMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
```

This can be placed outside the component (next to the other helper functions at the top of the file).

**Step 2: Add Actions column header**

In the `<thead>`, after the P&L `<th>`, add:

```tsx
<th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
  Actions
</th>
```

**Step 3: Add edit button to each row and expandable edit form**

In the `filteredTrades.map(...)` callback, after the P&L `<td>`, add a new `<td>` with the edit button:

```tsx
<td className="whitespace-nowrap px-4 py-3 text-right text-sm">
  <button
    type="button"
    onClick={() =>
      setEditingTradeId(
        editingTradeId === trade._id ? null : trade._id,
      )
    }
    className="text-slate-11 hover:text-slate-12 transition-colors"
    aria-label="Edit trade"
    data-testid={`edit-trade-${trade._id}`}
  >
    ✎
  </button>
</td>
```

Then, after the closing `</tr>` of the data row, conditionally render the edit form row:

```tsx
{editingTradeId === trade._id && (
  <tr>
    <td colSpan={11} className="px-4 py-3">
      <EditTradeForm
        tradeId={trade._id}
        initialValues={{
          assetType: trade.assetType,
          date: formatDateForInput(trade.date),
          direction: trade.direction,
          notes: trade.notes ?? "",
          price: String(trade.price),
          quantity: String(trade.quantity),
          side: trade.side,
          ticker: trade.ticker,
          tradePlanId: trade.tradePlanId ?? "",
        }}
        tradePlans={tradePlans}
        onCancel={() => setEditingTradeId(null)}
        onSaved={() => setEditingTradeId(null)}
      />
    </td>
  </tr>
)}
```

**Important:** Since `map` now returns two elements (data row + optional edit row), wrap both in a `React.Fragment` with the trade `_id` as key:

```tsx
{filteredTrades.map((trade) => {
  // ... accountDisplay logic stays the same ...
  return (
    <React.Fragment key={trade._id}>
      <tr className="hover:bg-slate-800/50" data-testid={`trade-row-${trade._id}`}>
        {/* ... all existing <td> cells ... */}
        {/* new Actions <td> */}
      </tr>
      {editingTradeId === trade._id && (
        <tr>
          <td colSpan={11} className="px-4 py-3">
            <EditTradeForm ... />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
})}
```

Add `React` to imports if not already imported (it's not — only specific hooks are imported):

```tsx
import React, { useMemo } from "react"; // replace the existing useMemo import
```

Also replace `import { useMemo } from "react"` if present. Actually, `useMemo` is already imported from React. Change:

```tsx
import { useMemo } from "react";
```
to:
```tsx
import React, { useMemo, useState } from "react";
```

**Step 4: Verify types compile and lint passes**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/trades/TradesPageClient.tsx
git commit -m "feat: integrate inline trade editing into trades table"
```

---

## Task 3: Manual Verification

**Step 1: Verify the feature works end-to-end**

Start the dev server if not running: `pnpm dev` (and `npx convex dev` in another terminal)

1. Navigate to `/trades`
2. Verify each trade row has an edit button (✎) in the Actions column
3. Click the edit button — verify the inline form expands below the row
4. Verify all fields are pre-populated with the trade's current values
5. Change a field (e.g., price) and click Save — verify the trade updates in the table
6. Click edit, then Cancel — verify the form closes without saving
7. Click edit on one trade, then edit on another — verify only one form is open at a time

**Step 2: Run CI checks**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: All pass

**Step 3: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "feat: add inline trade editing to trades table"
```
