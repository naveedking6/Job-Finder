import { describe, expect, it } from "vitest";
import {
  buildAnalyzeOpportunityPrompt,
  parseAnalyzeOpportunityResponse,
} from "./analyze-opportunity.js";
import { AiResponseParseError } from "../provider.js";
import type { AnalyzeOpportunityInput } from "../schemas.js";

const sampleInput: AnalyzeOpportunityInput = {
  opportunity: {
    title: "Need an online store for my clothing business",
    description: "Looking for someone to build an online store, don't care which platform.",
    budgetMin: 500,
    budgetMax: 1500,
    currency: "USD",
    skillsDetected: ["ecommerce"],
  },
  services: [
    { name: "Shopify Development", slug: "shopify-development" },
    { name: "WooCommerce Development", slug: "woocommerce-development" },
    { name: "API Integration", slug: "api-integration" },
  ],
};

const validModelJson = JSON.stringify({
  relevanceScore: 85,
  matchedServiceSlugs: ["shopify-development", "woocommerce-development"],
  confidence: 0.9,
  reasoning: "Client wants an online store; matches both Shopify and WooCommerce offerings.",
  likelySerious: true,
  suggestedSolution: "Recommend WooCommerce for cost-effectiveness given the stated budget.",
});

describe("buildAnalyzeOpportunityPrompt", () => {
  it("includes every offered service's name and slug in the prompt", () => {
    const prompt = buildAnalyzeOpportunityPrompt(sampleInput);
    for (const service of sampleInput.services) {
      expect(prompt.user).toContain(service.name);
      expect(prompt.user).toContain(service.slug);
    }
  });

  it("includes the opportunity's title and description", () => {
    const prompt = buildAnalyzeOpportunityPrompt(sampleInput);
    expect(prompt.user).toContain(sampleInput.opportunity.title);
    expect(prompt.user).toContain(sampleInput.opportunity.description);
  });

  it("includes budget when specified", () => {
    const prompt = buildAnalyzeOpportunityPrompt(sampleInput);
    expect(prompt.user).toMatch(/500.*1500|Budget/);
  });

  it("handles a missing budget gracefully rather than printing 'undefined'", () => {
    const withoutBudget: AnalyzeOpportunityInput = {
      ...sampleInput,
      opportunity: { ...sampleInput.opportunity, budgetMin: undefined, budgetMax: undefined },
    };
    const prompt = buildAnalyzeOpportunityPrompt(withoutBudget);
    expect(prompt.user).not.toContain("undefined");
    expect(prompt.user).toContain("not specified");
  });

  it("instructs the model to respond with ONLY JSON", () => {
    const prompt = buildAnalyzeOpportunityPrompt(sampleInput);
    expect(prompt.system).toMatch(/only.*JSON/is);
  });

  it("includes the scoring band guide from the shared scoring conventions", () => {
    const prompt = buildAnalyzeOpportunityPrompt(sampleInput);
    expect(prompt.system).toMatch(/0-30/);
    expect(prompt.system).toMatch(/86-100/);
  });
});

describe("parseAnalyzeOpportunityResponse — well-formed responses", () => {
  it("parses a clean JSON response", () => {
    const result = parseAnalyzeOpportunityResponse(validModelJson, sampleInput);
    expect(result.relevanceScore).toBe(85);
    expect(result.matchedServiceSlugs).toEqual(["shopify-development", "woocommerce-development"]);
  });

  it("parses a response wrapped in a markdown code fence (a real, common model behavior)", () => {
    const fenced = "```json\n" + validModelJson + "\n```";
    const result = parseAnalyzeOpportunityResponse(fenced, sampleInput);
    expect(result.relevanceScore).toBe(85);
  });

  it("parses a response wrapped in a bare code fence with no language tag", () => {
    const fenced = "```\n" + validModelJson + "\n```";
    const result = parseAnalyzeOpportunityResponse(fenced, sampleInput);
    expect(result.relevanceScore).toBe(85);
  });

  it("tolerates leading/trailing whitespace and newlines", () => {
    const padded = `\n\n  ${validModelJson}  \n\n`;
    const result = parseAnalyzeOpportunityResponse(padded, sampleInput);
    expect(result.relevanceScore).toBe(85);
  });
});

