# Campaign And Trade Plan Navigation Design

## Goal

Improve navigation across campaigns and trade plans so the hierarchy is easy to understand, easy to traverse, and still flexible enough to support standalone trade plans.

This spec focuses on navigation and information architecture, not backend modeling or component implementation details.

## Problem Summary

The current UI exposes the campaign-to-trade-plan hierarchy, but does not make it easy to move through that hierarchy in practice.

Current pain points:

- The parent campaign link on a trade plan detail page is easy to miss
- Moving between sibling trade plans requires too many steps
- The user loses context about where a trade plan sits in the larger structure
- As the number of campaigns and trade plans grows, it becomes harder to remember which items deserve attention now

The existing page-to-page model is adequate for viewing a single object, but weak for browsing a hierarchy.

## Domain Constraints

The relationship model is:

- Campaigns can contain trade plans
- Trade plans can contain trades

But both parent relationships are optional:

- Trades can exist without a trade plan
- Trade plans can exist without a campaign

That means the navigation model must do two things at once:

- clearly represent the hierarchy when it exists
- keep standalone trade plans feeling intentional rather than orphaned

## Primary UX Goals

1. Make campaign and trade plan context visible at all times on desktop.
2. Reduce the number of clicks needed to move between related trade plans.
3. Make standalone trade plans first-class citizens.
4. Add a persistent attention signal through `Watchlist`.
5. Preserve efficient navigation on mobile without forcing a drawer open for every local movement.

## Recommendation

Use a contextual navigation system for the campaign and trade plan area, made of three parts:

1. Desktop contextual tree rail
2. Mobile breadcrumbs plus drawer navigation
3. Minimal command palette for direct jump/search

These should work together, not compete.

## Navigation Model

The left rail should present three groups:

### 1. Watchlist

Contains:

- watched campaigns
- watched trade plans

Purpose:

- keep the user's current priorities visible
- provide one-click access to important items
- separate attention from lifecycle status

`Watchlist` means:

- important until explicitly unwatched

It is not a status and should not replace statuses like `planning`, `active`, or `closed`.

### 2. Campaigns

Contains:

- campaign rows
- expandable child trade plans nested beneath each campaign

Purpose:

- show the strategic hierarchy clearly
- support one-click navigation between parent and sibling items

### 3. Standalone Trade Plans

Contains:

- trade plans with no parent campaign

Purpose:

- avoid making standalone plans look unresolved
- support the external alert-driven workflow cleanly

## Desktop UX

### Layout

For campaign and trade plan pages only, use a two-panel layout:

- left: contextual navigation rail
- right: page content

The main app shell can still have the broader authenticated navigation. This contextual rail is local to the campaigns/trade-plans domain.

### Rail behavior

The rail should:

- stay visible across campaign and trade plan detail pages
- show the active item clearly
- allow campaigns to expand and collapse
- preserve expansion state while navigating nearby items
- support scrolling independently from the main page content

### Default expansion rules

To avoid overwhelming the rail as the tree grows:

- expand the active campaign automatically
- expand campaigns with watched child plans
- collapse unrelated campaigns by default
- keep the `Watchlist` group expanded by default
- keep `Standalone Trade Plans` expanded if the active item is standalone

### Suggested rail item contents

Campaign item:

- campaign name
- status chip
- optional watch marker

Trade plan item:

- trade plan name
- optional watch marker
- subtle parent context when shown in search results, not needed when nested

Standalone trade plan item:

- trade plan name
- status chip if meaningful
- optional watch marker

### Detail page header behavior

On desktop, the detail page header should still include quiet context:

- campaign detail page: section label + campaign title
- trade plan detail page: breadcrumb or parent label above the title

The header context is secondary. The rail is the primary hierarchy control.

## Mobile UX

Desktop tree navigation does not map directly to mobile, so use a different balance:

### 1. Breadcrumbs as the primary local hierarchy control

On campaign and trade plan detail pages, show a compact breadcrumb above the title.

Examples:

- `Campaigns / Commodity Run Up`
- `Campaigns / Commodity Run Up / URNM`
- `Trade Plans / Standalone / Short ARKK`

Purpose:

- provide immediate orientation
- allow one-tap movement upward
- reduce the need to reopen the drawer for simple local navigation

### 2. Drawer for broader browsing

The mobile drawer should contain the same groups as desktop:

