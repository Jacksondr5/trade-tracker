# Content And Copy Principles

## Purpose

This document defines how Trade Tracker should sound in product copy.

It should be short enough to scan and specific enough to keep future screens from drifting into different voices.

Use [target-user.md](target-user.md) for the audience assumptions this copy should speak to.

## Voice

Trade Tracker copy should be:

- direct
- calm
- precise
- domain-aware

It should not sound like:

- marketing copy
- broker software
- beginner education
- generic SaaS filler

Default rule: write the shortest copy that preserves meaning.

## Tone

- Prefer clear over clever.
- Prefer restrained over energetic.
- Prefer specific over generic.
- Prefer useful over decorative.
- Do not use hype, urgency, or celebration language.
- Do not use exclamation points.

Good:

- `Import trades`
- `Add note`
- `No trade plans yet`
- `3 trades need review`

Bad:

- `Supercharge your workflow`
- `You’re all caught up!`
- `No data available`
- `Something went wrong`

## Style

- Use short sentences.
- Use concrete nouns and verbs.
- Avoid filler adjectives like `powerful`, `robust`, `flexible`, `seamless`.
- Avoid `we` and minimize `you`.
- Use title case for page titles and major section titles.
- Use sentence case for body copy, helper text, alerts, and button labels.
- Do not use ellipses unless the action opens another step.

## Canonical Product Vocabulary

Use the terms in [glossary.md](glossary.md) consistently.

Do not invent synonyms in the UI.

Avoid:

- `setup` when the product means `Trade Plan`
- `journal entry` when the product means `Note`
- `bucket` when the product means `Portfolio`

## Lifecycle And Focus Language

Keep lifecycle and focus separate.

Rules:

- Use the lifecycle and focus terms defined in [glossary.md](glossary.md).
- Do not invent alternate labels for the same state unless the UI has a deliberate display-label rule.
- Use [navigation-model.md](navigation-model.md) for placement in the UI.

## Naming Rules

### Page titles

Use simple object-first titles:

- `Campaigns`
- `Trade Plans`
- `Trades`
- `Notes`
- `Strategy`
- `Imports`

Avoid decorative titles like:

- `Trading Dashboard`
- `Idea Workspace`
- `Market Journal`

### Detail pages

- Use the object name as the main title.
- Put status, parent relationship, watch state, and other metadata nearby.
- Do not repeat the object type in the title if the page context already makes it obvious.

### Navigation

Navigation labels should be short and stable.

Use:

- `Campaigns`
- `Trade Plans`
- `Trades`
- `Notes`
- `Strategy`
- `Positions`
- `Portfolios`
- `Imports`
- `Accounts`

## Action Language

Use `verb + object`.

Good:

- `New campaign`
- `New trade plan`
- `Add note`
- `Import trades`
- `Attach chart`
- `Accept trades`

Avoid vague actions:

- `Continue`
- `Manage`
- `Proceed`
- `Submit`

### Create actions

- Use `New` for first-class objects: `New campaign`, `New trade plan`, `New portfolio`
- Use `Add` for smaller contextual actions: `Add note`, `Add trade`

### Save actions

- Prefer autosave where it fits the workflow.
- If a label is needed, name the object: `Save strategy`, `Update campaign`, `Update trade plan`.
- Avoid generic `Save` for large forms when a clearer label fits.

### Relationship actions

Use the product model's language:

- `Link trade plan`
- `Assign portfolio`
- `Add to watchlist`
- `Remove from watchlist`

Avoid generic verbs like:

- `Connect`
- `Map item`
- `Relate`

### Destructive actions

Say exactly what will happen:

- `Delete note`
- `Delete campaign`
- `Remove from watchlist`

Do not use vague confirmations like `Confirm` or `Yes, remove`.

## Empty States

Rules:

- Keep empty states calm and useful.
- Do not use jokes, filler, or celebration language.
- Do not use `No data available`.

Use [visual-design-system.md](visual-design-system.md) for empty-state structure and presentation.

Good:

- `No trade plans yet`
- `Trade plans turn ideas into executable setups. Create one when an idea is specific enough to trade.`
- CTA: `New trade plan`

Imports empty states should be operational:

- `No trades waiting for review`
- `Imported trades will appear here before they become permanent trade records.`

## Helper Text And Placeholders

### Helper text

Helper text should clarify meaning, not repeat the label.

It should explain one of:

- what belongs here
- when to use this
- what this affects
- what happens next

Good:

- `Leave this blank if the trade plan stands on its own.`
- `Use Watchlist for items that deserve repeated attention. This does not change lifecycle status.`

Bad:

- `Enter the campaign name here.`
- `This field lets you select a portfolio.`

### Placeholders

Placeholders should be examples or format hints, not instructions.

Good:

- `Semiconductor strength during the AI boom`
- `URNM breakout after six-month base`
- `Search campaigns`

Bad:

- `Enter campaign name`
- `Type here`

## Alerts And Feedback

### Success

Keep success messages short and factual:

- `Campaign updated`
- `Trade plan created`
- `3 trades accepted`

Avoid `Success!`

### Errors

Errors should include:

- what failed
- the most useful reason available
- the next step, if relevant

Good:

- `Could not import trades. Check the file format and try again.`
- `Could not save the trade plan. Retry in a moment.`

Avoid:

- `Something went wrong`
- `Unexpected error`

### Warnings

Warnings should describe the real risk:

- `This trade is not linked to a trade plan. Review context will be weaker until it is connected.`

## Loading Language

- Avoid generic `Loading...` where possible.
- Use contextual labels if text is necessary: `Loading trade plans`, `Importing trades`.
- Let [visual-design-system.md](visual-design-system.md) own skeletons and other structural loading behavior.

## Things To Avoid

Do not use:

- hype
- fintech clichés
- motivational slogans
- vague button labels
- synonym drift for core objects
- cheerful filler in empty states
- generic error text when a specific cause is available

Avoid words like:

- `journey`
- `seamless`
- `powerful`
- `intelligent`
- `optimize` unless it names a real analytical concept

## Summary

Trade Tracker copy should feel like a serious working tool for the target user described in [target-user.md](target-user.md).

When in doubt:

- use the canonical object name
- choose direct language over decorative language
- keep the copy short
- favor clarity over friendliness
