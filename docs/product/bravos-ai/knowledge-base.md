# Bravos AI Knowledge Base

## Purpose

This document defines the intended role, boundaries, and design direction of the Bravos AI knowledge base in Trade Tracker.

Use it when deciding:

- what this feature is for
- what it should explicitly not become
- how Bravos knowledge should be shaped before it reaches an LLM
- how the assistant should evaluate trade ideas
- how future Bravos AI work should stay aligned with the product's core goals

This is an evergreen product-direction document. It is not an implementation plan and it is not the ingestion pipeline specification.

## Summary

The Bravos AI knowledge base is not primarily a search engine and not primarily a generic archive chatbot.

Its intended V1 role is:

- help the user pressure-test trade ideas against Bravos macro views and the Bravos trading system
- remain citation-backed and evidence-bound
- behave like a disciplined reviewer rather than an agreeable assistant

The product value is not that it can answer arbitrary questions about old Bravos content. The value is that it can use Bravos knowledge to challenge, refine, and reject weak trade ideas before they turn into action.

## Primary V1 Job

The primary V1 job is:

- act as a sounding board for trade ideas

That means the user should be able to bring one or more trade ideas in natural language and receive a response that:

- clarifies what the idea actually is
- asks follow-up questions when important context is missing
- evaluates the idea against the current Bravos macro backdrop
- evaluates the idea against the Bravos trading system and rules
- cites the Bravos knowledge used in that evaluation
- produces a firm verdict instead of vague agreement

This assistant should help the user think more clearly and more honestly. It should not make the user feel validated just because the user phrased an idea confidently.

## What This Feature Is

This feature is:

- a Bravos-grounded reasoning layer
- a citation-backed assistant
- a structured retrieval and evaluation system wrapped in a conversational interface
- a way to preserve and reuse Bravos educational and market knowledge that would otherwise be buried in years of content

The assistant should feel conversational, but its conversational behavior should sit on top of a disciplined internal evaluation model.

## What This Feature Is Not

This feature is not:

- a generic Bravos search experience as its main purpose
- a broad market chatbot trained to answer from the entire internet
- a replacement for the user's own strategy or judgment
- a generic long-form knowledge base inside Trade Tracker
- a live signal engine
- an autonomous trade recommender
- a portfolio analyzer over Trade Tracker's internal data in V1

The feature may eventually support broader use cases, but V1 should stay tightly centered on Bravos-grounded trade review.

## V1 Goals

- Make Bravos knowledge practically useful during trade evaluation rather than leaving it trapped in old posts, videos, and PDFs.
- Ground the assistant in explicit citations so the user can inspect why it said what it said.
- Help the user evaluate whether a trade idea fits the current macro backdrop.
- Help the user evaluate whether a trade idea fits the Bravos trading system and process rules.
- Surface durable, timeless lessons from older Bravos material when they are relevant.
- Support a natural conversational workflow instead of forcing the user through rigid forms.
- Make the assistant firm enough to reject ideas clearly when the evidence does not support them.

## V1 Non-Goals

- Do not optimize for broad archive Q&A as the primary workflow.
- Do not rely on raw transcript dumps at runtime as the main reasoning source.
- Do not mix internal app context like portfolio holdings, campaigns, trade plans, or positions into V1 analysis.
- Do not force the user to submit a fully structured trade form before getting feedback.
- Do not let recent macro commentary override trading-system rules.
- Do not make the assistant highly agreeable or easy to steer away from Bravos-grounded conclusions.

## Interaction Model

### User Input

User input should remain natural-language in V1.

The user should be able to describe:

- a single trade idea
- a small set of competing ideas
- a thesis with several possible expressions
- a partially formed idea that still needs refinement

The system should not require the user to start with a rigid template like:

- ticker
- direction
- timeframe
- thesis
- entry
- stop
- target

Avoiding that friction matters because the product should feel like a real sounding board, not a form workflow.

### Internal Evaluation Rubric

Even though the user-facing interaction should stay conversational, the assistant should not reason loosely.

Internally, it should still examine questions like:

- what trade idea is actually being proposed
- what macro thesis is implied
- what setup or trigger is implied
- what would invalidate the idea
- what Bravos evidence supports it
- what Bravos evidence conflicts with it
- what information is still missing

This internal structure exists to keep the assistant consistent, not to turn the user experience into a form.

### Handling Missing Information

When the user's input is incomplete, the assistant should not rush to analysis.

Instead it should:

- identify what is missing
- use Bravos system knowledge to know which questions matter most
- ask for the missing context before issuing a strong verdict

The goal is not to ask more questions for their own sake. The goal is to avoid weak analysis built on unstated assumptions.

### Multi-Idea Conversations

V1 should support natural comparison between a small number of trade ideas within the same conversation.

That includes situations where:

- several trade expressions come from one macro thesis
- the user wants to compare candidate instruments
- the conversation evolves from one idea into two or three alternatives

The system does not need to optimize for evaluating a large batch of ideas at once.

## Assistant Stance

The assistant should be:

- firm
- evidence-bound
- willing to disagree
- difficult for the user to talk into agreement

