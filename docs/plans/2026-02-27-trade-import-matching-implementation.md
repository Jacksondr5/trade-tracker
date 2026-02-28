# Trade Import Matching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-match imported trades to trade plans by instrument symbol, show inbox trade suggestions on the trade plan detail page, and add a quick-create trade plan form to the inbox.

**Architecture:** Extract auto-match as a pure function tested with vitest. Add a new Convex query for inbox trade suggestions. Frontend changes are additive to existing components — no structural rewrites.

**Tech Stack:** Convex (backend mutations/queries), Next.js App Router (frontend), vitest (tests), Zod (validation)

---

### Task 1: Extract auto-match pure function with tests

**Files:**
- Create: `shared/imports/auto-match.ts`
- Create: `shared/imports/auto-match.test.ts`

**Step 1: Write the failing tests**

Create `shared/imports/auto-match.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { findAutoMatchTradePlanId } from "./auto-match";

interface TradePlanMatch {
  id: string;
  instrumentSymbol: string;
}

describe("findAutoMatchTradePlanId", () => {
  const plans: TradePlanMatch[] = [
    { id: "plan1", instrumentSymbol: "AAPL" },
    { id: "plan2", instrumentSymbol: "MSFT" },
    { id: "plan3", instrumentSymbol: "GOOG" },
  ];

  it("returns the plan ID when exactly one plan matches the ticker", () => {
    expect(findAutoMatchTradePlanId("AAPL", plans)).toBe("plan1");
  });

  it("returns undefined when no plan matches the ticker", () => {
    expect(findAutoMatchTradePlanId("TSLA", plans)).toBeUndefined();
  });

  it("returns undefined when multiple plans match the ticker", () => {
    const plansWithDuplicate = [
      ...plans,
      { id: "plan4", instrumentSymbol: "AAPL" },
    ];
    expect(findAutoMatchTradePlanId("AAPL", plansWithDuplicate)).toBeUndefined();
  });

  it("returns undefined when ticker is undefined", () => {
    expect(findAutoMatchTradePlanId(undefined, plans)).toBeUndefined();
  });

  it("returns undefined when ticker is empty string", () => {
    expect(findAutoMatchTradePlanId("", plans)).toBeUndefined();
  });

  it("matches case-insensitively", () => {
    expect(findAutoMatchTradePlanId("aapl", plans)).toBe("plan1");
  });

  it("returns undefined when plans array is empty", () => {
    expect(findAutoMatchTradePlanId("AAPL", [])).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test shared/imports/auto-match.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `shared/imports/auto-match.ts`:

```typescript
interface TradePlanMatch {
  id: string;
  instrumentSymbol: string;
}

/**
 * Returns the trade plan ID if exactly one open plan matches the ticker.
 * Returns undefined if zero or multiple plans match.
 */
