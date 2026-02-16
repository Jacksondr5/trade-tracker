# Brokerage Trade Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement IBKR/Kraken periodic trade ingestion with manual sync, an inbox-first review flow, and user-confirmed trade-to-plan/campaign linkage.

**Architecture:** Add a shared broker connector layer (IBKR/Kraken) that normalizes external executions into idempotent `trades` records and marks all imported rows as `pending_review`. Build a single Import Inbox UI where each row gets at most one `tradePlanId` suggestion (symbol + side/direction match only), while `campaignId` remains user-selected unless derived from chosen trade plan. Keep reliability concerns centralized in the IBKR connector (session, pacing, maintenance handling).

**Tech Stack:** Next.js 15, Convex, TypeScript, Clerk, Tailwind, Vitest (new for unit tests)

---

### Task 1: Add Test Harness For Import Logic

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Test: `src/lib/imports/suggestion.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/imports/suggestion.test.ts
import { describe, expect, it } from "vitest";
import { pickTradePlanSuggestion } from "~/lib/imports/suggestion";

describe("pickTradePlanSuggestion", () => {
  it("returns none when there are no candidate plans", () => {
    const result = pickTradePlanSuggestion({
      execution: { side: "buy", symbol: "AAPL" },
      tradePlans: [],
    });

    expect(result).toEqual({ reason: "none", suggestedTradePlanId: null });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/imports/suggestion.test.ts`  
Expected: FAIL because Vitest is not configured and module does not exist.

**Step 3: Write minimal implementation/config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
    },
  },
  test: { environment: "node", globals: true, setupFiles: ["src/test/setup.ts"] },
});
```

```ts
// src/test/setup.ts
export {};
```

**Step 4: Run test to verify it passes (or reaches next missing symbol)**

Run: `pnpm test src/lib/imports/suggestion.test.ts`  
Expected: FAIL only on missing implementation module.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/test/setup.ts src/lib/imports/suggestion.test.ts
git commit -m "test: add vitest harness for import pipeline"
```

### Task 2: Implement Suggestion Engine (Trade Plan Only)

**Files:**
- Create: `src/lib/imports/suggestion.ts`
- Test: `src/lib/imports/suggestion.test.ts`

**Step 1: Write the failing tests**

```ts
it("suggests plan when symbol and side-direction are consistent", () => {
  const result = pickTradePlanSuggestion({
    execution: { side: "buy", symbol: "AAPL" },
    tradePlans: [{ _id: "p1", direction: "long", instrumentSymbol: "AAPL" }],
  });
  expect(result).toEqual({ reason: "symbol_and_side_match", suggestedTradePlanId: "p1" });
});

it("returns none when symbol matches but side-direction conflicts", () => {
  const result = pickTradePlanSuggestion({
    execution: { side: "sell", symbol: "AAPL" },
    tradePlans: [{ _id: "p1", direction: "long", instrumentSymbol: "AAPL" }],
  });
  expect(result).toEqual({ reason: "none", suggestedTradePlanId: null });
});
```

**Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/imports/suggestion.test.ts`  
Expected: FAIL on new expectations.

**Step 3: Write minimal implementation**

```ts
export function isSideDirectionConsistent(side: "buy" | "sell", direction: "long" | "short") {
  return (direction === "long" && side === "buy") || (direction === "short" && side === "sell");
}

export function pickTradePlanSuggestion({ execution, tradePlans }: {
  execution: { symbol: string; side: "buy" | "sell" };
  tradePlans: Array<{ _id: string; instrumentSymbol: string; direction: "long" | "short" }>;
}) {
  const normalized = execution.symbol.trim().toUpperCase();
  const match = tradePlans.find((p) => p.instrumentSymbol.trim().toUpperCase() === normalized && isSideDirectionConsistent(execution.side, p.direction));
  if (!match) return { suggestedTradePlanId: null, reason: "none" as const };
  return { suggestedTradePlanId: match._id, reason: "symbol_and_side_match" as const };
}
```

**Step 4: Run tests to verify pass**

Run: `pnpm test src/lib/imports/suggestion.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/imports/suggestion.ts src/lib/imports/suggestion.test.ts
git commit -m "feat: add trade-plan suggestion engine for import inbox"
```

### Task 3: Update Convex Schema For Import Domain

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/trades.ts`

**Step 1: Write failing type checks via schema usage updates**

Add new `trades` fields in validators/args first (without schema), then run typecheck to force schema mismatch.

**Step 2: Run check to verify failure**

Run: `pnpm typecheck`  
Expected: FAIL due Convex model mismatch.

**Step 3: Write minimal schema and validator changes**

