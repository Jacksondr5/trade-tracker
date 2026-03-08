# Navigation, Shell, And Working Context Issue Breakdown

**Goal:** Break the first near-term roadmap project into a reviewable set of Linear issues before creating tickets.

**Primary sources:** `docs/product/roadmap.md`, `docs/product/navigation-model.md`, `docs/product/ux-principles.md`, `docs/product/glossary.md`

**Current implementation anchors:** `src/app/layout.tsx`, `src/components/Header.tsx`, `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`, `src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx`

---

## Scope For This Project

This project covers the roadmap work needed to make navigation and working context materially better during daily use.

Included:

- Global shell redesign from flat top navigation to grouped desktop sidebar and mobile drawer
- Local hierarchy navigation for campaigns and trade plans
- Watchlist as a cross-cutting focus layer
- Better visibility and movement across `campaign -> trade plan -> trade`
- Cleaner handling of standalone trade plans versus campaign-linked trade plans
- Mobile breadcrumb behavior for campaign and trade-plan detail pages
- Command palette groundwork for direct jumps to known campaigns and trade plans
- Canonical navigation naming and visual-system cleanup on touched surfaces

Explicitly out of scope:

- Strategy redesign
- Notes redesign beyond navigation/context needs
- Deep trade-plan content redesign
- Retrospective workflow design
- Import throughput work
- Analytics and dashboard expansion

## Current State Summary

The app currently uses a flat header navigation in `src/components/Header.tsx` with route-local labels and a simple mobile menu. There is no watchlist model, no local hierarchy rail, no breadcrumb pattern on campaign or trade-plan detail pages, and no command palette. The core object relationships already exist in the data model and route structure, but hierarchy awareness is weak at the shell level and expensive to reconstruct in detail views.

## Recommended Linear Issue Set

### 1. Define the navigation information architecture and implementation contract

**Purpose**

Lock the target structure before UI work fans out.

**Scope**

- Translate `docs/product/navigation-model.md` into an implementation-ready navigation contract
- Define desktop sidebar groups, mobile drawer groups, and local hierarchy behavior
- Define what lives in global navigation versus local hierarchy navigation versus command palette
- Define route naming cleanup needed in this phase, including `Imports`

**Deliverables**

- Short implementation spec in `docs/plans/`
- Agreed navigation data shape for global and local navigation
- List of route labels to normalize during this project

**Notes**

This is the only intentionally design-heavy issue in the project. The remaining issues should implement against it.

### 2. Build the authenticated app shell foundation

**Purpose**

Replace the current flat authenticated shell with a reusable layout that can support the roadmap navigation model.

**Scope**

- Refactor the root authenticated layout away from header-only navigation
- Build the shared desktop sidebar shell
- Build the shared mobile drawer shell
- Preserve Clerk auth controls inside the new shell
- Establish section grouping: `Activity`, `Review`, `Writing`, `Settings`

**Deliverables**

- Shared shell components
- Route config for grouped global navigation
- Desktop and mobile active-state handling

**Likely touch points**

- `src/app/layout.tsx`
- `src/components/Header.tsx`
- new shared shell/navigation components under `src/components/`

### 3. Normalize global navigation labels and touched shell copy

**Purpose**

Apply canonical product language while the shell is being rebuilt.

**Scope**

- Rename route-local navigation labels to match product docs
- Update `Import` to `Imports`
- Align shell wording with `docs/product/content-and-copy-principles.md`
- Check page-level labels exposed directly by the shell for consistency

**Deliverables**

- Consistent navigation labels across desktop and mobile
- Copy cleanup on touched shell surfaces

**Notes**

Keep this narrowly focused on navigation and shell language, not broad copy cleanup.

### 4. Add the watchlist data model and basic mutations

**Purpose**

Create the minimum persistence needed for the cross-cutting focus layer.

**Scope**

- Define the watchlist storage model
- Support watched campaigns and watched trade plans
- Add add/remove/list queries and mutations
- Keep watch state explicitly separate from lifecycle state

**Deliverables**

- Convex schema and backend support for watchlist
- Ownership and authorization behavior consistent with existing domain modules
- Minimal tests for watchlist model behavior

**Notes**

Do not add dashboard or analytics uses of watchlist in this phase.

### 5. Build the campaign and trade-plan hierarchy data layer

**Purpose**

Feed the local rail and mobile local navigation with a coherent hierarchy view.

**Scope**

- Add a backend query that returns watched campaigns, watched trade plans, campaign rows, nested child trade plans, and standalone trade plans
- Include only the fields needed for navigation
- Make active object expansion and sibling movement cheap for the frontend

