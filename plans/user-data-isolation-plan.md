# User Data Isolation Plan (With Migration)

## Goal
Ensure every authenticated user can only read and modify their own data in Convex.

## Scope
- Backend authz and data model in `convex/`
- Preserve existing data while introducing per-user isolation
- Frontend API calls remain mostly unchanged

## Non-goals
- Rewriting frontend UX flows
- Large analytics redesign

## Implementation Strategy
1. Add ownership field to all user tables.
2. Enforce authentication + ownership in every query/mutation.
3. Enforce same-owner integrity for cross-table references.
4. Backfill `ownerId` onto existing records using a migration workflow.
5. Validate with two-user isolation checks.

## Detailed Work Plan

### 1. Add auth helper utilities
- Create `convex/lib/auth.ts`:
  - `requireUser(ctx)`:
    - Calls `ctx.auth.getUserIdentity()`
    - Throws if unauthenticated
    - Returns stable owner key (`identity.tokenIdentifier`)
  - `assertOwner(doc, ownerId, notFoundMessage?)`:
    - Throws not-found style error when doc missing/wrong owner

Acceptance criteria:
- All Convex handlers can consistently retrieve owner identity.

### 2. Update schema for ownership
Add `ownerId: v.string()` to these tables in `convex/schema.ts`:
- `campaigns`
- `campaignNotes`
- `tradePlans`
- `trades`
- `portfolioSnapshots`

Add owner-prefixed indexes:
- `campaigns`: `by_owner`, `by_owner_status`
- `campaignNotes`: `by_owner_campaignId`
- `tradePlans`: `by_owner`, `by_owner_status`, `by_owner_campaignId`
- `trades`: `by_owner`, `by_owner_date`, `by_owner_tradePlanId`, `by_owner_ticker`
- `portfolioSnapshots`: `by_owner_date`

Acceptance criteria:
- Schema supports efficient owner-scoped queries.

### 2.5. Introduce temporary migration compatibility
- Keep read/write handlers temporarily tolerant of missing `ownerId` during migration window.
- Add helper behavior:
  - Reads: include legacy records only in migration paths needed for backfill tools.
  - Writes/updates: always write `ownerId` for new/updated records.
- Add a feature flag/env toggle for strict mode (default off during migration, on after completion).

Acceptance criteria:
- Production can run safely while backfill is in progress.

### 3. Enforce ownership on write operations
Update all create/update/delete mutations:
- On create: set `ownerId` from `requireUser(ctx)`.
- On update/delete/get-by-id: load doc and verify `doc.ownerId === ownerId`.
- If ownership fails, return not-found style errors.

Files:
- `convex/trades.ts`
- `convex/campaigns.ts`
- `convex/tradePlans.ts`
- `convex/campaignNotes.ts`
- `convex/portfolioSnapshots.ts`

Acceptance criteria:
- No mutation can modify another user’s record.

### 4. Enforce ownership on read operations
Update all list/query handlers to only use owner-scoped indexes and filters:
- `trades`: list/get/by-tradePlan
- `campaigns`: list/by-status/get/PL/position status
- `tradePlans`: all list/get/PL/by-campaign
- `campaignNotes`: by-campaign
- `positions`: derive from owner trades only
- `portfolioSnapshots`: list/latest owner only
- `analytics`: derive from owner trades/campaigns/plans only

Acceptance criteria:
- All query results are user-isolated.

### 5. Enforce same-owner relationship integrity
Add explicit checks before creating/updating references:
- `trade.tradePlanId` must belong to same `ownerId`
- `tradePlan.campaignId` must belong to same `ownerId`
- `campaignNote.campaignId` must belong to same `ownerId`

Acceptance criteria:
- Cross-user linking is impossible.

### 6. Migration and backfill (retain data)
After schema changes are deployed:
- Add a migration function (internal/admin only) that backfills `ownerId` in batches.
- Backfill order to preserve relationships:
  1. `campaigns`
  2. `tradePlans`
  3. `trades`
  4. `campaignNotes`
  5. `portfolioSnapshots`
- Use deterministic ownership mapping rules for legacy records:
  - Preferred: map by historical user association source if available.
  - Fallback: map by curated import file (`legacyRecordId -> ownerId`) prepared before migration.
- For orphaned references (e.g. note references missing campaign), log and quarantine to a review table.
- Run migration repeatedly until zero records remain without `ownerId`.

Acceptance criteria:
- All legacy user-scoped records have valid `ownerId`.
- Relationship integrity holds after migration.

### 6.5. Cutover to strict enforcement
- Enable strict mode after successful backfill and verification.
- In strict mode:
  - All reads require `ownerId` match.
  - Records missing `ownerId` are excluded and surfaced in migration audit logs.
- Remove temporary compatibility paths once stable.

Acceptance criteria:
- Authorization is fail-closed and no compatibility code is required.

### 7. Verification
Run:
- `pnpm typecheck`
- `pnpm lint`

Manual isolation test:
1. Sign in as User A and create campaign, trade plan, trade, note, snapshot.
2. Sign in as User B.
3. Confirm User B cannot see User A data on:
   - Dashboard
   - Trades
   - Trade Plans
   - Campaigns and campaign detail
   - Positions
   - Portfolio
4. Attempt direct mutations with User A IDs while authenticated as User B; confirm failure.

Migration validation:
1. Before migration, capture baseline counts per table.
2. After migration, confirm:
   - same total record counts (excluding intentional quarantines)
   - zero records missing `ownerId`
   - zero cross-owner references
3. Run spot checks on known legacy users to confirm records landed under correct ownership.

Acceptance criteria:
- Cross-user reads/writes are blocked across UI and API paths.
- Legacy records are retained and correctly assigned.

## Rollout Order
1. Auth helper + schema/index updates
2. Temporary compatibility + migration tooling
3. Mutation authorization + relationship checks
4. Query scoping + aggregate scoping
5. Backfill execution + migration validation
6. Strict mode cutover
7. Verification

## Risks and Controls
- Risk: missing one handler leaves an authorization gap.
  - Control: checklist review of every exported Convex handler.
- Risk: performance regressions from filtering in memory.
  - Control: owner-prefixed indexes and index-based queries.
- Risk: ambiguous errors leak existence of records.
  - Control: use not-found style responses for unauthorized IDs.
- Risk: incorrect owner assignment during migration.
  - Control: deterministic mapping inputs, dry-run reports, and spot-check audits before strict cutover.
- Risk: long migration runtime/timeouts.
  - Control: batch processing with resumable checkpoints.

## Definition of Done
- Every Convex function requires auth and is owner-scoped.
- Every user-scoped table stores `ownerId`.
- Cross-table references are ownership-validated.
- Existing data retained and backfilled with correct `ownerId`.
- Typecheck/lint pass and two-user validation passes.
