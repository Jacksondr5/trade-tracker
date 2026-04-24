# Bravos AI Knowledge Extraction

## Purpose

This document defines the evergreen design direction for extracting Bravos knowledge from video transcripts into structured knowledge units for the Bravos AI knowledge base.

Use it when deciding:

- how the transcript extractor should process a video transcript
- what the extractor should emit
- how segments and knowledge units should relate to each other
- which extraction behaviors should be encouraged or prohibited
- how transcript-derived knowledge should stay aligned with the Bravos-grounded assistant design

This is an evergreen product-direction document. It is not a prompt draft, implementation plan, or final schema spec.

## Summary

The transcript extractor should run as a single unified pass over a full transcript and emit two linked outputs:

- `knowledge_units`
- `segments`

`knowledge_units` are the primary retrieval objects for the Bravos AI knowledge base.

`segments` are supporting context objects that preserve readable local transcript context, support source review, and enable later bounded drill-down.

The extractor should identify candidate knowledge directly from transcript passages rather than first summarizing or framing semantic segments and then extracting from those summaries.

This keeps extraction closer to the source material and reduces the risk that segment framing will distort what knowledge is emitted.

## V1 Input Assumptions

The initial extractor should assume:

- input is a relatively high-quality transcript derived from YouTube
- the transcript is not pre-segmented
- the extractor sees the full transcript in one pass
- source metadata such as source identity and published timestamp are available outside the transcript text itself

`V1` is focused on producing usable candidate knowledge units, not on solving every upstream transcript-cleaning problem.

## Core Recommendation

The recommended extraction flow is:

1. read the full transcript and source metadata
2. identify candidate knowledge directly from transcript passages
3. emit final knowledge units with storage-shaping metadata
4. create semantic segments as context containers
5. attach each unit to one or more segments while preserving narrower and broader citation spans

This means extraction should be `transcript-first` and `segment-attachment-second`.

The extractor should not treat segment labels or segment summaries as the source of meaning. Segments exist to organize and contextualize knowledge, not to redefine it.

Why this direction fits:

- it keeps unit extraction closer to the source
- it reduces segment-framing bias
- it supports linked context without making segments the primary knowledge object
- it fits the runtime model where `knowledge_units` are the evidence layer and `segments` are the context layer

## Output Model

The extractor should emit a structured result with two arrays:

- `knowledge_units`
- `segments`

The application layer may discard segments that do not end up anchoring any knowledge units. That cleanup should not be pushed into the extractor prompt.

## Knowledge Units

A `knowledge_unit` is the primary stored evidence object for retrieval and later assistant reasoning.

It should remain:

- atomic
- source-faithful
- lightly cleaned
- explicit rather than inferred
- citable

Expected fields include:

- `unit_id`
- `statement`
- `corpus`
- `unit_type`
- `temporal_sensitivity`
- `claim_span`
- `support_spans`
- `parent_segment_ids`
- `time_context`
- `visual_dependency`
- `visual_instruction`

### Field Intent

- `statement`: a lightly cleaned, source-faithful statement that may summarize wording but should not lose resolution or introduce inference
- `corpus`: one of `trading-system`, `macro-economic-conditions`, or `durable-market-principles`
- `unit_type`: a controlled type such as `rule`, `observation`, `scenario`, `watch-condition`, or `principle`
- `temporal_sensitivity`: enough structure to distinguish rule-like, durable, and time-sensitive material
- `claim_span`: the narrowest defensible transcript span for the unit
- `support_spans`: one or more broader or repeated supporting spans
- `parent_segment_ids`: one or more linked semantic segments
- `time_context`: a lightweight object that preserves the original relative time phrase when relevant
- `visual_dependency`: `none`, `helpful`, or `required`
- `visual_instruction`: a short instruction describing what a later visual pass should inspect

## Corpus Assignment

Corpus assignment is not secondary metadata. It is one of the main meaning-shaping parts of extraction because it affects:

- what the extractor considers worth storing
- how a passage should be split into units
- how the assistant will later retrieve and reason over the knowledge

### `trading-system`

`trading-system` should stay strict.

This corpus is for explicit, broadly applicable trading and process guidance that could be applied to almost any trade regardless of the current market environment.

Good examples include:

- always using a stop loss
- having a clear thesis and game plan before entering
- monitoring key technical values before and during a trade

This corpus should include things like:

- trade-process rules
- setup rules
- invalidation rules
- risk rules
- broadly applicable trade-evaluation guidance

This corpus should not absorb one-off commentary about the current market just because that commentary sounds actionable.

If assigning `trading-system` would require generalizing from current market discussion into a broader rule, the extractor should not do it.

### `macro-economic-conditions`

`macro-economic-conditions` is for current or date-sensitive market framing.

This includes:

- current market posture
- current risk or opportunity framing
- current watch items
- current trade context
- current sector or asset leadership
- historical analogs being used to interpret the present market

This corpus should hold statements about:

- what matters now
- what to watch now
- how the present environment should be interpreted

Current setup guidance should remain here even when it sounds action-guiding. The extractor should not promote that guidance into `trading-system`.

### `durable-market-principles`

`durable-market-principles` is for timeless or slowly changing market behavior patterns.

These principles do not have to be universal rules. They can be:

- conditional
- subject-specific
- tied to a particular asset, sector, policy action, or intermarket relationship

Good examples include:

- Federal Reserve actions often having a long lag effect
- the S&P 500 often revisiting moving averages during bull markets without invalidating the bull market
- silver often making an explosive move after gold has already risen substantially

This corpus is for statements describing how markets, assets, sectors, or regimes tend to behave over time.

