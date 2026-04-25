import { createGateway, generateText, Output } from "ai";
import { z } from "zod";
import { env } from "~/env";

const gateway = createGateway({
  apiKey: env.VERCEL_GATEWAY_API_KEY,
});

const followUpFieldSchema = z.enum([
  "entryConditions",
  "exitConditions",
  "instrumentNotes",
  "rationale",
  "targetConditions",
]);

const bravosProposalKindSchema = z.enum([
  "apply_follow_up",
  "create_trade_plan",
  "note_only",
  "unknown",
]);

const bravosProposalSchema = z.object({
  classification: z.enum(["initiate", "follow_up", "unknown"]),
  confidence: z.enum(["high", "medium", "low"]),
  proposal: z.object({
    content: z
      .string()
      .nullable()
      .describe("Required when kind is note_only. Null otherwise."),
    entryConditions: z
      .string()
      .nullable()
      .describe(
        "Entry price and setup description. Include specific price levels, entry triggers, and any conditions that must be met before entering. Null if not stated.",
      ),
    exitConditions: z
      .string()
      .nullable()
      .describe(
        "Stop loss level and exit rules that would invalidate the trade. Include specific stop-loss prices and any conditions that would trigger an exit. Only include negative conditions that would invalidate the trade, not target price conditions. Null if not stated.",
      ),
    fieldUpdates: z
      .array(
        z.object({
          field: followUpFieldSchema,
          text: z
            .string()
            .describe(
              "Text to append to the selected trade plan field. Do not include a date prefix.",
            ),
        }),
      )
      .describe("Required when kind is apply_follow_up. Empty otherwise."),
    instrumentNotes: z
      .string()
      .nullable()
      .describe(
        "Additional technical setup details, chart patterns, or instrument-specific context not covered by other fields. Null if none.",
      ),
    instrumentSymbol: z
      .string()
      .nullable()
      .describe(
        "Ticker symbol or instrument symbol, uppercase. Required when kind is create_trade_plan. Null otherwise.",
      ),
    instrumentType: z
      .string()
      .nullable()
      .describe(
        'The asset type inferred from context, such as "stock", "crypto", "etf", or "options". Null if unclear.',
      ),
    kind: bravosProposalKindSchema,
    name: z
      .string()
      .nullable()
      .describe(
        'A concise trade plan name combining direction and ticker, such as "Long AAPL" or "Short TSLA". Required when kind is create_trade_plan. Null otherwise.',
      ),
    noteContent: z
      .string()
      .nullable()
      .describe(
        "A note summarizing the follow-up action and reasoning. Required when kind is apply_follow_up. Null otherwise.",
      ),
    rationale: z
      .string()
      .nullable()
      .describe(
        "The fundamental and/or technical analysis justifying this trade. Combine both if present. Null if not stated.",
      ),
    reason: z
      .string()
      .nullable()
      .describe("Required when kind is unknown. Null otherwise."),
    targetConditions: z
      .string()
      .nullable()
      .describe(
        "Price targets and success criteria. Include specific target prices and milestone conditions. Only include target conditions that would be good for the trade, not stops or negative conditions. Null if not stated.",
      ),
  }),
  sourcePostDate: z
    .string()
    .nullable()
    .describe(
      "The post's own source/publication date in YYYY-MM-DD format if present in the text or page metadata. Null if unavailable.",
    ),
});

const bravosProposalOutputSchema = bravosProposalSchema.superRefine(
  (output, ctx) => {
    const proposal = output.proposal;
    if (proposal.kind === "create_trade_plan") {
      if (!proposal.instrumentSymbol?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "create_trade_plan requires instrumentSymbol",
          path: ["proposal", "instrumentSymbol"],
        });
      }
      if (!proposal.name?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "create_trade_plan requires name",
          path: ["proposal", "name"],
        });
      }
    }
    if (proposal.kind === "apply_follow_up" && !proposal.noteContent?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "apply_follow_up requires noteContent",
        path: ["proposal", "noteContent"],
      });
    }
    if (proposal.kind === "note_only" && !proposal.content?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "note_only requires content",
        path: ["proposal", "content"],
      });
    }
    if (proposal.kind === "unknown" && !proposal.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "unknown requires reason",
        path: ["proposal", "reason"],
      });
    }
  },
);

export type BravosAiProposalResult = z.infer<typeof bravosProposalSchema>;

