# UI Design Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract shared UI components (Badge, Alert), clean up dead CSS, add tabular numbers for financial data, standardize table styling, and add transition animations to interactive elements across the app.

**Architecture:** Bottom-up approach - build new shared primitives first (`Badge`, `Alert`), then sweep through all pages to replace inline patterns with the new components. CSS cleanup and animation additions happen as separate passes.

**Tech Stack:** React, Tailwind CSS v4, CVA (class-variance-authority), Lucide icons, `cn()` utility from `~/lib/utils`

---

## Task 1: Remove Dead Light-Mode CSS Variables

**Files:**
- Modify: `src/styles/global.css`

**Step 1: Remove unused oklch variables and light-mode theme block**

The `:root` block (lines 121-152) defines light-mode CSS variables (`--background`, `--foreground`, `--card`, etc.) that are never used - the app is hard-coded to dark mode via `bg-slate-900 text-slate-12` in `layout.tsx`. The `@theme inline` block (lines 154-182) maps these dead variables to Tailwind color tokens. The `@layer base` block (lines 184-191) applies `bg-background text-foreground` which references these unused variables.

Remove everything from line 121 to line 191 in `global.css`. Keep:
- Lines 1-4 (imports and dark variant)
- Lines 6-104 (the `@theme` block with grass/olive/slate/green/red/amber/blue scales)
- Lines 106-119 (the border color compatibility layer)

After removing, add a `:root` block with only the radius tokens the components use:

```css
:root {
  --radius: 0.625rem;
}
```

The `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl` calculations from the old `@theme inline` block are still needed by button and card components. Add them as a minimal inline theme:

```css
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

**Step 2: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS - no references to removed variables

**Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "chore: remove unused light-mode CSS variables from global.css"
```

---

## Task 2: Add Tabular Numbers for Financial Figures

**Files:**
- Modify: `src/styles/global.css`

**Step 1: Add a `.tabular-nums` utility class and apply it globally to table cells containing numbers**

In `src/styles/global.css`, add a base layer rule that sets `font-variant-numeric: tabular-nums` on elements that commonly display financial data. The simplest approach: add it to the existing `@layer base` block. Table cells with numeric data (prices, quantities, P&L) will automatically use tabular number spacing, making columns align properly.

Add to the existing `@layer base` block in `global.css`:

```css
@layer base {
  *,
  ::after,
  ::before,
  ::backdrop,
  ::file-selector-button {
    border-color: var(--color-gray-200, currentColor);
  }

  td, th {
    font-variant-numeric: tabular-nums;
  }
}
```

This is a lightweight change that ensures all numbers in tables line up vertically. The `tabular-nums` property makes all digits the same width (e.g., "1" takes as much space as "8"), which is essential for financial data columns.

**Step 2: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "style: add tabular-nums to table cells for aligned financial figures"
```

---

## Task 3: Create Badge Component

**Files:**
- Create: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/index.ts`

**Step 1: Create the Badge component**

Create `src/components/ui/badge.tsx`. This replaces all the inline badge patterns used across the app:

- Campaign status badges: `bg-blue-900/50 border-blue-700 text-blue-200` (planning), `bg-green-900/50 border-green-700 text-green-200` (active), `bg-slate-700/50 border-slate-600 text-slate-300` (closed)
- Trade side badges: `border-green-700 bg-green-900/50` (buy), `border-red-700 bg-red-900/50` (sell)
- Direction badges: `border-green-700 bg-green-900/50` (long), `border-red-700 bg-red-900/50` (short)
- Trade plan status badges in campaigns: unstyled `border-slate-600 text-slate-11`

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        success: "border-green-700 bg-green-900/50 text-green-200",
        danger: "border-red-700 bg-red-900/50 text-red-200",
        info: "border-blue-700 bg-blue-900/50 text-blue-200",
        warning: "border-amber-700 bg-amber-900/50 text-amber-200",
        neutral: "border-slate-600 bg-slate-700/50 text-slate-300",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