```ts
// in trades table
campaignId: v.optional(v.id("campaigns")),
source: v.union(v.literal("manual"), v.literal("ibkr"), v.literal("kraken")),
externalExecutionId: v.optional(v.string()),
externalOrderId: v.optional(v.string()),
brokerAccountRef: v.optional(v.string()),
importJobId: v.optional(v.id("importJobs")),
inboxStatus: v.optional(v.union(v.literal("pending_review"), v.literal("reviewed"))),
suggestedTradePlanId: v.optional(v.id("tradePlans")),
suggestionReason: v.optional(v.union(v.literal("symbol_and_side_match"), v.literal("none"))),
```

Add new tables:
- `brokerageConnections`
- `importJobs`
- `externalExecutions`
- `importCursorState`

**Step 4: Run checks**

Run: `pnpm typecheck && pnpm lint`  
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/schema.ts convex/trades.ts
git commit -m "feat: add import-domain schema and trade linkage fields"
```

### Task 4: Add Shared Connector Contracts

**Files:**
- Create: `src/lib/imports/types.ts`
- Create: `src/lib/imports/connectors/base.ts`
- Test: `src/lib/imports/connectors/base.test.ts`

**Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeSymbol } from "~/lib/imports/connectors/base";

describe("normalizeSymbol", () => {
  it("normalizes case and trims whitespace", () => {
    expect(normalizeSymbol(" btcusd ")).toBe("BTCUSD");
  });
});
```

**Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/imports/connectors/base.test.ts`  
Expected: FAIL missing module/function.

**Step 3: Implement contracts**

```ts
export type NormalizedExecution = {
  accountRef: string;
  occurredAt: number;
  externalExecutionId: string | null;
  externalOrderId: string | null;
  price: number;
  provider: "ibkr" | "kraken";
  quantity: number;
  rawPayload: unknown;
  side: "buy" | "sell";
  symbol: string;
};

export function normalizeSymbol(input: string): string {
  return input.trim().toUpperCase();
}
```

**Step 4: Run tests**

Run: `pnpm test src/lib/imports/connectors/base.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/imports/types.ts src/lib/imports/connectors/base.ts src/lib/imports/connectors/base.test.ts
git commit -m "feat: add shared broker connector contracts"
```

### Task 5: Build IBKR Connector Reliability Primitives

**Files:**
- Create: `src/lib/imports/connectors/ibkr.ts`
- Test: `src/lib/imports/connectors/ibkr.test.ts`

**Step 1: Write failing tests (rate limit + session transitions)**

```ts
it("enforces 5-second minimum spacing for trades endpoint", async () => {
  // mock clock, invoke limiter twice, expect second call delayed
});

it("returns blocked_reauth when preflight shows expired session", async () => {
  // mock preflight result => expired
});
```

**Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/imports/connectors/ibkr.test.ts`  
Expected: FAIL.

**Step 3: Implement minimal connector helpers**

```ts
export function createIbkrLimiter() {
  let lastCallAt = 0;
  return async function waitTurn(now = Date.now()) {
    const minGapMs = 5000;
    const waitMs = Math.max(0, minGapMs - (now - lastCallAt));
    lastCallAt = now + waitMs;
    return waitMs;
  };
}

export function mapIbkrPreflightToConnectionStatus(preflight: { authenticated: boolean }) {
  return preflight.authenticated ? "active" : "needs_reauth";
}
```

**Step 4: Run tests**

Run: `pnpm test src/lib/imports/connectors/ibkr.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/imports/connectors/ibkr.ts src/lib/imports/connectors/ibkr.test.ts
git commit -m "feat: add ibkr connector session and pacing primitives"
```

### Task 6: Build Kraken Pagination Primitive

**Files:**
- Create: `src/lib/imports/connectors/kraken.ts`
- Test: `src/lib/imports/connectors/kraken.test.ts`

**Step 1: Write failing tests**

```ts
it("stops paging once cursor boundary is reached", () => {
  // mock descending pages and cursor cutoff
});
```

**Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/imports/connectors/kraken.test.ts`  
Expected: FAIL.

**Step 3: Implement minimal pagination helper**

```ts
export function shouldContinueKrakenPaging(oldestSeenTimestamp: number, cursorTimestamp: number | null) {
  if (cursorTimestamp === null) return true;
  return oldestSeenTimestamp > cursorTimestamp;
}
```

**Step 4: Run tests**

Run: `pnpm test src/lib/imports/connectors/kraken.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/imports/connectors/kraken.ts src/lib/imports/connectors/kraken.test.ts
git commit -m "feat: add kraken pagination helper"
```

### Task 7: Implement Import Ingestion Service (Idempotent)

**Files:**
- Create: `convex/lib/importIngestion.ts`
- Modify: `convex/trades.ts`
- Test: `src/lib/imports/importIngestion.test.ts`

**Step 1: Write failing tests for idempotency key behavior**

```ts
it("generates deterministic fallback hash when externalExecutionId missing", () => {
  // expect same hash for same normalized payload
});
```

**Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/imports/importIngestion.test.ts`  
Expected: FAIL.

