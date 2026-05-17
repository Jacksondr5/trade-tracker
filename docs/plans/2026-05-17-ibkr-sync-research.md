# IBKR Daily Trade And Position Sync Research

Date: 2026-05-17

## Problem

Daily portfolio valuations in Trade Tracker are derived from local trades, cash
ledger entries, and cached market prices. That model only works if the local
trade record is close to current. A valuation run that uses yesterday's or last
week's IBKR positions can produce a precise but wrong portfolio equity row.

The existing app has an IBKR CSV import path and an import inbox, but no
unattended sync. The near-term need is not live trading. It is a reliable daily
way to ingest:

- new executions/trades
- current open positions
- cash balances
- enough raw source data to audit and reconcile differences

## Bottom Line

The best primary path is IBKR Flex Web Service, not TWS API and not Client
Portal's brokerage-session API.

Flex Web Service is designed for programmatic retrieval of preconfigured
reports. It uses a token and query IDs created in Client Portal, does not
require running TWS or Client Portal Gateway, and is specifically documented for
daily report capture. It can retrieve Activity Flex Queries and Trade
Confirmation Flex Queries. Activity data is normally once daily after close of
business; trade confirmations update intraday with a 5-10 minute lag.

For this app, that is a good fit because daily valuations do not need
sub-second order state. They need a trustworthy end-of-day source of record and
an auditable reconciliation path.

## What The User Remembered Correctly

The user's concerns are accurate for the brokerage-session APIs:

- Client Portal Web API for individual accounts uses Client Portal Gateway, a
  local Java program.
- Gateway login requires a browser on the same machine and two-factor
  authentication.
- `/iserver` endpoints require an active brokerage session.
- IBKR permits only one active brokerage session per username across TWS,
  Client Portal, IBKR Mobile, and API surfaces.
- TWS and IB Gateway require a locally running trading platform, and IBKR's
  own third-party guidance calls out daily restart plus weekly manual login.

Those properties make brokerage-session APIs a poor primary ingestion mechanism
for unattended daily portfolio valuations.

## What Changes With Flex

Flex is a reporting API, not a trading-session API.

IBKR documents Flex Web Service as a standalone HTTP API for generating and
retrieving preconfigured Flex Queries. The user creates report templates in
Client Portal, captures a query ID, and enables a Flex token. After that, API
requests use the token and query ID rather than the IBKR username and password.

Important documented constraints:

- Activity Flex Query data is only updated once daily at close of business.
- Trade Confirmation Flex Queries can update throughout the day, but execution
  entries are not real-time and are typically available after 5-10 minutes.
- Flex is not meant for active polling.
- The token can be set for 6 hours to 1 year and can be IP-restricted.
- `/SendRequest` is paced at 1 request per second and 10 requests per minute.
- Report generation is asynchronous: call `/SendRequest`, wait/retry, then call
  `/GetStatement` with the returned reference code.

That implies the correct daily workflow is:

1. After the market-data planner window, request the prior day's Activity Flex
   report.
2. Parse trades, open positions, and cash sections.
3. Import new trades through the existing import/inbox path or a closely related
   internal path.
4. Store the raw report and a sync run record.
5. Reconcile local open positions and cash against the IBKR snapshot before
   allowing daily valuation rows to be considered fresh.

## Official IBKR Options

### 1. Flex Web Service

Recommended primary path.

Strengths:

- No TWS or IB Gateway process.
- No constantly active brokerage session.
- Token/query-id workflow is much easier to schedule.
- Activity statements are aligned with end-of-day accounting.
- Trade confirmations can cover same-day executions if we need a second
  intraday pass.
- Reports can include execution IDs and enough fields for deterministic dedupe.

Risks:

- Requires manual Client Portal setup of Flex Queries and token rotation.
- Activity data is not intraday fresh.
- Need to choose report sections carefully and test actual IBKR output.
- Flex fields can differ by account/product/report template.

Recommended Flex reports:

- Activity Flex Query for previous business day:
  - Trades
  - Open Positions
  - Cash Report or Statement of Funds
  - Deposits/Withdrawals if available
  - Corporate Actions if the account trades instruments where this matters
- Trade Confirmation Flex Query:
  - Execution-level trade confirmations for same-day or recent trades
  - Use only if the valuation job needs same-day late-afternoon trades before
    the final Activity report is available

### 2. Client Portal Web API

Useful as a secondary current-state source, not as the primary trade history
source.

Client Portal Web API has two important families:

- `/portfolio` endpoints are non-`/iserver` resources and IBKR says they do not
  require the brokerage session.
- `/iserver` endpoints require the brokerage session and trading permissions.

The trade endpoint `GET /iserver/account/trades` only returns current day plus
six previous days and is advised once per session. That is not enough to be the
durable ingestion source for this app. The session mechanics also create the
exact conflict the user is worried about.

A possible future use is a read-only `/portfolio` health check for current
positions, but only if we can authenticate without disturbing the user's normal
trading session. Flex should be proven first.

### 3. TWS API / IB Gateway

Not recommended as the primary ingestion path.

TWS API is a socket protocol through TWS or IB Gateway. It can receive
executions and commission reports, but IBKR's current docs say IB Gateway is
limited to executions since midnight, and TWS can look back only if the Trade
Log setting is adjusted. TWS/IB Gateway also brings process management,
API settings, daily restart, and weekly manual authentication.

This may be acceptable for automated trading systems that already run IB
Gateway. It is too much operational surface for a portfolio analytics sync whose
main source of truth can be daily reports.

## Third-Party Options

### SnapTrade

Best third-party candidate if we want to buy normalization instead of building
Flex parsing ourselves.

SnapTrade has an explicit Interactive Brokers integration. Its IBKR connection
uses IBKR Query ID and Token, which means it is also effectively built on IBKR
Flex/reporting. It exposes API endpoints for positions, balances, activities,
and refreshes.

Strengths:

- Direct API for positions, balances, and activities.
- Uses a read-only IBKR Query ID and Token.
- Handles some normalization across brokerages.
- Can trigger async refreshes and receive webhooks.

Risks:

- Adds a vendor, cost, account, SDK, and availability dependency.
- Activities are daily cached data.
- SnapTrade's activity ID may not be fully stable if it reprocesses brokerage
  data, so Trade Tracker still needs broker-native dedupe where possible.
- We would need to verify pricing and whether a single-user/internal app is
  acceptable under their plan.

Practical evaluation: worth a proof-of-concept if Flex parsing proves messy or
if we plan to support more brokerages soon.

### Plaid Investments

Good fallback for holdings/transactions, less attractive than SnapTrade for
this specific IBKR workflow.

Plaid lists Interactive Brokers - US as supporting Investments, and Plaid's
Investments product exposes holdings, investment transactions, refresh, and
webhooks. It can retrieve up to 24 months of investment transactions.

Risks:

- Plaid is broader financial aggregation, not brokerage-workflow focused.
- On-demand investment refresh is not supported by every institution.
- Investment transaction normalization may not preserve the execution-level
  details this app wants for order/trade review.
- Production access and pricing may be overkill for a personal/internal app.

### Monarch Money Scrape Via Browserbase

This is a workable last-resort fallback, not the preferred integration.

Monarch uses Plaid, Finicity, and MX for account connections. If Monarch already
connects to the user's IBKR account, Browserbase or Playwright automation could
log in and scrape holdings. Browserbase supports persistent authenticated
browser contexts and browser automation.

Risks:

- No official Monarch public API for this data path.
- Scraping adds UI fragility and credentials/session handling.
- It likely gives current holdings but not execution-level source data.
- It would be a reconciliation snapshot source, not a canonical trade import
  source.

Use only if IBKR Flex and direct aggregator APIs cannot be made to work.

### Yodlee / MX / Finicity

These are data aggregator platforms that can expose investment holdings or
transactions, and Monarch itself uses Plaid/Finicity/MX. They are not the best
first choices for this repo because they are enterprise-style integrations and
do not obviously solve execution-level IBKR trade ingestion better than Flex or
SnapTrade.

## Account Type And Permission Implications

IBKR Pro matters. IBKR's Web API docs say individual live or paper Web API use
requires the live account to be fully open, funded, and IBKR Pro. IBKR's
third-party connection page also says third-party data connections require an
opened IB account, IBKR Pro, and a funded account.

Trading permissions matter for brokerage-session APIs. IBKR states `/iserver`
resources are effectively trading-infrastructure resources requiring a
brokerage session. This matches the user's memory.

For Flex, the dependency is different: the user must be able to log into Client
Portal and create the token/query IDs. Flex reporting access is username and
query-template scoped. It should avoid the active brokerage-session collision,
but we still need to test with the user's actual account and report setup.

## Recommended Trade Tracker Architecture

Add first-class IBKR sync as an ingestion subsystem, but keep Convex as the
system of record.

### New Durable State

Likely tables:

