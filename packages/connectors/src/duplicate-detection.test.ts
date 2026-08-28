import { describe, expect, it } from "vitest";
import type { NormalizedOpportunity } from "@ai-sales-agent/shared";
import {
  computeTitleSimilarity,
  filterExactDuplicates,
  findLikelyCrossPlatformDuplicates,
  type ExistingOpportunityRef,
} from "./duplicate-detection.js";

function makeOpportunity(overrides: Partial<NormalizedOpportunity> = {}): NormalizedOpportunity {
  return {
    sourcePlatformKey: "remoteok",
    externalId: "abc123",
    title: "Senior Shopify Developer",
    description: "A test opportunity.",
    ...overrides,
  };
}

describe("computeTitleSimilarity", () => {
  it("returns 1 for identical titles", () => {
    expect(computeTitleSimilarity("Senior Shopify Developer", "Senior Shopify Developer")).toBe(
      1,
    );
  });

  it("returns 1 for identical titles differing only in case", () => {
    expect(computeTitleSimilarity("Senior Shopify Developer", "senior shopify developer")).toBe(
      1,
    );
  });

  it("returns a high but non-1 score for lightly reworded titles", () => {
    const score = computeTitleSimilarity(
      "Senior Shopify Developer Needed",
      "Senior Shopify Developer Wanted",
    );
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });

  it("returns 0 for completely unrelated titles", () => {
    const score = computeTitleSimilarity("Senior Shopify Developer", "Marketing Manager Role");
    expect(score).toBe(0);
  });

  it("returns 1 for two empty strings", () => {
    expect(computeTitleSimilarity("", "")).toBe(1);
  });

  it("returns 0 when one title is empty and the other isn't", () => {
    expect(computeTitleSimilarity("", "Senior Developer")).toBe(0);
  });

  it("ignores punctuation differences", () => {
    const score = computeTitleSimilarity(
      "Senior Shopify Developer!",
      "Senior, Shopify, Developer",
    );
    expect(score).toBe(1);
  });

  it("is symmetric — order of arguments doesn't matter", () => {
    const a = computeTitleSimilarity("Shopify Developer", "WordPress Developer");
    const b = computeTitleSimilarity("WordPress Developer", "Shopify Developer");
    expect(a).toBe(b);
  });
});

describe("filterExactDuplicates", () => {
  it("keeps opportunities whose externalId isn't in the existing set", () => {
    const opportunities = [makeOpportunity({ externalId: "new-1" })];
    const { newOnes, duplicateCount } = filterExactDuplicates(opportunities, new Set());
    expect(newOnes).toHaveLength(1);
    expect(duplicateCount).toBe(0);
  });

  it("filters out opportunities whose externalId IS in the existing set", () => {
    const opportunities = [
      makeOpportunity({ externalId: "existing-1" }),
      makeOpportunity({ externalId: "new-1" }),
    ];
    const { newOnes, duplicateCount } = filterExactDuplicates(
      opportunities,
      new Set(["existing-1"]),
    );
    expect(newOnes).toHaveLength(1);
    expect(newOnes[0]?.externalId).toBe("new-1");
    expect(duplicateCount).toBe(1);
  });

  it("handles an empty input list", () => {
    const { newOnes, duplicateCount } = filterExactDuplicates([], new Set(["x"]));
    expect(newOnes).toEqual([]);
    expect(duplicateCount).toBe(0);
  });

  it("handles all-duplicate input", () => {
    const opportunities = [makeOpportunity({ externalId: "dup-1" })];
    const { newOnes, duplicateCount } = filterExactDuplicates(
      opportunities,
      new Set(["dup-1"]),
    );
    expect(newOnes).toEqual([]);
    expect(duplicateCount).toBe(1);
  });
});

describe("findLikelyCrossPlatformDuplicates", () => {
  const existing: ExistingOpportunityRef[] = [
    { id: "existing-1", title: "Senior Shopify Developer" },
    { id: "existing-2", title: "Marketing Manager" },
  ];

  it("flags a new opportunity with a near-identical title to an existing one", () => {
    const newOpportunities = [
      makeOpportunity({ externalId: "n1", title: "Senior Shopify Developer" }),
    ];
    const matches = findLikelyCrossPlatformDuplicates(newOpportunities, existing);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchedExistingId).toBe("existing-1");
    expect(matches[0]?.similarity).toBe(1);
  });

  it("does not flag a new opportunity with a genuinely different title", () => {
    const newOpportunities = [
      makeOpportunity({ externalId: "n1", title: "Backend Python Engineer" }),
    ];
    const matches = findLikelyCrossPlatformDuplicates(newOpportunities, existing);
    expect(matches).toHaveLength(0);
  });

  it("respects a custom similarity threshold", () => {
    const newOpportunities = [
      makeOpportunity({ externalId: "n1", title: "Shopify Developer Position" }),
    ];
    // Loose threshold: matches.
    const looseMatches = findLikelyCrossPlatformDuplicates(newOpportunities, existing, 0.3);
    expect(looseMatches).toHaveLength(1);

    // Strict threshold: does not match.
    const strictMatches = findLikelyCrossPlatformDuplicates(newOpportunities, existing, 0.95);
    expect(strictMatches).toHaveLength(0);
  });

  it("picks the BEST match when multiple existing opportunities are similar", () => {
    const existingWithTwo: ExistingOpportunityRef[] = [
      { id: "close", title: "Senior Shopify Developer Role" },
      { id: "exact", title: "Senior Shopify Developer" },
    ];
    const newOpportunities = [
      makeOpportunity({ externalId: "n1", title: "Senior Shopify Developer" }),
    ];
    const matches = findLikelyCrossPlatformDuplicates(newOpportunities, existingWithTwo, 0.5);
    expect(matches[0]?.matchedExistingId).toBe("exact");
  });

  it("returns an empty array when there are no existing opportunities to compare against", () => {
    const newOpportunities = [makeOpportunity({ externalId: "n1" })];
    const matches = findLikelyCrossPlatformDuplicates(newOpportunities, []);
    expect(matches).toEqual([]);
  });

  it("does NOT exclude anything from the input — it only annotates matches", () => {
    // This test documents the contract: the caller decides what to do
    // with a flagged match, this function never filters newOpportunities.
    const newOpportunities = [
      makeOpportunity({ externalId: "n1", title: "Senior Shopify Developer" }),
    ];
    findLikelyCrossPlatformDuplicates(newOpportunities, existing);
    expect(newOpportunities).toHaveLength(1); // unchanged
  });
});
