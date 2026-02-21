# Convex Imports Backend Test Plan

## Goal
Add reliable backend tests for `convex/imports.ts` so import/inbox behavior is safe to evolve without regressions.

## Scope
- Functions under test:
  - `importTrades`
  - `listInboxTrades`
  - `updateInboxTrade`
  - `acceptTrade`
  - `acceptAllTrades`
  - `deleteInboxTrade`
  - `deleteAllInboxTrades`
- Related regression behavior:
  - Accepted/manual trades remain in canonical `trades`
  - Pending imported trades remain isolated in `inboxTrades`

## Test Harness Options
1. Preferred: add Convex function tests using the project’s Convex test utilities (or official Convex testing helpers) to execute queries/mutations against a test DB context.
2. Fallback: add deterministic integration script tests that run against local Convex (`npx convex dev --once`) and seed/verify data through generated API calls.

Use one harness consistently in CI.

## Fixtures
- `ownerA` (primary user under test)
- `ownerB` (authorization/ownership negative tests)
- Trade plan fixtures for both users
- Canonical trade fixtures in `trades`
- Pending inbox fixtures in `inboxTrades`

## Core Test Cases

### 1. `importTrades`
1. Inserts rows into `inboxTrades` with `status: "pending_review"`.
2. Does not insert canonical rows into `trades`.
3. Deduplicates when `source + externalId` exists in canonical `trades`.
4. Deduplicates when `source + externalId` exists in pending `inboxTrades`.
5. Allows missing `externalId` and increments warnings path (no dedup key).
6. Persists server-computed validation metadata (`validationErrors`, `validationWarnings`, normalized ticker).
7. Enforces `tradePlanId` ownership (reject foreign owner trade plan).

### 2. `listInboxTrades`
1. Returns only pending inbox rows for authenticated owner.
2. Excludes other owners’ rows.
3. Returns rows sorted by date/creation-time descending.

### 3. `updateInboxTrade`
1. Applies editable fields (`ticker`, `side`, `direction`, `assetType`, `price`, `quantity`, `date`, `notes`, `tradePlanId`).
2. Supports clearing nullable fields via `null` inputs.
3. Recomputes validation metadata after edits.
4. Enforces ownership and pending-only status.

### 4. `acceptTrade`
1. Rejects incomplete/invalid inbox rows.
2. Accepts valid row by inserting canonical `trades` record.
3. Preserves import metadata (`source`, `externalId`, `brokerageAccountId`, `fees`, `taxes`, `orderType`).
4. Applies override args (`notes`, `tradePlanId`) when provided.
5. Deletes accepted inbox row.
6. Enforces ownership and `tradePlanId` ownership.

### 5. `acceptAllTrades`
1. Accepts all valid rows.
2. Skips invalid rows and reports `skippedInvalid`.
3. Returns error messages for invalid rows.
4. Leaves invalid rows pending for later correction.

### 6. Delete Mutations
1. `deleteInboxTrade` deletes one pending row for owner.
2. `deleteInboxTrade` rejects foreign-owner or non-pending targets.
3. `deleteAllInboxTrades` deletes all pending rows for owner and returns count.

### 7. Canonical Regression Checks
1. After accepting trades, canonical queries still see accepted/manual data as expected.
2. Pending inbox rows do not affect canonical read paths.

## Suggested File Layout
- `convex/imports.test.ts` (or equivalent harness location)
- Optional test helper module:
  - `convex/test/helpers/imports-fixtures.ts`

## Assertions and Invariants
- No cross-owner access.
- Dedup key is exactly `source + externalId` for import sources.
- Pending state always represented by inbox table status, not canonical table fields.
- Acceptance is atomic enough for practical usage: canonical insert + inbox deletion semantics verified.

## Execution Plan
1. Set up harness and baseline auth/user fixture utility.
2. Implement `importTrades` and dedup tests first.
3. Add update/accept flow tests.
4. Add bulk and delete tests.
5. Add canonical regression checks.
6. Wire into CI (`pnpm test`).

## Done Criteria
- All core cases above covered and passing in CI.
- Clear fixture helpers reduce copy/paste setup noise.
- Tests fail on key regressions (dedup breakage, invalid acceptance, ownership leakage).