- Watchlist
- Campaigns
- Standalone Trade Plans

But it should be optimized for touch:

- larger tap targets
- expandable campaign rows
- strong active-state treatment
- compact but readable nesting

### 3. Local switching behavior

If the user is already on a trade plan and wants to move to another nearby plan, the mobile drawer should support that. Breadcrumbs are for moving up; the drawer is for broader switching.

## Minimal Command Palette

### Purpose

The command palette is not meant to replace the rail or drawer. It is a direct-jump tool for when the user already knows what they want.

Primary use cases:

- jump to a known campaign
- jump to a known trade plan
- find a watched item quickly
- confirm parent context for similarly named trade plans

### Trigger

- `Cmd/Ctrl+K`
- optional small jump/search button in the top app chrome

### Scope

First version should stay narrow:

- search campaigns
- search trade plans
- surface watched items first
- show parent campaign context when relevant
- allow `Watch` / `Unwatch` as a lightweight inline action if easy

Do not start with:

- create actions
- edit actions
- bulk actions
- generic app-wide command systems

That is where the palette becomes heavy-handed.

### Result grouping

Suggested result sections:

- Watchlist
- Campaigns
- Standalone Trade Plans

Example result rows:

- `Commodity Run Up` `Campaign`
- `URNM` `Trade Plan • Commodity Run Up`
- `Short ARKK` `Trade Plan • Standalone`

### Why palette + rail is better than choosing one

The rail is best for:

- browsing
- orientation
- local switching

The palette is best for:

- fast direct jump
- recall by name
- speed once the data set grows

They solve different navigation jobs.

## Watchlist Design

`Watchlist` should be modeled as a lightweight focus flag.

It should:

- be manually set and manually removed
- apply to campaigns and trade plans independently
- not imply status, urgency reason, or deadline by itself

### Surface areas

Show watch state in:

- contextual rail
- campaign list rows
- trade plan list rows
- campaign detail header
- trade plan detail header
- command palette results

Later, once dashboard work matters again, watched items should become a natural dashboard module.

### Ordering rules

In navigation surfaces, bias toward:

1. watched items
2. active/open items
3. everything else

Do not hide non-watched items. Watchlist should prioritize, not filter the entire system by default.

## Suggested Page Patterns

### Campaign detail

Desktop:

- contextual rail on the left
- campaign header on the right
- linked trade plans visible as part of the content body
- watch toggle visible near the title

Mobile:

- breadcrumb above title
- watch toggle near title
- drawer available for broader navigation

### Trade plan detail

Desktop:

- contextual rail on the left
- breadcrumb or quiet parent context above the title
- watch toggle near title
- obvious relationship to parent campaign if linked

Mobile:

- breadcrumb as primary local navigation
- watch toggle near title
- drawer for switching elsewhere

### Campaign and trade plan index pages

These should align with the same hierarchy model:

- watch markers visible in rows/cards
- standalone plans clearly labeled
- linked plans clearly connected to campaign context

## Alternatives Considered

### 1. Context-aware back button

Useful as a supporting affordance, but not sufficient.

Why it falls short:

- helps only with the previous step
- does not support sibling switching
- does not persist hierarchy awareness

### 2. Breadcrumbs only

Helpful on mobile and as a secondary desktop cue, but not enough by themselves.

Why they fall short:

- they help you move up
- they do not help you browse sideways efficiently

### 3. Command palette only

Fast for direct jump, but weak for spatial understanding.

Why it falls short:

- assumes the user knows what they want
- does not help with browsing or hierarchy discovery

## Recommended Rollout

1. Introduce watch state for campaigns and trade plans
2. Add contextual desktop rail for campaign/trade-plan surfaces
3. Add mobile breadcrumbs on detail pages
4. Add drawer hierarchy sections on mobile
5. Add minimal command palette for direct jump

This sequence gets the highest-value hierarchy improvements in place before adding the optional speed layer.

## Success Criteria

The design is successful if:

- users can move from one trade plan to a sibling trade plan in one navigation action on desktop
- users can reliably identify a trade plan's parent campaign when one exists
- standalone trade plans feel intentional and easy to locate
- watched campaigns and trade plans stay visible until explicitly unwatched
- mobile users can move up the hierarchy without repeatedly opening the drawer
- the system still feels understandable as the number of campaigns and trade plans grows
