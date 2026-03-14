# Campaign Workspace Data Contract

## Purpose

Define the backend payloads that the campaign workspace surfaces should use for campaign index and campaign detail summary work.

This contract stays campaign-focused. It supports scanning, reorientation, and summary review without expanding into a broader analytics layer.

## Queries

### `api.campaigns.listCampaignWorkspaceSummaries`

Returns one summary object per campaign, with optional filtering by campaign lifecycle status.

Each summary includes:

- campaign identity and base copy fields: `id`, `name`, `thesis`, `status`, `createdAt`
- watch state: `isWatched`
- linked trade-plan rollup:
  - `totalCount`
  - `openCount`
  - `ideaCount`
  - `watchingCount`
  - `activeCount`
  - `closedCount`
- linked trade rollup:
  - `totalCount`
  - `latestTradeDate`
- lifecycle metadata:
  - `isClosed`
  - `closedAt`
  - `hasRetrospective`
  - `hasLinkedTradePlans`
  - `hasOpenTradePlans`
  - `hasClosedTradePlans`

### `api.campaigns.getCampaignWorkspace`

Returns `null` when the campaign does not exist for the current user.

Otherwise returns:

- `summary`: the same campaign workspace summary shape used by the index query
- `linkedTradePlans`: a detail-oriented list of linked trade-plan summaries with:
  - `id`
  - `name`
  - `instrumentSymbol`
  - `status`
  - `isWatched`
  - `tradeCount`
  - `latestTradeDate`
  - `closedAt`
  - `invalidatedAt`

## Intentional Boundaries

- Do not add P&L, win rate, exposure, or other analytics-first metrics here.
- Do not move campaign notes, trades tables, or full trade-plan editing into this query shape.
- Keep raw CRUD queries such as `listCampaigns` and `getCampaign` available for non-workspace use.

## Current Adoption

- The campaigns index now preloads `listCampaignWorkspaceSummaries`.
- The campaign detail route now preloads `getCampaignWorkspace` for header and linked-plan summary context.