```

**Step 2: Export Badge from the barrel file**

Add to `src/components/ui/index.ts`:

```ts
export { Badge, badgeVariants, type BadgeProps } from "./badge";
```

**Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/index.ts
git commit -m "feat: add Badge component with success/danger/info/warning/neutral variants"
```

---

## Task 4: Replace Inline Badge Patterns with Badge Component

**Files:**
- Modify: `src/app/campaigns/CampaignsPageClient.tsx`
- Modify: `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`
- Modify: `src/app/positions/PositionsPageClient.tsx`
- Modify: `src/app/trades/TradesPageClient.tsx`
- Modify: `src/app/imports/components/inbox-table.tsx`
- Modify: `src/app/trade-plans/TradePlansPageClient.tsx`
- Modify: `src/app/portfolio/[id]/PortfolioDetailPageClient.tsx`

**Step 1: Replace badges in CampaignsPageClient.tsx**

Remove the `getStatusBadgeClasses` function (lines 38-47). Replace the inline badge `<span>` at line 152 with:

```tsx
import { Badge } from "~/components/ui";

// In the table cell (replace the <span> around campaign.status):
<Badge
  variant={
    campaign.status === "active"
      ? "success"
      : campaign.status === "planning"
        ? "info"
        : "neutral"
  }
>
  {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
</Badge>
```

**Step 2: Replace badges in PositionsPageClient.tsx**

Replace the inline direction badge at lines 57-65 with:

```tsx
import { Badge } from "~/components/ui";

// In the table cell:
<Badge variant={position.direction === "long" ? "success" : "danger"}>
  {position.direction.toUpperCase()}
</Badge>
```

**Step 3: Replace badges in TradesPageClient.tsx**

Replace the inline side badge at lines 344-353 with:

```tsx
<Badge variant={trade.side === "buy" ? "success" : "danger"}>
  {trade.side.toUpperCase()}
</Badge>
```

Add `Badge` to the import from `~/components/ui`.

**Step 4: Replace badges in inbox-table.tsx**

Replace the side badge (lines 149-162) and direction badge (lines 164-176) with Badge:

```tsx
import { Badge } from "~/components/ui";

// Side badge:
{trade.side ? (
  <Badge variant={trade.side === "buy" ? "success" : "danger"}>
    {trade.side.toUpperCase()}
  </Badge>
) : (
  <span className="text-slate-11">---</span>
)}

// Direction badge:
{trade.direction ? (
  <Badge variant={trade.direction === "long" ? "info" : "danger"}>
    {trade.direction.toUpperCase()}
  </Badge>
) : (
  <span className="text-slate-11">---</span>
)}
```

**Step 5: Replace badges in TradePlansPageClient.tsx**

Replace the trade plan status badge (currently `<span className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-11">`) with:

```tsx
import { Badge } from "~/components/ui";

<Badge variant="neutral">{plan.status}</Badge>
```

**Step 6: Replace badges in CampaignDetailPageClient.tsx**

