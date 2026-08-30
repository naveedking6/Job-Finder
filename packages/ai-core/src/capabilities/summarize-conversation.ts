import {
  summarizeConversationOutputSchema,
  type SummarizeConversationInput,
  type SummarizeConversationOutput,
} from "../schemas.js";
import { parseJsonResponse } from "./parse-utils.js";
import type { BuiltPrompt } from "./analyze-opportunity.js";

/**
 * A rolling summary exists so generateResponse never has to re-read an
 * entire, potentially long message history on every single turn — see
 * Conversation.summary in schema.prisma. This capability refreshes that
 * summary; the caller (apps/api) decides how often to call it (e.g.
 * every N messages), not this function.
 */
export function buildSummarizeConversationPrompt(
  input: SummarizeConversationInput,
): BuiltPrompt {
  const messagesText = input.messages.map((m) => `${m.sender}: ${m.content}`).join("\n");

  const system = `You summarize a sales conversation between an AI/human representing a freelance web developer and a potential client. Respond with ONLY a single JSON object matching this exact shape, and nothing else — no markdown code fences, no explanation:

{
  "summary": "<a concise summary capturing who the client is, what they need, what's been discussed (budget, timeline, features, solution recommended, portfolio shared), and the current state of the conversation>"
}

Keep the summary factual and specific — it will be used to ground future responses, so vague generalities aren't useful. Include concrete details (numbers, names, specific features) rather than abstractions.`;

  const user = `Full conversation to summarize:\n\n${messagesText}`;

  return { system, user };
}

export function parseSummarizeConversationResponse(
  rawResponse: string,
): SummarizeConversationOutput {
  return parseJsonResponse(rawResponse, summarizeConversationOutputSchema);
}
