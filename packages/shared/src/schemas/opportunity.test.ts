import { describe, expect, it } from "vitest";
import { normalizedOpportunitySchema } from "./opportunity.js";

const validOpportunity = {
  sourcePlatformKey: "remoteok",
  externalId: "abc123",
  title: "Need a Shopify store built",
  description: "Looking for someone to build an online store for my clothing business.",
  budgetMin: 500,
  budgetMax: 1500,
  currency: "USD",
};

describe("normalizedOpportunitySchema", () => {
  it("accepts a valid minimal opportunity", () => {
    const result = normalizedOpportunitySchema.safeParse(validOpportunity);
    expect(result.success).toBe(true);
  });

  it("rejects an opportunity missing a title", () => {
    const { title, ...withoutTitle } = validOpportunity;
    const result = normalizedOpportunitySchema.safeParse(withoutTitle);
    expect(result.success).toBe(false);
  });

  it("rejects an opportunity missing externalId (breaks duplicate detection)", () => {
    const { externalId, ...withoutId } = validOpportunity;
    const result = normalizedOpportunitySchema.safeParse(withoutId);
    expect(result.success).toBe(false);
  });

  it("rejects a negative budget", () => {
    const result = normalizedOpportunitySchema.safeParse({
      ...validOpportunity,
      budgetMin: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed source URL", () => {
    const result = normalizedOpportunitySchema.safeParse({
      ...validOpportunity,
      sourceUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a currency code that isn't 3 letters", () => {
    const result = normalizedOpportunitySchema.safeParse({
      ...validOpportunity,
      currency: "US",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields being entirely absent", () => {
    const result = normalizedOpportunitySchema.safeParse({
      sourcePlatformKey: "own_website",
      externalId: "contact-form-1",
      title: "Contact form submission",
      description: "Client submitted a request via the contact form.",
    });
    expect(result.success).toBe(true);
  });

  it("coerces a date string for sourceCreatedAt", () => {
    const result = normalizedOpportunitySchema.safeParse({
      ...validOpportunity,
      sourceCreatedAt: "2026-08-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceCreatedAt).toBeInstanceOf(Date);
    }
  });
});
