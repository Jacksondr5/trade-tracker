# Product Roadmap

## Purpose

This roadmap describes the current intended sequence of product work for Trade Tracker.

It is not a release plan. It is a strategic ordering of major product efforts based on current priorities, product maturity, and the need to tighten the existing workflow before expanding into larger new feature sets.

## Roadmap Principles

- Improve the current core workflow before broadening the product.
- Fix movement and context before polishing isolated screens.
- Strengthen evidence capture and review before building deep analytics.
- Roll the new visual design system out incrementally as major surfaces are touched.
- Build missing shared UI primitives as soon as a phase needs them rather than deferring them to a later cleanup pass.
- Every phase should leave touched surfaces more compliant with the shared UI and shared form system than before.
- Keep the roadmap flexible where the product is still exploratory.

## Phase 1: Navigation And Working Context

Goal: make the core hierarchy easier to move through and easier to keep in view during daily use.

Includes:

1. Campaign and Trade Plan navigation overhaul
2. Watchlist as a cross-cutting focus layer
3. Better linkage and visibility across `campaign -> trade plan -> trade`
4. Cleaner handling of standalone trade plans vs campaign-linked trade plans
5. Global shell redesign from flat top-nav to the grouped desktop sidebar and mobile drawer model
6. Local hierarchy rail for campaigns and trade plans, plus breadcrumb behavior on mobile
7. Command palette / quick-switcher groundwork for direct jumps to known campaigns and trade plans
8. Apply canonical navigation language such as `Imports` instead of route-local variants
9. Apply the new visual design system to all navigation and hierarchy surfaces touched in this phase

Why this phase comes first:

- the current hierarchy exists in the model but is harder to navigate than it should be
- movement between related objects is too expensive
- focus and parent-child context need to stay visible without relying on memory

## Phase 2: Core Thinking Surfaces

Goal: improve the parts of the product that already matter most to the trading process.

Includes:

1. Strategy editor redesign
2. Notes workflow redesign, including chart and image support
3. Campaign detail and Trade Plan detail information design refresh
4. Make trade plans a true first-class tactical working surface rather than splitting the experience between standalone lists and campaign detail embeds
5. Expose the richer trade-plan structure needed for tactical planning, such as rationale, entry, target, exit, and instrument notes
6. Keep campaign, trade plan, trade, and note context visible together on the main thinking surfaces
7. Retrospective workflow design
8. Apply the new visual design system to all strategy, notes, campaign, and trade-plan surfaces touched in this phase

Why this phase comes next:

- these are the most mature and most strategically important workflows
- they hold the thinking, evidence, and review context the product depends on
- improving them has higher leverage than expanding underdeveloped areas

## Phase 3: Operational Efficiency

Goal: reduce weekly maintenance work and make operational surfaces faster and clearer.

Includes:

1. Import flow UX refinement for weekly throughput
2. Standardize status language vs watch and focus language
3. Refactor dense operational controls onto shared primitives instead of maintaining route-local inputs, selects, and action buttons
4. Improve loading and skeleton states across data-heavy routes
5. Apply the copy principles across major surfaces touched in this phase
6. Apply the new visual design system to all operational and data-heavy surfaces touched in this phase

Why this phase follows the core thinking surfaces:

- imports matter, but they are an operational workflow rather than the center of the product
- the right measure of success here is reduced friction, less admin work, and reliable throughput

## Phase 4: Systemization And Documentation

Goal: consolidate the design and product system before moving into larger analytics and review expansions.

Includes:

1. Apply the new visual design system across the authenticated shell
2. Standardize page templates, empty states, and recurring page-level patterns
3. Fill the remaining shared UI gaps such as standalone selects, icon-button patterns, and other reused controls discovered in earlier phases
4. Migrate remaining touched routes off route-local UI patterns and onto the shared UI layer
5. Maintain and update `technical-architecture-overview.md`
6. Maintain and expand `glossary.md`
7. Start and maintain a decision log (`docs/product/decision-log.md`)
8. Maintain this roadmap as priorities change

Why this phase sits here:

- phases 1 through 3 will change a meaningful portion of the app
- the product should be tightened and documented before larger new feature areas are introduced
- some of this work should happen in parallel with earlier phases, but it should be considered a formal checkpoint before major analytics expansion
- this phase is for consolidation and long-tail cleanup, not for deferring obvious shared-component adoption on high-priority surfaces

## Phase 5: Analytics Foundation

Goal: build the first meaningful analytical layer for judging whether the trading process is working.

Includes:

1. Baseline performance analytics
2. Exposure analytics by portfolio, campaign, and trade plan
3. Review-oriented analytics that point to what deserves diagnosis
4. Portfolio model clarification for future analytics and exposure review
5. Define the long-term analytics object model before expanding the dashboard

Why this phase comes after systemization:

- analytics should be built on top of stronger workflow, evidence, and design foundations
- the dashboard should not be expanded until the underlying analytical model is clear

## Phase 6: Review And Portfolio Maturity

Goal: deepen the review layer and clarify parts of the model that are currently intentionally flexible.

Includes:

1. Retrospective summaries and possible retrospectives of retrospectives
2. Watchlist and review signals surfaced into the dashboard
3. Dashboard redesign once analytics are mature enough to justify it
4. Keep portfolios as trade-linked overlays unless analytics prove a stronger model is needed
5. Clarify the long-term role of trades without trade plans
6. Make a deliberate trade-detail visibility decision:
   decide how prominent trade-level notes should be relative to trade-plan notes

Why this phase comes last:

- it depends on better navigation, stronger thinking surfaces, and a more developed analytics layer
- several items here are important, but they should be resolved with more product evidence than is available today

## Notes On Scope

- `Dashboard` remains strategically important but is not an early design priority.
- `Portfolios` matter, but they should remain an overlay until analytics prove they need a stronger structural role.
- `Watchlist` should remain separate from lifecycle status throughout this roadmap.
- Trade-level notes are supported, but their prominence should remain secondary to trade-plan notes until the product has a clearer trade-review workflow.
- A possible future trade-detail workflow may emerge from phases 2 and 6, but it should not distract from the campaign and trade-plan hierarchy work that comes first.
- Shared UI and shared form migration is not isolated to phase 4; each earlier phase should improve the system on the surfaces it touches.

## Summary

The roadmap is intentionally front-loaded toward tightening the product that already exists:

1. improve navigation and context
2. improve the main thinking and review surfaces
3. reduce operational friction
4. consolidate the system
5. then expand analytics and deeper review

That order keeps the product grounded in real workflow improvement instead of expanding breadth too early.
