import { describe, expect, it } from "vitest";
import { MockAiProvider } from "./mock.js";
import type { AnalyzeOpportunityInput } from "../schemas.js";

const provider = new MockAiProvider();

const services = [
  { name: "Shopify Development", slug: "shopify-development" },
  { name: "WordPress Development", slug: "wordpress-development" },
];

describe("MockAiProvider.analyzeOpportunity", () => {
  it("matches a service whose name keyword appears in the opportunity text", async () => {
    const input: AnalyzeOpportunityInput = {
      opportunity: {
        title: "Need a Shopify store",
        description: "Looking for a Shopify expert.",
      },
      services,
    };
    const result = await provider.analyzeOpportunity(input);
    expect(result.matchedServiceSlugs).toContain("shopify-development");
    expect(result.relevanceScore).toBeGreaterThan(50);
  });

  it("scores low with no keyword overlap at all", async () => {
    const input: AnalyzeOpportunityInput = {
      opportunity: {
        title: "Need a graphic designer for a logo",
        description: "Simple logo design project.",
      },
      services,
    };
    const result = await provider.analyzeOpportunity(input);
    expect(result.matchedServiceSlugs).toEqual([]);
    expect(result.relevanceScore).toBeLessThan(50);
  });

  it("does not false-match a substring inside an unrelated word (e.g. 'design' inside 'designer')", async () => {
    const servicesWithDesign = [
      { name: "Website Design", slug: "website-design" },
      { name: "Shopify Development", slug: "shopify-development" },
    ];
    const input: AnalyzeOpportunityInput = {
      opportunity: {
        title: "Need a graphic designer for a logo",
        description: "Nothing web-related, just a logo designer wanted.",
      },
      services: servicesWithDesign,
    };
    const result = await provider.analyzeOpportunity(input);
    expect(result.matchedServiceSlugs).not.toContain("website-design");
  });

  it("marks likelySerious true when a budget is specified", async () => {
    const input: AnalyzeOpportunityInput = {
      opportunity: {
        title: "Shopify project",
        description: "Test.",
        budgetMin: 500,
        budgetMax: 1000,
      },
      services,
    };
    const result = await provider.analyzeOpportunity(input);
    expect(result.likelySerious).toBe(true);
  });

  it("marks likelySerious false when no budget is specified", async () => {
    const input: AnalyzeOpportunityInput = {
      opportunity: { title: "Shopify project", description: "Test." },
      services,
    };
    const result = await provider.analyzeOpportunity(input);
    expect(result.likelySerious).toBe(false);
  });

  it("returns a confidence within the valid 0-1 range", async () => {
    const input: AnalyzeOpportunityInput = {
      opportunity: { title: "Shopify project", description: "Test." },
      services,
    };
    const result = await provider.analyzeOpportunity(input);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("never returns a relevanceScore outside 0-100", async () => {
    const input: AnalyzeOpportunityInput = {
      opportunity: { title: "Anything", description: "Anything." },
      services: [],
    };
    const result = await provider.analyzeOpportunity(input);
    expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
    expect(result.relevanceScore).toBeLessThanOrEqual(100);
  });
});

describe("MockAiProvider — other methods are usable, not throwing NotImplementedYetError", () => {
  it("generateResponse returns a usable response", async () => {
    const result = await provider.generateResponse({ recentMessages: [] });
    expect(result.response.length).toBeGreaterThan(0);
  });

  it("scoreLead returns a score in range", async () => {
    const result = await provider.scoreLead({ conversationSummary: "test" });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("analyzeRisk returns a score in range", async () => {
    const result = await provider.analyzeRisk({ conversationSummary: "test" });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("recommendSolution handles an empty service list without throwing", async () => {
    const result = await provider.recommendSolution({ requirements: {}, services: [] });
    expect(result.matchedServiceSlugs).toEqual([]);
  });
});