The extractor should not require Bravos to explicitly label something as a general principle. If a durable market behavior is explicitly being explained, it can be extracted as its own unit.

## Boundary Rules

The extractor should use these tests:

- if a statement is an explicit, broadly applicable trading or process rule, it may belong in `trading-system`
- if a statement is about the current market environment, current watch items, current setup, or a historical analog being used to interpret the present, it belongs in `macro-economic-conditions`
- if a durable market behavior is being explicitly explained, it may belong in `durable-market-principles`

A single passage may legitimately yield both:

- a `macro-economic-conditions` unit about what matters now
- a `durable-market-principles` unit about the recurring behavior being explained nearby

However:

- a current watch item that relies on a recurring relationship is still `macro-economic-conditions` if the statement itself is about what to watch now
- historical analogs used to interpret the present stay inside `macro-economic-conditions`
- `trading-system` should remain the hardest corpus to enter

## Segments

A `segment` is a semantic context span. It is not the final knowledge object and it should not be treated as a coarse summary standing in for multiple claims.

Its main jobs are:

- preserve readable local transcript context
- support citation review
- support later source drill-down
- provide a stable local grouping for nearby related knowledge units

The segment should include fields such as:

- `segment_id`
- `start_timestamp`
- `end_timestamp`
- `topic`
- `transcript_text`

The `topic` should remain descriptive rather than interpretive. It should say what is being discussed, not what conclusion the model thinks the user should draw.

## Extraction Rules

The extractor should follow these rules:

- read the full transcript before finalizing output
- extract only knowledge explicitly stated by Bravos
- stay source-faithful while lightly cleaning transcript noise
- allow summarization, but do not lose resolution
- preserve qualifiers, conditions, tensions, and uncertainty language
- do not convert implications into asserted facts
- do not force every segment to yield a unit
- do not force every corpus to appear in each passage
- emit multiple units from one passage when they are genuinely distinct
- allow one passage to yield units across multiple corpora when the statements are genuinely distinct
- when unsure whether two candidate units are the same, split them apart
- keep `trading-system` strict and explicit rather than inferred from current market commentary
- use segments as context anchors, not as the meaning-defining layer

## Multi-Unit And Multi-Corpus Behavior

A single passage may contain:

- more than one knowledge unit
- units belonging to different corpora
- a mix of time-sensitive and durable material

The extractor should support this naturally.

However, it should not force one statement to become several units just because several corpora exist. Separate units are appropriate only when the source actually contains separate statements.

## Repetition Within A Transcript

If the same atomic point is restated within a transcript, the default behavior should be:

- keep one unit per corpus when the repeated passages clearly support the same atomic point
- attach multiple `support_spans` and `parent_segment_ids` to that unit

If a later passage adds a meaningful new condition, scope, exception, or distinct statement, the extractor should emit a separate unit rather than overloading the first one.

The guardrail is to avoid turning one unit into a compound bundle of adjacent ideas just to reduce count.

## Temporal Handling

The extractor should preserve time-relative phrasing when timing materially affects meaning.

`V1` should not depend on aggressive date normalization during extraction.

The preferred approach is lightweight:

- keep the source-faithful `statement`
- preserve the original relative phrase in `time_context` when relevant
- rely on source-level published timestamp metadata to ground later runtime interpretation

This keeps the extractor closer to the source and avoids introducing avoidable date-normalization errors.

## Visual Handling

Transcript-only extraction is not always sufficient.

The extractor should explicitly mark whether a knowledge unit depends on visual information:

- `none`
- `helpful`
- `required`

It should also emit a short actionable `visual_instruction` that tells a later visual clarification step what to inspect.

This instruction should be more concrete than a generic note that a chart is involved. It should tell the later system what information is likely being carried visually, such as:

- the specific level or range being referenced
- which asset or sector is leading or lagging
- whether a divergence or momentum loss is visible
- what table values or labels need to be read

## Relationship To RAG

The extractor should support a layered retrieval model rather than a single undifferentiated pool.

The intended runtime pattern is:

- retrieve `knowledge_units` first as the primary evidence layer
- use linked `segments` for local context, review, and bounded drill-down

This is preferable to storing only transcript-level context because it keeps final evidence retrieval precise while preserving a practical context layer between atomic units and the full transcript.

Segments should not crowd out units at retrieval time. They are supporting context objects, not equal-status evidence objects.

## Failure Modes To Guard Against

The extraction design should explicitly guard against:

- `segment framing bias`
- `over-normalization`
- `flattened conditionals`
- `lost temporal context`
- `visual blind spots`
- `forced corpus filling`
- `compound units`

These failures are more damaging than minor inconsistency in exact unit count because they distort what Bravos actually said.

## Relationship To Other Bravos AI Docs

- [knowledge-base.md](./knowledge-base.md) defines the purpose and behavioral boundaries of the Bravos-grounded assistant
- [knowledge-representation.md](./knowledge-representation.md) defines the layered source, segment, citation, and runtime reasoning model
- this document defines how a full transcript should be transformed into segments and candidate knowledge units that fit that broader system

## Summary

The Bravos transcript extractor should be a full-transcript, unified, transcript-first knowledge extraction pass.

It should:

- emit `knowledge_units` as the primary retrieval objects
- emit linked `segments` as context anchors
- classify units into the canonical Bravos corpora
- preserve timing, conditionals, and visual dependency where relevant
- stay source-faithful while lightly cleaning transcript noise
- prefer splitting over merging when unit identity is unclear

This approach fits the Bravos AI runtime design while keeping the extractor close to the original source material and avoiding unnecessary interpretive drift.