**Step 3: Implement minimal ingestion helpers + wiring**

```ts
export function buildExecutionIdentity(input: {
  accountRef: string;
  occurredAt: number;
  price: number;
  provider: "ibkr" | "kraken";
  quantity: number;
  side: "buy" | "sell";
  symbol: string;
  externalExecutionId: string | null;
}) {
  if (input.externalExecutionId) return { kind: "native", value: input.externalExecutionId };
  return { kind: "hash", value: `${input.provider}|${input.accountRef}|${input.symbol}|${input.side}|${input.quantity}|${input.price}|${input.occurredAt}` };
}
```

Use this identity before creating `externalExecutions` and `trades` rows.

**Step 4: Run checks**

Run: `pnpm test src/lib/imports/importIngestion.test.ts && pnpm typecheck`  
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/lib/importIngestion.ts convex/trades.ts src/lib/imports/importIngestion.test.ts
git commit -m "feat: add idempotent import ingestion service"
```

### Task 8: Add Convex APIs For Sync + Inbox Review

**Files:**
- Create: `convex/imports.ts`
- Modify: `convex/trades.ts`
- Test: `src/lib/imports/inboxState.test.ts`

**Step 1: Write failing tests for inbox transition helpers**

```ts
it("marks inbox row reviewed when user saves linkage", () => {
  // helper should set inboxStatus=reviewed
});
```

**Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/imports/inboxState.test.ts`  
Expected: FAIL.

**Step 3: Implement minimal Convex functions**

Add:
- `imports.syncNow` mutation/action (per connection or all)
- `imports.listInboxRows` query (`inboxStatus = pending_review`)
- `imports.listImportErrors` query
- `imports.reviewImportedTrade` mutation to set `tradePlanId` and/or `campaignId`, then `inboxStatus=reviewed`

**Step 4: Run checks**

Run: `pnpm typecheck && pnpm lint`  
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/imports.ts convex/trades.ts src/lib/imports/inboxState.test.ts
git commit -m "feat: add sync and inbox review convex APIs"
```

### Task 9: Enforce Linkage Validation Rules

**Files:**
- Modify: `convex/trades.ts`
- Modify: `convex/campaigns.ts`
- Test: `src/lib/imports/linkageValidation.test.ts`

**Step 1: Write failing tests**

```ts
it("allows direct campaignId only when tradePlanId is unset", () => {
  // tradePlanId + campaignId direct should reject unless campaign derives from plan
});

it("includes directly linked campaign trades in campaign PL queries", () => {
  // campaign analytics should include both plan-derived and direct campaign links
});
```

**Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/imports/linkageValidation.test.ts`  
Expected: FAIL.

**Step 3: Implement minimal validation + analytics updates**

- In trade create/update/review mutations, enforce direct `campaignId` path only when no `tradePlanId`.
- In campaign metrics queries, include trades directly linked via `campaignId`.

**Step 4: Run checks**

Run: `pnpm test src/lib/imports/linkageValidation.test.ts && pnpm typecheck`  
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/trades.ts convex/campaigns.ts src/lib/imports/linkageValidation.test.ts
git commit -m "feat: validate direct campaign linkage and include in analytics"
```

### Task 10: Build Import Inbox Page

**Files:**
- Create: `src/app/imports/page.tsx`
- Create: `src/components/imports/import-inbox-table.tsx`
- Create: `src/components/imports/import-sync-controls.tsx`
- Test: `src/components/imports/import-inbox-table.test.tsx`

**Step 1: Write failing component test**

```tsx
it("renders pending imported trades with suggestion and editable selectors", () => {
  // render table rows with suggested trade plan and blank campaign by default
});
```

**Step 2: Run test to verify failure**

Run: `pnpm test src/components/imports/import-inbox-table.test.tsx`  
Expected: FAIL.

**Step 3: Implement minimal UI**

- Table columns: provider, account, symbol, side, qty, price, time, suggested plan, selected plan, selected campaign, actions.
- Action button saves row via `imports.reviewImportedTrade`.
- Campaign selector starts blank when no selected plan.

**Step 4: Run checks**

Run: `pnpm test src/components/imports/import-inbox-table.test.tsx && pnpm typecheck`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/imports/page.tsx src/components/imports/import-inbox-table.tsx src/components/imports/import-sync-controls.tsx src/components/imports/import-inbox-table.test.tsx
git commit -m "feat: add import inbox page with review actions"
```

