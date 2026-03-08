# Visual Design System

## Purpose

This document defines the concrete visual rules for Trade Tracker.

It is meant to be specific enough that future design and implementation work does not drift into multiple incompatible interpretations.

This document answers:

- what the product should look like
- which palette it should use
- how hierarchy should be shown
- how typography, spacing, density, and surfaces should behave
- how different workflows should differ visually

## Decision: Change The Current Visual Language

The current blue-heavy dark theme should not remain the long-term visual direction.

Why:

- it reads like a generic dark admin app
- it makes the product feel flatter than it is
- it gives the app a cold, undifferentiated mood
- it overuses one background treatment across almost every screen
- it makes the green primary action feel pasted on rather than integrated

The product should move away from a navy-dashboard feel and toward a warmer, darker, more deliberate workspace.

## New Visual Direction

The target visual direction is:

`market notebook + research terminal`

That means:

- dark and serious
- warm-neutral rather than blue-dominant
- editorial where writing matters
- structured where planning matters
- dense where operations matter

The product should feel like a disciplined thinking tool, not a broker terminal.

## Foundation Palette

The app should keep using Radix token families, but the primary foundation should change.

### Primary base palette

Use these as the main visual base:

- `olive` for app background, panels, cards, dividers, and quiet structure
- `slate` for tables, dense neutral UI, and secondary contrast surfaces

### Accent palette

Use these only for specific jobs:

- `grass` for create / confirm / positive progress
- `blue` for focus, active selection, and informational emphasis
- `amber` for review, watch, pending attention, and import workflow emphasis
- `red` for destructive, short/risk, and error states

### Explicit rule

Do not use `blue` as the ambient background language of the app.

Blue is a signal color, not the main canvas.

## Exact Color Mapping

These are the default assignments agents should follow unless a screen has a strong reason to diverge.

### App shell

- App background: `bg-olive-1`
- Global nav surface: `bg-olive-2`
- Global nav border: `border-olive-6`

### Standard content surfaces

- Default card / module: `bg-olive-2 border-olive-6`
- Elevated card / active section: `bg-olive-3 border-olive-6`
- Dense data surface: `bg-slate-2 border-slate-6`

### Text

- Primary text: `text-olive-12`
- Secondary text: `text-olive-11`
- Strong headings inside dense tables or editorial sections: `text-slate-12`
- Muted metadata: `text-slate-11`

### Interactive emphasis

- Primary button: `bg-grass-9 hover:bg-grass-10 text-grass-1`
- Secondary button: `bg-olive-3 hover:bg-olive-4 text-olive-12 border border-olive-6`
- Destructive button: `bg-red-9 hover:bg-red-10 text-red-1`
- Selected nav item: `bg-blue-3 text-blue-12`
- Focus ring: `ring-blue-8`

### Workflow accents

- Watch / pending attention: `amber`
- Suggested auto-match / informational guidance: `blue`
- Active / confirmed / long-positive: `grass`
- Destructive / short / invalidation: `red`

## Surface System

Use four surface levels, not three.

### Surface 0: Canvas

Use for:

- app background
- large empty background areas

Style:

- `bg-olive-1`

Rule:

- no content should feel like it is floating in an empty colored void
- if a page is sparse, use purposeful modules rather than leaving a large uninterrupted field

### Surface 1: Shell

Use for:

- top bar
- sidebar
- drawers
- persistent chrome

Style:

- `bg-olive-2 border-olive-6`

Rule:

- shell surfaces should be quieter than content surfaces

### Surface 2: Working

Use for:

- standard cards
- forms
- detail sections
- list wrappers

Style:

- `bg-olive-2 border-olive-6`

### Surface 3: Dense

Use for:

- trade tables
- imports
- compact structured data

Style:

- `bg-slate-2 border-slate-6`

Rule:

- dense surfaces may be slightly cooler and tighter than writing/planning surfaces

### Surface 4: Featured

Use for:

- strategy editor shell
- onboarding modules
- important review modules
- special-focus areas

Style:

- `bg-olive-2` or `bg-olive-3`, with stronger border and spacing treatment

Rule:

- featured surfaces should be distinguished by framing, spacing, and hierarchy
- do not solve feature prominence by dumping saturated color into the background

## Typography

Keep the current Geist font stack for now.

Reason:

- it is already integrated
- it is clean and modern
- the biggest current issue is hierarchy, not font family

If typography is revisited later, it should be done intentionally across the whole app, not piecemeal.

## Type Scale

Agents should use this default scale.

### Page title

- Desktop: `text-3xl font-bold`
- Mobile: `text-2xl font-bold`
- Color: `text-olive-12`
- Margin below: `mb-6` minimum

### Section title

- `text-lg font-semibold`
- Color: `text-olive-12` or `text-slate-12`
- Margin below: `mb-3` or `mb-4`

### Card title

- `text-sm font-semibold`
- Color: `text-olive-12`

### Field label

- `text-xs font-medium uppercase tracking-wide`
- Color: `text-olive-11`

### Body text

