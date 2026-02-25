Portfolio Redesign: Trade Grouping Categories

Context

The current portfolio feature (portfolioSnapshots table) is a manual value-tracking system — users record point-in-time total portfolio values with no connection to trades. This is being replaced with a new
concept where portfolios are categories for grouping trades by goal (e.g., long-term, swing, etc.). Portfolios have only a name. Trades optionally link to a portfolio. The portfolio detail page shows
associated trades and derived campaigns.

User decisions:

- Deleting a portfolio unlinks its trades (sets portfolioId to null)
- Campaigns shown on portfolio detail page are derived (through trades -> trade plans -> campaigns), no direct link
- portfolioSnapshots table is retained in schema (`recordedAt`, `value`) for historical compatibility

---

Step 1: Schema Changes

File: convex/schema.ts

- Add portfolios table:
  portfolios: defineTable({
  name: v.string(),
  ownerId: v.string(),
  }).index("by_owner", ["ownerId"])
- Add portfolioId: v.optional(v.id("portfolios")) to trades table
- Add index by_owner_portfolioId on trades: ["ownerId", "portfolioId"]
- Add portfolioId: v.optional(v.id("portfolios")) to inboxTrades table
- Keep portfolioSnapshots table definition (owner-scoped snapshots with `recordedAt` and `value`)

Step 2: Backend — New Portfolio Functions

New file: convex/portfolios.ts

- createPortfolio({ name }) — mutation, validates name not empty, inserts with ownerId
- listPortfolios() — query, returns all portfolios for owner with trade count (query trades by portfolioId index)
- getPortfolio({ portfolioId }) — query, returns single portfolio with ownership check
- updatePortfolio({ portfolioId, name }) — mutation, validates name (same pattern as campaign name validation: max 120 chars, trimmed, non-empty)
- deletePortfolio({ portfolioId }) — mutation, unlinks all trades with this portfolioId (patch to remove portfolioId), then deletes portfolio
- getPortfolioDetail({ portfolioId }) — query, returns portfolio + trades (with P&L) + derived campaigns:
  - Get all trades with this portfolioId
  - Calculate P&L using existing calculateTradesPL from convex/lib/plCalculation.ts
  - Collect unique tradePlanIds from trades, look up trade plans, collect unique campaignIds, look up campaigns
  - Return { portfolio, trades, campaigns }

Step 3: Backend — Modify Trade Functions

File: convex/trades.ts

- createTrade: Add portfolioId: v.optional(v.id("portfolios")) to args, validate ownership if provided, include in insert
- updateTrade: Add portfolioId: v.optional(v.union(v.id("portfolios"), v.null())) to args, handle in patch (same pattern as tradePlanId — null means unlink)
- tradeWithPLValidator: Add portfolioId: v.optional(v.id("portfolios")) field
- listTrades: Include portfolioId in returned data (already included via spread, just needs validator update)

Step 4: Backend — Modify Import Functions

File: convex/imports.ts

- inboxTradeValidator: Add portfolioId: v.optional(v.id("portfolios"))
- acceptInboxTradeInternal: Pass portfolioId from inboxTrade to the created trade (same pattern as tradePlanId)
- acceptTrade: Add portfolioId to args (optional), allow overriding during acceptance
- updateInboxTrade: Add portfolioId: v.optional(v.union(v.id("portfolios"), v.null())) to args, handle in patch
- importTrades: Add portfolioId to trade candidate args (optional)

Step 5: Backend — Remove Old Portfolio Code

- Keep `portfolioSnapshots` schema support for compatibility; if snapshot APIs are deprecated, remove them in a separate migration PR

Step 6: Frontend — Portfolio List Page

Replace files in src/app/portfolio/

- page.tsx (server): Preload api.portfolios.listPortfolios, render client component
- PortfolioPageClient.tsx (replace):
  - List page following campaigns list pattern
  - Header: "Portfolios" title + "New Portfolio" button
  - Table: Name, Trade Count columns
  - Clicking a row navigates to /portfolio/[id]
  - Empty state: "No portfolios yet."
  - Inline "create portfolio" form (name input + save) rather than a separate /new page — keeps it simple since portfolios only have a name

Step 7: Frontend — Portfolio Detail Page

New files: src/app/portfolio/[id]/page.tsx and PortfolioDetailPageClient.tsx (patterned after CampaignDetailPageClient.tsx)

