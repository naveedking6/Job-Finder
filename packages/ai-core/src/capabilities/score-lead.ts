import { scoreLeadOutputSchema, type ScoreLeadInput, type ScoreLeadOutput } from "../schemas.js";
import { parseJsonResponse } from "./parse-utils.js";
import type { BuiltPrompt } from "./analyze-opportunity.js";

/**
 * Lead scoring is deliberately a HYBRID, not a pure AI judgment call:
 * packages/shared/src/scoring-signals/lead-signals.ts computes a fast,
 * free, deterministic rule-based score from structured facts (does the
 * conversation have a discussed budget, detailed requirements, multiple
 * responses, etc — see the brief's own list of positive lead signals).
 * That rule-based score and the signals behind it are passed to the
 * model as grounding context here, rather than asking the model to
 * reason about lead quality from raw conversation text alone with
 * nothing to anchor to. The model's job is the nuanced judgment a
 * simple rule can't capture (tone, specificity, genuine intent reading
 * between the lines) — not re-deriving facts the rules already
 * established for free.
 */
export function buildScoreLeadPrompt(input: ScoreLeadInput): BuiltPrompt {
  const signalsText = input.signals
    ? `\n\nDetected structured signals (already computed, treat as reliable facts):\n${JSON.stringify(input.signals, null, 2)}`
    : "";

  const system = `You score how promising a sales lead is, on a scale of 0-100. Respond with ONLY a single JSON object matching this exact shape, and nothing else — no markdown code fences, no explanation:

{
  "score": <integer 0-100>,
  "reasoning": "<short, specific explanation grounded in the actual conversation and signals>"
}

Scoring guide: 0-30 Cold, 31-50 Possible, 51-70 Interested, 71-85 Strong Lead, 86-100 Hot Lead.

Positive indicators: detailed requirements, realistic budget mentioned, client asks about portfolio/price/timeline, responds consistently, expresses readiness to start, requests direct contact.
Negative indicators: vague/one-line messages, no budget discussion, unresponsive or inconsistent, requests unrelated to the offered services.

Use the detected signals as reliable ground truth for what's factually been established, but weigh the actual conversation tone and specificity too — a checklist match alone doesn't guarantee a great lead if the conversation reads as low-effort or generic.`;

  const user = `Conversation summary: ${input.conversationSummary}${signalsText}`;

  return { system, user };
}

export function parseScoreLeadResponse(rawResponse: string): ScoreLeadOutput {
  return parseJsonResponse(rawResponse, scoreLeadOutputSchema);
}