**Deliverables**

- Convex query for local hierarchy navigation
- Stable frontend-facing shape for hierarchy rendering

**Notes**

This issue should avoid premature generalization. It exists to support the navigation model, not a generic tree API.

### 6. Build the desktop local hierarchy rail for campaigns and trade plans

**Purpose**

Make the strategic hierarchy visible and browsable during normal desktop use.

**Scope**

- Add a contextual left rail on campaign and trade-plan screens
- Render `Watchlist`, `Campaigns`, and `Standalone Trade Plans`
- Preserve expansion state locally
- Auto-expand the active campaign
- Expand campaigns with watched child plans
- Keep the rail independently scrollable

**Deliverables**

- Shared local rail component(s)
- Integration on campaign detail and trade-plan detail routes
- Clear active, watched, parent, and child visual states

**Likely touch points**

- `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`
- `src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx`
- new local navigation components

### 7. Add mobile hierarchy navigation with breadcrumbs

**Purpose**

Preserve hierarchy awareness on mobile without forcing a desktop-style two-panel layout.

**Scope**

- Add breadcrumbs on campaign and trade-plan detail pages
- Make parent relationships obvious and tappable
- Expose local hierarchy browsing from mobile navigation
- Keep interaction cost low for upward movement and nearby switching

**Deliverables**

- Shared breadcrumb pattern for hierarchy routes
- Mobile local-navigation behavior consistent with the approved shell model

**Notes**

The exact mechanism can be a unified drawer or a local drawer pattern, but the browsing outcome should match the product docs.

### 8. Improve cross-link visibility across campaign, trade plan, and trade surfaces

**Purpose**

Reduce the cost of moving through the existing hierarchy and seeing related context.

**Scope**

- Improve campaign-to-trade-plan navigation affordances
- Improve trade-plan-to-campaign context visibility
- Improve trade linkage visibility on touched campaign and trade-plan surfaces
- Make parent-child relationships easier to identify near titles and summary areas

**Deliverables**

- Better contextual links and summary treatment on touched detail surfaces
- Reduced need to backtrack through list pages to move between related objects

**Likely touch points**

- `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`
- `src/app/trade-plans/[id]/TradePlanDetailPageClient.tsx`
- possibly touched trade list affordances if needed for direct movement

### 9. Clarify standalone versus campaign-linked trade-plan presentation

**Purpose**

Make optional structure feel intentional instead of unresolved.

**Scope**

- Improve labels and presentation for standalone trade plans
- Make linked trade plans visually and structurally distinct where relevant
- Ensure local navigation and breadcrumbs reflect both cases cleanly
- Avoid implying that standalone plans are broken or incomplete

**Deliverables**

- Consistent standalone-versus-linked treatment across navigation surfaces
- Copy and UI states aligned with `docs/product/glossary.md`

### 10. Implement command palette groundwork for known-object jumps

**Purpose**

Add the first speed layer for power use without trying to solve global search all at once.

**Scope**

- Add `Cmd/Ctrl+K` entry point
- Support jumping to known campaigns and trade plans
- Show enough parent context to disambiguate similarly named trade plans
- Optionally surface watched items first if cheap to implement

**Deliverables**

- Command palette shell and keyboard entry
- Data source limited to campaigns and trade plans
- Navigation behavior that lands on the target route cleanly

**Notes**

Keep the first version narrow. This is not a general search initiative.

### 11. Finish navigation visual-system compliance and touched-state cleanup

**Purpose**

Prevent the shell/navigation project from shipping as a structural improvement with inconsistent UI debt baked in.

**Scope**

- Move touched navigation and hierarchy surfaces onto shared UI primitives where needed
- Eliminate obvious route-local button/input/select patterns introduced or exposed by this project
- Add loading, empty, and skeleton states for new navigation surfaces
- Verify dark-mode styling and Radix token compliance on all touched navigation components

**Deliverables**

- Navigation surfaces aligned with the current shared UI standards
- No new shell or navigation-specific design debt carried forward from this phase

## Recommended Issue Order

1. Define the navigation information architecture and implementation contract
2. Build the authenticated app shell foundation
3. Normalize global navigation labels and touched shell copy
4. Add the watchlist data model and basic mutations
5. Build the campaign and trade-plan hierarchy data layer
6. Build the desktop local hierarchy rail for campaigns and trade plans
7. Add mobile hierarchy navigation with breadcrumbs
8. Improve cross-link visibility across campaign, trade plan, and trade surfaces
9. Clarify standalone versus campaign-linked trade-plan presentation
10. Implement command palette groundwork for known-object jumps
11. Finish navigation visual-system compliance and touched-state cleanup

