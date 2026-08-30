import { describe, expect, it } from "vitest";
import {
  buildExtractRequirementsPrompt,
  parseExtractRequirementsResponse,
} from "./extract-requirements.js";
import { AiResponseParseError } from "../provider.js";

describe("buildExtractRequirementsPrompt", () => {
  it("includes the raw conversation text", () => {
    const prompt = buildExtractRequirementsPrompt({
      conversationText: "I need about 5 pages and Stripe for payments.",
    });
    expect(prompt.user).toContain("I need about 5 pages and Stripe for payments.");
  });

  it("instructs against inventing unstated requirements", () => {
    const prompt = buildExtractRequirementsPrompt({ conversationText: "test" });
    expect(prompt.system).toMatch(/never invent/i);
  });
});

describe("parseExtractRequirementsResponse", () => {
  it("parses requirements with arbitrary keys", () => {
    const raw = JSON.stringify({ requirements: { pages: 5, paymentGateway: "stripe" } });
    const result = parseExtractRequirementsResponse(raw);
    expect(result.requirements).toEqual({ pages: 5, paymentGateway: "stripe" });
  });

  it("parses optional budget and timeline fields", () => {
    const raw = JSON.stringify({
      requirements: {},
      budget: "$1000-1500",
      timeline: "3 weeks",
    });
    const result = parseExtractRequirementsResponse(raw);
    expect(result.budget).toBe("$1000-1500");
    expect(result.timeline).toBe("3 weeks");
  });

  it("parses an empty requirements object when nothing new was mentioned", () => {
    const raw = JSON.stringify({ requirements: {} });
    const result = parseExtractRequirementsResponse(raw);
    expect(result.requirements).toEqual({});
  });

  it("throws AiResponseParseError when requirements field is missing entirely", () => {
    const raw = JSON.stringify({ budget: "$500" });
    expect(() => parseExtractRequirementsResponse(raw)).toThrow(AiResponseParseError);
  });

  it("throws AiResponseParseError for non-JSON text", () => {
    expect(() => parseExtractRequirementsResponse("plain text response")).toThrow(
      AiResponseParseError,
    );
  });
});