### Task 11: Add Navigation + Trades Page Integration

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/app/trades/page.tsx`

**Step 1: Write failing UI expectations**

Use component test to assert `Import Inbox` nav link renders and trades page can deep-link to inbox.

**Step 2: Run test to verify failure**

Run: `pnpm test src/components/Header.test.tsx`  
Expected: FAIL (missing new link/test file initially).

**Step 3: Implement minimal updates**

- Add `{ href: "/imports", label: "Import Inbox" }` to header links.
- Add CTA near manual trade creation: `Go to Import Inbox`.

**Step 4: Run checks**

Run: `pnpm lint && pnpm typecheck`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/Header.tsx src/app/trades/page.tsx src/components/Header.test.tsx
git commit -m "feat: wire import inbox into app navigation"
```

### Task 12: Add Scheduled Sync Job Entrypoint

**Files:**
- Create: `convex/crons.ts`
- Modify: `convex/imports.ts`
- Test: `src/lib/imports/schedule.test.ts`

**Step 1: Write failing schedule tests**

```ts
it("registers a 15-minute sync for active brokerage connections", () => {
  // verify cron expression or schedule interval config
});
```

**Step 2: Run tests to verify failure**

Run: `pnpm test src/lib/imports/schedule.test.ts`  
Expected: FAIL.

**Step 3: Implement minimal schedule**

- Define Convex cron every 15 minutes calling an internal sync function.
- Ensure sync function skips inactive/disconnected connections.

**Step 4: Run checks**

Run: `pnpm typecheck && pnpm lint`  
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/crons.ts convex/imports.ts src/lib/imports/schedule.test.ts
git commit -m "feat: add scheduled 15-minute import sync"
```

### Task 13: Development Data Reset Guardrail (No Migration Path)

**Files:**
- Modify: `README.md`
- Create: `docs/plans/import-dev-reset.md`

**Step 1: Write failing docs check (manual)**

Confirm no docs explain expected behavior when breaking Convex schema changes block deploy due existing data.

**Step 2: Run verification command**

Run: `rg -n "Convex schema|delete existing development data|import inbox" README.md docs -S`  
Expected: Missing or incomplete guidance.

**Step 3: Implement minimal docs update**

Add a short section:
- In early development, delete existing dev rows when schema-breaking changes are introduced.
- No migration guarantee for pre-import data.

**Step 4: Verify docs presence**

Run: `rg -n "delete existing development data" README.md docs/plans/import-dev-reset.md -S`  
Expected: Matches found.

**Step 5: Commit**

```bash
git add README.md docs/plans/import-dev-reset.md
git commit -m "docs: add dev-data reset guidance for schema-breaking import work"
```

### Task 14: Final Verification And Integration Checkpoint

**Files:**
- Modify: `docs/plans/2026-02-16-brokerage-import-implementation-plan.md` (checklist updates only)

**Step 1: Run full verification suite**

Run:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

Expected: PASS for all configured checks.

**Step 2: Run Convex dev smoke check**

Run: `npx convex dev --once`  
Expected: Schema compiles, functions register without errors.

**Step 3: Manual UX smoke test**

- Connect mock connection.
- Trigger `Sync now`.
- Confirm imported rows appear in `/imports` as `pending_review`.
- Confirm suggestion prefill appears only for `tradePlanId`.
- Confirm `campaignId` is blank unless selected or derived from chosen plan.

**Step 4: Record outcomes in plan file**

- Mark each task complete.
- Add discovered follow-ups (if any) under `Post-Implementation Notes`.

**Step 5: Commit**

```bash
git add docs/plans/2026-02-16-brokerage-import-implementation-plan.md
git commit -m "chore: finalize brokerage import implementation verification"
```

## Cross-Cutting Implementation Notes

- Keep broker API clients behind connector boundaries; Convex functions call connector interfaces only.
- Keep IBKR-specific timeout/pacing/session logic isolated to `ibkr.ts`.
- Avoid introducing TradingView ingestion in this plan.
- Every imported trade must enter inbox review (`pending_review`) before considered done.
- Suggest exactly one `tradePlanId` or none; do not rank candidates.
- Never suggest `campaignId` directly.

## Execution Order

1. Task 1-2 (test foundation + suggestion engine)
2. Task 3-4 (schema + contracts)
3. Task 5-8 (connectors + ingestion + APIs)
4. Task 9-12 (linkage rules + UI + cron)
5. Task 13-14 (docs + final verification)