const BRAVOS_PROPOSAL_SYSTEM_PROMPT = `You extract structured review proposals from Bravos Research trading posts for a personal trade-tracking app.

Classify the post:
- initiate: a new trade idea, setup, recommendation, or plan.
- follow_up: an update to a previously recommended trade, including adding, trimming, raising stops, adjusting targets, commentary that changes plan management, or closing.
- unknown: not enough information to safely classify.

Proposal rules:
- For a new trade idea, return create_trade_plan.
- For a follow-up, return apply_follow_up.
- Use note_only only for useful market/trade commentary that should be preserved but does not create or change a trade plan.
- Use unknown when the post is not about a trade setup or follow-up, or when required fields are too unclear.
- Do not invent prices, symbols, stops, targets, or actions.
- Do not choose a target trade plan. The user will review and pick it later.
- Do not include date prefixes in follow-up field update text. The app handles date prefixes from the source post date.
- Preserve source wording where it improves precision.

Initiate extraction rules:
- Extract ALL relevant information from the post.
- Be precise with price levels and copy them exactly as stated.
- For name, use concise "Direction TICKER" format when direction is stated.
- Combine fundamental and technical analysis into rationale.
- Include specific price levels in entry, target, and exit conditions.
- If the post mentions chart patterns or technical setup details, include them in instrumentNotes.
- Do not include notes like "no additional information beyond..." If sparse, just include the sparse information.

Follow-up extraction rules:
- noteContent should summarize the full action and reasoning from the post.
- Include all context, commentary, and rationale in noteContent. This is the primary output for follow-ups.
- Do not include historical information that the existing trade plan already tracks, such as original entry date or original entry price, unless the post changes it.
- Be very conservative with fieldUpdates.
- Only create a fieldUpdate when there is a specific, concrete change to a parameter or rule, such as stop loss moved, new price target added/removed, exit condition changed, or thesis changed.
- Do not update rationale just because the post restates or reinforces the existing thesis.
- Do not update entryConditions just because exposure was increased. That belongs in noteContent.
- Do not update a field just because the post mentions information related to that field.
- A field update means the rules or parameters of that field changed, not merely that new activity occurred.
- Partial profit-taking is not a close by itself; capture it in noteContent unless it changes targets/stops/rules.`;

function optionalText(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requiredText(value: string | null, fieldName: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`AI Bravos proposal missing ${fieldName}`);
  }
  return trimmed;
}

export async function extractBravosProposal(args: {
  rawText: string;
  sourcePostDate?: string;
  sourceUrl: string;
  title?: string;
}) {
  const result = await generateText({
    model: gateway("openai/gpt-5-nano"),
    output: Output.object({ schema: bravosProposalOutputSchema }),
    prompt: [
      `Source URL: ${args.sourceUrl}`,
      `Source post date: ${args.sourcePostDate ?? "unknown"}`,
      args.title ? `Title: ${args.title}` : null,
      "Post text:",
      args.rawText,
    ]
      .filter((line): line is string => line !== null)
      .join("\n\n"),
    system: BRAVOS_PROPOSAL_SYSTEM_PROMPT,
  });

  const output = await result.output;
  const proposal = output.proposal;
  const sourcePostDate = optionalText(output.sourcePostDate);
  const aiOutput = JSON.stringify(output, null, 2);

  if (proposal.kind === "create_trade_plan") {
    return {
      aiOutput,
      classification: "initiate" as const,
      proposedAction: {
        entryConditions: optionalText(proposal.entryConditions),
        exitConditions: optionalText(proposal.exitConditions),
        instrumentNotes: optionalText(proposal.instrumentNotes),
        instrumentSymbol: requiredText(
          proposal.instrumentSymbol,
          "instrumentSymbol",
        ).toUpperCase(),
        instrumentType: optionalText(proposal.instrumentType),
        kind: "create_trade_plan" as const,
        name: requiredText(proposal.name, "name"),
        rationale: optionalText(proposal.rationale),
        targetConditions: optionalText(proposal.targetConditions),
      },
      sourcePostDate,
      suggestedTradePlanReason: `AI classified this Bravos post as a new trade idea with ${output.confidence} confidence.`,
    };
  }

  if (proposal.kind === "apply_follow_up") {
    return {
      aiOutput,
      classification: "follow_up" as const,
      proposedAction: {
        fieldUpdates: proposal.fieldUpdates.map((update) => ({
          field: update.field,
          text: update.text,
        })),
        kind: "apply_follow_up" as const,
        noteContent: requiredText(proposal.noteContent, "noteContent"),
      },
      sourcePostDate,
      suggestedTradePlanReason: `AI classified this Bravos post as a follow-up with ${output.confidence} confidence.`,
    };
  }

  if (proposal.kind === "note_only") {
    return {
      aiOutput,
      classification: "unknown" as const,
      proposedAction: {
        content: requiredText(proposal.content, "content"),
        kind: "note_only" as const,
      },
      sourcePostDate,
      suggestedTradePlanReason: `AI classified this Bravos post as note-only with ${output.confidence} confidence.`,
    };
  }

  return {
    aiOutput,
    classification: "unknown" as const,
    proposedAction: {
      kind: "unknown" as const,
      reason: requiredText(proposal.reason, "reason"),
    },
    sourcePostDate,
    suggestedTradePlanReason: `AI could not classify this Bravos post with enough confidence.`,
  };
}
