import { analyzeRiskOutputSchema, type AnalyzeRiskInput, type AnalyzeRiskOutput } from "../schemas.js";
import { parseJsonResponse } from "./parse-utils.js";
import type { BuiltPrompt } from "./analyze-opportunity.js";

/**
 * Same hybrid philosophy as score-lead.ts: packages/shared/src/scoring-signals/risk-signals.ts
 * computes conservative, deterministic pattern matches (well-known scam
 * phrases, payment-avoidance language, budget/scope mismatches,
 * suspicious link patterns) as grounding facts. The brief is explicit
 * that this is about a configurable risk score, not an accusation of
 * fraud — that framing carries through into this prompt's instructions.
 */
export function buildAnalyzeRiskPrompt(input: AnalyzeRiskInput): BuiltPrompt {
  const metadataText = input.clientMetadata
    ? `\n\nDetected structured risk signals (already computed, treat as reliable facts — a signal firing means "worth a closer look", not a confirmed problem):\n${JSON.stringify(input.clientMetadata, null, 2)}`
    : "";

  const system = `You assess how risky a potential client interaction is, on a scale of 0-100, where higher means more risk. This is NOT an accusation of fraud — it's a caution level to inform how much a human should review before proceeding. Respond with ONLY a single JSON object matching this exact shape, and nothing else — no markdown code fences, no explanation:

{
  "score": <integer 0-100>,
  "signals": [<short strings naming the specific risk indicators found, empty array if none>],
  "reasoning": "<short, specific explanation>"
}

Risk guide: 0-30 low risk, 31-60 moderate risk (worth a second look), 61-100 high risk (recommend human review before any sensitive info is shared).

Look for: known scam-adjacent language, requests to move payment off-platform or pay only after full completion, unrealistic budget for the described scope, suspicious links, excessive urgency pressure, contradictory information. A single weak signal (e.g. mild urgency alone) should not push the score into high risk on its own — only clear, compounding indicators should.`;

  const user = `Conversation summary: ${input.conversationSummary}${metadataText}`;

  return { system, user };
}

export function parseAnalyzeRiskResponse(rawResponse: string): AnalyzeRiskOutput {
  return parseJsonResponse(rawResponse, analyzeRiskOutputSchema);
}
