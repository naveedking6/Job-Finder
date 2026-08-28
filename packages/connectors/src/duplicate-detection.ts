import type { NormalizedOpportunity } from "@ai-sales-agent/shared";

/**
 * Tokenizes a title into a set of lowercase words for similarity
 * comparison. Deliberately simple (no stemming, no stopword removal) —
 * job titles are short and this is meant to catch "the same listing,
 * copy-pasted or lightly reworded across platforms", not do general NLP.
 */
function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 0),
  );
}

/**
 * Jaccard similarity of two titles' word sets: |intersection| / |union|.
 * Returns a value from 0 (nothing in common) to 1 (identical word sets).
 */
export function computeTitleSimilarity(titleA: string, titleB: string): number {
  const tokensA = tokenize(titleA);
  const tokensB = tokenize(titleB);

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersectionSize++;
  }
  const unionSize = tokensA.size + tokensB.size - intersectionSize;

  return intersectionSize / unionSize;
}

export interface ExistingOpportunityRef {
  id: string;
  title: string;
}

/**
 * Splits a batch of freshly normalized opportunities into "genuinely
 * new" and "already ingested" (exact match on externalId for THIS
 * platform — the same thing the database's unique constraint on
 * (sourcePlatformId, externalId) enforces, checked proactively here so
 * the pipeline doesn't have to rely on catching a constraint-violation
 * error for something entirely expected and routine).
 */
export function filterExactDuplicates(
  opportunities: NormalizedOpportunity[],
  existingExternalIds: Set<string>,
): { newOnes: NormalizedOpportunity[]; duplicateCount: number } {
  const newOnes: NormalizedOpportunity[] = [];
  let duplicateCount = 0;

  for (const opportunity of opportunities) {
    if (existingExternalIds.has(opportunity.externalId)) {
      duplicateCount++;
    } else {
      newOnes.push(opportunity);
    }
  }

  return { newOnes, duplicateCount };
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.6;

/**
 * For each new opportunity, checks whether its title is suspiciously
 * similar to an opportunity that already exists FROM A DIFFERENT
 * PLATFORM (cross-platform, hence not caught by the exact-externalId
 * check above) — the classic "same job posted on RemoteOK and We Work
 * Remotely" case. Returns matches at or above the threshold; does not
 * mutate or exclude anything — the caller decides what to do with a
 * flagged match.
 */
export function findLikelyCrossPlatformDuplicates(
  newOpportunities: NormalizedOpportunity[],
  existingOpportunities: ExistingOpportunityRef[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): Array<{
  opportunity: NormalizedOpportunity;
  matchedExistingId: string;
  matchedExistingTitle: string;
  similarity: number;
}> {
  const matches: Array<{
    opportunity: NormalizedOpportunity;
    matchedExistingId: string;
    matchedExistingTitle: string;
    similarity: number;
  }> = [];

  for (const opportunity of newOpportunities) {
    let bestMatch: { id: string; title: string; similarity: number } | null = null;

    for (const existing of existingOpportunities) {
      const similarity = computeTitleSimilarity(opportunity.title, existing.title);
      if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { id: existing.id, title: existing.title, similarity };
      }
    }

    if (bestMatch) {
      matches.push({
        opportunity,
        matchedExistingId: bestMatch.id,
        matchedExistingTitle: bestMatch.title,
        similarity: bestMatch.similarity,
      });
    }
  }

  return matches;
}
