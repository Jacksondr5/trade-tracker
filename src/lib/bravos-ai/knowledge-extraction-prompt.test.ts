import { describe, expect, it } from "vitest";
import {
  BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT,
  buildBravosKnowledgeExtractionPrompt,
} from "./knowledge-extraction-prompt";

describe("BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT", () => {
  it("includes the core extraction guardrails", () => {
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "Extract only knowledge that Bravos explicitly stated.",
    );
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "When uncertain whether two candidate units are the same, split them apart rather than merging them.",
    );
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "Do not normalize relative time phrases into explicit calendar dates inside the knowledge unit.",
    );
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "Return only the structured result that matches the schema.",
    );
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "trading-system knowledge units should be explicitly stated.",
    );
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "A single passage may yield both macro-economic-conditions and durable-market-principles units when both are explicitly present.",
    );
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "Historical analogs used to interpret the present stay in macro-economic-conditions",
    );
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "preserve both in the statement instead of flattening the unit into fact-only wording",
    );
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "keep them together in one atomic macro-economic-conditions unit unless they are genuinely separate claims",
    );
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "Write statements as direct claims rather than attribution about Bravos saying them.",
    );
    expect(BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain(
      'Express explicit present-market conclusions as direct claims, not attribution such as "Bravos says", "he thinks", or "Bravos reads this as".',
    );
  });
});

describe("buildBravosKnowledgeExtractionPrompt", () => {
  it("formats source metadata and transcript into the user prompt", () => {
    const prompt = buildBravosKnowledgeExtractionPrompt({
      sourceId: "youtube:abc123",
      sourcePublishedAt: "2026-04-10T13:30:00Z",
      sourceTitle: "Macro Update - April 10",
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
      transcript: "[00:00:00] Gold is still leading here.",
    });

    expect(prompt).toContain("sourceId: youtube:abc123");
    expect(prompt).toContain("sourceTitle: Macro Update - April 10");
    expect(prompt).toContain("sourcePublishedAt: 2026-04-10T13:30:00Z");
    expect(prompt).toContain("sourceUrl: https://www.youtube.com/watch?v=abc123");
    expect(prompt).toContain("[00:00:00] Gold is still leading here.");
  });

  it("uses null text when sourceUrl is absent", () => {
    const prompt = buildBravosKnowledgeExtractionPrompt({
      sourceId: "youtube:def456",
      sourcePublishedAt: "2026-04-11T13:30:00Z",
      sourceTitle: "Macro Update - April 11",
      sourceUrl: null,
      transcript: "[00:00:00] Watch the dollar here.",
    });

    expect(prompt).toContain("sourceUrl: null");
  });
});
