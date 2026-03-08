# Navigation Model

## Purpose

This document defines how navigation in Trade Tracker should be structured.

It answers:

- how the target user moves between major product areas
- how local hierarchy navigation should work
- how desktop and mobile navigation should differ
- where `Watchlist` belongs
- what role a command palette should play

This is the evergreen product-level navigation model. Detailed explorations or redesign iterations can still live in `docs/plans/`.

Use [glossary.md](glossary.md) for the meaning of shared terms such as `Watchlist`, `Watched`, and `Standalone Trade Plan`.
Use [target-user.md](target-user.md) for the audience assumptions behind this navigation model.

## Navigation Goals

Trade Tracker navigation should:

- make the core hierarchy legible
- keep important context close at hand
- reduce repeated multi-step navigation
- support power use for the target user
- distinguish broad app navigation from local object navigation

The navigation model should help the target user answer two different questions quickly:

- where am I in the product?
- where do I need to go next?

## Core Navigation Layers

Trade Tracker has three navigation layers.

### 1. Global navigation

This is the app-wide shell used to move between major product areas.

It is for switching domains such as:

- Dashboard
- Trades
- Campaigns / Trade Plans
- Notes
- Strategy
- Imports
- Positions
- Portfolios
- Accounts

### 2. Local hierarchy navigation

This is the navigation used inside a domain with meaningful structure, especially:

- Campaigns
- Trade Plans

It is for moving between:

- parent and child objects
- sibling objects
- watched items
- standalone trade plans

### 3. Direct-jump navigation

This is the command palette / quick switcher layer.

It is for:

- fast access when the target user already knows what they want
- jumping to important or frequently revisited items
- reducing friction once the data set grows

Each layer serves a different job. They should complement each other, not compete.

## Global Navigation Model

### Desktop

The desktop shell should use a left sidebar as the primary global navigation.

Grouping:

- `Journal`
  - Dashboard
  - Trades
  - Campaigns
  - Trade Plans
- `Review`
  - Positions
  - Portfolios
  - Imports
- `Writing`
  - Notes
  - Strategy
- `Settings`
  - Accounts

### Mobile

Mobile should use a drawer-based version of the same global grouping.

The mobile drawer should:

- preserve the same section structure as desktop
- use strong active-state treatment
- keep tap targets large and obvious
- avoid turning the whole app into a single ungrouped link list

## Local Hierarchy Navigation Model

Local hierarchy navigation is most important in the campaigns and trade-plans domain.

This domain has:

- a real parent-child structure
- repeated revisits
- sibling switching needs
- a growing need for prioritization

### Desktop

Use a contextual left rail on campaign and trade-plan surfaces.

The local rail should sit alongside the page content and show:

- `Watchlist`
- `Campaigns`
- `Standalone Trade Plans`

The rail is the primary local hierarchy control on desktop.

### Rail groups

#### Watchlist

Contains:

- watched campaigns
- watched trade plans

Purpose:

- surface ongoing priorities
- provide one-click return to important items
- keep attention separate from lifecycle

#### Campaigns

Contains:

- campaign rows
- nested child trade plans beneath each campaign

Purpose:

- express the strategic hierarchy directly
- make parent/child/sibling movement cheap

#### Standalone Trade Plans

Contains:

- trade plans with no parent campaign

Purpose:

- keep standalone plans first-class
- support external-alert and direct-execution workflows without making them look unresolved

### Rail behavior

The rail should:

- remain visible across campaign and trade-plan detail pages
- preserve expansion state while navigating nearby items
- auto-expand the active campaign
- expand campaigns with watched child plans
- keep `Watchlist` expanded by default
- scroll independently from the main content

### Header behavior on desktop

Even with the rail present, page headers should retain quiet local context.

Examples:

- campaign detail: section label + campaign title
- trade-plan detail: parent label or breadcrumb above the title

The header is secondary context. The rail is the primary hierarchy control.

## Mobile Hierarchy Navigation Model

Mobile should not try to mirror the desktop two-panel layout directly.

Instead, it should balance:

- breadcrumbs for local upward navigation
- drawer navigation for broader switching

### Breadcrumbs

On campaign and trade-plan detail pages, breadcrumbs should be the primary local hierarchy control.

Examples:

- `Campaigns / Commodity Run Up`
- `Campaigns / Commodity Run Up / URNM`
- `Trade Plans / Standalone / Short ARKK`

