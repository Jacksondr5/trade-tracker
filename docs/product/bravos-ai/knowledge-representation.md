# Bravos AI Knowledge Representation

## Purpose

This document defines how Bravos source material should be shaped into knowledge that the assistant can retrieve, inspect, and cite.

Use it when deciding:

- how atomic Bravos knowledge units should be
- how video transcripts should be cleaned and segmented
- how citations should map back to source material
- how curated knowledge and deeper source inspection should work together

This is an evergreen design-direction document. It is not a final schema spec or implementation plan.

## Summary

The Bravos assistant should not retrieve or reason from raw source documents alone.

Instead, it should use a layered model:

1. `Raw source representation`
2. `Normalized source representation`
3. `Curated knowledge units`

At runtime, the assistant should begin with curated knowledge units and then drill into linked source material when needed.

The current corpus names should be treated as canonical:

- `trading-system`
- `macro-economic-conditions`
- `durable-market-principles`

The corpus boundary matters during extraction, not only during storage.

In particular:

- `trading-system` should stay strict and hold explicit, broadly applicable trade and process rules
- `macro-economic-conditions` should hold current market framing, current watch items, current setup guidance, and historical analogs used to interpret the present
- `durable-market-principles` should hold recurring market behaviors, even when they are conditional or subject-specific

## Core Recommendation

The default indexed evidence unit should be:

- one atomic claim
- one rule
- or one durable principle

Each unit should stay small enough to support precise retrieval and precise citation, but large enough to preserve the meaning of the claim.

The system should avoid making the primary indexed unit:

- a whole video summary
- a full document section
- a mixed paragraph with several unrelated claims

At the same time, it should avoid over-fragmenting knowledge into tiny isolated phrases that lose qualifier, condition, or scope.

## Knowledge Unit Granularity

The recommended default is:

- claim-sized units for evidence
- larger segments for local source context
- optional source summaries for routing and coarse recall

This creates a layered representation rather than forcing one unit shape to do every job.

## Shared Envelope, Corpus-Specific Payloads

The corpora do not need identical subject-matter fields.

The preferred design is:

- one thin shared schema envelope for linking, retrieval, and citation
- corpus-specific payload fields for the actual knowledge content

The shared envelope should cover the metadata the system needs consistently, such as:

- stable identity
- corpus
- source identity
- source published date/time
- timestamps and citation spans
- review status
- confidence
- tags and extracted entities

The knowledge payload itself can vary by corpus because `trading-system`, `macro-economic-conditions`, and `durable-market-principles` are not the same kind of material.

At this stage, `market-history` should not be treated as a fully separate corpus. It is better modeled as a lens, subtype, or metadata dimension within `macro-economic-conditions` because Bravos historical references usually appear as brief comparisons inside current macro commentary rather than as standalone historical lessons.

## Temporal Grounding

Bravos posts and videos often use relative time language such as:

- `last week`
- `earlier this year`
- `recently`
- `coming into this month`

Because of that, extraction and retrieval must preserve the source publication date and give the model enough time context to interpret relative references correctly.

The system should not let the model reason about relative time phrases in a vacuum.

This means:

- every source should retain an absolute published timestamp
- extracted units should preserve any relevant `as-of` context when possible
- downstream agents should be grounded in the source date when they interpret time-relative language

For `macro-economic-conditions` especially, temporal grounding is part of the meaning of the claim, not just metadata.

### Good Evidence Units

Good evidence-unit examples:

- a single Bravos trading rule
- a single macro view about the present market backdrop
- a single durable principle extracted from a broader discussion

These units should be citable and understandable on their own, while still linking back to nearby context.

### Units To Avoid

Avoid using the following as the primary evidence unit:

- entire video transcripts
- broad section summaries containing multiple claims
- caption-sized transcript fragments that only exist because of subtitle formatting

Those units are either too broad for precise retrieval or too narrow to preserve meaning.