export function findAutoMatchTradePlanId(
  ticker: string | undefined,
  openPlans: TradePlanMatch[],
): string | undefined {
  if (!ticker) return undefined;

  const normalizedTicker = ticker.toUpperCase();
  const matches = openPlans.filter(
    (p) => p.instrumentSymbol.toUpperCase() === normalizedTicker,
  );

  return matches.length === 1 ? matches[0].id : undefined;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test shared/imports/auto-match.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add shared/imports/auto-match.ts shared/imports/auto-match.test.ts
git commit -m "feat: add auto-match pure function with tests"
```

---

### Task 2: Integrate auto-match into importTrades mutation

**Files:**
- Modify: `convex/imports.ts` — the `importTrades` handler (lines 178-288)

**Step 1: Add the auto-match call to importTrades**

In `convex/imports.ts`, inside the `handler` of `importTrades` (after line 190 where `existingPendingInboxTrades` is fetched), add a query for open trade plans and build the match list:

```typescript
// After line 190, add:
const openTradePlans = [
  ...(await ctx.db
    .query("tradePlans")
    .withIndex("by_owner_status", (q) =>
      q.eq("ownerId", ownerId).eq("status", "active"),
    )
    .collect()),
  ...(await ctx.db
    .query("tradePlans")
    .withIndex("by_owner_status", (q) =>
      q.eq("ownerId", ownerId).eq("status", "idea"),
    )
    .collect()),
  ...(await ctx.db
    .query("tradePlans")
    .withIndex("by_owner_status", (q) =>
      q.eq("ownerId", ownerId).eq("status", "watching"),
    )
    .collect()),
];

const tradePlanMatchList = openTradePlans.map((p) => ({
  id: p._id as string,
  instrumentSymbol: p.instrumentSymbol,
}));
```

Then inside the per-trade loop, after the existing `tradePlanId` ownership check block (line 251), add auto-match for trades without a pre-set plan:

```typescript
// After the trade.tradePlanId ownership check block, add:
let resolvedTradePlanId = trade.tradePlanId;
if (resolvedTradePlanId === undefined && validation.normalizedTicker) {
  const autoMatchId = findAutoMatchTradePlanId(
    validation.normalizedTicker,
    tradePlanMatchList,
  );
  if (autoMatchId) {
    resolvedTradePlanId = autoMatchId as Id<"tradePlans">;
  }
}
```

Update the `ctx.db.insert` call (line 279) to use `resolvedTradePlanId` instead of `trade.tradePlanId`:

```typescript
tradePlanId: resolvedTradePlanId,
```

Add the import at the top of the file:

```typescript
import { findAutoMatchTradePlanId } from "../shared/imports/auto-match";
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add convex/imports.ts
git commit -m "feat: auto-match trades to trade plans on import"
```

---

### Task 3: Sort trade plan dropdown by ticker match in inbox table

**Files:**
- Modify: `src/app/imports/components/inbox-table.tsx` — the trade plan `<select>` (lines 208-223)

**Step 1: Add sorted options logic**

Replace the trade plan `<select>` block (lines 208-223) with a version that groups matching plans first. The trade's ticker is available as `trade.ticker`.

```tsx
<td className="px-4 py-3 text-sm">
  <select
    value={inlineTradePlanIds[trade._id] ?? ""}
    onChange={(e) =>
      onInlineTradePlanChange(trade._id, e.target.value)
    }
    className="text-slate-12 h-7 w-full min-w-[120px] rounded border border-slate-600 bg-slate-700 px-1 text-xs"
  >
    <option value="">None</option>
    {(() => {
      const ticker = trade.ticker?.toUpperCase();
      const matching = openTradePlans?.filter(
        (p) => p.instrumentSymbol.toUpperCase() === ticker,
      ) ?? [];
      const rest = openTradePlans?.filter(
        (p) => p.instrumentSymbol.toUpperCase() !== ticker,
      ) ?? [];
      return (
        <>
          {matching.length > 0 && (
            <optgroup label="Matching plans">
              {matching.map((plan) => (
                <option key={plan._id} value={plan._id}>
                  {plan.name} ({plan.instrumentSymbol})
                </option>
              ))}
            </optgroup>
          )}
          {rest.length > 0 && (
            <optgroup label={matching.length > 0 ? "Other plans" : "Trade plans"}>
              {rest.map((plan) => (
                <option key={plan._id} value={plan._id}>
                  {plan.name} ({plan.instrumentSymbol})
                </option>
              ))}
            </optgroup>
          )}
        </>
      );
    })()}
  </select>
</td>
```

**Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/imports/components/inbox-table.tsx
git commit -m "feat: sort trade plan dropdown with matching plans first"
```

---

### Task 4: Add listInboxTradesForTradePlan query

**Files:**
- Modify: `convex/imports.ts` — add new query after `listInboxTrades` (after line 307)

**Step 1: Add the query**

After the `listInboxTrades` query in `convex/imports.ts`, add:

```typescript
export const listInboxTradesForTradePlan = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.array(
    v.object({
      inboxTrade: inboxTradeValidator,
      matchType: v.union(v.literal("assigned"), v.literal("suggested")),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    assertOwner(tradePlan, ownerId, "Trade plan not found");

    const pendingTrades = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "pending_review"),
      )
      .collect();

    const normalizedSymbol = tradePlan.instrumentSymbol.toUpperCase();

    return pendingTrades
      .filter((t) => {
        if (t.tradePlanId === args.tradePlanId) return true;
        if (
          !t.tradePlanId &&
          t.ticker?.toUpperCase() === normalizedSymbol
        )
          return true;
        return false;
      })
      .map((t) => ({
        inboxTrade: t,
        matchType: (t.tradePlanId === args.tradePlanId
          ? "assigned"
          : "suggested") as "assigned" | "suggested",
      }));
  },
});
```

You will also need to add or locate the `inboxTradeValidator` — check if one exists already. If not, create it near the top of the file following the same pattern as `tradeValidator` in `convex/trades.ts`. It should match the `inboxTrades` schema shape.

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add convex/imports.ts
git commit -m "feat: add listInboxTradesForTradePlan query"
```

---

### Task 5: Show inbox trade suggestions on trade plan detail page

**Files:**
- Modify: `src/app/trade-plans/[id]/page.tsx` — add preloaded queries for inbox trades and portfolios
- Modify: `src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx` — add pending trade rows to the trades table

**Step 1: Update server component to preload new data**

In `src/app/trade-plans/[id]/page.tsx`, add two more preloaded queries to the `Promise.all`:

```typescript
const [
  preloadedTradePlan,
  preloadedNotes,
  preloadedAllTrades,
  preloadedAccountMappings,
  preloadedInboxTradesForPlan,
  preloadedPortfolios,
] = await Promise.all([
  preloadQuery(api.tradePlans.getTradePlan, { tradePlanId }, { token }),
  preloadQuery(api.notes.getNotesByTradePlan, { tradePlanId }, { token }),
  preloadQuery(api.trades.listTrades, {}, { token }),
  preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
  preloadQuery(api.imports.listInboxTradesForTradePlan, { tradePlanId }, { token }),
  preloadQuery(api.portfolios.listPortfolios, {}, { token }),
]);
```

Pass the new props to the client component:

```tsx
<TradePlanDetailPageClient
  tradePlanId={tradePlanId}
  preloadedTradePlan={preloadedTradePlan}
  preloadedNotes={preloadedNotes}
  preloadedAllTrades={preloadedAllTrades}
  preloadedAccountMappings={preloadedAccountMappings}
  preloadedInboxTradesForPlan={preloadedInboxTradesForPlan}
  preloadedPortfolios={preloadedPortfolios}
/>
```

**Step 2: Update client component props and data**

In `TradePlanDetailPageClient.tsx`, add the new preloaded props and consume them:

```typescript
// Add to props interface:
preloadedInboxTradesForPlan: Preloaded<typeof api.imports.listInboxTradesForTradePlan>;
preloadedPortfolios: Preloaded<typeof api.portfolios.listPortfolios>;

// Add to component body:
const inboxTradesForPlan = usePreloadedQuery(preloadedInboxTradesForPlan);
const portfolios = usePreloadedQuery(preloadedPortfolios);
const acceptTrade = useMutation(api.imports.acceptTrade);
```

Add local state for portfolio selection on pending rows:

```typescript
const [pendingPortfolioIds, setPendingPortfolioIds] = useState<Record<string, string>>({});
```

**Step 3: Add pending trade rows to the trades table**

In the trades table body (around line 299), render inbox trade rows above the existing accepted trades. Each pending row should:

- Have a distinct background (e.g., `bg-blue-900/20` or similar subtle tint)
- Show a `Badge` in the first column area:
  - `variant="info"` with text "Suggested" for `matchType === "suggested"`
  - `variant="neutral"` with text "Pending" for `matchType === "assigned"`
- Display the same columns: Date, Ticker, Account, Side, Qty, Price
- Replace the P&L column with a portfolio `<select>` and an accept `<button>`:

```tsx
{inboxTradesForPlan.map(({ inboxTrade, matchType }) => (
  <tr
    key={inboxTrade._id}
    className="border-b border-slate-700 bg-blue-900/20"
  >
    <td className="px-4 py-3 text-sm">
      {inboxTrade.date
        ? new Date(inboxTrade.date).toLocaleDateString("en-US")
        : "---"}
    </td>
    <td className="px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        {inboxTrade.ticker ?? "---"}
        <Badge variant={matchType === "suggested" ? "info" : "neutral"}>
          {matchType === "suggested" ? "Suggested" : "Pending"}
        </Badge>
      </div>
    </td>
    <td className="px-4 py-3 text-sm">
      {accountLabelByKey.get(inboxTrade.brokerageAccountId ?? "") ??
        inboxTrade.brokerageAccountId ??
        "---"}
    </td>
    <td className="px-4 py-3 text-sm">{inboxTrade.side ?? "---"}</td>
    <td className="px-4 py-3 text-sm">{inboxTrade.quantity ?? "---"}</td>
    <td className="px-4 py-3 text-sm">
      {inboxTrade.price ? formatCurrency(inboxTrade.price) : "---"}
    </td>
    <td className="px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <select
          value={pendingPortfolioIds[inboxTrade._id] ?? ""}
          onChange={(e) =>
            setPendingPortfolioIds((prev) => ({
              ...prev,
              [inboxTrade._id]: e.target.value,
            }))
          }
          className="text-slate-12 h-7 rounded border border-slate-600 bg-slate-700 px-1 text-xs"
        >
          <option value="">None</option>
          {portfolios?.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Accept trade"
          onClick={() => {
            const portfolioId = pendingPortfolioIds[inboxTrade._id] || undefined;
            void acceptTrade({
              inboxTradeId: inboxTrade._id,
              tradePlanId: tradePlanId,
              portfolioId: portfolioId
                ? (portfolioId as Id<"portfolios">)
                : undefined,
            });
          }}
          className="rounded p-1.5 text-green-400 hover:bg-green-900/50"
          title="Accept trade"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    </td>
  </tr>
))}
```

Add needed imports: `Badge` from `~/components/ui`, `Check` from `lucide-react`, `formatCurrency` from `~/lib/format`, `useState` from `react`.

**Step 4: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/trade-plans/[id]/page.tsx src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx
git commit -m "feat: show inbox trade suggestions on trade plan detail page"
```

---

### Task 6: Add quick-create trade plan form to inbox

**Files:**
- Modify: `src/app/imports/components/inbox-table.tsx` — add quick-create button and inline form
- Modify: `src/app/imports/ImportsPageClient.tsx` — add campaigns query and createTradePlan mutation
- Modify: `src/app/imports/page.tsx` — preload campaigns

**Step 1: Update server component to preload campaigns**

In `src/app/imports/page.tsx`, add `listCampaigns` to the `Promise.all`:

```typescript
const [
  preloadedInboxTrades,
  preloadedOpenTradePlans,
  preloadedAccountMappings,
  preloadedPortfolios,
  preloadedCampaigns,
] = await Promise.all([
  preloadQuery(api.imports.listInboxTrades, {}, { token }),
  preloadQuery(api.tradePlans.listOpenTradePlans, {}, { token }),
  preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
  preloadQuery(api.portfolios.listPortfolios, {}, { token }),
  preloadQuery(api.campaigns.listCampaigns, {}, { token }),
]);
```

Pass `preloadedCampaigns` to `ImportsPageClient`.

**Step 2: Wire up mutations in ImportsPageClient**

In `ImportsPageClient.tsx`, add:

```typescript
// Props:
preloadedCampaigns: Preloaded<typeof api.campaigns.listCampaigns>;

// In component body:
const campaigns = usePreloadedQuery(preloadedCampaigns);
const createTradePlan = useMutation(api.tradePlans.createTradePlan);
```

Pass `campaigns` and a `onQuickCreateTradePlan` callback to `InboxTable`. The callback should:
1. Call `createTradePlan` with name, instrumentSymbol, and optional campaignId
2. On success, set the new plan's ID as the inline trade plan selection for that inbox trade
3. Persist the selection via `updateInboxTrade`

**Step 3: Add quick-create UI to inbox table**

In `inbox-table.tsx`, add a small "+" button next to the trade plan `<select>`. When clicked, it opens a popover or inline form below the dropdown with:

- **Name** — text input (required)
- **Instrument** — text input, pre-filled with `trade.ticker` (required)
- **Campaign** — `<select>` dropdown with "None" + all active/planning campaigns

The form needs: a "Create" submit button and a "Cancel" button. On submit, call the `onQuickCreateTradePlan` callback.

Add to `InboxTableProps`:

```typescript
campaigns: Array<{ _id: Id<"campaigns">; name: string; status: string }> | undefined;
onQuickCreateTradePlan: (
  inboxTradeId: Id<"inboxTrades">,
  args: { name: string; instrumentSymbol: string; campaignId?: Id<"campaigns"> },
) => Promise<void>;
```

Track which trade row has the quick-create form open via local state:

```typescript
const [quickCreateTradeId, setQuickCreateTradeId] = useState<Id<"inboxTrades"> | null>(null);
```

**Step 4: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/imports/page.tsx src/app/imports/ImportsPageClient.tsx src/app/imports/components/inbox-table.tsx
git commit -m "feat: add quick-create trade plan from inbox"
```

---

### Task 7: Manual verification

**Step 1: Start dev servers**

Run Convex dev server and Next.js dev server.

**Step 2: Test auto-match**

1. Create a trade plan for a specific ticker (e.g., AAPL) with status "active"
2. Import a CSV containing an AAPL trade
3. Verify the inbox trade auto-selects the AAPL trade plan

**Step 3: Test multiple-match behavior**

1. Create a second trade plan for AAPL
2. Import another AAPL trade
3. Verify the inbox trade does NOT auto-select (multiple matches)
4. Verify the dropdown shows both AAPL plans in the "Matching plans" optgroup

**Step 4: Test trade plan detail suggestions**

1. Navigate to the AAPL trade plan detail page
2. Verify inbox trades for AAPL appear inline with "Suggested" or "Pending" badges
3. Select a portfolio and click accept
4. Verify the trade moves from pending to accepted in the table

**Step 5: Test quick-create from inbox**

1. Import a trade for a ticker with no existing trade plan
2. Click the "+" button next to the trade plan dropdown
3. Fill in name, verify instrument is pre-filled, select a campaign
4. Submit and verify the new plan is auto-selected on the inbox trade

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```
