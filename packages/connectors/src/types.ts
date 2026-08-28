import type { NormalizedOpportunity } from "@ai-sales-agent/shared";

/**
 * Every connector implements this interface. The two methods are
 * deliberately separate:
 *
 * - `fetch()` does the actual network call (or, for a push-based source
 *   like the own-website contact form, just receives already-delivered
 *   data). This is the part that CANNOT be meaningfully unit tested
 *   without hitting a real external service, so it stays thin and
 *   untested-in-CI by design — see docs/ADR.md Round 4 section.
 *
 * - `normalize()` converts one raw platform-specific item into the
 *   shared NormalizedOpportunity shape. This is pure, deterministic,
 *   and where the actual logic worth testing lives — every connector's
 *   normalize() is tested against realistic fixture data captured from
 *   the platform's real (documented) response format.
 */
export interface Connector<TRaw = unknown> {
  /** Matches a Platform.key in the database. */
  platformKey: string;

  fetch(): Promise<TRaw[]>;

  /** Returns null if the raw item can't be normalized (missing required
   *  fields, clearly not a real listing, etc.) rather than throwing —
   *  one bad item from a platform should never abort the whole batch. */
  normalize(raw: TRaw): NormalizedOpportunity | null;
}

export interface ConnectorRunResult {
  platformKey: string;
  /** True only if the policy engine's DISCOVER check passed. If false,
   *  nothing else in this result was attempted — see pipeline.ts. */
  policyAllowed: boolean;
  policyReason: string;
  fetchedCount: number;
  normalizedCount: number;
  invalidCount: number;
  /** Already exists in the database for this platform (same externalId) —
   *  skipped before insertion, not an error. */
  exactDuplicateCount: number;
  /** New opportunities, ready for the caller to insert into the database. */
  newOpportunities: NormalizedOpportunity[];
  /** New opportunities that also look like they might duplicate an
   *  EXISTING opportunity on a DIFFERENT platform (same job posted in
   *  multiple places) — not excluded, just flagged with what they
   *  matched and how closely, for a human or the AI relevance engine
   *  (Round 5) to weigh in on rather than silently dropping data. */
  likelyCrossPlatformDuplicates: Array<{
    opportunity: NormalizedOpportunity;
    matchedExistingId: string;
    matchedExistingTitle: string;
    similarity: number;
  }>;
}
