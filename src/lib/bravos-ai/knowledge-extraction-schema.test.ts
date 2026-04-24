import { describe, expect, it } from "vitest";
import {
  bravosKnowledgeExtractionInputSchema,
  bravosKnowledgeExtractionResultSchema,
} from "./knowledge-extraction-schema";

describe("bravosKnowledgeExtractionInputSchema", () => {
  it("accepts a full transcript payload with source metadata", () => {
    const result = bravosKnowledgeExtractionInputSchema.safeParse({
      sourceId: "youtube:abc123",
      sourcePublishedAt: "2026-04-10T13:30:00Z",
      sourceTitle: "Macro Update - April 10",
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
      transcript: "[00:00:00] Today I want to talk about gold leadership...",
    });

    expect(result.success).toBe(true);
  });
});

describe("bravosKnowledgeExtractionResultSchema", () => {
  it("accepts a valid extraction result", () => {
    const result = bravosKnowledgeExtractionResultSchema.safeParse({
      knowledgeUnits: [
        {
          claimSpan: {
            endTimestamp: "00:03:04",
            startTimestamp: "00:02:40",
          },
          corpus: "macro-economic-conditions",
          parentSegmentIds: ["segment-001"],
          statement:
            "Gold leadership is acting like a defensive macro signal here.",
          supportSpans: [
            {
              endTimestamp: "00:03:15",
              startTimestamp: "00:02:20",
            },
          ],
          temporalSensitivity: "time-sensitive",
          timeContext: {
            originalPhrase: "right now",
          },
          unitId: "unit-001",
          unitType: "observation",
          visualDependency: "helpful",
          visualInstruction:
            "Inspect the chart comparison to confirm gold is leading while risk assets lag.",
        },
      ],
      segments: [
        {
          endTimestamp: "00:03:20",
          segmentId: "segment-001",
          startTimestamp: "00:02:10",
          topic: "Gold leadership and defensive market tone",
          transcriptText:
            "Gold is still leading here, and that is not what you want to see if you think this is a healthy risk-on move.",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects knowledge units that reference unknown segments", () => {
    const result = bravosKnowledgeExtractionResultSchema.safeParse({
      knowledgeUnits: [
        {
          claimSpan: {
            endTimestamp: "00:01:20",
            startTimestamp: "00:01:10",
          },
          corpus: "trading-system",
          parentSegmentIds: ["segment-999"],
          statement: "Do not chase a breakout without a clear invalidation.",
          supportSpans: [
            {
              endTimestamp: "00:01:35",
              startTimestamp: "00:01:00",
            },
          ],
          temporalSensitivity: "rule-like",
          timeContext: null,
          unitId: "unit-001",
          unitType: "rule",
          visualDependency: "none",
          visualInstruction: null,
        },
      ],
      segments: [],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("Unknown parentSegmentId");
  });

  it("rejects visual instructions when no visual clarification is needed", () => {
    const result = bravosKnowledgeExtractionResultSchema.safeParse({
      knowledgeUnits: [
        {
          claimSpan: {
            endTimestamp: "00:04:10",
            startTimestamp: "00:04:00",
          },
          corpus: "durable-market-principles",
          parentSegmentIds: ["segment-001"],
          statement:
            "Commodity leadership can matter more than index strength for reading the macro tape.",
          supportSpans: [
            {
              endTimestamp: "00:04:22",
              startTimestamp: "00:03:50",
            },
          ],
          temporalSensitivity: "durable",
          timeContext: null,
          unitId: "unit-001",
          unitType: "principle",
          visualDependency: "none",
          visualInstruction: "This should fail.",
        },
      ],
      segments: [
        {
          endTimestamp: "00:04:30",
          segmentId: "segment-001",
          startTimestamp: "00:03:45",
          topic: "Commodity leadership as a macro read",
          transcriptText:
            "When commodities lead, that can tell you more than just watching the index.",
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
