import { generateResponseOutputSchema, type GenerateResponseInput, type GenerateResponseOutput } from "../schemas.js";
import { parseJsonResponse } from "./parse-utils.js";
import type { BuiltPrompt } from "./analyze-opportunity.js";

/**
 * Pure prompt builder for generateResponse. Grounds the model in the
 * conversation's rolling summary (not the full history — see
 * summarizeConversation.ts for why) plus the most recent messages
 * verbatim, and optionally relevant knowledge-base snippets so answers
 * are grounded in the operator's real FAQ/policy/pricing content rather
 * than the model inventing plausible-sounding details.
 */
export function buildGenerateResponsePrompt(input: GenerateResponseInput): BuiltPrompt {
  const summaryLine = input.conversationSummary
    ? `Conversation so far (summary): ${input.conversationSummary}`
    : "This is the start of the conversation — no prior summary.";

  const recentMessagesText = input.recentMessages
    .map((m) => `${m.sender}: ${m.content}`)
    .join("\n");

  const knowledgeBaseSection = input.knowledgeBaseContext?.length
    ? `\n\nRelevant knowledge base context (use this to ground factual claims, don't just invent details):\n${input.knowledgeBaseContext.map((c) => `- ${c}`).join("\n")}`
    : "";

  const system = `You are responding to a potential client on behalf of a freelance web developer. Respond with ONLY a single JSON object matching this exact shape, and nothing else — no markdown code fences, no explanation before or after:

{
  "response": "<the actual reply message to send the client>",
  "suggestedNextStage": "<optional — a conversation stage name if this response clearly moves the conversation into a new phase, otherwise omit this field>"
}

Communication rules:
- Sound natural, professional, and human — never say things like "As an AI" or "I am unable to" unless legally/platform required.
- Never repeat a question that's already been answered in the conversation so far — check the summary and recent messages first.
- Never lie about experience, portfolio, services, pricing, or capabilities.
- Ask at most one clarifying question per response, only if genuinely needed.
- Keep the response focused and concise, not a wall of text.`;

  const user = `${summaryLine}

Recent messages:
${recentMessagesText}${knowledgeBaseSection}

Generate the next response to send to the client.`;

  return { system, user: user.trim() };
}

export function parseGenerateResponseResponse(rawResponse: string): GenerateResponseOutput {
  return parseJsonResponse(rawResponse, generateResponseOutputSchema);
}
