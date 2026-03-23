# JAC-161 Imports Operational Contract And Data Foundation

## Scope

This ticket owns the implementation contract and backend foundation for the imports review workspace.

Included:

- imports review contract for the next route migration
- imports review vocabulary for lifecycle, watch/focus, import-review, and match state
- a dedicated backend workspace query for imports review
- explicit row readiness, validation, and match metadata
- focused backend tests for matching, validation, and summary rollups

Excluded:

- `ImportsPageClient` consumption changes
- imports page layout and workflow redesign
- trade-plan detail UI changes outside existing backend reuse
- broader `Trades` route and loading-state work from later tickets

## Touched Surface Matrix

Owned in this ticket:

- `Imports` backend review workspace contract
- import-related backend reference data used by the imports route
- shared auto-match helper behavior used by imports review

Referenced but not rewritten in this ticket:

- `Imports` route composition in `src/app/(app)/imports/`
- open trade-plan selection workflows
- campaign and portfolio reference data consumers

Explicitly left to adjacent tickets:

- `JAC-162` for imports route consumption and workflow/UI overhaul
- `JAC-163` for touched-route systemization, loading states, and regression hardening

## Vocabulary Matrix

### Lifecycle status

These remain the canonical statuses on long-lived objects:

- `Campaign`: `planning`, `active`, `closed`
- `Trade Plan`: `idea`, `watching`, `active`, `closed`
- `Inbox Trade`: `pending_review`

### Watch / Focus state

This is separate from lifecycle:

- `Watchlist` indicates whether a campaign or trade plan is intentionally watched
- `watching` on a trade plan remains a tactical lifecycle status, not a generic watch toggle

### Import-review state

This ticket makes review state explicit per inbox row:

- `ready`: the row can be accepted as a trade now
- `needs_review`: the row still has blocking issues before acceptance

### Match state

This ticket makes trade-plan match state explicit per inbox row:

- `assigned`: the row already has a selected trade plan
- `suggested`: exactly one open trade plan matches the ticker
- `unmatched`: no open trade plan matches the ticker
- `ambiguous`: multiple open trade plans match the ticker

## Backend Contract

`getImportsReviewWorkspace` returns one backend-owned payload for the imports review route migration:

- `summary`
  - `totalPendingCount`
  - `readyCount`
  - `needsReviewCount`
  - `assignedCount`
  - `suggestedCount`
  - `unmatchedCount`
  - `ambiguousCount`
  - `validCount`
  - `warningCount`
- `rows`
  - `inboxTrade`
  - `reviewState`
  - `validationState`
  - `readiness`
  - `matchState`
  - `matchContext`
- `referenceData`
  - `openTradePlans`
  - `portfolios`
  - `accountMappings`
  - active and planning `campaigns`

## Row Semantics

### Readiness

Readiness answers whether the row is currently acceptable as a trade:

- required fields: `ticker`, `assetType`, `side`, `direction`, `date`, `price`, `quantity`
- `price` and `quantity` must be finite and greater than zero
- `readiness.missingFields` exposes stable field keys for review UI and tests

### Validation

Validation remains parser- and data-contract-driven:

- `error` when `validationErrors` is non-empty
- `warning` when there are no errors but `validationWarnings` is non-empty
- `valid` otherwise

### Matching

Matching remains understandable and reviewable:

- imports still auto-assign only when exactly one open trade plan matches the normalized ticker
- the workspace payload exposes candidate count and suggested plans instead of hiding ambiguity
- this ticket does not add fuzzy or heuristic matching