Its default posture should be closer to a disciplined reviewer than a collaborative brainstorming partner.

This matters because many LLMs are naturally too agreeable. In this feature, that would create the wrong behavior. The assistant should privilege Bravos-grounded evidence over the user's enthusiasm for an idea.

## Decision Model

The assistant should evaluate each idea through two separate gates:

1. `System fit`
2. `Macro fit`

Both gates need to clear.

That means:

- a trade can fit the macro backdrop but still fail because it violates Bravos trading-system rules
- a trade can look technically clean within the trading system but still fail because the macro backdrop is hostile

These are separate signals, not competing opinions that should be averaged together.

### Decision Rule

The V1 decision bias should be:

- fail the trade if `system fit` is negative
- fail the trade if `macro fit` is negative
- avoid passing a trade unless both signals are sufficiently positive

This is intentionally strict.

## Knowledge Separation

The knowledge base should not behave like a single undifferentiated pile of Bravos content.

The recommended V1 model is to separate Bravos knowledge into at least three logical corpora.

### 1. `trading-system`

This corpus holds time-agnostic Bravos rulebook material such as:

- setup rules
- risk/reward standards
- invalidation logic
- process rules
- sizing guidance
- recurring tactical principles

This corpus should not be recency-weighted in the same way macro content is.

Because this corpus is both critical and comparatively bounded, the current working assumption is that it can receive full manual review and curation.

### 2. `macro-economic-conditions`

This corpus holds current or time-sensitive market framing such as:

- recent macro update videos
- current market posture
- regime commentary
- date-sensitive sector views
- short-horizon opportunity or risk framing

This corpus should have a meaningful default recency bias.

V1 will likely need to trust auto-extracted knowledge in this corpus by default, while preserving review status and confidence metadata for later refinement.

### 3. `durable-market-principles`

This corpus holds more timeless or slowly changing market lessons that may appear inside macro videos, posts, or PDFs, such as:

- recurring intermarket relationships
- broad commodity behavior patterns
- general macro cause-and-effect principles
- durable sector or asset-class tendencies

This corpus exists because macro content often contains both:

- time-bound commentary
- timeless principles

Those two should not be treated as the same kind of knowledge.

Like `macro-economic-conditions`, this corpus will likely need to trust auto-extracted knowledge by default in V1 while preserving reviewability and provenance.

## Shared Schema Envelope

The corpora should not be forced into the same subject-matter payload shape.

However, they should share a thin common envelope of metadata that makes the system coherent across ingestion, storage, retrieval, and citation.

That shared envelope should include fields such as:

- stable IDs
- corpus name
- source identity
- citation fields and source spans
- timestamps
- review status
- confidence
- entity and topic tags

Beyond that shared envelope, each corpus should be free to carry more specialized payload fields that match its own type of knowledge.

## Time Sensitivity

Time sensitivity should live at the knowledge-unit level, not only at the document level.

A single Bravos video may contain:

- a dated claim about current market conditions
- a durable principle that should still be retrievable much later

Because of that, the system should avoid classifying an entire source as simply timeless or time-bound. The more useful distinction is whether a specific extracted unit is:

- time-sensitive
- durable
- rule-like and time-agnostic

This distinction is one of the key strengths the system should preserve over time.

## Runtime Knowledge Strategy

V1 should reason primarily from pre-extracted and curated knowledge units, not from large raw transcripts or full raw documents.

That means the runtime assistant should rely on a curated knowledge layer that is already shaped into usable units before prompt time.

Why this matters:

- there is too much backlog to reason over raw content directly in a reliable way
- curated units make retrieval cheaper and more predictable
- curated units allow system rules, macro views, and durable principles to be handled differently
- curated units give the product a clearer path toward future review and quality control

Raw sources still matter for provenance, citation, and possible future verification workflows, but they should not be the main runtime reasoning substrate in V1.

As an operating principle, deeper source material should generally outrank curated knowledge when the two conflict. The purpose of curation is to make source knowledge more accessible and more retrievable, not to replace the source as the ultimate grounding layer.

### Curated-First With Source Drill-Down

V1 should not stop at curated knowledge alone.

The recommended behavior is:

- start with curated knowledge units for the first-pass evaluation
- drill into linked source material when the curated layer is weak, conflicting, ambiguous, or incomplete
- keep that drill-down bounded and visible

This is important because the curated layer will likely improve over time rather than start perfectly mature. If the assistant cannot inspect underlying source material, then any extraction weakness becomes a hard product limitation.

The intended model is:

1. `Curated knowledge review`
2. `Targeted source verification when needed`
3. `Final evidence-bound verdict`

The system should not default to open-ended raw-source chat. It should use source drill-down as a controlled second step.

Source drill-down should be treated as verification and refinement, not as permission to relitigate the entire corpus on every answer.

## Recommended Retrieval Architecture

The recommended V1 approach is:

- use curated knowledge units
- keep the corpora logically separate
- retrieve from each corpus independently
- combine the retrieved evidence in the prompt
- require the final response to remain grounded in citations

This is preferable to a fully unified corpus because the product logic itself depends on treating different knowledge classes differently.

### Why Separation Matters

Separate retrieval policies make it easier to:

