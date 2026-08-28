import { describe, expect, it, vi } from "vitest";
import type { PlatformPolicyInput } from "@ai-sales-agent/policy-engine";
import type { NormalizedOpportunity } from "@ai-sales-agent/shared";
import { runConnectorPipeline } from "./pipeline.js";
import type { Connector } from "./types.js";

interface MockRawItem {
  id: string;
  title: string;
  valid: boolean;
}

function makeMockConnector(rawItems: MockRawItem[]): Connector<MockRawItem> {
  return {
    platformKey: "mock_platform",
    fetch: vi.fn(async () => rawItems),
    normalize: (raw) => {
      if (!raw.valid) return null;
      return {
        sourcePlatformKey: "mock_platform",
        externalId: raw.id,
        title: raw.title,
        description: `Description for ${raw.title}`,
      } satisfies NormalizedOpportunity;
    },
  };
}

const openPlatform: PlatformPolicyInput = {
  key: "mock_platform",
  name: "Mock Platform",
  isEnabled: true,
  discoveryAllowed: true,
  automationAllowed: false,
  autoMessageAllowed: false,
  autoCommentAllowed: false,
};

const discoveryDisallowedPlatform: PlatformPolicyInput = {
  ...openPlatform,
  discoveryAllowed: false,
};

describe("runConnectorPipeline — policy gate", () => {
  it("does NOT call connector.fetch() when discovery is not policy-permitted", async () => {
    const connector = makeMockConnector([{ id: "1", title: "Test", valid: true }]);

    const result = await runConnectorPipeline(connector, {
      platform: discoveryDisallowedPlatform,
      existingExternalIds: new Set(),
      existingOpportunities: [],
    });

    expect(result.policyAllowed).toBe(false);
    expect(connector.fetch).not.toHaveBeenCalled();
    expect(result.newOpportunities).toEqual([]);
  });
});

describe("runConnectorPipeline — normalization", () => {
  it("counts and excludes items that fail to normalize", async () => {
    const connector = makeMockConnector([
      { id: "1", title: "Valid Item", valid: true },
      { id: "2", title: "Invalid Item", valid: false },
    ]);

    const result = await runConnectorPipeline(connector, {
      platform: openPlatform,
      existingExternalIds: new Set(),
      existingOpportunities: [],
    });

    expect(result.fetchedCount).toBe(2);
    expect(result.normalizedCount).toBe(1);
    expect(result.invalidCount).toBe(1);
    expect(result.newOpportunities).toHaveLength(1);
  });

  it("excludes items whose normalized output fails the shared schema (e.g. empty title)", async () => {
    const connector: Connector<MockRawItem> = {
      platformKey: "mock_platform",
      fetch: vi.fn(async () => [{ id: "1", title: "", valid: true }]),
      normalize: (raw) => ({
        sourcePlatformKey: "mock_platform",
        externalId: raw.id,
        title: raw.title, // empty — schema requires min(1)
        description: "Some description",
      }),
    };

    const result = await runConnectorPipeline(connector, {
      platform: openPlatform,
      existingExternalIds: new Set(),
      existingOpportunities: [],
    });

    expect(result.normalizedCount).toBe(0);
    expect(result.invalidCount).toBe(1);
  });
});

describe("runConnectorPipeline — exact duplicate filtering", () => {
  it("excludes items already present in existingExternalIds", async () => {
    const connector = makeMockConnector([
      { id: "already-here", title: "Old One", valid: true },
      { id: "brand-new", title: "New One", valid: true },
    ]);

    const result = await runConnectorPipeline(connector, {
      platform: openPlatform,
      existingExternalIds: new Set(["already-here"]),
      existingOpportunities: [],
    });

    expect(result.exactDuplicateCount).toBe(1);
    expect(result.newOpportunities).toHaveLength(1);
    expect(result.newOpportunities[0]?.externalId).toBe("brand-new");
  });
});

describe("runConnectorPipeline — cross-platform duplicate flagging", () => {
  it("flags but does not exclude a likely cross-platform duplicate", async () => {
    const connector = makeMockConnector([
      { id: "new-1", title: "Senior Shopify Developer", valid: true },
    ]);

    const result = await runConnectorPipeline(connector, {
      platform: openPlatform,
      existingExternalIds: new Set(),
      existingOpportunities: [{ id: "existing-1", title: "Senior Shopify Developer" }],
    });

    expect(result.newOpportunities).toHaveLength(1); // NOT excluded
    expect(result.likelyCrossPlatformDuplicates).toHaveLength(1);
    expect(result.likelyCrossPlatformDuplicates[0]?.matchedExistingId).toBe("existing-1");
  });
});

describe("runConnectorPipeline — full result shape", () => {
  it("returns a complete, consistent summary for a typical run", async () => {
    const connector = makeMockConnector([
      { id: "1", title: "Job One", valid: true },
      { id: "2", title: "Job Two", valid: true },
      { id: "3", title: "Bad Data", valid: false },
    ]);

    const result = await runConnectorPipeline(connector, {
      platform: openPlatform,
      existingExternalIds: new Set(),
      existingOpportunities: [],
    });

    expect(result).toMatchObject({
      platformKey: "mock_platform",
      policyAllowed: true,
      fetchedCount: 3,
      normalizedCount: 2,
      invalidCount: 1,
      exactDuplicateCount: 0,
    });
    expect(result.newOpportunities).toHaveLength(2);
  });
});
