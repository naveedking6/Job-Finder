import { AiResponseParseError } from "../provider.js";
import type { ZodType } from "zod";

/**
 * Extracts a JSON object from a raw model response, tolerating the most
 * common real-world deviation from "respond with only JSON" — wrapping
 * it in a markdown code fence anyway, despite being told not to. This is
 * not theoretical: it's a well-documented behavior across every major
 * chat-tuned model when the response includes structured data.
 */
export function extractJsonText(rawResponse: string): string {
  const trimmed = rawResponse.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fencedMatch ? fencedMatch[1]!.trim() : trimmed;
}

/**
 * Shared parse-and-validate pipeline every capability's response parser
 * uses: extract JSON (tolerating code fences), parse it, validate
 * against the capability's own Zod schema. Throws AiResponseParseError
 * (never a generic error) on any failure, so callers can uniformly
 * decide whether a retry is worthwhile — see provider.ts.
 */
export function parseJsonResponse<T>(rawResponse: string, schema: ZodType<T>): T {
  const jsonText = extractJsonText(rawResponse);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    throw new AiResponseParseError(rawResponse, "Response is not valid JSON");
  }

  const validation = schema.safeParse(parsedJson);
  if (!validation.success) {
    throw new AiResponseParseError(rawResponse, validation.error.message);
  }

  return validation.data;
}
