# IBKR Endpoint Call Guide (OpenAPI Filter Set)

Scope: Endpoints currently included in `openapi-ts.config.ts` for IBKR import/connect flows.

## Purpose

This guide describes what each included IBKR endpoint does and when Trade Tracker should call it.
Keep this document in sync with the `operations.include` list in `openapi-ts.config.ts`.

## Runtime Call Sequence

1. User connects IBKR account:
- `POST /oauth/request_token`
- `POST /oauth/access_token`
- `POST /oauth/live_session_token`
- `POST /iserver/auth/ssodh/init`
- `GET /iserver/accounts`
- Optional: `POST /iserver/account` for multi-account users

2. Scheduled or manual sync:
- `POST /iserver/auth/status`
- `POST /tickle` (before and during active polling windows)
- `GET /iserver/account/trades`

3. Disconnect:
- `POST /logout`

4. Optional historical backfill flow (Phase 3):
- `GET /gw/api/v1/trade-confirmations/available`
- `POST /gw/api/v1/trade-confirmations`
- `GET /gw/api/v1/statements/available`
- `POST /gw/api/v1/statements`

## Endpoint Details

### `POST /oauth/request_token`
- Function: Starts OAuth 1.0a flow by issuing a temporary request token.
- When to call: First step of IBKR connection/reconnection.
- Notes: Not needed for routine sync once valid long-lived auth material exists.

### `POST /oauth/access_token`
- Function: Exchanges authorized request token for permanent OAuth token + secret.
- When to call: During initial connect or explicit reauth.
- Notes: Persist securely in `brokerageConnections.auth`.

### `POST /oauth/live_session_token`
- Function: Creates a live session token secret used to access trading Web API endpoints.
- When to call: After obtaining permanent OAuth credentials and before brokerage session init.
- Notes: Refresh when expired or invalidated.

### `POST /iserver/auth/ssodh/init`
- Function: Initializes IBKR brokerage session.
- When to call: After auth bootstrap and whenever a new brokerage session must be established.
- Notes: Required before trading-session endpoints are usable.

### `POST /iserver/auth/status`
- Function: Returns whether brokerage session is authenticated/established/connected.
- When to call: Pre-flight check at start of every scheduled job and every manual "Sync now".
- Notes: If not authenticated, set connection status to `needs_reauth` and stop sync.

### `POST /tickle`
- Function: Keepalive ping for active brokerage session.
- When to call: Around active sync windows and long-running IBKR interactions.
- Notes: Use as a session-maintenance primitive, not as a health check replacement.

### `GET /iserver/accounts`
- Function: Lists tradable accounts and selected account context.
- When to call: After connect, after reauth, and periodically when account context may change.
- Notes: Needed for multi-account support and account validation.

### `POST /iserver/account`
- Function: Switches active account context.
- When to call: For FA/multi-account structures before account-specific data pulls.
- Notes: Usually not required for single-account users.

### `GET /iserver/account/trades`
- Function: Returns execution history up to last 7 days (`days` query param max 7).
- When to call: Core fetch for both scheduled sync and manual sync.
- Notes: Enforce pacing (effectively 1 request / 5s) and idempotent dedupe on ingest.

### `POST /logout`
- Function: Terminates Web API session.
- When to call: User-initiated disconnect, explicit cleanup, or forced reset workflows.
- Notes: Clear local session/cookie state after logout.

### `GET /gw/api/v1/trade-confirmations/available`
- Function: Lists dates with available trade confirmations for an account.
- When to call: Start of report-based historical backfill flow.
- Notes: Optional in v1 runtime; used for deep-history import planning.

### `POST /gw/api/v1/trade-confirmations`
- Function: Retrieves trade confirmations in supported formats.
- When to call: During historical backfill for confirmation-level detail.
- Notes: Requires gateway scopes/policies distinct from CP API session endpoints.

### `GET /gw/api/v1/statements/available`
- Function: Lists available statement periods/dates.
- When to call: Start of statement-based backfill flow.
- Notes: Useful for selecting deterministic backfill windows.

### `POST /gw/api/v1/statements`
- Function: Generates/fetches statements in supported formats.
- When to call: During initial historical backfill beyond the 7-day CP API trade limit.
- Notes: Treat as asynchronous/report ingestion path, separate from 15-minute sync loop.

## Design Constraints Captured By This Set

- Ongoing execution sync: `GET /iserver/account/trades` (short-window incremental).
- Session resilience: `POST /iserver/auth/status` + `POST /tickle`.
- Connection lifecycle: OAuth bootstrap + brokerage session init + logout.
- Multi-account readiness: account discovery and account switching.
- Deep history path: statements/trade-confirmations for backfill.
