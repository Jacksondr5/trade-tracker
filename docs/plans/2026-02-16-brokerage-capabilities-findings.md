# Brokerage Capability Findings (IBKR, Kraken, TradingView)

Date: 2026-02-16
Scope: Evaluate capabilities for automated trade ingestion into Trade Tracker, focused on periodic sync + manual sync now.

## Executive Summary

- IBKR supports API-based retrieval and streaming, but the CP API trade endpoint (`GET /iserver/account/trades`) is intentionally short-window (max 7 days).
- Kraken supports robust REST backfill (`POST /private/TradesHistory`) and optional websocket execution streaming.
- TradingView webhook support is for alerts/signals, not direct historical brokerage fill import for this use case.
- No first-party outbound fill webhook model was found for IBKR/Kraken; integration is pull/stream with explicit auth/session handling.

## 1) Interactive Brokers (IBKR)

### Core endpoint for periodic sync

- Endpoint: `GET /iserver/account/trades`
- Lookback control: `days` query parameter with max value `7`
- Result window: current day + up to prior 6 days (7 total)
- Pacing: endpoint has strict rate constraints (documented as 1 request per 5 seconds)

Conclusion:
- This is the correct endpoint for ongoing incremental polling.
- It is not sufficient alone for deep historical initial sync.

### Initial historical sync beyond one week

For deeper history, use a separate historical export/report path (IBKR Flex Queries / statement-based import) for initial backfill, then switch to incremental CP API polling.

Why:
- CP API trade endpoint is short-window by design.
- Statement/Flex workflow is more appropriate for durable history import.

### Session model and what it means for 15-minute polling

IBKR CP API has a brokerage session concept that can expire quickly when idle. `/tickle` is the keepalive mechanism. 2FA is required for live brokerage login workflows.

Practical behavior for your app:

1. Scheduled 15-minute poll
- At job start, check auth/session state.
- If active, run sync and finish quickly.
- If expired, mark connection `needs_reauth` and stop job with actionable status (no noisy retries).

2. Manual `Sync now` in app
- Run same preflight auth check.
- If session valid: sync immediately.
- If not: show inline "reauth required" state and provide reconnect path.

3. Maintenance/reset windows
- Expect occasional planned downtime and session drops.
- Treat as retryable/degraded state, not hard failure.

### Additional caveats

- CP API availability is tied to IBKR account/API eligibility constraints (including IBKR Pro in CP API docs context).
- Pacing violations can trigger 429s and temporary restriction windows.

## 2) Kraken (Spot)

### Core endpoints

1. REST backfill/incremental sync
- `POST /private/TradesHistory`
- Paginated history retrieval (50 results per request)
- Requires private API permission for closed orders/trades query

2. Optional future real-time
- WebSocket v2 `executions` channel on authenticated WS endpoint
- Auth token obtained via `POST /private/GetWebSocketsToken`

Conclusion:
- Kraken is well-suited for periodic polling and historical backfill.

### Operational notes

- Private REST rate limits are counter/tier-based.
- Use watermark/cursor sync and bounded retries.

## 3) TradingView

### What is useful now

- Alert webhooks: TradingView can POST alert payloads to your endpoint.
- Best fit: future signal/intention ingestion, not authoritative fill import.

### What is not a fit for v1 fills

- TradingView Broker API is partner-oriented (broker integrations), not a simple user-level fills export API for this product.

## Implications for architecture

1. Authoritative executed-trade sources (v1): IBKR + Kraken.
2. IBKR requires a dedicated connector handling:
- session preflight/check,
- keepalive usage,
- pacing enforcement,
- reset-window resilience,
- clear `needs_reauth` UX state.
3. Initial IBKR historical sync should use statement/Flex import path; incremental runs use `/iserver/account/trades`.

## Security note for `brokerageConnections.auth`

- For v1, store auth/token data in Convex with native encryption at rest plus strict function-level access controls.
- Keep credentials minimal and read-only scoped where possible.
- Re-evaluate app-layer encryption as a production-hardening step.

## Source References

- IBKR CP API v1 docs: https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/
- IBKR TWS API executions/commissions: https://interactivebrokers.github.io/tws-api/executions_commissions.html
- IBKR Flex Web Service guide: https://www.interactivebrokers.com.au/en/software/etmug/employeetrack/flex%20web%20service%20version%203.htm
- Kraken TradesHistory: https://docs.kraken.com/api/docs/rest-api/get-trade-history/
- Kraken WS executions: https://docs.kraken.com/api/docs/websocket-v2/executions/
- Kraken WS token: https://docs.kraken.com/api/docs/rest-api/get-websockets-token/
- Kraken Spot REST rate limits: https://docs.kraken.com/api/docs/guides/spot-rest-ratelimits/
- TradingView webhook alerts: https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/
- TradingView webhook authentication: https://www.tradingview.com/support/solutions/43000680459-webhook-authentication/
- TradingView Broker API docs: https://www.tradingview.com/broker-api-docs/