## Explicit Dependency Map

### Issue 1. Define the navigation information architecture and implementation contract

**Blocks**

- Issue 2
- Issue 6
- Issue 7
- Issue 10

**Why**

These issues all depend on a settled shell structure, navigation data shape, and the division between global navigation, local hierarchy navigation, and command palette behavior.

### Issue 2. Build the authenticated app shell foundation

**Blocked by**

- Issue 1

**Blocks**

- Issue 3
- Issue 6
- Issue 7
- Issue 8
- Issue 10
- Issue 11

**Why**

The shell foundation creates the reusable layout and shared navigation frame that the rest of the project builds into.

### Issue 3. Normalize global navigation labels and touched shell copy

**Blocked by**

- Issue 2

**Blocks**

- nothing hard-blocked

**Why**

This should land on top of the new shell, but it does not need to block the hierarchy or watchlist work once naming decisions are clear.

### Issue 4. Add the watchlist data model and basic mutations

**Blocked by**

- nothing hard-blocked

**Blocks**

- Issue 5
- Issue 6
- Issue 10 if watched-item prioritization is included in v1

**Why**

The project can build shell structure without watchlist persistence, but the hierarchy rail and any watched-item navigation need the underlying model first.

### Issue 5. Build the campaign and trade-plan hierarchy data layer

**Blocked by**

- Issue 4

**Blocks**

- Issue 6
- Issue 7 if mobile local browsing uses the same hierarchy payload
- Issue 10

**Why**

The local rail and command palette should not each invent their own fetching and shaping logic for campaign and trade-plan navigation.

### Issue 6. Build the desktop local hierarchy rail for campaigns and trade plans

**Blocked by**

- Issue 1
- Issue 2
- Issue 4
- Issue 5

**Blocks**

- Issue 8
- Issue 9
- partially informs Issue 11

**Why**

The rail is where the new hierarchy becomes visible in daily use. Cross-link and standalone-versus-linked cleanup will land better once the rail exists.

### Issue 7. Add mobile hierarchy navigation with breadcrumbs

**Blocked by**

- Issue 1
- Issue 2
- Issue 5

**Blocks**

- Issue 9
- partially informs Issue 11

**Why**

Mobile needs the approved shell model and hierarchy shape before breadcrumb and local-navigation behavior can be implemented cleanly.

### Issue 8. Improve cross-link visibility across campaign, trade plan, and trade surfaces

**Blocked by**

- Issue 2

**Strongly prefers after**

- Issue 6

**Blocks**

- nothing hard-blocked

**Why**

Some contextual-link improvements can start once the shell exists, but the final pass should happen after the local rail is in place so the page-level context treatment is coherent.

### Issue 9. Clarify standalone versus campaign-linked trade-plan presentation

**Blocked by**

- Issue 6
- Issue 7

**Blocks**

- nothing hard-blocked

**Why**

This issue depends on seeing how both desktop and mobile hierarchy surfaces represent linked and standalone plans before tightening the presentation and copy.

### Issue 10. Implement command palette groundwork for known-object jumps

**Blocked by**

- Issue 1
- Issue 2
- Issue 5

**Also blocked by**

- Issue 4 if watched-item prioritization is included in v1

**Blocks**

- nothing hard-blocked

**Why**

The command palette needs settled scope, shell entry points, and a reliable campaign/trade-plan navigation data source.

### Issue 11. Finish navigation visual-system compliance and touched-state cleanup

**Blocked by**

- Issue 2
- Issue 6
- Issue 7

**Strongly prefers after**

- Issue 8
- Issue 9
- Issue 10

**Blocks**

- project completion

**Why**

This is the final consolidation pass for touched navigation surfaces. It should happen after the major structural work is in place.

## Dependency Notes

- Issue 1 should be completed before 2, 6, 7, and 10.
- Issue 4 should be completed before 5 and 6.
- Issue 5 should be completed before 6 and should inform 7 and 10.
- Issue 8 can begin once 2 is underway, but it will land better after 6.
- Issue 11 should be the final issue in the project or be split across implementation if preferred.

## Items To Decide Before Linear Entry

- Whether issue 1 should be a Linear issue or simply a pre-ticket design artifact
- Whether watchlist should be implemented as its own table or as object-specific watch tables
- Whether the first mobile implementation uses one unified drawer or separate global/local drawer patterns
- Whether command palette v1 should include watched-item prioritization immediately or defer that to a follow-up
