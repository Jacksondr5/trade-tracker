# Campaign System Redesign: Campaigns + Trade Plans

Date: 2026-02-08
Status: Validated design

## Goals

- Keep campaigns focused on strategy (`thesis`, notes, retrospective, outcome).
- Move execution setup (instrument + entry/exit/target logic) into child `tradePlan` records.
- Support standalone trade plans that are not attached to any campaign.
- Link trades to trade plans (optional), not campaigns.
- Preserve flexibility for non-numeric condition tracking (technical structure, confirmations, invalidation logic).

## Domain Model

### Campaign (`campaigns`)

Retain:
- `name`
- `status` (`planning | active | closed`)
- `thesis`
- `retrospective`
- `outcome`
- `closedAt`

Remove from campaign model (post-migration):
- `instruments`
- `entryTargets`
- `profitTargets`
- `stopLossHistory`

### Trade Plan (`tradePlans`) - new table

Fields:
- `campaignId?` (optional `Id<"campaigns">`)
- `name`
- `status` (`idea | watching | active | closed`)
- `instrumentSymbol`
- `instrumentType?`
- `instrumentNotes?`
- `entryConditions` (free-form string)
- `exitConditions` (free-form string)
- `targetConditions` (free-form string)
- `rationale?`
- `closedAt?`
- `invalidatedAt?`
- `sortOrder?`

Indexes:
- `by_campaignId`
- `by_status`

### Trade (`trades`)

Change linkage:
- remove `campaignId`
- add `tradePlanId?` (optional `Id<"tradePlans">`)

Rule:
- If `tradePlanId` is provided, plan must exist.
- Trades may remain unlinked.

## Behavioral Rules

- Trade plans can be campaign-linked or standalone.
- Campaign detail shows only trade plans with matching `campaignId`.
- Standalone plans are managed in a dedicated trade-plan view.
- Campaign status remains explicit (not derived).
- Trade plan status is independent and explicit.
- If a campaign is closed, linked plans should not be reopened to active states.
- Closing a campaign should warn (not hard-block) when linked plans are still open.

## API and Query Surface

New module: `convex/tradePlans.ts`

- `createTradePlan`
- `updateTradePlan`
- `updateTradePlanStatus`
- `deleteTradePlan` (optional soft-delete policy to decide)
- `listTradePlans({ campaignId?, status? })`
- `getTradePlan({ tradePlanId })`
- `getTradesByTradePlan({ tradePlanId })`
- `getTradePlanPL({ tradePlanId })`

Updated modules:
- `convex/trades.ts`: validate `tradePlanId`, remove campaign validation logic.
- `convex/campaigns.ts`: campaign rollups compute via linked trade plans -> trades.

## UI Changes

### Campaign Detail

Replace current instruments/targets/stop-loss sections with a `Trade Plans` section:
- list plan cards (instrument + entry/exit/target conditions + status)
- create/edit trade plan in-place or modal
- plan-level trade summary and link to filtered trades

### New Trade Plan Page

Add `/trade-plans` to manage standalone and cross-campaign plans:
- filters: standalone, linked, status
- quick actions for status transitions

### Trade Form

- replace campaign selector with optional trade-plan selector
- filter selector to active plans by default
- preserve ability to submit trade without a plan

## Migration Strategy (staged)

1. Additive schema changes (`tradePlans`, `trades.tradePlanId`) while keeping legacy fields.
2. Ship backend and UI read/write path for trade plans.
3. Migrate existing campaign arrays into one or more initial trade plans.
4. Switch trade linkage fully to `tradePlanId`; stop writing campaign linkage.
5. Remove legacy campaign array fields and deprecated mutations/UI.

## Validation and Test Plan

- Schema/type checks for new optional foreign keys.
- Mutation tests:
  - create/update/status transitions for trade plans
  - trade creation with and without `tradePlanId`
  - rejection on invalid `tradePlanId`
- Query tests:
  - campaign-linked plan listing
  - standalone plan listing
  - trade-plan and campaign P&L rollups
- UI checks:
  - campaign detail trade-plan management
  - standalone trade-plan view
  - trade form optional linkage behavior

## Non-Goals

- Brokerage sync/import redesign.
- Full historical reconciliation across external sources.
- Automated strategy execution logic.
