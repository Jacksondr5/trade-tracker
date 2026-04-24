import { generateObject } from "ai";
import { codexCli } from "ai-sdk-provider-codex-cli";
import {
  type BravosKnowledgeExtractionInput,
  bravosKnowledgeExtractionResultSchema,
} from "./knowledge-extraction-schema";
import {
  BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT,
  buildBravosKnowledgeExtractionPrompt,
} from "./knowledge-extraction-prompt";

export interface BravosKnowledgeExtractionOptions {
  model?: string;
}

export async function extractBravosKnowledge(
  input: BravosKnowledgeExtractionInput,
  options: BravosKnowledgeExtractionOptions = {},
) {
  const model = options.model ?? "gpt-5.2";

  const result = await generateObject({
    model: codexCli(model, {
      approvalMode: "never",
      reasoningEffort: "medium",
      sandboxMode: "read-only",
    }),
    prompt: buildBravosKnowledgeExtractionPrompt(input),
    schema: bravosKnowledgeExtractionResultSchema,
    schemaDescription:
      "Structured Bravos transcript extraction result with primary knowledge units and linked semantic segments.",
    schemaName: "bravosKnowledgeExtractionResult",
    system: BRAVOS_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT,
  });

  return result.object;
}