Breadcrumbs should:

- make the parent relationship obvious
- allow one-tap upward movement
- reduce drawer-open-close churn for simple local moves

### Drawer behavior

The mobile drawer should include the same local groups as desktop when the target user is inside the campaign/trade-plan domain:

- Watchlist
- Campaigns
- Standalone Trade Plans

This can be implemented either as:

- one unified drawer with both global and local sections

or

- a global drawer plus a domain-specific local drawer pattern

The important rule is not the exact mechanical implementation. The important rule is that mobile users must still be able to browse the hierarchy without excessive steps.

## Command Palette Model

The command palette is a speed layer, not the primary navigation system.

### Purpose

Use the command palette for:

- jumping to a known campaign
- jumping to a known trade plan
- surfacing watched items quickly
- resolving similarly named plans by showing parent context

### Trigger

- `Cmd/Ctrl+K`
- optional jump/search affordance in the app chrome

### Scope

The command palette should stay narrow.

Include:

- campaign search
- trade-plan search
- watched-item prioritization
- parent context in results
- optional `Watch` / `Unwatch` action if low-friction

Do not start with:

- creation commands
- editing commands
- bulk operations
- a generic everything-command system

### Relationship to other navigation

Use the command palette for:

- direct jump
- recall-by-name
- repeated access to familiar objects

Do not use it as a replacement for:

- hierarchy browsing
- understanding relationships
- local movement through the campaign/trade-plan tree

## Watchlist Placement

`Watchlist` should appear in navigation as a persistent cross-cutting priority surface.

### Navigation roles for Watchlist

- pinned group in the local hierarchy rail
- visible group in mobile hierarchy navigation
- prioritized section in command-palette results
- eventually surfaced on the dashboard once that page becomes more meaningful

### Ordering

In navigation contexts, bias toward:

1. watched items
2. active/open items
3. everything else

Watchlist should prioritize visibility, not hide the rest of the system by default.

## Navigation Patterns By Surface

### Dashboard

Navigation role:

- global orientation
- summary return point
- not the primary hub for object-level movement

### Campaign index

Navigation role:

- browse strategic ideas
- filter by lifecycle status
- enter campaign detail

### Campaign detail

Navigation role:

- primary parent view for linked trade plans
- local switching point within a campaign

Expected local affordances:

- hierarchy rail on desktop
- breadcrumb on mobile
- watch toggle near title
- visible list of linked trade plans

### Trade-plan index

Navigation role:

- browse standalone plans
- browse or filter plans across the system

Important rule:

- linked and standalone plans should be distinguishable

### Trade-plan detail

Navigation role:

- tactical working surface
- repeated revisit point
- local switching point to sibling plans and parent campaign

Expected local affordances:

- hierarchy rail on desktop
- breadcrumb on mobile
- parent context visible near title
- watch toggle near title

### Trades

Navigation role:

- execution history view
- broad scan/review surface

- if trade detail becomes a first-class workflow later, navigation should preserve cheap access back to trade-plan and campaign context

### Notes

Navigation role:

- broad writing/review surface

- notes navigation is primarily collection-based, not hierarchical

### Strategy

Navigation role:

- singleton document access

- strategy should be easy to reach globally, but does not need local hierarchy controls

### Imports

Navigation role:

- operational workflow surface

- navigation should reduce interruption and avoid unnecessary context switching away from the import task

### Portfolios

Navigation role:

- overlay and review surface

- portfolios are not part of the core campaign/trade-plan hierarchy and should not be navigated as if they are parents in that tree

## Principles For Navigation Decisions

When navigation tradeoffs arise, prefer the pattern that:

- reduces repeated multi-step movement to familiar items
- preserves parent-child context
- keeps standalone trade plans legible
- separates focus from lifecycle
- supports efficient use by the target user
- makes the hierarchy easier to browse, not just easier to describe

## Summary

Trade Tracker navigation should have three layers:

- global navigation for major product areas
- local hierarchy navigation for campaigns and trade plans
- command-palette navigation for fast direct jump

Desktop should emphasize a sidebar shell plus contextual local rails.
Mobile should emphasize a drawer plus breadcrumbs for local hierarchy control.

The system should make it cheap to move between important ideas, cheap to return to watched items, and easy to understand where a trade plan sits inside the broader trading structure.
