import { z } from "zod";

const TIMESTAMP_REGEX = /^\d{2}:\d{2}:\d{2}$/;

export const bravosTimestampSchema = z
  .string()
  .regex(
    TIMESTAMP_REGEX,
    "Timestamp must use zero-padded HH:MM:SS format.",
  )
  .describe("A transcript timestamp in zero-padded HH:MM:SS format.");

export const bravosTranscriptSpanSchema = z
  .object({
    startTimestamp: bravosTimestampSchema.describe(
      "Inclusive start timestamp for this transcript span.",
    ),
    endTimestamp: bravosTimestampSchema.describe(
      "Inclusive end timestamp for this transcript span.",
    ),
  })
  .superRefine((value, ctx) => {
    if (value.startTimestamp > value.endTimestamp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startTimestamp must be less than or equal to endTimestamp.",
        path: ["startTimestamp"],
      });
    }
  })
  .describe(
    "A bounded span in the transcript. Use the narrowest honest timestamps available for a claim or supporting context.",
  );

export const bravosKnowledgeCorpusSchema = z.enum([
  "trading-system",
  "macro-economic-conditions",
  "durable-market-principles",
]);

export const bravosKnowledgeUnitTypeSchema = z.enum([
  "rule",
  "observation",
  "scenario",
  "watch-condition",
  "principle",
]);

export const bravosTemporalSensitivitySchema = z.enum([
  "rule-like",
  "durable",
  "time-sensitive",
]);

export const bravosVisualDependencySchema = z.enum([
  "none",
  "helpful",
  "required",
]);

export const bravosTimeContextSchema = z
  .object({
    originalPhrase: z
      .string()
      .trim()
      .min(1)
      .describe(
        'The source-relative time phrase that appeared in the transcript, such as "last week" or "earlier this month".',
      ),
  })
  .describe(
    "Lightweight timing context for statements that use relative or otherwise meaningfully time-bound phrasing.",
  );

export const bravosKnowledgeUnitBaseSchema = z.object({
  unitId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Extractor-assigned local identifier for this knowledge unit, such as unit-001.",
    ),
  statement: z
    .string()
    .trim()
    .min(1)
    .describe(
      "A lightly cleaned, source-faithful statement that preserves resolution and does not add inference beyond what Bravos explicitly said.",
    ),
  corpus: bravosKnowledgeCorpusSchema.describe(
    "Which Bravos knowledge corpus this unit belongs to.",
  ),
  unitType: bravosKnowledgeUnitTypeSchema.describe(
    "The shape of the knowledge being stored, such as a rule, observation, scenario, watch condition, or principle.",
  ),
  temporalSensitivity: bravosTemporalSensitivitySchema.describe(
    "How time-bound this knowledge is: rule-like, durable, or time-sensitive.",
  ),
  claimSpan: bravosTranscriptSpanSchema.describe(
    "The narrowest defensible transcript span for the core statement.",
  ),
  supportSpans: z
    .array(bravosTranscriptSpanSchema)
    .min(1)
    .describe(
      "One or more supporting transcript spans that provide broader context or repeated reinforcement for the same atomic point.",
    ),
  parentSegmentIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .describe(
      "One or more semantic segment identifiers that provide local context for this knowledge unit.",
    ),
  timeContext: bravosTimeContextSchema
    .nullable()
    .describe(
      "Null when no additional relative time phrase needs to be preserved beyond the source publication timestamp.",
    ),
});

const bravosKnowledgeUnitNoVisualSchema = bravosKnowledgeUnitBaseSchema.extend({
  visualDependency: z
    .literal("none")
    .describe("Use when the statement is understandable from transcript alone."),
  visualInstruction: z
    .null()
    .describe("Null when no additional visual clarification is needed."),
});

const bravosKnowledgeUnitWithVisualSchema =
  bravosKnowledgeUnitBaseSchema.extend({
    visualDependency: z
      .enum(["helpful", "required"])
      .describe(
        "Use helpful when visuals would clarify the statement, and required when the transcript is not sufficient on its own.",
      ),
    visualInstruction: z
      .string()
      .trim()
      .min(1)
      .describe(
        "A short, actionable instruction for a later visual clarification step describing exactly what to inspect in the chart, slide, table, or other on-screen aid.",
      ),
  });

export const bravosKnowledgeUnitSchema = z
  .union([
    bravosKnowledgeUnitNoVisualSchema,
    bravosKnowledgeUnitWithVisualSchema,
  ])
  .describe(
    "One atomic, citable piece of Bravos knowledge extracted from the transcript.",
  );

