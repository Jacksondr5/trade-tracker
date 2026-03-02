Feature list:

I want to be able to mark campaigns or trade plans as watch-listed.

Acceptance criteria:
1) Watch-listed items are visually prominent on dashboard and list/detail views (star icon + consistent border/background treatment).
2) Provide short contextual dashboard/tooltip copy for watch-listed items (1–2 sentences, <=120 characters).
3) Define a reusable watch-list style set (icon, border/background classes, accessible contrast variants meeting WCAG AA).
4) Optional style variants are available for list rows, detail badges, and summary widgets, with consistent appearance across campaigns and trade plans.
5) Verification: render examples on dashboard/list/detail/summary surfaces and confirm contrast/copy requirements.

## ShadCN Component Additions

### 1. Table

Add `npx shadcn@latest add table` to get Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption.

Every data page has a hand-rolled `<table>` with manual Tailwind styling. There are 10 tables across 9 files:
- `imports/components/inbox-table.tsx` (most complex: 12 columns, inline editing, selects, validation)
- `trades/TradesPageClient.tsx` (11 columns with inline edit row)
- `campaigns/CampaignsPageClient.tsx`
- `campaigns/[id]/CampaignDetailPageClient.tsx` (trades sub-table)
- `trade-plans/[id]/TradePlanDetailPageClient.tsx` (trades sub-table)
- `positions/PositionsPageClient.tsx`
- `portfolio/PortfolioPageClient.tsx`
- `portfolio/[id]/PortfolioDetailPageClient.tsx` (two tables: trades + campaigns)
- `accounts/AccountsPageClient.tsx`

Standardizing on the ShadCN Table would unify styling and reduce boilerplate. Migrate one table first (e.g. positions, which is simplest) to prove the pattern, then roll out to the rest.

### 2. Select

Add `npx shadcn@latest add select` to get Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel.

There are 11+ raw `<select>` elements across the app. The existing `FieldSelect` component only works inside TanStack form contexts. A standalone Select component would cover both form and non-form uses:
- Status filters (campaigns, trade plans)
- Portfolio pickers (inbox table, trade plan detail, new trade)
- Trade plan pickers (inbox table, new trade)
- Rows-per-page (trades pagination)
- Brokerage source (upload section)

After adding the ShadCN Select, rebuild `FieldSelect` on top of it so there's one underlying Select primitive.

### 3. Tooltip

Add `npx shadcn@latest add tooltip` to get Tooltip, TooltipTrigger, TooltipContent, TooltipProvider.

The app uses icon buttons extensively (per CLAUDE.md guidance) but relies on HTML `title` attributes for hover descriptions. Proper Tooltip components would improve accessibility (screen readers, keyboard focus) and visual consistency. Locations using `title` today:
- `imports/components/inbox-table.tsx` — Accept, Edit, Delete buttons
- `portfolio/[id]/PortfolioDetailPageClient.tsx` — Save, Confirm delete, Cancel buttons
- `components/NotesSection.tsx` — Edit, Save, Cancel, Delete buttons
- `accounts/AccountsPageClient.tsx` — Edit, Delete buttons

Wrap the app in a `TooltipProvider` (likely in the root layout) and replace `title` props with Tooltip components.

### 4. Skeleton

Add `npx shadcn@latest add skeleton` to get the Skeleton component.

The dashboard (`src/app/page.tsx`) has hand-rolled skeleton loaders using `animate-pulse rounded bg-slate-700` divs (lines 25-46). A Skeleton component would make loading states trivial to add across any page. Currently only the dashboard has skeleton loading; the inbox table falls back to a plain "Loading..." text string.

V2 should definitely include trade capabilities - mainly pulling from the brokerages. This will become a lot more valuable and let me keep track of things long term. Some other features that I need to prioritize include:

- Analytics - need to be able to tell things like profit/loss, win/loss ratio, comparison to various benchmarks
- Automatic trade execution - there may be a case where I can't set a stop-loss exactly how I want to (mainly on break of a trend line). This would give me a way to automate exiting a position in certain cases. I need to think more about this though because it's pretty poorly defined requirement
- Alerts - not necessarily sending me a notification but bringing my attention (likely on dashboard) if a certain trade is close to its stop-loss or close to some kind of other exit condition (any exit condition other than stop-loss)