- keep macro and system reasoning distinct
- apply recency bias only where appropriate
- preserve time-agnostic rulebook guidance
- introduce future human-review workflows without redesigning the whole system

The current corpus names should be used consistently:

- `trading-system`
- `macro-economic-conditions`
- `durable-market-principles`

## Source Drill-Down Behavior

When the assistant drills deeper into source material, it should do so in a way that remains constrained, inspectable, and grounded in the original retrieval path.

The assistant should be allowed to:

- inspect the directly linked source span
- inspect a bounded context window before and after that span
- inspect nearby related spans from the same source when they are clearly part of the same idea

The assistant should not silently turn drill-down into:

- a full-video reread
- a broad new search across the whole corpus
- an unconstrained second-pass research workflow

The default rule should be:

- prefer local verification before broad search

If local verification still leaves the assistant uncertain, it should say so explicitly instead of hiding that uncertainty.

### When Drill-Down Should Happen

Drill-down is especially appropriate when:

- curated evidence is low-confidence
- curated evidence conflicts internally
- a claim appears visually dependent
- a critical point materially affects the verdict
- the assistant needs nuance that the curated unit did not preserve

### Visible Action Reporting

When the assistant drills into source material, that action should be visible in the response.

The assistant should not hide that it performed extra verification. A useful response shape may include:

- `Initial knowledge review`
- `Source drill-down performed`
- `What it checked`
- `What changed`
- `Final verdict`

This supports user trust and provides a concrete debugging trail.

## Approaches Considered

### Approach 1: Curated Knowledge Units With Separate Corpora

This is the recommended V1 direction.

Each extracted unit is a small, structured claim, rule, or principle with citation metadata and corpus-specific handling.

Why it fits best:

- it matches the two-gate reasoning model
- it supports explicit citation
- it creates a cleaner debugging surface
- it scales better than raw-source reasoning

Main cost:

- it requires a thoughtful knowledge-unit schema

### Approach 2: Source Briefings With Lighter Extraction

In this model, each source becomes a more summarized briefing rather than a set of smaller atomic units.

This is simpler to bootstrap but weaker for:

- precise retrieval
- separating durable vs time-sensitive knowledge
- applying distinct macro and system logic

### Approach 3: Heavier Ontology Or Knowledge Graph

This is not the recommended V1 approach, but it is a meaningful future direction.

A future version could formalize entities and relationships such as:

- instruments
- sectors
- macro regimes
- setup types
- risk rules
- relationships between principles and trade expressions

Potential long-term benefit:

- deeper reasoning and more powerful future workflow support

Why it is not the V1 recommendation:

- the taxonomy cost is high
- the system would likely become too rigid too early
- V1 first needs evidence about what retrieval and evaluation patterns are actually useful

This option should remain documented as a possible later evolution once the curated-unit model proves itself.

## Output Shape

The assistant should expose intermediate reasoning explicitly.

This is important because explicit reasoning is the main debugging mechanism for this feature. It allows the user to see whether a bad answer came from:

- weak retrieval
- weak macro interpretation
- weak system interpretation
- missing context
- missing knowledge

The likely V1 response shape should include:

- `Trade idea`
- `Missing questions` when needed
- `System fit`
- `Macro fit`
- `Supporting evidence`
- `Conflicting evidence`
- `Verdict`

The answer should remain readable and conversational, but it should not hide the structure that led to the conclusion.

## Citation Expectations

Citations are not optional polish. They are part of the core trust model.

The assistant should not ask the user to trust its synthesis blindly. Instead, it should show which Bravos knowledge units supported:

- the macro assessment
- the system assessment
- the final verdict

This is necessary both for user trust and for system debugging.

For video sources in particular, the citation model should preserve enough time information to support:

- direct transcript-span citation
- later source review
- future screenshot capture or other visual inspection workflows

## Relationship To Ingestion

The ingestion and extraction pipeline is a prerequisite for this feature, but it is a separate project.

This document assumes that Bravos content can be ingested and transformed into useful knowledge units. The purpose here is to define:

- what kind of assistant behavior the product wants
- what kind of knowledge shape that behavior requires

This keeps the assistant design from being overly constrained by ingestion details too early while still making clear that curated extraction quality is foundational.

## Open Questions

The following questions remain open and should be resolved in later design work:

- what metadata each unit should carry
- how citations should be rendered in the final UX
- how multi-idea comparison should be structured in detail
- how future source drill-down or verification workflows should work

Current working assumptions:

- `trading-system` can be fully reviewed
- `macro-economic-conditions` and `durable-market-principles` will need to trust auto-extracted knowledge in V1
- review-state weighting can be added later if it proves necessary

## Summary

The Bravos AI knowledge base should be a citation-backed, Bravos-grounded trade-review assistant.

Its V1 purpose is not to answer arbitrary archive questions. Its purpose is to help the user pressure-test trade ideas against:

- the Bravos trading system
- the current Bravos macro backdrop
- relevant durable Bravos market principles

It should reason from curated knowledge units, keep key knowledge classes separate, ask follow-up questions when needed, and issue firm verdicts that are auditable through explicit intermediate reasoning and citations.
