/**
 * The brief is explicit: "Never repeatedly ask for information already
 * provided." That requirement lives here, structurally — merging new
 * extraction results into existing memory is additive by default, never
 * a silent overwrite that could lose something the client already told
 * the AI in an earlier message.
 */
export interface ConversationMemoryData {
  clientName?: string | null;
  business?: string | null;
  requirements?: Record<string, unknown> | null;
  featuresDiscussed?: string[] | null;
  budgetDiscussed?: string | null;
  timelineDiscussed?: string | null;
  questionsAnswered?: string[] | null;
  recommendedSolution?: string | null;
  portfolioSharedIds?: string[] | null;
}

function mergeScalar(existing: string | null | undefined, update: string | null | undefined) {
  // A new non-empty value updates the field. An update that's absent,
  // null, or empty never clears a value that was already captured —
  // "the client didn't mention their budget again in this message"
  // must not be read as "the client's budget requirement is now unknown".
  if (update && update.trim().length > 0) return update;
  return existing ?? null;
}

function mergeArray(existing: string[] | null | undefined, update: string[] | null | undefined) {
  const combined = [...(existing ?? []), ...(update ?? [])];
  return Array.from(new Set(combined));
}

/**
 * Shallow-merges the requirements object: new keys are added, existing
 * keys are overwritten ONLY if the update actually supplies a new value
 * for that same key, and keys the update doesn't mention are preserved
 * unchanged.
 */
function mergeRequirements(
  existing: Record<string, unknown> | null | undefined,
  update: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return { ...(existing ?? {}), ...(update ?? {}) };
}

export function mergeConversationMemory(
  existing: ConversationMemoryData,
  update: Partial<ConversationMemoryData>,
): ConversationMemoryData {
  return {
    clientName: mergeScalar(existing.clientName, update.clientName),
    business: mergeScalar(existing.business, update.business),
    requirements: mergeRequirements(existing.requirements, update.requirements),
    featuresDiscussed: mergeArray(existing.featuresDiscussed, update.featuresDiscussed),
    budgetDiscussed: mergeScalar(existing.budgetDiscussed, update.budgetDiscussed),
    timelineDiscussed: mergeScalar(existing.timelineDiscussed, update.timelineDiscussed),
    questionsAnswered: mergeArray(existing.questionsAnswered, update.questionsAnswered),
    recommendedSolution: mergeScalar(existing.recommendedSolution, update.recommendedSolution),
    portfolioSharedIds: mergeArray(existing.portfolioSharedIds, update.portfolioSharedIds),
  };
}
