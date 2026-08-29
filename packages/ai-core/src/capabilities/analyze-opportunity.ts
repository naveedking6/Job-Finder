import {
  analyzeOpportunityOutputSchema,
  type AnalyzeOpportunityInput,
  type AnalyzeOpportunityOutput,
} from "../schemas.js";
import { AiResponseParseError } from "../provider.js";

export interface BuiltPrompt {
  system: string;
  user: string;
}

/**
 * Pure — takes structured input, returns prompt text. No network call,
 * no provider-specific SDK code, fully deterministic and unit-testable.
 * Both the Anthropic and OpenAI adapters call this same function, so the
 * actual analysis instructions only exist in one place.
 */
export function buildAnalyzeOpportunityPrompt(input: AnalyzeOpportunityInput): BuiltPrompt {
  const serviceList = input.services.map((s) => `- ${s.name} (slug: "${s.slug}")`).join("\n");

  const budgetLine =
    input.opportunity.budgetMin || input.opportunity.budgetMax
      ? `Budget: ${input.opportunity.budgetMin ?? "?"}-${input.opportunity.budgetMax ?? "?"} ${input.opportunity.currency ?? ""}`
      : "Budget: not specified";

  const skillsLine = input.opportunity.skillsDetected?.length
    ? `Detected skills/tags: ${input.opportunity.skillsDetected.join(", ")}`
    : "";

  const system = `You are analyzing job/project opportunities for a freelance web developer to determine relevance and fit. You must respond with ONLY a single JSON object matching this exact shape, and nothing else — no markdown code fences, no explanation before or after:

{
  "relevanceScore": <integer 0-100>,
  "matchedServiceSlugs": [<service slugs from the provided list that this opportunity actually needs>],
  "confidence": <number 0-1, how confident you are in this assessment>,
  "reasoning": "<short, specific explanation grounded in the actual listing text>",
  "likelySerious": <boolean, does this read as a genuine serious inquiry>,
  "suggestedSolution": "<a brief, concrete technical approach using the operator's actual services>"
}

Scoring guide: 0-30 ignore (no real match), 31-50 low priority (weak/tangential match), 51-70 possible opportunity, 71-85 high priority (strong clear match), 86-100 excellent opportunity (ideal match with clear budget and serious intent).

Only include slugs in matchedServiceSlugs that are from the provided service list — never invent a service that wasn't offered. Understand semantic intent, not just exact keyword matches — for example, "build an online store" can match Shopify, WooCommerce, or eCommerce Development even if those exact words aren't used.`;

  const user = `Operator's available services:
${serviceList}

Opportunity to analyze:
Title: ${input.opportunity.title}
Description: ${input.opportunity.description}
${budgetLine}
${skillsLine}`;

  return { system, user: user.trim() };
}

/**
 * Extracts a JSON object from a raw model response, tolerating the most
 * common real-world deviation from "respond with only JSON" — wrapping
 * it in a markdown code fence anyway, despite being told not to. This is
 * not theoretical: it's a well-documented behavior across every major
 * chat-tuned model when the response includes structured data.
 */
function extractJsonText(rawResponse: string): string {
  const trimmed = rawResponse.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fencedMatch ? fencedMatch[1]!.trim() : trimmed;
}

/**
 * Parses and validates a raw model response into AnalyzeOpportunityOutput.
 * Two layers of validation:
 *   1. Zod schema shape (types, ranges, required fields).
 *   2. A business rule Zod alone can't express: matchedServiceSlugs must
 *      only contain slugs that were actually offered in the input — a
 *      hallucinated slug is silently filtered out (not a fatal error;
 *      the rest of the analysis is still usable) rather than trusted.
 *
 * Throws AiResponseParseError (not a generic Error) on anything that
 * doesn't parse as valid JSON or doesn't match the schema, so callers
 * can distinguish "the model gave a bad response" from "something else
 * broke" and decide whether a retry is worthwhile.
 */
export function parseAnalyzeOpportunityResponse(
  rawResponse: string,
  input: AnalyzeOpportunityInput,
): AnalyzeOpportunityOutput {
  const jsonText = extractJsonText(rawResponse);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    throw new AiResponseParseError(rawResponse, "Response is not valid JSON");
  }

  const validation = analyzeOpportunityOutputSchema.safeParse(parsedJson);
  if (!validation.success) {
    throw new AiResponseParseError(rawResponse, validation.error.message);
  }

  const validServiceSlugs = new Set(input.services.map((s) => s.slug));
  const filteredSlugs = validation.data.matchedServiceSlugs.filter((slug) =>
    validServiceSlugs.has(slug),
  );

  return { ...validation.data, matchedServiceSlugs: filteredSlugs };
}