- `text-sm`
- Color: `text-olive-12`

### Helper / metadata text

- `text-sm`
- Color: `text-olive-11` or `text-slate-11`

### Table header text

- `text-xs font-medium`
- Color: `text-slate-11`

### Numeric emphasis

- use tabular numerals
- important values may use `font-medium` or `font-semibold`
- do not use oversized stat numerals unless the page actually warrants them

## Spacing Rules

Use consistent spacing so pages stop feeling improvised.

### Page padding

- Desktop page padding: `px-6 py-8` minimum
- Mobile page padding: `px-4 py-6`

### Vertical rhythm

- Page title to first section: `24px`
- Between major sections: `24px` to `32px`
- Between related controls inside a card: `12px` to `16px`
- Dense table toolbar to table: `12px`

### Card padding

- Standard card: `p-4`
- Large editorial or strategy card: `p-6`
- Dense table wrapper: `p-0` to `p-3` depending on the table style

## Radius And Borders

Use rounded corners, but keep them restrained.

### Default radius

- cards and panels: `rounded-lg`
- buttons and inputs: `rounded-md`

### Borders

- use `border-olive-6` on olive surfaces
- use `border-slate-6` on dense slate surfaces
- do not rely on shadow as the main separator in dark mode

Shadows should be minimal. Borders and tonal separation should do most of the structural work.

## Status And Badge Rules

Status needs stricter visual rules than it has today.

### Campaign status

- `planning`: `info`
- `active`: `success`
- `closed`: `neutral`

### Trade plan status

- `idea`: `neutral`
- `watching`: `warning`
- `active`: `success`
- `closed`: `neutral`

### Trade and position semantics

- `buy`: `success`
- `sell`: `danger`
- `long`: `success`
- `short`: `danger`

### Import semantics

- `suggested`: `info`
- `pending review`: `warning`
- `validation issue`: `danger`

### Watchlist semantics

`Watchlist` must not look like lifecycle status.

Use:

- star / eye / pin style indicator
- amber-accented marker or outline treatment
- never the same badge language used for status fields

## Page Templates

Every major page should fit one of these templates.

### 1. Overview page

Use for:

- Dashboard
- Positions
- Portfolio detail

Required structure:

- title row
- optional one-line framing text
- summary module row
- one or two main content modules below

Rule:

- no overview page should end after a floating stat strip unless it is intentionally empty and onboarding-oriented

### 2. Collection page

Use for:

- Trades
- Campaigns
- Trade Plans
- Notes
- Imports
- Accounts

Required structure:

- title row with primary action
- filter / toolbar row if relevant
- collection surface below

Rule:

- primary action and collection must feel visually related, not like disconnected blocks

### 3. Focused editor page

Use for:

- Strategy
- New Trade

Required structure:

- title row
- readable main editor/form column
- persistent or clearly visible save/action area
- optional contextual side content on desktop

## Workflow-Specific Visual Rules

### Strategy

Strategy must look like a document, not a generic form card.

Rules:

- max readable line length on desktop
- larger internal padding than standard cards
- clear heading hierarchy
- strong prose rhythm
- reduced chrome inside the editor body
- visible document framing around the editor, not around every paragraph

Do:

- make it feel like a formal operating manual

Do not:

- put the strategy text inside a generic dark rectangle with no editorial identity

### Notes

Notes must look like a journal, not a stack of anonymous textareas.

Rules:

- each note entry needs visible time context
- entries need clear separation
- screenshots should feel like evidence, not attachments buried below the fold
- composer should feel fast and lightweight

Do:

- privilege chronology and rereading

Do not:

- make notes feel like miniature strategy documents

### Campaigns

Campaigns must feel strategic.

Rules:

- row/card previews should show more than just name and status over time
- lifecycle and focus should be clearly visible
- linked trade plans should feel structurally related, not tacked on

Do:

- emphasize thesis and stage

Do not:

- make campaigns feel like a generic project table

### Trade Plans

Trade plans must feel tactical and actively usable.

Rules:

- local navigation should be prominent
- parent campaign context should be visible when present
- standalone plans should be labeled as intentional, not leftover

Do:

- make trade plans a core working surface

Do not:

- bury them behind repeated clicks or weak hierarchy cues

### Trades

Trades must feel like an execution ledger.

Rules:

- rows should prioritize date, ticker, relationship fields, side/direction, and key financial values
- values should align cleanly
- badges should be restrained

Do:

- optimize for scanning and verification

Do not:

- overload the table with decorative emphasis

### Imports

Imports must feel like a high-throughput review workspace.

Rules:

- denser than all other surfaces
- clear distinction between editable and read-only cells
- row actions always visible
- matching state obvious at a glance
- pending-review emphasis uses amber, not generic blue

Do:

- design for weekly admin speed

Do not:

- beautify imports at the cost of throughput

## Navigation Visual Rules

### Global navigation

- quieter than content
- grouped by domain
- active item clearly marked with background and text change
- no bright accent on every nav item

### Local hierarchy navigation