- `brokerageConnections`
  - ownerId, source, status, account identifiers, query IDs, token metadata,
    lastSyncAt, lastSuccessfulSyncAt
  - Store secrets in environment/secret storage where possible; avoid writing
    raw tokens into normal user-facing tables.
- `brokerageSyncRuns`
  - ownerId, source, connectionId, reportDate, startedAt, completedAt, status,
    counts, errorMessage
- `brokerageRawReports`
  - syncRunId, reportType, reportDate, content hash, raw XML/blob pointer or
    compact raw payload
- `brokeragePositionSnapshots`
  - syncRunId, brokerageAccountId, date, symbol, assetType, quantity, market
    value, currency
- `brokerageCashSnapshots`
  - syncRunId, brokerageAccountId, date, currency, cash
- Optional `portfolioReconciliationIssues`
  - mismatches between local accepted trades and IBKR position/cash snapshots

### Ingestion Flow

1. Scheduled action starts an IBKR sync run.
2. Action calls Flex `/SendRequest` for the Activity report.
3. Action retries `/GetStatement` until ready or timeout.
4. XML parser normalizes:
   - trade candidates
   - position snapshot
   - cash snapshot
   - raw report metadata
5. Internal mutation writes raw report/run data.
6. New trades go to `inboxTrades` or a dedicated auto-import path that shares
   the existing `importTrades` normalization/dedupe rules.
7. Reconciliation compares:
   - local open position quantities by account/symbol/direction
   - IBKR open position quantities
   - cash ledger/cash snapshot
8. Portfolio valuation reads a freshness/reconciliation status before it marks
   rows as trustworthy.

### Valuation Guardrail

Do not let daily valuation silently proceed from stale trade data.

Add one of these statuses to the operational valuation/review surface:

- `current`: latest IBKR sync succeeded and reconciled for the valuation date
- `stale`: no successful IBKR sync for the expected report date
- `mismatched`: IBKR snapshot and local accepted trades disagree
- `pending_review`: new imported trades or reconciliation issues need review

The portfolio page can still show a computed estimate, but it should not present
it as a clean end-of-day valuation when the source data is stale or mismatched.

## Implementation Recommendation

Build in this order:

1. Manual Flex proof-of-concept outside the app.
   - Create Activity and Trade Confirmation Flex Queries.
   - Generate a 30-90 day token first.
   - Fetch XML with a small local script.
   - Confirm actual fields for executions, commissions, open positions, and
     cash.
2. Add a pure parser module and fixtures.
   - Convert IBKR XML to the existing import candidate shape.
   - Preserve IBKR execution IDs as `externalId`.
   - Add fixtures from sanitized real Flex XML.
3. Add Convex ingestion state and a scheduled action.
   - Store run status, raw report hash, snapshots, and import counts.
   - Keep parser tests independent from Convex where possible.
4. Add reconciliation before valuation freshness.
   - Start with quantity mismatches by brokerage account and symbol.
   - Add cash reconciliation after the position loop is stable.
5. Evaluate SnapTrade only if Flex parsing or token setup becomes a bottleneck.
   - It may be a faster product path, but it should be compared against the
     complexity of maintaining one IBKR Flex parser for a single account.

## Source Links

- IBKR Web API docs: https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/
- IBKR Client Portal Web API v1.0 docs: https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/
- IBKR Flex Web Service docs: https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service/
- IBKR TWS API docs: https://www.interactivebrokers.com/campus/ibkr-api-page/twsapi-doc/
- IBKR third-party connection requirements: https://www.interactivebrokers.com/campus/ibkr-api-page/third-party-connections/
- IBKR Lite vs Pro comparison: https://www.interactivebrokers.com/en/general/compare-lite-pro.php
- Plaid Investments API: https://plaid.com/docs/api/products/investments/
- Plaid Interactive Brokers - US institution page: https://plaid.com/institutions/interactive-brokers-us/
- SnapTrade IBKR integration: https://snaptrade.com/brokerage-integrations/ibkr-api
- SnapTrade account data docs: https://docs.snaptrade.com/docs/account-data
- SnapTrade positions endpoint: https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getUserAccountPositions
- SnapTrade activities endpoint: https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getAccountActivities
- SnapTrade refresh endpoint: https://docs.snaptrade.com/reference/Connections/Connections_refreshBrokerageAuthorization
- Monarch account connection docs: https://help.monarchmoney.com/hc/en-us/articles/360048393352-Guide-to-Connecting-Your-Accounts
- Browserbase docs: https://docs.browserbase.com/