## Two-Layer Retrieval Representation

The recommended runtime model is to separate:

1. `Summary or routing units`
2. `Evidence units`

### Summary Or Routing Units

These help the system answer questions like:

- what is this source generally about
- which sources are likely relevant
- which themes or instruments are discussed here

These units are useful for retrieval assistance, clustering, and high-level navigation.

They should not be treated as the main evidence layer for final trade-review judgments.

### Evidence Units

These are the claim-level units the assistant should actually cite and reason from.

They should link to:

- source identity
- timestamps or text spans
- nearby context
- the parent segment or document

This lets the assistant stay grounded while still moving quickly.

For V1, these evidence units will likely be trusted differently by corpus:

- `trading-system` should bias toward fully reviewed content
- `macro-economic-conditions` and `durable-market-principles` will often need to rely on auto-extracted content with preserved confidence and review metadata

For `macro-economic-conditions`, units may also carry historical-analog metadata when a present-day macro discussion references a prior episode. That does not require a fourth fully separate corpus yet.

The extractor should also allow one passage to yield both:

- a `macro-economic-conditions` unit about the current environment
- a `durable-market-principles` unit about the recurring behavior being explained nearby

By contrast, `trading-system` should not be inferred from current commentary unless Bravos explicitly states a broadly applicable trading or process rule.

## Scenario And Conditional Language

Macro and market commentary often uses conditional language such as:

- `if`
- `could`
- `perhaps`
- `may`
- `unless`

The extraction layer should not flatten these statements into asserted facts.

Instead, it should preserve whether a statement is:

- an asserted observation
- a scenario
- a contingent forecast
- a watch condition

This matters because scenario language is often part of the actual knowledge being communicated. Flattening it into a hard claim would distort the source.

## Signal Tension

Macro videos often contain multiple meaningful signals that point in different directions at the same time.

The system should not treat that as extraction noise by default.

Examples of this pattern include:

- one indicator acting as a tailwind while another acts as a headwind
- a bullish market behavior occurring alongside a risk signal
- multiple regimes or cross-currents that need to be monitored together

The extraction layer should preserve these tensions as first-class information rather than trying to prematurely collapse them into a single clean conclusion.

Historical analog references are one example of this pattern. They may enrich the interpretation of the current backdrop without becoming timeless principles themselves.

## Source Representations For Video

YouTube videos require a custom preprocessing layer because the caption stream is not organized around actual ideas.

For Bravos videos, the system should preserve at least three representations.

### 1. Raw Caption Stream

This is the original source-of-truth transcript from YouTube, including its original timestamps and chunk boundaries.

Keep it because it provides:

- exact provenance
- original timing
- a durable path back to the source

### 2. Normalized Transcript

This is a cleaned version of the transcript that:

- removes filler noise like repeated `um` or `uh` where appropriate
- restores more natural sentence boundaries
- merges closed-caption fragments into readable units
- preserves traceability back to the raw timestamped source

The normalized transcript is for readability and extraction, not for replacing the raw source.

### 3. Semantic Segments

These are topic-coherent ranges of discussion created from the normalized transcript.

They should reflect:

- what is actually being discussed
- where one idea ends and another begins

They should not simply mirror subtitle screen lengths.

Semantic segments should not be treated as the primary meaning-defining layer for extraction.

The extractor should identify candidate knowledge directly from transcript passages and then attach those units to semantic segments for context, citation review, and later drill-down.

Across repeated videos, semantic segments may also support later rolling summaries or watch-item synthesis, but that should remain a separate layer from the primary source-of-truth extraction flow.

## Video Citation Model

Video-derived knowledge should preserve multiple layers of time information.

The recommended model is:

- `claim span`
- `support span`
- `parent segment`

### Claim Span

This is the narrowest defensible timestamp range for the extracted claim.

It should be as precise as possible without becoming misleadingly narrow.

### Support Span

