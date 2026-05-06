# Manual Trade CSV Import Design

## Context

Trade imports currently accept brokerage-specific CSV exports, parse them client-side, and stage normalized rows in `inboxTrades` for review. Manual CSV import should reuse that same review pipeline instead of creating a second trade creation path.

## Approved Approach

Add `manual` as a first-class import source alongside `ibkr` and `kraken`. The imports page will offer `Manual CSV` in the existing source selector and a `Download template` action that downloads a CSV with the required headers.

The manual CSV format uses internal field names directly:

```csv
ticker,assetType,side,direction,date,price,quantity,externalId,brokerageAccountId,orderType,fees,taxes
```

Required fields:

- `ticker`
- `assetType`
- `side`
- `direction`
- `date`
- `price`
- `quantity`

Optional fields:

- `externalId`
- `brokerageAccountId`
- `orderType`
- `fees`
- `taxes`

`date` accepts either an ISO date/datetime value or a millisecond timestamp. Parsed rows are sent to the existing `api.imports.importTrades` mutation with `source: "manual"` and then reviewed in the normal imports workspace.

Rows without `externalId` remain importable, but keep the existing warning that dedupe cannot be guaranteed.

## Data Flow

1. User selects `Manual CSV`.
2. User downloads the template or chooses a custom CSV with matching headers.
3. The client parser validates headers and normalizes field values into `InboxTradeCandidate` objects.
4. Convex validates ownership, required fields, ticker normalization, price mapping, and optional auto-matching.
5. Valid and invalid rows are staged in `inboxTrades` for review, matching the existing import behavior.

## Error Handling

Parser-level CSV errors and missing header errors are shown before upload when no rows can be parsed. Row-level field errors are preserved on staged inbox trades so users can fix them in the review table.

## Testing

Add parser unit coverage for valid manual rows, missing required headers, invalid enum values, numeric validation, ISO dates, timestamp dates, and missing `externalId` warnings. Add Convex coverage that `source: "manual"` rows stage successfully and dedupe by manual external ids.