The campaign detail page has trade plan status rendered via a `<select>` dropdown, not badges - no changes needed there. The P&L coloring stays as-is (it's inline text, not a badge pattern).

**Step 7: Replace badges in PortfolioDetailPageClient.tsx**

The campaigns table in the portfolio detail page renders campaign status as plain capitalized text. Replace with Badge:

```tsx
import { Badge } from "~/components/ui";

// In the campaigns table status cell:
<Badge
  variant={
    campaign.status === "active"
      ? "success"
      : campaign.status === "planning"
        ? "info"
        : "neutral"
  }
>
  {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
</Badge>
```

**Step 9: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS

**Step 10: Commit**

```bash
git add src/app/campaigns/CampaignsPageClient.tsx src/app/campaigns/\[id\]/CampaignDetailPageClient.tsx src/app/positions/PositionsPageClient.tsx src/app/trades/TradesPageClient.tsx src/app/imports/components/inbox-table.tsx src/app/trade-plans/TradePlansPageClient.tsx src/app/portfolio/\[id\]/PortfolioDetailPageClient.tsx
git commit -m "refactor: replace inline badge patterns with Badge component across all pages"
```

---

## Task 5: Create Alert Component

**Files:**
- Create: `src/components/ui/alert.tsx`
- Modify: `src/components/ui/index.ts`

**Step 1: Create the Alert component**

Create `src/components/ui/alert.tsx`. This replaces the copy-pasted success/error message patterns found across:

- `NewTradePageClient.tsx`: `<div className="rounded-md bg-green-900/50 p-4">` and `<div className="rounded-md bg-red-900/50 p-4">`
- `PortfolioPageClient.tsx`: `<div className="rounded border border-green-700 bg-green-900/50 px-4 py-2 text-green-200">` and `<div className="rounded border border-red-700 bg-red-900/50 px-4 py-2 text-red-200">`
- `TradePlansPageClient.tsx`: `<p className="text-sm text-red-300">`
- `imports/upload-section.tsx`: `<div className="rounded-md bg-red-900/50 p-4 text-sm text-red-300">`

```tsx
"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const alertVariants = cva(
  "flex items-center justify-between rounded-md border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        success: "border-green-700 bg-green-900/50 text-green-200",
        error: "border-red-700 bg-red-900/50 text-red-200",
        warning: "border-amber-700 bg-amber-900/50 text-amber-200",
        info: "border-blue-700 bg-blue-900/50 text-blue-200",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  onDismiss?: () => void;
}

function Alert({
  className,
  variant,
  children,
  onDismiss,
  ...props
}: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-4 shrink-0 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export { Alert, alertVariants };
```

**Step 2: Export Alert from the barrel file**

Add to `src/components/ui/index.ts`:

```ts
export { Alert, alertVariants, type AlertProps } from "./alert";
```

**Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/ui/alert.tsx src/components/ui/index.ts
git commit -m "feat: add Alert component with success/error/warning/info variants and dismiss"
```

---

## Task 6: Replace Inline Alert Patterns with Alert Component

**Files:**
- Modify: `src/app/trades/new/NewTradePageClient.tsx`
- Modify: `src/app/trades/components/edit-trade-form.tsx`
- Modify: `src/app/portfolio/PortfolioPageClient.tsx`
- Modify: `src/app/portfolio/[id]/PortfolioDetailPageClient.tsx`
- Modify: `src/app/trade-plans/TradePlansPageClient.tsx`
- Modify: `src/app/accounts/AccountsPageClient.tsx`
- Modify: `src/app/imports/components/upload-section.tsx`
- Modify: `src/app/imports/ImportsPageClient.tsx` (only if it has inline alerts not in sub-components)
- Modify: `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`

**Step 1: Replace alerts in NewTradePageClient.tsx**

Replace the success message div (lines ~93-96):
```tsx
{successMessage && (
  <Alert variant="success" className="mb-4">
    {successMessage}
  </Alert>
)}
```

Replace the error message div (lines ~98-108):
```tsx
{errorMessage && (
  <Alert variant="error" className="mb-4" onDismiss={() => setErrorMessage(null)}>
    {errorMessage}
  </Alert>
)}
```

Add `Alert` to the import from `~/components/ui`.

**Step 2: Replace alerts in edit-trade-form.tsx (trades)**

Replace the error message div (lines ~68-79):
```tsx
{errorMessage && (
  <Alert variant="error" className="mb-3" onDismiss={() => setErrorMessage(null)}>
    {errorMessage}
  </Alert>
)}
```

Add `Alert` to the import from `~/components/ui`.

**Step 3: Replace alerts in PortfolioPageClient.tsx**

The portfolio page was redesigned in PR #20. It now has a single error pattern:
```tsx
{errorMessage && (
  <Alert variant="error" className="mt-2">
    {errorMessage}
  </Alert>
)}
```

Replace the `<p className="mt-2 text-sm text-red-300">` with Alert. Add `Alert` to imports.

**Step 4: Replace alerts in PortfolioDetailPageClient.tsx**

Replace the name error `<p>` tag:
```tsx
{nameError && (
  <Alert variant="error" className="mt-2">
    {nameError}
  </Alert>
)}
```

Add `Alert` to imports (currently no import from `~/components/ui` in this file).

**Step 5: Replace alerts in TradePlansPageClient.tsx**

Replace the error text (line ~58):
```tsx
{error && (
  <Alert variant="error" className="mb-3">
    {error}
  </Alert>
)}
```

Add `Alert` to imports.

**Step 6: Replace alerts in AccountsPageClient.tsx**

Replace the error paragraph (line ~101):
```tsx
{errorMessage && (
  <Alert variant="error" className="mb-3">
    {errorMessage}
  </Alert>
)}
```

Add `Alert` to imports.

**Step 7: Replace alerts in upload-section.tsx**

Replace the import result div and error div:
```tsx
{importResult && (
  <Alert variant="success">
    Imported <span className="font-semibold">{importResult.imported}</span> trade
    {importResult.imported !== 1 ? "s" : ""}.
    {importResult.skippedDuplicates > 0 && (
      <> Skipped <span className="font-semibold">{importResult.skippedDuplicates}</span> duplicate{importResult.skippedDuplicates !== 1 ? "s" : ""}.</>
    )}
    {importResult.withValidationErrors > 0 && (
      <> <span className="font-semibold">{importResult.withValidationErrors}</span> need review.</>
    )}
    {importResult.withWarnings > 0 && (
      <> <span className="font-semibold">{importResult.withWarnings}</span> with warnings.</>
    )}
  </Alert>
)}

{errorMessage && (
  <Alert variant="error">{errorMessage}</Alert>
)}
```

Add `Alert` to imports.

**Step 8: Replace alerts in CampaignDetailPageClient.tsx**

Replace inline error patterns. These are simpler `<p className="text-sm text-red-300">` patterns (not dismissible). Replace:

- `statusChangeError` (line 437): `{statusChangeError && <Alert variant="error" className="mt-3">{statusChangeError}</Alert>}`
- `thesisError` (line 442): `{thesisError && <Alert variant="error" className="mb-2">{thesisError}</Alert>}`
- `noteError` (line 541): `{noteError && <Alert variant="error" className="mb-2">{noteError}</Alert>}`
- `planError` (line 581): `{planError && <Alert variant="error" className="mb-3">{planError}</Alert>}`
- `retrospectiveError` (line 771): `{retrospectiveError && <Alert variant="error" className="mb-2">{retrospectiveError}</Alert>}`
- `campaignNameError` (line 395): `{campaignNameError && <Alert variant="error" className="mt-2">{campaignNameError}</Alert>}`

Add `Alert` to the imports (it currently imports from `~/components/ui` already via `useAppForm`).

**Step 9: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS

**Step 10: Commit**

```bash
git add src/app/trades/new/NewTradePageClient.tsx src/app/trades/components/edit-trade-form.tsx src/app/portfolio/PortfolioPageClient.tsx src/app/portfolio/\[id\]/PortfolioDetailPageClient.tsx src/app/trade-plans/TradePlansPageClient.tsx src/app/accounts/AccountsPageClient.tsx src/app/imports/components/upload-section.tsx src/app/campaigns/\[id\]/CampaignDetailPageClient.tsx
git commit -m "refactor: replace inline alert patterns with Alert component across all pages"
```

---

## Task 7: Add Transition Animations to Interactive Elements

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/badge.tsx`

**Step 1: Add smooth transitions to common interactive patterns**

Cards, table rows, and badges should have smooth transitions. Add to `global.css` in the `@layer base` block:

```css
@layer base {
  *,
  ::after,
  ::before,
  ::backdrop,
  ::file-selector-button {
    border-color: var(--color-gray-200, currentColor);
  }

  td, th {
    font-variant-numeric: tabular-nums;
  }

  tr {
    transition: background-color 150ms ease;
  }
}
```

**Step 2: Add transition to Card component**

In `src/components/ui/card.tsx`, add `transition-colors` to the Card's base classes:

```tsx
className={cn(
  "border-olive-4 bg-olive-2 text-olive-12 flex flex-col rounded-xl border transition-colors",
  className,
)}
```

**Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/styles/global.css src/components/ui/card.tsx
git commit -m "style: add transition animations to table rows and cards"
```

---

## Task 8: Standardize P&L Color Usage

**Files:**
- Modify: `src/app/page.tsx`

The dashboard currently uses `text-green-400` / `text-red-400` (Tailwind defaults) while the rest of the app uses `text-green-400` / `text-red-400` as well. This is actually already consistent. However, the dashboard defines its P&L color as a variable (`plColorClass`) using the `-400` shade. Standardize by ensuring the same pattern is used everywhere.

**Step 1: Verify consistency**

Check that all P&L color references across the app use `text-green-400` for profit and `text-red-400` for loss. These files need checking:
- `src/app/page.tsx` (line 96): uses `text-green-400` / `text-red-400` - OK
- `src/app/campaigns/CampaignsPageClient.tsx` (line 29): uses `text-green-400` / `text-red-400` - OK
- `src/app/campaigns/[id]/CampaignDetailPageClient.tsx` (lines 430, 849): uses `text-green-400` / `text-red-400` - OK

All P&L colors are consistent. No changes needed for this task.

**Step 2: Commit (skip - no changes)**

---

## Task 9: Final Verification

**Step 1: Run full CI check**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: All three pass with no errors.

**Step 2: Visual verification**

Start the dev server and spot-check key pages to ensure badges, alerts, and animations render correctly:
- `/campaigns` - status badges should render with correct colors
- `/trades` - side badges, pagination, filter buttons
- `/positions` - direction badges
- `/portfolio` - success/error alerts after form submission
- `/trades/new` - error/success alerts

**Step 3: Final commit if any fixes needed**

Only commit if step 1 or 2 revealed issues that required fixes.

---

## Task 10: Update AGENTS.md to Reflect Completed Changes

**Files:**
- Modify: `AGENTS.md`

This task runs last, after all implementation is done. The repo already has an `AGENTS.md` (added in PR #20) and `CLAUDE.md` is a symlink to it. Do NOT replace the file - merge UI component guidelines into the existing content.

**Step 1: Review the actual component APIs and existing AGENTS.md**

Read the final versions of:
- `AGENTS.md` - understand existing content (project overview, architecture, key patterns)
- `src/components/ui/badge.tsx` - confirm variant names, props, and export shape
- `src/components/ui/alert.tsx` - confirm variant names, props (especially `onDismiss`), and export shape
- `src/components/ui/index.ts` - confirm all new exports are present
- `src/styles/global.css` - confirm the final base layer rules (tabular-nums, transitions, border-color compat)

**Step 2: Add UI component guidance section to AGENTS.md**

Merge a new "## UI Component Guidelines" section into the existing AGENTS.md (which already has project overview, architecture, and key patterns). Add concise guidance on:
- Badge component: variant names and domain value mapping (campaign status, trade side, direction)
- Alert component: variant names, `onDismiss` behavior, when to use vs inline error text
- Standard select classes for selects outside the form system
- Standard table structure classes
- P&L color conventions (`text-green-400` / `text-red-400`, always prefix positive with `+`)
- Forms: use `useAppForm` with `FieldInput`/`FieldSelect`/`FieldTextarea` for forms with validation
- Theme: dark-mode only, no light-mode variables

Do NOT duplicate or contradict existing content in AGENTS.md. Keep additions concise.

**Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS (AGENTS.md is markdown, but verify nothing else broke)

**Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md to reflect final UI component implementations"
```