describe("parseAnalyzeOpportunityResponse — hallucination guard", () => {
  it("filters out a matchedServiceSlug that was never offered (hallucinated service)", () => {
    const withHallucination = JSON.stringify({
      relevanceScore: 80,
      matchedServiceSlugs: ["shopify-development", "made-up-service-that-does-not-exist"],
      confidence: 0.8,
      reasoning: "Test.",
      likelySerious: true,
      suggestedSolution: "Test solution.",
    });
    const result = parseAnalyzeOpportunityResponse(withHallucination, sampleInput);
    expect(result.matchedServiceSlugs).toEqual(["shopify-development"]);
    expect(result.matchedServiceSlugs).not.toContain("made-up-service-that-does-not-exist");
  });

  it("returns an empty matchedServiceSlugs array (not an error) when ALL slugs are hallucinated", () => {
    const allHallucinated = JSON.stringify({
      relevanceScore: 20,
      matchedServiceSlugs: ["totally-invented-service"],
      confidence: 0.5,
      reasoning: "Test.",
      likelySerious: false,
      suggestedSolution: "Test solution.",
    });
    const result = parseAnalyzeOpportunityResponse(allHallucinated, sampleInput);
    expect(result.matchedServiceSlugs).toEqual([]);
    // The rest of the analysis is still returned and usable.
    expect(result.relevanceScore).toBe(20);
  });
});

describe("parseAnalyzeOpportunityResponse — malformed responses", () => {
  it("throws AiResponseParseError for non-JSON text", () => {
    expect(() =>
      parseAnalyzeOpportunityResponse("I think this is a great opportunity!", sampleInput),
    ).toThrow(AiResponseParseError);
  });

  it("throws AiResponseParseError for JSON missing a required field", () => {
    const missingField = JSON.stringify({
      relevanceScore: 80,
      // matchedServiceSlugs missing entirely
      confidence: 0.8,
      reasoning: "Test.",
      likelySerious: true,
      suggestedSolution: "Test.",
    });
    expect(() => parseAnalyzeOpportunityResponse(missingField, sampleInput)).toThrow(
      AiResponseParseError,
    );
  });

  it("throws AiResponseParseError for a relevanceScore out of range", () => {
    const outOfRange = JSON.stringify({
      relevanceScore: 150,
      matchedServiceSlugs: [],
      confidence: 0.8,
      reasoning: "Test.",
      likelySerious: true,
      suggestedSolution: "Test.",
    });
    expect(() => parseAnalyzeOpportunityResponse(outOfRange, sampleInput)).toThrow(
      AiResponseParseError,
    );
  });

  it("throws AiResponseParseError for a confidence value outside 0-1", () => {
    const badConfidence = JSON.stringify({
      relevanceScore: 50,
      matchedServiceSlugs: [],
      confidence: 5, // should be 0-1
      reasoning: "Test.",
      likelySerious: true,
      suggestedSolution: "Test.",
    });
    expect(() => parseAnalyzeOpportunityResponse(badConfidence, sampleInput)).toThrow(
      AiResponseParseError,
    );
  });

  it("throws AiResponseParseError for an empty string", () => {
    expect(() => parseAnalyzeOpportunityResponse("", sampleInput)).toThrow(AiResponseParseError);
  });

  it("throws AiResponseParseError for valid JSON that's the wrong shape entirely (e.g. an array)", () => {
    expect(() => parseAnalyzeOpportunityResponse("[1, 2, 3]", sampleInput)).toThrow(
      AiResponseParseError,
    );
  });

  it("preserves the raw response text on the thrown error, for debugging/logging", () => {
    const badResponse = "not json at all";
    try {
      parseAnalyzeOpportunityResponse(badResponse, sampleInput);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiResponseParseError);
      expect((err as InstanceType<typeof AiResponseParseError>).rawResponse).toBe(badResponse);
    }
  });
});