- page.tsx (server): Extract id from params, preload portfolio detail query
- PortfolioDetailPageClient.tsx:
  - Back link: "← Back to Portfolios"
  - Header section: Editable name (same pattern as campaign name — input + save button with save state indicator)
  - Delete button with confirmation
  - Trades section: Table showing associated trades (Date, Ticker, Side, Direction, Price, Qty, P&L) — reuse same table pattern from campaign detail
  - Campaigns section: Derived campaigns list (Name, Status, Trade Count in this portfolio) — each links to /campaigns/[id]

Step 8: Frontend — Add Portfolio Selector to Trade Forms

File: src/app/trades/new/NewTradePageClient.tsx

- Add portfolio selector dropdown (same pattern as trade plan selector)
- Preload api.portfolios.listPortfolios and pass to client
- Add portfolioId field to form schema and default values
- Pass portfolioId to createTrade mutation

File: src/app/trades/components/edit-trade-form.tsx

- Add portfolioId to EditTradeFormValues and schema
- Add portfolio selector dropdown (FieldSelect)
- Accept portfolios prop (list of { \_id, name })
- Pass portfolioId to updateTrade mutation

File: src/app/trades/TradesPageClient.tsx

- Query portfolios list, pass to EditTradeForm
- Show portfolio name in trade table (add Portfolio column)
- Pass portfolio info when opening edit form

Step 9: Frontend — Add Portfolio Selector to Import Inbox

File: src/app/imports/components/inbox-table.tsx

- Add inline portfolio selector (same pattern as trade plan selector — a <select> in the table)
- Accept portfolios prop

File: src/app/imports/ImportsPageClient.tsx

- Query portfolios, pass to InboxTable
- Add inlinePortfolioIds state and handler (same pattern as inlineTradePlanIds)
- Update onInlinePortfolioChange to call updateInboxTrade with portfolioId

File: src/app/imports/types.ts

- Add portfolioId to InboxTrade type if needed

Step 10: Frontend — Navigation Update

File: src/components/Header.tsx

- Change label from "Portfolio" to "Portfolios" (href stays /portfolio)

---

Files to Modify (Summary)

┌──────────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────┐
│ File │ Action │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ convex/schema.ts │ Add portfolios table, add portfolioId to trades/inboxTrades, remove portfolioSnapshots │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ convex/portfolios.ts │ New — CRUD + detail query │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ convex/portfolioSnapshots.ts │ Delete │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ convex/trades.ts │ Add portfolioId to create/update/validator │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ convex/imports.ts │ Add portfolioId to inbox trade handling │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/portfolio/page.tsx │ Replace — server preload for list │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/portfolio/PortfolioPageClient.tsx │ Replace — list page with inline create │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/portfolio/[id]/page.tsx │ New — server preload for detail │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/portfolio/[id]/PortfolioDetailPageClient.tsx │ New — detail page │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/trades/new/NewTradePageClient.tsx │ Add portfolio selector │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/trades/new/page.tsx │ Preload portfolios │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/trades/components/edit-trade-form.tsx │ Add portfolio selector │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/trades/TradesPageClient.tsx │ Pass portfolios to edit form, add column │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/trades/page.tsx │ Preload portfolios │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/imports/ImportsPageClient.tsx │ Add portfolio state/handlers │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/imports/components/inbox-table.tsx │ Add portfolio selector column │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/app/imports/page.tsx │ Preload portfolios │
├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ src/components/Header.tsx │ Rename "Portfolio" → "Portfolios" │
└──────────────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────┘

Reusable Code

- P&L calculation: convex/lib/plCalculation.ts → calculateTradesPL() — reuse in getPortfolioDetail
- Auth helpers: convex/lib/auth.ts → requireUser(), assertOwner() — use in all new Convex functions
- Form hook: src/components/ui/use-app-form.ts → useAppForm with FieldInput, FieldSelect, SubmitButton
- Campaign detail pattern: src/app/campaigns/[id]/CampaignDetailPageClient.tsx — reference for editable name, save states, trades table
- Format helpers: src/lib/format.ts → formatCurrency(), formatDate()

Verification

1.  pnpm typecheck — ensure no type errors
2.  pnpm lint — ensure no lint errors
3.  pnpm build — ensure production build succeeds
4.  Manual testing with pnpm dev + npx convex dev:

- Create a portfolio, verify it appears in list
- Edit portfolio name, verify save state feedback
- Create a trade with portfolio selected, verify it shows on portfolio detail
- Edit a trade to change/remove portfolio, verify portfolio detail updates
- Import trades with portfolio selected, verify accepted trades carry portfolioId
- Delete portfolio, verify trades are unlinked (portfolioId cleared)
- Verify derived campaigns section on portfolio detail (link trade to trade plan linked to campaign)
- Verify old portfolio snapshot page is fully replaced
