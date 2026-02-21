# Inbox Trades Table Migration Plan

## Goal
Move import staging out of `trades` and into a dedicated `inboxTrades` table so imported data can be partial/nullable, reviewed/edited by users, and only promoted into strict canonical `trades` records on acceptance.

This plan is designed for AI-agent execution in this repository.

## Why This Change
Current architecture inserts imported rows directly into `trades` with `inboxStatus: "pending_review"` and then filters them out from all analytics/positions/trades queries.

Observed issues in the current implementation:
- Parser coercions/defaults are forced early to satisfy strict `trades` schema.
- Validation gaps are hard to surface because staging and canonical storage are conflated.
- Many read paths carry `pending_review` filtering logic that should be unnecessary for canonical data.

## Current-State Analysis (Files)
- Schema:
  - `convex/schema.ts`: `trades` currently contains both canonical and staging fields (`inboxStatus`, import metadata fields).
- Import backend:
  - `convex/imports.ts`: imports insert directly into `trades` with `inboxStatus: "pending_review"`; accept mutates status to `accepted`.
- Canonical trade readers (all currently filter pending):
  - `convex/trades.ts`
  - `convex/tradePlans.ts`
  - `convex/campaigns.ts`
  - `convex/analytics.ts`
  - `convex/positions.ts`
- Import UI:
  - `src/app/imports/page.tsx`: assumes inbox IDs are `Id<"trades">` and most fields are present.
- Parser contracts:
  - `src/lib/imports/types.ts`: `NormalizedTrade` currently assumes required canonical-like fields.

## Target Architecture
1. `inboxTrades` becomes the only staging table for imported rows.
2. `trades` stores only accepted/manual canonical trades.
3. Import flow:
   - parse CSV -> map to inbox candidates (nullable allowed) -> insert `inboxTrades`.
   - user edits missing/defaulted fields in inbox UI.
   - accept inserts a new strict row in `trades` and removes (or marks accepted) inbox row.
4. Canonical query paths no longer filter `pending_review`.

## Data Model Design

### 1. `trades` table (canonical)
Keep strict required fields for execution/calc correctness:
- required: `ticker`, `assetType`, `side`, `direction`, `price`, `quantity`, `date`, `ownerId`
- optional metadata: `notes`, `tradePlanId`, `fees`, `taxes`, `orderType`, `source`, `externalId`, `brokerageAccountId`
- remove `inboxStatus` from usage (can be removed from schema in this migration if data migration is complete)

### 2. `inboxTrades` table (staging)
Add table in `convex/schema.ts`:
- ownership/source:
  - `ownerId: string` (required)
  - `source: "ibkr" | "kraken"` (required)
  - `externalId?: string`
- candidate trade fields (mostly optional):
  - `ticker?`, `assetType?`, `side?`, `direction?`, `price?`, `quantity?`, `date?`
  - `fees?`, `taxes?`, `orderType?`, `brokerageAccountId?`, `notes?`, `tradePlanId?`
- review state:
  - `status: "pending_review" | "accepted" | "deleted"` (or `pending_review` only + hard delete)
- validation metadata:
  - `validationErrors: string[]`
  - `validationWarnings: string[]`
  - `autoFilledFields: string[]`
- optional diagnostics:
  - `rawPayloadJson?: string` (serialized raw row/order data)

Recommended indexes:
- `by_owner_status` => `["ownerId", "status"]`
- `by_owner_source_externalId` => `["ownerId", "source", "externalId"]`
- `by_owner_date` => `["ownerId", "date"]` (optional convenience)

## Required Product Decisions (Lock Before Implementation)
The implementing agent should stop and request confirmation if these are not already decided:
1. On accept, should inbox rows be hard-deleted or retained with `status: "accepted"` for audit?
   - Recommended: retain with `status: "accepted"` for traceability.
2. Should dedup check against:
   - only canonical `trades`, or
   - canonical `trades` + pending `inboxTrades`?
   - Recommended: both.
3. `externalId` requirement for import candidates:
   - if missing, allow insert but skip dedup for that row?
   - Recommended: allow insert; mark warning.
4. Kraken `taxes` convention:
   - set explicit `0` or `undefined` in staging?
   - Recommended: explicit `0` only if documented and stable.

## Implementation Plan

### Phase 1: Schema + Types

#### 1.1 Update schema
File: `convex/schema.ts`
- Add `inboxTrades` table with fields/indexes above.
- Keep `trades` table strict.
- Remove `by_owner_inboxStatus` from `trades` once no code depends on it.

#### 1.2 Regenerate Convex types
Run:
- `npx convex dev --once`

This updates generated files in `convex/_generated/*`.

### Phase 2: Refactor `convex/imports.ts` to inbox-first
File: `convex/imports.ts`

#### 2.1 Define validators for inbox records
- Replace current `inboxTradeValidator` (`Id<"trades">`) with `Id<"inboxTrades">` and nullable candidate fields.
- Add validator for `inboxTradePatch` used by updates.

#### 2.2 `importTrades` mutation
- Input should allow nullable candidate fields + metadata arrays.
- Dedup logic:
  - build key set from existing canonical `trades` (`source + externalId`) and pending `inboxTrades`.
  - dedup only when `externalId` is present.
- Insert rows into `inboxTrades` with `status: "pending_review"`.
- Return summary object:
  - `imported`, `skippedDuplicates`, `withValidationErrors`, `withWarnings`.

#### 2.3 `listInboxTrades` query
- Query `inboxTrades.by_owner_status(ownerId, "pending_review")`.
- Sort by newest-first or oldest-first (choose and keep consistent with UI).

#### 2.4 `updateInboxTrade` mutation
- Accept edits for candidate fields and notes/tradePlan.
- Permit explicit clearing (`null` or empty input mapped appropriately).
- Recompute/patch validation state if needed.

