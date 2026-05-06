# Manual Trade CSV Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-class manual CSV import source that stages custom CSV rows through the existing imports review workflow.

**Architecture:** Reuse the existing client-side parser plus Convex import mutation path. Add a manual parser that maps exact internal CSV headers to `InboxTradeCandidate`, widen shared and Convex source validators to include `manual`, and expose a template download action in the imports toolbar.

**Tech Stack:** Next.js App Router, React client components, Convex, Papa Parse, Vitest.

---

## Task 1: Manual Source Type And Parser Tests

**Files:**

- Modify: `shared/imports/types.ts`
- Create: `src/lib/imports/manual-parser.test.ts`

**Step 1: Write the failing tests**

Add tests for:

- parsing a fully populated manual row
- parsing ISO date values and timestamp date values
- reporting missing required headers
- preserving validation warnings when `externalId` is missing
- reporting invalid enum and numeric values as row-level validation errors

**Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/imports/manual-parser.test.ts`

Expected: fail because `parseManualCSV` does not exist.

## Task 2: Manual Parser

**Files:**

- Create: `src/lib/imports/manual-parser.ts`
- Modify: `src/app/(app)/imports/hooks/use-import-upload.ts`

**Step 1: Implement parser**

Use Papa Parse with headers. Require exact headers:

```ts
const MANUAL_IMPORT_HEADERS = [
  "ticker",
  "assetType",
  "side",
  "direction",
  "date",
  "price",
  "quantity",
  "externalId",
  "brokerageAccountId",
  "orderType",
  "fees",
  "taxes",
] as const;
```

Normalize strings with `trim()`, parse `date` as finite milliseconds or `Date.parse`, parse numeric fields with `Number`, map invalid enum values to `undefined`, and append clear validation errors before calling `withParserValidation`.

**Step 2: Route manual selection to parser**

Update `useImportUpload` to call `parseManualCSV` when `brokerage === "manual"`.

**Step 3: Run parser tests**

Run: `pnpm test src/lib/imports/manual-parser.test.ts`

Expected: pass.

## Task 3: Convex Source Support

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/imports.ts`
- Modify: `convex/accountMappings.ts`
- Test: `convex/imports.test.ts`

**Step 1: Widen source validators**

Include `manual` wherever inbox trades and account mappings validate import sources. Preserve existing accepted trade `source` behavior, which already supports `manual`.

**Step 2: Add Convex tests**

Add coverage that manual import rows stage in `inboxTrades`, and duplicate manual `externalId` values are skipped.

**Step 3: Run focused Convex tests**

Run: `pnpm test convex/imports.test.ts`

Expected: pass.

## Task 4: Imports UI Template Download

**Files:**

- Modify: `shared/e2e/testIds.ts`
- Modify: `src/app/(app)/imports/ImportsPageClient.tsx`

**Step 1: Add stable test id**

Add `templateDownloadButton` to `IMPORTS_INDEX_TEST_IDS`.

**Step 2: Add download action**

Show a `Download template` button next to the import controls only when `brokerage === "manual"`. Use a Blob URL with the manual headers, and expose it only in the Manual CSV UI so template discovery aligns with the selected source.

**Step 3: Update selector usage**

Use `IMPORTS_INDEX_TEST_IDS.brokerageSelect` for the existing selector and the new template test id for the button.

## Task 5: Validation

**Files:**

- All changed files

**Step 1: Run focused tests**

Run:

```bash
pnpm test src/lib/imports/manual-parser.test.ts convex/imports.test.ts
pnpm typecheck
```

Expected: pass.

**Step 2: Review diff**

Run: `git diff --check && git diff --stat`

Expected: no whitespace errors and a small scoped diff.
