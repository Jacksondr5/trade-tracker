# UX Principles

## Purpose

These principles define how Trade Tracker should feel to use.

They are not generic usability rules. They are specific to this product's role as a personal trading process system focused on clarity, evidence, and improvement over time.

Use [target-user.md](target-user.md) for the audience assumptions behind these UX decisions.

## 1. Preserve Context At The Point Of Action

The target user should not have to leave a page or reconstruct memory just to understand what something means.

In practice:

- campaign context should be easy to reach from a trade plan
- trade-plan context should be easy to reach from a trade
- relevant notes and evidence should stay near the object they explain
- parent-child relationships should be obvious without hunting

Good UX in this product means decisions happen in context, not after a scavenger hunt.

## 2. Make The Hierarchy Legible

Campaigns, trade plans, and trades are not just separate pages. They form a working hierarchy.

The interface should make that hierarchy easy to:

- understand
- browse
- move through
- return to later

This means:

- local hierarchy controls matter
- sibling switching should be cheap
- standalone trade plans should remain first-class and clearly distinguished

When the hierarchy is hidden, the product becomes harder to think inside.

Use [glossary.md](glossary.md) for term meanings, [information-architecture.md](information-architecture.md) for the object model, and [navigation-model.md](navigation-model.md) for the navigation patterns that expose it.

## 3. Keep Important Information Visible

Much of the most valuable information in this app is semi-structured and situationally important.

That means the product should err toward showing meaningful context rather than hiding it behind overly neat UI.

Examples:

- thesis should not feel buried
- notes should be easy to reread
- key status and relationship information should be near the title or main content
- review surfaces should not require repeated drilling into subviews to reconstruct what happened

If information is hidden, it is likely to be forgotten.

## 4. Reduce Administrative Friction

Busy work steals attention from the actual thinking the product is meant to support.

The UX should remove unnecessary effort through:

- smart defaults
- prefilled links where confidence is high
- inline workflows when they save time
- minimal redundant data entry

This matters especially in imports and maintenance flows, where speed and low-friction completion are more important than expressive UI.

## 5. Optimize For Reviewability

A good interaction is not only easy in the moment. It should also leave behind a useful record.

The product should make it easy to preserve:

- what was done
- why it was done
- what the market looked like at the time

That means UX should encourage evidence capture, not just outcome logging.

Features should be judged partly by the quality of the later retrospective they make possible.

## 6. Distinguish Thinking Modes

Different parts of the product support different kinds of work. They should not all feel the same.

In particular:

- `Strategy` should feel formal and document-like
- `Notes` should feel fast, lightweight, and chronological
- `Imports` should feel efficient and operational
- `Campaigns` and `Trade Plans` should feel structured and navigable

Consistency matters, but sameness is not the goal.

The right interaction style depends on the job being done.

Use [feature-philosophy.md](feature-philosophy.md) for feature roles and [visual-design-system.md](visual-design-system.md) for concrete presentation rules.

## 7. Support Power Use Without Overexplaining

The product can assume domain fluency and repeated use.

That means the UX can lean into:

- denser interfaces
- stronger local navigation
- command palettes
- minimal hand-holding
- reduced instructional copy where the workflow is already familiar

The goal is not mainstream onboarding. The goal is efficient use by the target user.

## 8. Separate Focus From Lifecycle

The interface should distinguish between:

- what stage something is in
- what deserves attention right now

Lifecycle and focus are different concepts.

Examples:

- a trade plan can be `watching` as a tactical state
- that same trade plan can separately be on `Watchlist`
- an `active` campaign may or may not need immediate attention

UX should surface both without conflating them.

Use [glossary.md](glossary.md) for the underlying semantics, [navigation-model.md](navigation-model.md) for placement, and [content-and-copy-principles.md](content-and-copy-principles.md) for wording.

## 9. Favor Calm Clarity Over Dashboard Noise

The app should feel serious and readable, not flashy or hyperactive.

That means:

- strong hierarchy
- restrained color usage
- clear spacing
- stable layouts
- emphasis where it matters

The product should help the target user think clearly, not stimulate constant reaction.

This is especially important because the broader trading ecosystem often pushes the opposite feel.

## 10. Use Analytics To Orient, Not To Replace Thinking

Analytics are important, but they are not the whole product.

The UX should use analytics to answer questions like:

- is the process working
- where should I look more closely
- what deserves review

The product should not imply that derived metrics alone are sufficient without underlying notes, plans, and evidence.

Analytics should guide reflection, not replace it.

## 11. Make Navigation Cheap For Frequently Revisited Objects

Campaigns and trade plans are not one-time destinations. They are revisited repeatedly over time.

The UX should support:

- fast return to important items
- cheap movement between related items
- low-cost reorientation after context switching

This is why navigation should favor:

- local hierarchy awareness
- pinned focus items
- direct jump patterns when useful

Repeated multi-step navigation to familiar objects is a UX smell in this product.

See [navigation-model.md](navigation-model.md) for the source-of-truth navigation patterns.

## 12. Prefer Legible Automation

Helpful automation is good. Opaque automation is not.

When the UI auto-matches, suggests, or pre-associates data, it should remain understandable enough that the target user can trust it.

The target user should be able to tell:

- what the system did
- why it likely did it
- how to correct it if needed

Trade Tracker should feel assistive, not mysterious.

## Summary

Trade Tracker UX should make disciplined trading behavior easier by keeping context visible, reducing friction, preserving evidence, and supporting clear movement through the thesis-to-trade hierarchy.

When tradeoffs appear, prefer the experience that:

- reduces memory burden
- makes review easier later
- exposes important context sooner
- removes unnecessary maintenance work
- helps the target user think more clearly under real trading conditions
