# Trade Tracker Design Review Brief

## Goal

Improve the product's look and feel so it reads like a focused trading journal rather than a generic dark admin tool. This phase is based on a Playwright review of the signed-in shell, empty states, creation flows, mobile navigation, and the signed-out landing state.

This brief is intentionally design-first. It does not prescribe component implementation details.

## Review Scope

Reviewed in Playwright on desktop and mobile:

- Signed-out landing page
- Dashboard
- Trades
- Trade Plans
- Campaigns
- Notes
- Strategy
- Positions
- Portfolios
- Imports
- Accounts
- New Trade form
- Mobile navigation state

Current review context: mostly empty-state data.

Updated with a second Playwright pass against lightly populated data on the same day.

## Product Read

The product already has a clear information architecture and a stable dark theme. The core weakness is hierarchy. Most pages share the same background, same card styling, same text contrast, and same empty-state treatment, so the app feels flatter and quieter than the domain warrants.

For a trading journal, the UI should feel:

- focused
- disciplined
- information-dense where needed
- calm, but not inert
- opinionated about next steps

Right now it is calm, but also visually underpowered.

## Domain Model Constraints

The core relationship is:

- Campaigns can contain trade plans
- Trade plans can contain trades

But both parent relationships are optional in practice:

- trades do not have to belong to a trade plan
- trade plans do not have to belong to a campaign

This reflects two real workflows:

1. External alert-driven trading, where a trade plan may exist independently because the idea originated outside the user's campaign work
2. Internally developed ideas, where the user starts with a campaign, adds trade plans beneath it, and later records trades against those plans

Design implication:

- campaigns should read as the strategic parent when that structure exists
- standalone trade plans should still feel intentional and complete
- the hierarchy should feel helpful, not mandatory

## Design Direction

Recommended direction: **editorial terminal + portfolio notebook**

This should not become a flashy brokerage dashboard. The strongest position for this product is a deliberate, high-trust workspace that combines:

- the seriousness of a trading log
- the clarity of a writing tool
- the structure of a portfolio review system

### Visual principles

- Use the dark theme as a base, but introduce stronger surface separation.
- Reserve brighter accent color for user action and status, not for generic decoration.
- Give written thinking areas more editorial character than operational tables and forms.
- Make primary workflows feel progressive: capture, organize, review, reflect.
- Replace "large empty dark box with centered sentence" patterns with guided, purposeful layouts.

## Recommended Visual System Changes

### 1. Stronger hierarchy

Establish three distinct surface levels:

- App chrome surface: restrained, low-contrast navigation frame
- Content surface: standard working cards and tables
- Feature surface: emphasized modules such as onboarding, import review, and strategy writing

Use typography and spacing to create more separation between:

- page titles
- section titles
- helper copy
- status data
- empty-state guidance

### 2. Tighter type system

Current typography is readable but too uniform. Introduce a clearer scale:

- Large page titles with more authority
- Compact nav text
- Smaller, quieter helper copy
- Tabular numeric styling for trading stats and table values

The app should feel more like a serious tool with a point of view, not a default dashboard template.

### 3. More intentional color behavior

Keep the dark navy foundation, but create clearer semantic roles:

- Green for create/confirm/progress
- Blue for active selection and focus
- Amber for review/waiting/import attention
- Red for destructive or risk-heavy states
- Neutral olive/slate surfaces for baseline structure

Avoid using the same card tone everywhere. Visual sameness is one of the main reasons the product feels unfinished.

### 4. Better empty-state language and composition

Every empty state should answer:

- What is this area for?
- What should I do first?
- What will I get after doing that?

Add lightweight examples, starter actions, or explanatory scaffolding where useful.

### 5. Distinct environments for writing vs. logging

Do not force Notes and Strategy into a single writing metaphor.

They serve different jobs:

- Strategy is a formal long-lived document with markdown structure, section hierarchy, and reference value
- Notes is a fast capture tool for in-the-moment observations, including chart images and lightweight commentary for later retrospectives

Design implication:

- Strategy should feel like a formal document workspace
- Notes should feel like a lightweight field journal
- They can share product DNA, but should not feel interchangeable

## Shell And Navigation Redesign

### Desktop

Current issue:

- The top nav has too many peer-level items.
- The shell does not establish enough structure or orientation.

Recommendation:

- Move to a left sidebar for authenticated app areas.
- Keep the top bar lighter and more utility-focused: account, search later if needed, quick-add.
- Group navigation into sections:
  - Journal: Dashboard, Trades, Trade Plans, Campaigns
  - Review: Positions, Portfolios, Imports
  - Notes: Notes, Strategy
  - Settings: Accounts

Benefits:

- clearer scanning
- more room for page-level actions
- better support for future growth
- more natural mobile adaptation

### Mobile

Current issue:

- The mobile menu works, but feels like a plain overlay list rather than a designed app navigation pattern.

Recommendation:

- Use a proper slide-over drawer with stronger structure, section labels, and a clearer active-state treatment.
- Keep a persistent primary action available where relevant instead of burying all intent in the page body.

## Page Template Recommendations

Standardize most authenticated screens around one of three templates.

### 1. Overview pages

Use for:

- Dashboard
- Positions
- Portfolio detail

Template:

- strong title and short framing sentence
- top row of key metrics
- one or two dominant content modules below
- empty-state actions embedded into those modules

### 2. Collection pages

Use for:

- Trades
- Campaigns
- Trade Plans
- Notes
- Imports
- Accounts

Template:

- title + short page purpose
- clear primary action near the title
- filters/search in a dedicated row below
- list/table/card collection beneath
- empty state integrated into the collection area

### 3. Focused editor pages

Use for:

- New Trade
- Strategy

Template:

- narrow, deliberate writing/form column
- persistent action row
- stronger section grouping
- optional contextual guidance panel on large screens

## Highest-Priority Page Changes

### Dashboard

Current state:

- Three metric cards floating in large unused space

Redesign:

- Add a "getting started" module when the account is empty
- Pair summary stats with action-oriented cards:
  - Create first trade
  - Start a campaign
  - Import a CSV
- Add a recent activity area once data exists

Outcome:

- Dashboard becomes a launchpad, not just a sparse stat shelf

### Trades

Current state:

- Filters are serviceable but visually cramped
- Empty state is passive

Redesign:

- Separate filters from primary action more clearly
- Make date filtering feel like a deliberate toolbar
- When empty, show two clear paths:
  - Record manually
  - Import from broker

With data:

- prioritize scanability, row rhythm, and numeric alignment

### Trade Plans

Current state:

- Inline create form dominates the page before the user understands what plans are

Redesign:

- Reframe page around the list of plans
- Move creation into a modal, drawer, or a secondary panel
- Add brief explanatory copy that clarifies the role of a trade plan relative to campaigns and trades
- Explicitly support two states:
  - campaign-linked plans
  - standalone plans created from external alerts or direct execution needs

### Campaigns

Current state:

- Filter and CTA work, but the page lacks narrative or status richness

Redesign:

- Make status chips and counts more prominent
- Use cards or rows that preview thesis, symbol set, linked plans, and stage
- Empty state should teach the mental model: campaigns are strategic containers for self-developed ideas
- Clarify that not every trade plan must roll up into a campaign

### Notes

Current state:

- Functional but visually plain
- Feels like a textarea in a card, not a note-taking surface

Redesign:

- Treat notes as a lightweight trading journal
- Improve spacing, title treatment, and note list/editor separation
- Add better affordance for fast capture, quick rereading, and image attachment
- Make retrospection easier by giving each note stronger temporal context and better visual separation

### Strategy

Current state:

- Visually the weakest screen
- The editor appears almost blank or broken until focused

Redesign:

- Make this a dedicated writing environment
- Add visible placeholder guidance, save/status feedback, and editorial spacing
- Consider a split between writing surface and structural prompts:
  - setup criteria
  - risk rules
  - review checklist

This page should feel like the product's formal operating manual.

### Imports

Current state:

- Upload box is simple, but the page does not yet communicate the review workflow strongly

Redesign:

- Make the workflow explicit:
  - Upload
  - Review
  - Accept
- Give the inbox area stronger visual importance than the upload controls
- Use amber/review styling to distinguish this page from standard CRUD surfaces
- Judge design decisions here by weekly throughput, not elegance in isolation
- Preserve inline creation and matching affordances when they reduce batch-processing time

### Accounts

Current state:

- Reads like a placeholder

Redesign:

- Fold this into a broader "settings / mappings" style layout or add more framing so the page explains why account mapping matters

## Populated-State Addendum

The populated pass confirmed that some earlier concerns were structural, not just artifacts of empty pages.

### Dashboard still feels underpowered with data

Even with real trades and campaigns, the dashboard remains three metric cards in a large field of empty space. The counts update, but the page still does not help the user review current positions, recent activity, pending imports, or active ideas.

Design implication:

- The dashboard needs modules, not just metrics.
- Data alone will not make this page feel useful.

### Trades works better than expected on desktop, but not on mobile

Desktop trades is one of the stronger populated screens. The table is legible and the badge usage is restrained. The remaining issues are mostly hierarchy and layout efficiency:

- the filter toolbar feels bolted above the table instead of integrated with it
- the page still leaves a lot of unused space below the first fold
- the main CTA and the table are visually disconnected

On mobile, the table treatment breaks down. The user gets only a narrow slice of the dataset, and the interaction starts to feel like viewing a desktop grid through a small window rather than using a mobile-native trading journal.

Design implication:

- desktop can evolve from the current table
- mobile needs a different representation, likely stacked cards or progressively disclosed rows

### Campaigns needs richer content density

With real campaign rows, the page becomes readable but still thin. A campaign is a strategic object, yet the table exposes only name, status, and created date. That undersells the value of the feature.

Design implication:

- campaigns need more narrative density: symbol scope, linked plans, last activity, and stage context
- but they do not need to become the mandatory organizing object for every idea

### Imports becomes the most visibly crowded workflow

The populated imports table makes the workflow concrete, which is good, but it also shows the heaviest density problem in the product:

- too many editable controls are embedded inline per row
- trade plan, portfolio, notes, and actions all compete in the same horizontal band
- scanability drops quickly

On mobile, the problem is more severe. Only the first few columns are visible and the workflow intent becomes much harder to understand.

Design implication:

- the import review flow should be treated as a dedicated review workspace, not just a wide editable table
- but the redesign should preserve the current speed target of clearing a weekly batch in roughly five minutes

### Notes and Strategy improve with real content, but need more deliberate separation

Real text helps both screens. Strategy especially feels more valid once it contains actual writing. Even so:

- notes are visually dense and repetitive
- strategy reads as content inside a dark box rather than a first-class writing environment

Design implication:

- these screens should diverge more deliberately:
  - Strategy toward a formal document editor
  - Notes toward fast chronological capture with media support

### Positions and Portfolios are readable, but too bare

Populated rows make these pages functional, but they still feel like transitional views rather than destinations. There is little summary context, no framing, and minimal support for interpretation.

Design implication:

- these pages need top-level summary modules or supporting context so they feel analytical, not provisional

### Loading treatment weakens perceived quality

Several populated routes briefly show a generic `Loading...` slab before the real content appears. In spot checks, `trade-plans`, `positions`, `portfolio`, and `imports` all exposed that state, typically settling in roughly 0.8s to 1.2s.

Design implication:

- replace the plain loading block with route-specific skeletons or reserved layout shells
- preserve table structure during load so the app feels faster and more intentional

## Form UX Recommendations

### New Trade form

What to improve:

- clearer sectioning
- less visual crowding on mobile
- better field grouping
- stronger top-level context

Recommended structure:

- Instrument and timing
- Position details
- Classification and linking
- Notes
- Sticky action row on mobile if the form grows

The current form works, but it does not yet feel premium or especially efficient.

## Prototype Priorities

Prototype these in order:

1. Authenticated shell redesign
2. Strategy editor redesign
3. Notes journal redesign
4. Campaigns hierarchy and status views
5. Trade plans list and standalone-vs-linked treatment
6. Imports review workspace
7. Mobile navigation drawer and mobile trade/import patterns
8. Trades list + filter toolbar
9. New Trade form restructure

This sequence tests the system-level design first before spending time on lower-impact pages.

## Spec Backlog

The following design specs should be written as separate follow-up documents so this review can turn into concrete implementation work without losing context:

### 1. Campaign and Trade Plan Navigation

Purpose:

- define the contextual rail, mobile breadcrumbs, watchlist behavior, and minimal command palette

Document:

- `docs/plans/2026-03-07-campaign-trade-plan-navigation-design.md`

### 2. Strategy Editor Design

Purpose:

- define the formal document experience for markdown-heavy long-lived strategy content

Should cover:

- editor layout
- document framing
- save/status feedback
- markdown affordances
- reading vs editing states

### 3. Notes Journal Design

Purpose:

- define the quick-capture note experience for time-stamped observations, later retrospectives, and image/chart support

Should cover:

- note list rhythm
- entry composer
- media attachments
- chronological review
- retrospective readability

### 4. Campaigns And Trade Plans Information Design

Purpose:

- define how campaigns and trade plans communicate hierarchy, status, standalone-vs-linked state, and focus

Should cover:

- list/index layouts
- detail page summaries
- relationship framing
- watch markers
- campaign-level narrative density

### 5. Imports Throughput UX

Purpose:

- optimize the import flow for weekly batch processing speed, not just visual polish

Should cover:

- review table density
- inline matching workflow
- inline trade plan creation workflow
- portfolio assignment flow
- mobile fallback behavior

### 6. Authenticated Shell Design

Purpose:

- define the broader app shell once local hierarchy navigation is accounted for

Should cover:

- global nav grouping
- top bar role
- mobile drawer structure
- shell behavior when contextual rails are present

## Success Criteria

The redesign is successful if:

- first-time users understand what to do in each empty page
- the shell feels more structured and less generic
- major workflows are visually distinguishable from each other
- writing surfaces feel intentionally different from each other and from operational data surfaces
- mobile navigation and forms feel intentionally designed, not just compressed desktop layouts
- populated tables and lists remain readable without sacrificing the calmer journal aesthetic
