"use server";

import { generateText, Output } from "ai";
import { createGateway } from "ai";
import { z } from "zod";
import { env } from "~/env";

const gateway = createGateway({
  apiKey: env.VERCEL_GATEWAY_API_KEY,
});

const initiatePostSchema = z.object({
  entryConditions: z
    .string()
    .describe(
      "Entry price and setup description. Include specific price levels, entry triggers, and any conditions that must be met before entering.",
    ),
  exitConditions: z
    .string()
    .describe(
      "Stop loss level and exit rules that would invdliate the trade. Include specific stop-loss prices and any conditions that would trigger an exit.  Only include negative conditions that would invalidate the trade, DO NOT include target price conditions.",
    ),
  instrumentNotes: z
    .string()
    .nullable()
    .describe(
      "Additional technical setup details, chart patterns, or instrument-specific context not covered by other fields. Null if none.",
    ),
  instrumentSymbol: z
    .string()
    .describe(
      "The ticker symbol for the instrument (e.g., AAPL, BTC, TSLA). Extract only the symbol, uppercase.",
    ),
  instrumentType: z
    .string()
    .nullable()
    .describe(
      'The asset type inferred from context (e.g., "stock", "crypto", "etf", "options"). Null if unclear.',
    ),
  name: z
    .string()
    .describe(
      "A concise trade plan name combining direction and ticker (e.g., 'Long AAPL', 'Short TSLA').",
    ),
  rationale: z
    .string()
    .describe(
      "The fundamental and/or technical analysis justifying this trade. Combine both if present.",
    ),
  targetConditions: z
    .string()
    .describe(
      "Price targets and success criteria. Include specific target prices and any milestone conditions.  Only include target conditions that would be good for the trade, DO NOT include stop loss or negative conditions.",
    ),
});

const followUpFieldUpdateSchema = z.object({
  appendText: z
    .string()
    .describe(
      'The date-stamped text to append (e.g., "2026-02-25: Stop raised to $58.50 (breakout above trendline)").',
    ),
  field: z
    .enum([
      "entryConditions",
      "exitConditions",
      "targetConditions",
      "rationale",
      "instrumentNotes",
    ])
    .describe("Which trade plan field this update applies to."),
});

const followUpPostSchema = z.object({
  fieldUpdates: z
    .array(followUpFieldUpdateSchema)
    .describe(
      "Date-stamped updates to append to existing trade plan fields. Each update should start with the date from the post.",
    ),
  noteContent: z
    .string()
    .describe(
      "A summary of the action taken and the reasoning. This becomes a note attached to the trade plan. Use newlines to separate distinct sections (e.g., action taken, rationale, market context). Do NOT put everything on one line.",
    ),
  suggestClose: z
    .boolean()
    .describe(
      "Whether this post indicates the trade should be closed (e.g., full exit, position closed, trade completed).",
    ),
});

export type InitiatePostResult = z.infer<typeof initiatePostSchema>;
export type FollowUpPostResult = z.infer<typeof followUpPostSchema>;

const INITIATE_SYSTEM_PROMPT = `You are a trade recommendation parser. You extract structured trade plan fields from trading service recommendation posts.

The posts follow a consistent format with direction, ticker, entry price, stop loss, price targets, fundamental rationale, and technical analysis.

Rules:
- Extract ALL relevant information from the post
- Be precise with price levels — copy them exactly as stated
- For the name field, create a concise "Direction TICKER" format (e.g., "Long AAPL")
- Combine fundamental and technical analysis into the rationale field
- Include specific price levels in entry, target, and exit conditions
- If the post mentions chart patterns or technical setups, include those in instrumentNotes
- Do NOT invent information that is not in the post
- Do NOT include notes like "no additional information beyond...".  If there is sparse information, just include that without commentary.`;

const FOLLOW_UP_SYSTEM_PROMPT = `You are a trade recommendation parser. You extract structured updates from follow-up posts on existing trades.

Follow-up posts include actions like: increase exposure, take partial profits, raise/lower stops, adjust targets, or close the position.

The trade plan already has fields for rationale, entryConditions, targetConditions, exitConditions, and instrumentNotes. These fields were populated when the trade was initially created. Your job is to identify ONLY concrete, mechanical changes to those fields.

Rules for noteContent:
- The note should summarize the full action and reasoning from the post
- Include all context, commentary, and rationale in the note — this is the primary output
- Do NOT include historical information that the trade plan already tracks (e.g., original entry date, original entry price)

Rules for fieldUpdates — BE VERY CONSERVATIVE:
- Only create a fieldUpdate when there is a specific, concrete change to a parameter (e.g., a stop loss price changed, a new price target was added or removed)
- Do NOT update rationale just because the post restates or reinforces the existing thesis
- Do NOT update entryConditions just because exposure was increased — that is a note, not a change to entry conditions
- Do NOT update a field just because the post mentions information related to that field
- A field update means the RULES or PARAMETERS of that field have changed, not that new activity occurred
- Examples of real field updates: stop loss moved, new price target added, exit condition changed
- Examples of things that are NOT field updates: adding to position, taking partial profits, restating thesis, commentary on price action
- Date format: "YYYY-MM-DD:" prefix followed by the update
- If the post includes a date, use that date; otherwise use today's date

Rules for suggestClose:
- Set to true ONLY if the post indicates a full exit or position close
- Partial profit-taking is NOT a close — only set suggestClose for complete exits`;

export async function extractInitiatePost(
  text: string,
): Promise<
  { success: true; data: InitiatePostResult } | { success: false; error: string }
> {
  try {
    const result = await generateText({
      model: gateway("openai/gpt-5-nano"),
      system: INITIATE_SYSTEM_PROMPT,
      prompt: text,
      output: Output.object({ schema: initiatePostSchema }),
    });

    return { success: true, data: await result.output };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to extract trade plan from post",
    };
  }
}

export async function extractFollowUpPost(
  text: string,
): Promise<
  | { success: true; data: FollowUpPostResult }
  | { success: false; error: string }
> {
  try {
    const result = await generateText({
      model: gateway("openai/gpt-5-nano"),
      system: FOLLOW_UP_SYSTEM_PROMPT,
      prompt: text,
      output: Output.object({ schema: followUpPostSchema }),
    });

    return { success: true, data: await result.output };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to extract follow-up from post",
    };
  }
}
