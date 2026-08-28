import { evaluatePolicy, type PlatformPolicyInput } from "@ai-sales-agent/policy-engine";
import { normalizedOpportunitySchema } from "@ai-sales-agent/shared";
import {
  filterExactDuplicates,
  findLikelyCrossPlatformDuplicates,
  type ExistingOpportunityRef,
} from "./duplicate-detection.js";
import type { Connector, ConnectorRunResult } from "./types.js";

export interface RunConnectorContext {
  platform: PlatformPolicyInput;
  /** externalIds already stored for THIS platform — for exact-duplicate
   *  filtering. Fetched by the caller (has database access); this
   *  package never queries anything itself. */
  existingExternalIds: Set<string>;
  /** Opportunities from OTHER platforms — for cross-platform fuzzy
   *  duplicate detection. */
  existingOpportunities: ExistingOpportunityRef[];
  crossPlatformSimilarityThreshold?: number;
}

/**
 * The actual entry point that ties the whole framework together:
 *   1. Policy check (DISCOVER) — a denial here means NOTHING else runs,
 *      not even fetch(). A platform that isn't permitted for discovery
 *      never gets a network request made to it by this system.
 *   2. Fetch raw items from the connector.
 *   3. Normalize each item; invalid ones (fail schema validation) are
 *      counted and dropped, not thrown — one malformed listing shouldn't
 *      abort an entire run.
 *   4. Filter out exact duplicates (already ingested from this platform).
 *   5. Flag (not exclude) likely cross-platform duplicates.
 *
 * This function makes exactly one kind of I/O call: connector.fetch().
 * Everything else is pure and was already independently unit tested in
 * duplicate-detection.test.ts and policy-engine's own test suite — this
 * function's own tests (pipeline.test.ts) use a mock connector with an
 * injected fetch(), so no real network call happens in the test suite
 * either.
 */
export async function runConnectorPipeline(
  connector: Connector,
  context: RunConnectorContext,
): Promise<ConnectorRunResult> {
  const policyDecision = evaluatePolicy(context.platform, "DISCOVER", true);

  if (!policyDecision.allowed) {
    return {
      platformKey: connector.platformKey,
      policyAllowed: false,
      policyReason: policyDecision.reason,
      fetchedCount: 0,
      normalizedCount: 0,
      invalidCount: 0,
      exactDuplicateCount: 0,
      newOpportunities: [],
      likelyCrossPlatformDuplicates: [],
    };
  }

  const rawItems = await connector.fetch();

  let invalidCount = 0;
  const normalized = [];
  for (const raw of rawItems) {
    const candidate = connector.normalize(raw);
    if (candidate === null) {
      invalidCount++;
      continue;
    }
    const validation = normalizedOpportunitySchema.safeParse(candidate);
    if (!validation.success) {
      invalidCount++;
      continue;
    }
    normalized.push(validation.data);
  }

  const { newOnes, duplicateCount } = filterExactDuplicates(
    normalized,
    context.existingExternalIds,
  );

  const likelyCrossPlatformDuplicates = findLikelyCrossPlatformDuplicates(
    newOnes,
    context.existingOpportunities,
    context.crossPlatformSimilarityThreshold,
  );

  return {
    platformKey: connector.platformKey,
    policyAllowed: true,
    policyReason: policyDecision.reason,
    fetchedCount: rawItems.length,
    normalizedCount: normalized.length,
    invalidCount,
    exactDuplicateCount: duplicateCount,
    newOpportunities: newOnes,
    likelyCrossPlatformDuplicates,
  };
}
