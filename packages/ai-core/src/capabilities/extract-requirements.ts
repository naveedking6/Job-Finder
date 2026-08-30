import {
  extractRequirementsOutputSchema,
  type ExtractRequirementsInput,
  type ExtractRequirementsOutput,
} from "../schemas.js";
import { parseJsonResponse } from "./parse-utils.js";
import type { BuiltPrompt } from "./analyze-opportunity.js";

/**
 * Extracts structured requirements from raw conversation text. This
 * output feeds directly into mergeConversationMemory
 * (packages/shared/src/conversation/conversation-memory.ts) — the
 * merge logic there is what actually enforces "never lose earlier
 * context", not this prompt. This prompt's only job is turning free text
 * into structured signal for THIS turn.
 */
export function buildExtractRequirementsPrompt(input: ExtractRequirementsInput): BuiltPrompt {
  const system = `You extract structured project requirements from a conversation with a potential client. Respond with ONLY a single JSON object matching this exact shape, and nothing else — no markdown code fences, no explanation:

{
  "requirements": { <any requirement details mentioned — e.g. "pages": 5, "paymentGateway": "stripe", "hasExistingWebsite": false — use whatever keys genuinely fit what was said, don't force a fixed schema>, },
  "budget": "<a short string describing budget if mentioned, otherwise omit>",
  "timeline": "<a short string describing timeline if mentioned, otherwise omit>"
}

Only include what was ACTUALLY stated or clearly implied in the text — never invent requirement details that weren't mentioned. If nothing new was mentioned, return an empty requirements object rather than guessing.`;

  const user = `Conversation text to extract requirements from:\n\n${input.conversationText}`;

  return { system, user };
}

export function parseExtractRequirementsResponse(
  rawResponse: string,
): ExtractRequirementsOutput {
  return parseJsonResponse(rawResponse, extractRequirementsOutputSchema);
}