- stronger than global nav because it carries structure
- active path obvious
- child indentation consistent
- watch indicators visible but not noisy

### Breadcrumbs

- compact
- quiet
- one visual level below the page title

## Empty-State Rules

Empty states need specific visual behavior.

Every empty state must include:

- a clear title or message
- one concrete next action
- one sentence explaining what will appear here later

Preferred structure:

- compact module
- left-aligned content
- visible CTA

Do not use:

- giant empty dark boxes with centered text only

## Loading-State Rules

Loading must preserve structure.

Use:

- skeleton rows for tables
- skeleton blocks that match the eventual layout
- stable wrappers with preserved dimensions

Do not use:

- a single generic `Loading...` slab as the main route placeholder

## Motion Rules

Motion should be subtle and functional.

Allowed:

- hover state transitions
- nav expansion/collapse
- save state transitions
- skeleton loading fades

Avoid:

- large animated entrances
- bounce, spring, or decorative motion on serious workflows
- motion that suggests market urgency

## Iconography

Iconography should be used heavily enough to support information density, but not so aggressively that the interface becomes cryptic.

### Core rule

Use icons to reduce clutter, not to hide meaning.

### Icon-only actions

Prefer icon-only actions when all of the following are true:

- the action is frequent
- the action appears in a dense repeated context
- the meaning is already familiar
- the action is local to a row, card, or field

Good icon-only candidates:

- edit
- delete
- accept
- close
- watch / unwatch
- open / quick jump
- expand / collapse
- attach image or chart
- small inline save for an already-understood field

### Text plus icon actions

Prefer text plus icon when:

- the action is page-level
- the action is a major CTA
- the action is destructive and consequential
- the action may be ambiguous as an icon alone
- the user should clearly understand the result before clicking

Good text-plus-icon candidates:

- New Campaign
- New Trade
- Upload CSV
- Accept All
- Create Trade Plan
- Delete Portfolio

### Text-only actions

Use text-only sparingly.

Best uses:

- inline prose links
- helper links
- low-emphasis navigation text
- contexts where the icon would add no extra signal

### Save action rule

Do not default to the word `Save` on every button.

Instead:

- for dense inline field actions, prefer an icon-only save action
- for major form submissions, keep text or text plus icon
- if autosave is reliable and clearly communicated, prefer autosave over an explicit save button

This keeps the interface tighter without making important submits unclear.

### Accessibility rule

Every icon-only action must include:

- an accessible label
- a tooltip or equivalent hover/focus affordance

No icon-only action should depend on visual recognition alone.

### Consistency rule

Use the same icon for the same meaning everywhere in the app.

Suggested mappings:

- save: check / check-circle / disk equivalent, but use one family consistently
- edit: pencil
- delete: trash
- accept / confirm: check
- close / dismiss: x
- watch: star, eye, or pin
- expand / collapse: chevron
- navigate outward / open detail: arrow or external/open icon
- add attachment / chart image: image icon
- search / jump: search or command palette icon

Do not swap icon metaphors casually from screen to screen.

### Density rule

In dense tables and row collections:

- default to icon-only row actions
- keep actions aligned in a predictable trailing actions column
- avoid mixing text buttons and icon buttons randomly within the same table

### Visual styling rule

Icon buttons should generally be:

- compact
- low-chrome
- visually consistent within a workflow

Use color for meaning only when it adds signal:

- green for accept / confirm
- red for destructive
- amber for watch or attention if appropriate
- neutral for edit and navigation

Do not color every icon action differently just because it is possible.

## What Agents Should Avoid

Agents working on the UI should avoid:

- blue-heavy page backgrounds
- generic dashboard cards repeated everywhere
- identical treatment for notes, strategy, imports, and planning surfaces
- large fields of unused dark space
- bright accent colors used as decoration
- hidden context in the name of visual neatness
- over-rounding or soft consumer-app styling
- default Tailwind gray/slate palettes outside the Radix system
- converting major CTAs into icon-only buttons
- using different icons for the same meaning across screens

## Default Visual Recipe

If an agent needs a safe default and the screen does not have special requirements, use:

- page background: `bg-olive-1`
- primary panel: `bg-olive-2 border border-olive-6 rounded-lg`
- section heading: `text-lg font-semibold text-olive-12`
- body text: `text-sm text-olive-12`
- helper text: `text-sm text-olive-11`
- primary action: `bg-grass-9 hover:bg-grass-10 text-grass-1`
- secondary action: `bg-olive-3 border border-olive-6 text-olive-12`
- selected state: `bg-blue-3 text-blue-12`
- warning/review state: `amber`
- dense data area: `bg-slate-2 border border-slate-6`

This should be the baseline, not an excuse to stop thinking.

## Summary

Trade Tracker should abandon the current blue-admin visual feel.

The correct direction is:

- olive/charcoal foundation
- blue used only for focus and selection
- workflow-specific surface treatment
- stronger type and spacing hierarchy
- editorial writing surfaces
- dense but disciplined data surfaces

The visual system should make the app feel like a serious trading notebook, not a generic dark dashboard.
