import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig([
  {
    input: "./openapi/ibkr.json", // sign up at app.heyapi.dev
    output: "src/lib/ibkr-client",
    parser: {
      filters: {
        operations: {
          include: [
            // Connection auth/bootstrap (OAuth 1.0a + brokerage session init).
            "POST /oauth/request_token",
            "POST /oauth/access_token",
            "POST /oauth/live_session_token",
            "POST /iserver/auth/ssodh/init",
            // Session lifecycle for scheduled/manual sync.
            "POST /iserver/auth/status",
            "POST /tickle",
            "POST /logout",
            // Account discovery/selection for multi-account sync.
            "GET /iserver/accounts",
            "POST /iserver/account",
            // Execution ingestion endpoint (7-day window).
            "GET /iserver/account/trades",
            // Optional IBKR report-style backfill endpoints (Phase 3).
            "GET /gw/api/v1/trade-confirmations/available",
            "POST /gw/api/v1/trade-confirmations",
            "GET /gw/api/v1/statements/available",
            "POST /gw/api/v1/statements",
          ],
        },
      },
    },
  },
]);