#### 2.5 `acceptTrade` mutation
- Load inbox record by `Id<"inboxTrades">`.
- Validate required canonical fields present and valid:
  - `ticker`, `assetType`, `side`, `direction`, `price`, `quantity`, `date`.
- Validate optional `tradePlanId` ownership.
- Insert into `trades`.
- Mark inbox row accepted (or delete, per decision).

#### 2.6 `acceptAllTrades` mutation
- Iterate pending inbox records.
- Accept only valid records.
- Return detailed result counts:
  - `accepted`, `skippedInvalid`, `errors`.

#### 2.7 delete mutations
- Operate on `Id<"inboxTrades">` only.

### Phase 3: Canonical Trade Query Cleanup

Remove now-unnecessary pending filters and validator fields.

#### 3.1 `convex/trades.ts`
- Remove `inboxStatus` from `tradeWithPLValidator`.
- Remove all `.filter((t) => t.inboxStatus !== "pending_review")`.
- Keep `source`, `externalId`, and metadata optional fields.

#### 3.2 `convex/tradePlans.ts`
- Remove `inboxStatus` from trade validator and filters.

#### 3.3 `convex/campaigns.ts`
- Remove pending filter from `allTrades` fetches.

#### 3.4 `convex/analytics.ts`
- Remove pending filter from `allTrades` fetch.

#### 3.5 `convex/positions.ts`
- Remove pending filter from trades fetch.

### Phase 4: Frontend `/imports` Update
File: `src/app/imports/page.tsx`

#### 4.1 Type changes
- Replace `Id<"trades">` with `Id<"inboxTrades">` for inbox operations.

#### 4.2 UI for nullable staging fields
- Update table rendering to handle missing values safely (e.g., `---`, badges).
- Highlight parser defaults / missing required fields using metadata from backend.

#### 4.3 Edit capabilities
- Expand edit controls to include required canonical fields if missing:
  - ticker, side, direction, assetType, price, quantity, date.
- Keep existing notes/tradePlan edits.

#### 4.4 Accept behavior
- Disable accept button for records missing required canonical fields.
- Show inline reason(s) from `validationErrors`.

#### 4.5 Import result UX
- Display richer import summary (`imported`, duplicates, warnings/errors counts).

### Phase 5: Parser Contract Evolution (Optional but Recommended)
Files:
- `src/lib/imports/types.ts`
- `src/lib/imports/ibkr-parser.ts`
- `src/lib/imports/kraken-parser.ts`

Introduce parser output type distinct from canonical normalized trade:
- `ParsedInboxTradeCandidate` with nullable fields + validation metadata.

Behavior guidance:
- Do not coerce unknown enums into valid values silently.
- If row/order has parse issues, keep candidate when feasible and attach validation errors.
- Keep parser deterministic and side-effect free.

### Phase 6: Data Migration

#### 6.1 One-time migration function
Create `convex/migrations.ts` with an internal/admin mutation:
- Find rows in `trades` where `inboxStatus === "pending_review"`.
- Copy each to `inboxTrades` (`status: "pending_review"`, preserve metadata).
- Delete migrated rows from `trades`.
- Return migration counts.

#### 6.2 Execute migration
- Run migration in batches if needed.
- Confirm zero `pending_review` rows remain in `trades`.

#### 6.3 Cleanup
- Remove `inboxStatus` from `trades` schema and related indexes after successful migration and deploy.

## Testing Plan

### A. Unit tests (parser reliability)
Files:
- `src/lib/imports/ibkr-parser.test.ts`
- `src/lib/imports/kraken-parser.test.ts`

Add tests for:
- invalid numeric values (`NaN` paths)
- invalid timestamps
- unknown side/direction/type values
- metadata reporting (`validationErrors`, `autoFilledFields`)
- no silent coercion for invalid enum strings

### B. Convex behavior tests (if no harness, do manual script checks)
Validate:
1. `importTrades` inserts into `inboxTrades`, not `trades`.
2. `listInboxTrades` returns only pending inbox entries.
3. `acceptTrade` creates strict `trades` row and transitions/deletes inbox row.
4. `acceptTrade` rejects incomplete records.
5. `acceptAllTrades` partial success semantics are correct.
6. Dedup checks both canonical and inbox datasets.

### C. Regression checks for canonical screens
Verify these screens no longer rely on pending-filter behavior and still render correctly:
- Trades
- Trade Plans
- Campaign stats
- Dashboard analytics
- Positions

## Verification Commands
Run after each major phase and at end:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `npx convex dev --once`

## Rollout Sequence
1. Schema add `inboxTrades` + generated types.
2. Backend imports refactor to write/read inbox table.
3. Frontend imports page update to new ID/table contract.
4. Migration of existing pending rows from `trades` to `inboxTrades`.
5. Remove `inboxStatus` dependencies from canonical query code.
6. Cleanup legacy `inboxStatus` schema/indexes on `trades`.
7. Full verification.

## Risks and Controls
- Risk: orphan pending rows during migration.
  - Control: migration returns counts; rerunnable until zero pending in `trades`.
- Risk: dedup regressions.
  - Control: explicit dedup key tests against both tables.
- Risk: UI break from ID/table type changes.
  - Control: change all inbox action handlers to `Id<"inboxTrades">` in one pass.
- Risk: accepting invalid records into canonical trades.
  - Control: strict server-side validation in `acceptTrade` before insert.

## Definition of Done
- Imported rows exist only in `inboxTrades` before acceptance.
- Canonical `trades` contains only accepted/manual records.
- Inbox can store partial records with validation metadata.
- Users can complete missing data and accept successfully.
- All canonical analytics/positions/trade queries function without pending filters.
- Typecheck, lint, and tests pass.