This is a somewhat broader timestamp range that captures nearby supporting context.

Use it when the claim depends on:

- qualifying language
- setup leading into the claim
- nearby explanation immediately after the claim

### Parent Segment

This is the larger semantic segment that the claim belongs to.

It exists so the system can later:

- re-open local context
- review the broader discussion
- support future screenshot capture or multimodal verification

The product should preserve both narrow and broad citation layers rather than forcing a single timestamp range to do both jobs.

## Why Both Narrow And Broad Context Matter

Using only broad segment-level timestamps weakens citation precision and makes atomic knowledge units less useful.

Using only ultra-narrow timestamps creates false precision and may hide the surrounding context needed to interpret the claim honestly.

The right default is:

- broader grouping during transcript processing
- narrower spans at the knowledge-unit level

## Visual Dependency

Not all transcript-derived knowledge is equally independent from the on-screen visual material.

Some claims are fully understandable from speech alone. Others are only partially understandable without the chart or diagram being shown.

The system should preserve this distinction explicitly.

A useful future-facing model is:

- `visual_dependency: none`
- `visual_dependency: helpful`
- `visual_dependency: required`

Examples:

- a spoken rule about RSI behavior may be understandable without the chart
- a statement like `you can see the loss of momentum here` may depend heavily on the visual

V1 does not need full screenshot-driven interpretation, but it should preserve enough metadata to distinguish visually grounded claims from transcript-sufficient claims.

## Source Drill-Down Model

The assistant should use a bounded two-step process:

1. retrieve curated knowledge units first
2. drill into linked source material when needed

This drill-down should remain targeted.

The assistant may inspect:

- the directly linked claim span
- a bounded window around that span
- nearby related spans from the same source when they are clearly part of the same idea

The assistant should not automatically turn this into a broad corpus-wide search unless it explicitly states that local verification was insufficient.

When curated knowledge conflicts with deeper source material, the source material should generally win. Curated knowledge exists to increase accessibility and retrieval quality, not to override the source-of-truth layer.

## Why Drill-Down Matters In V1

The curated knowledge layer will likely improve over time rather than begin perfectly mature.

If the assistant cannot inspect source material at all, then:

- extraction mistakes become hard product failures
- nuance lost during curation cannot be recovered
- user trust depends too heavily on the first-pass knowledge layer

Allowing bounded drill-down makes the system more resilient while keeping the assistant grounded.

The intended posture is:

- trust curated knowledge first for speed
- trust deeper source more when verification reveals meaningful nuance or contradiction

## Visible Reasoning And Actions

When the assistant drills into source material, that should be visible in the output.

The response should make clear:

- what it checked
- why it checked it
- whether the deeper inspection changed the conclusion

This is part of the debugging model for the system, not just a UX preference.

## Relationship To Future Tooling

This knowledge-representation model is intentionally compatible with using external tools for:

- document parsing
- vector indexing
- retrieval infrastructure

However, the Bravos-specific knowledge shaping should remain repo-owned.

In particular, the system should keep control over:

- corpus classification
- claim extraction behavior
- timestamp and citation handling
- visual-dependency handling
- the relationship between curated units and source material

## Open Questions

- what the final shared base schema should be across corpora
- which fields should differ between `system`, `macro`, and `durable principle` units
- how semantic segmentation should be performed for long videos
- how much automatic transcript cleanup is acceptable before meaning drifts
- how future screenshots should be captured and attached to visually dependent claims
- how aggressive the assistant should be about escalating from local drill-down to broader search

## Summary

The Bravos assistant should retrieve from small, citable, claim-level knowledge units while preserving broader local context through support spans and parent segments.

For videos, the system should preserve:

- the raw caption stream
- a normalized transcript
- semantic segments
- extracted knowledge units linked back to timestamp ranges

At runtime, the assistant should reason from curated knowledge first, then perform visible, bounded source drill-down when the first-pass evidence is not enough.
