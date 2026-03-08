# Product Principles

## Purpose

These principles define how Trade Tracker should make product decisions.

Use [target-user.md](target-user.md) for the audience assumptions these principles are optimizing for.

They are meant to be durable rules for deciding:

- what to build
- what not to build
- how workflows should feel
- how tradeoffs should be resolved when simplicity, speed, structure, and insight are in tension

## 1. Optimize For Process Improvement, Not Activity

Trade Tracker should help improve trading performance by improving the quality of the underlying process.

That means the product should prioritize:

- clearer thesis development
- better trade planning
- stronger decision context during trades
- more honest retrospectives
- analytics that reveal whether the process is working

It should not optimize for:

- more clicks
- more logging for its own sake
- more surface area without better insight

If a feature creates activity without improving process quality, it is probably noise.

## 2. Reduce Cognitive Load

The product exists in part because important ideas, plans, and decision context are too difficult to hold in working memory.

Trade Tracker should reduce that burden by giving durable structure to:

- macro theses
- campaign ideas
- trade plans
- live trade notes
- retrospective evidence

The target user should not have to keep an idea front of mind just to avoid losing it.

When choosing between a design that depends on memory and one that externalizes context clearly, prefer the one that reduces memory pressure.

## 3. Preserve Evidence, Not Just Conclusions

The product should retain the evidence needed to understand both what happened and why.

The most important evidence types are:

- imported trade records
- time-stamped notes
- chart screenshots

The goal is not just to store opinions after the fact. The goal is to preserve the decision record closely enough that a later review can reconstruct the real context of a trade.

Whenever possible, features should strengthen the evidence trail rather than summarize it away too aggressively.

## 4. Make Review Honest And Actionable

Retrospectives are not mainly about storytelling. They are about identifying whether the target user followed a sound process and where that process needs to improve.

Trade Tracker should support review of:

- why a trade was entered
- why exposure was increased
- why profits were taken
- why a trade was exited
- whether those actions matched the plan and principles in place at the time

Outcome analytics and retrospective review serve different jobs:

- analytics detect whether the process is working
- retrospectives help diagnose why it is or is not working

The product should support both without collapsing them into the same thing.

## 5. Favor Prepared Conviction Over Live Improvisation

The app should help the target user trade from prepared plans rather than gut feel.

This is especially important during volatile periods, when the target user is most vulnerable to:

- reacting emotionally
- forgetting the original thesis
- confusing normal price action with invalidation
- changing course without a clear reason

Trade Tracker should help the target user lean on defined plans, explicit monitoring conditions, and preserved context instead of improvising under pressure.

## 6. Use Structure To Clarify, Not To Punish

Campaigns, trade plans, and trades form a useful hierarchy:

- campaigns can contain trade plans
- trade plans can contain trades

But that structure must remain flexible enough to support real workflows:

- some trade plans are standalone
- some trades may exist without a plan

The product should make hierarchy visible and useful, but it should not make optional structure feel like unresolved or broken data.

Structure is there to reduce friction and improve clarity, not to enforce purity for its own sake.

See [glossary.md](glossary.md) for canonical term meanings and [information-architecture.md](information-architecture.md) for the object model.

## 7. Minimize Administrative Work

Administrative work and busy work feel productive while often stealing time from higher-level thinking.

Trade Tracker should aggressively reduce unnecessary maintenance work through:

- automatic matching where confidence is high
- smart defaults
- inline creation where it saves time
- suggestions that reduce repetitive mapping work

Examples include:

- auto-mapping imported trades to trade plans
- suggesting existing trades or records when creating new related objects

This principle matters most in operational workflows like imports, where the right measure of quality is often time saved and friction removed.

## 8. Make Information Easy To Reach

Much of the product's most important information is semi-structured and difficult to rank programmatically.

Because of that, hiding information behind too many clicks is often more dangerous than showing more context by default.

In general:

- important related information should be visible together
- campaign context should be easy to reach from a trade plan
- trade-plan context should be easy to reach from a trade
- notes and supporting evidence should be easy to revisit

If information is hidden, it is likely to be forgotten. Prefer layouts that surface the relevant context rather than concealing it behind overly tidy interfaces.

## 9. Distinguish Reflection Surfaces From Operational Surfaces

Not every part of the app should feel the same.

In particular:

- Strategy is a formal long-lived document
- Notes is a lightweight chronological journal
- Imports is an operational throughput workflow

These areas should share product DNA, but they should not be forced into a uniform interaction model.

The product should let each workflow feel appropriate to its job:

- editorial for strategy
- quick-capture for notes
- efficient and dense for imports

## 10. Use Personal Optimization As A Feature

Trade Tracker can take advantage of interaction patterns that would be too specialized for a broad-market product if they meaningfully improve the intended workflow.

That means the product can reasonably use:

- command palettes
- advanced hierarchy navigation
- dense contextual layouts
- minimal onboarding and instruction

If an interaction is unusually efficient for the target user, it may be the right choice even if it would be too specialized for a mass-market app.

The constraint is not mass-market convention. The constraint is whether it reliably improves the real workflow.

## 11. Complement Existing Tools Instead Of Rebuilding Them

Trade Tracker should not compete directly with tools that already do other jobs better.

In particular:

- brokerages execute trades
- TradingView provides charting and price-action visibility

Trade Tracker should focus on the layer around those tools:

- thesis
- planning
- note-taking
- evidence capture
- review
- analytics

If a proposed feature drifts toward brokerage execution, live alerting, real-time monitoring, or charting replacement, it should face a high bar for inclusion.

## 12. Prioritize Focus Over Breadth

Trade Tracker should not try to become a complete trading platform all at once.

The right bias is:

- deepen the workflows that matter most
- leave underdeveloped areas intentionally light until their role is clearer
- avoid broadening the product just because adjacent features are imaginable

## 13. Surface Priorities Explicitly

As the number of campaigns and trade plans grows, importance becomes harder to track from memory alone.

The product should provide explicit ways to mark focus and relevance, such as `Watchlist`, so important items stay visible until intentionally deprioritized.

The app should help answer:

- what deserves attention now
- what is linked to what
- where the target user should return next

This is especially important in navigation and review workflows.

Use [glossary.md](glossary.md) for the term meanings, [navigation-model.md](navigation-model.md) for placement and behavior, and [content-and-copy-principles.md](content-and-copy-principles.md) for wording.

## Summary

Trade Tracker should be a focused personal system for trading process development.

It should reduce cognitive load, preserve evidence, minimize busy work, expose important context, and make review honest enough to improve performance over time.

When in doubt, choose the direction that helps the target user think more clearly, follow plans more reliably, and learn more from the full record of their trading behavior.