export const bravosSegmentSchema = z
  .object({
    segmentId: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Extractor-assigned local identifier for this semantic segment, such as segment-001.",
      ),
    startTimestamp: bravosTimestampSchema.describe(
      "Inclusive start timestamp for the semantic segment.",
    ),
    endTimestamp: bravosTimestampSchema.describe(
      "Inclusive end timestamp for the semantic segment.",
    ),
    topic: z
      .string()
      .trim()
      .min(1)
      .describe(
        "A descriptive, non-interpretive label for what is being discussed in this transcript segment.",
      ),
    transcriptText: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Readable transcript text for the local semantic segment used for review and drill-down.",
      ),
  })
  .superRefine((value, ctx) => {
    if (value.startTimestamp > value.endTimestamp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startTimestamp must be less than or equal to endTimestamp.",
        path: ["startTimestamp"],
      });
    }
  })
  .describe(
    "A semantic context span that anchors one or more knowledge units without becoming the primary evidence object.",
  );

export const bravosKnowledgeExtractionInputSchema = z
  .object({
    sourceId: z
      .string()
      .trim()
      .min(1)
      .describe("Stable source identifier for the transcript being processed."),
    sourceTitle: z
      .string()
      .trim()
      .min(1)
      .describe("Human-readable title of the Bravos source."),
    sourcePublishedAt: z
      .string()
      .datetime({ offset: true })
      .describe(
        "ISO 8601 publication timestamp for the source, including timezone offset or Z.",
      ),
    sourceUrl: z
      .string()
      .url()
      .nullable()
      .describe("Optional canonical source URL when available."),
    transcript: z
      .string()
      .trim()
      .min(1)
      .describe(
        "The full transcript for one Bravos source. The extractor sees the entire transcript in one pass.",
      ),
  })
  .describe(
    "Input payload for a single full-transcript Bravos knowledge extraction run.",
  );

export const bravosKnowledgeExtractionResultSchema = z
  .object({
    knowledgeUnits: z
      .array(bravosKnowledgeUnitSchema)
      .describe(
        "Primary extracted evidence objects for retrieval, citation, and later assistant reasoning.",
      ),
    segments: z
      .array(bravosSegmentSchema)
      .describe(
        "Semantic context spans linked from knowledge units for review and bounded source drill-down.",
      ),
  })
  .superRefine((value, ctx) => {
    const segmentIds = new Set<string>();

    value.segments.forEach((segment, index) => {
      if (segmentIds.has(segment.segmentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate segmentId "${segment.segmentId}".`,
          path: ["segments", index, "segmentId"],
        });
      }
      segmentIds.add(segment.segmentId);
    });

    const unitIds = new Set<string>();

    value.knowledgeUnits.forEach((unit, index) => {
      if (unitIds.has(unit.unitId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate unitId "${unit.unitId}".`,
          path: ["knowledgeUnits", index, "unitId"],
        });
      }
      unitIds.add(unit.unitId);

      unit.parentSegmentIds.forEach((segmentId, segmentIndex) => {
        if (!segmentIds.has(segmentId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown parentSegmentId "${segmentId}".`,
            path: [
              "knowledgeUnits",
              index,
              "parentSegmentIds",
              segmentIndex,
            ],
          });
        }
      });
    });
  })
  .describe(
    "Structured result for a Bravos transcript extraction run: primary knowledge units plus linked semantic context segments.",
  );

export type BravosTranscriptSpan = z.infer<typeof bravosTranscriptSpanSchema>;
export type BravosKnowledgeCorpus = z.infer<
  typeof bravosKnowledgeCorpusSchema
>;
export type BravosKnowledgeUnitType = z.infer<
  typeof bravosKnowledgeUnitTypeSchema
>;
export type BravosTemporalSensitivity = z.infer<
  typeof bravosTemporalSensitivitySchema
>;
export type BravosVisualDependency = z.infer<
  typeof bravosVisualDependencySchema
>;
export type BravosTimeContext = z.infer<typeof bravosTimeContextSchema>;
export type BravosKnowledgeUnit = z.infer<typeof bravosKnowledgeUnitSchema>;
export type BravosSegment = z.infer<typeof bravosSegmentSchema>;
export type BravosKnowledgeExtractionInput = z.infer<
  typeof bravosKnowledgeExtractionInputSchema
>;
export type BravosKnowledgeExtractionResult = z.infer<
  typeof bravosKnowledgeExtractionResultSchema
>;
