import { describe, expect, it } from "vitest";
import { normalizedOpportunitySchema } from "@ai-sales-agent/shared";
import {
  contactFormSubmissionSchema,
  normalizeContactFormSubmission,
} from "./contact_form.js";

const validSubmission = {
  name: "Jane Client",
  email: "jane@example.com",
  projectDescription: "I need an online store for my clothing business.",
  budget: "around $2000",
  timeline: "ASAP",
};

describe("contactFormSubmissionSchema", () => {
  it("accepts a valid submission", () => {
    expect(contactFormSubmissionSchema.safeParse(validSubmission).success).toBe(true);
  });

  it("rejects a submission with an invalid email", () => {
    const result = contactFormSubmissionSchema.safeParse({
      ...validSubmission,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a submission with no project description", () => {
    const { projectDescription, ...withoutDescription } = validSubmission;
    const result = contactFormSubmissionSchema.safeParse(withoutDescription);
    expect(result.success).toBe(false);
  });

  it("accepts a submission with budget/timeline omitted (they're optional)", () => {
    const { budget, timeline, ...minimal } = validSubmission;
    expect(contactFormSubmissionSchema.safeParse(minimal).success).toBe(true);
  });
});

describe("normalizeContactFormSubmission", () => {
  it("produces an opportunity tagged to the own_website platform", () => {
    const result = normalizeContactFormSubmission(validSubmission);
    expect(result.sourcePlatformKey).toBe("own_website");
  });

  it("uses the project description as the opportunity description", () => {
    const result = normalizeContactFormSubmission(validSubmission);
    expect(result.description).toBe(validSubmission.projectDescription);
  });

  it("preserves the stated budget and timeline in authorMetadata rather than dropping them", () => {
    const result = normalizeContactFormSubmission(validSubmission);
    expect(result.authorMetadata).toMatchObject({
      statedBudget: "around $2000",
      statedTimeline: "ASAP",
    });
  });

  it("does not include statedBudget/statedTimeline keys when they weren't provided", () => {
    const { budget, timeline, ...minimal } = validSubmission;
    const result = normalizeContactFormSubmission(minimal);
    expect(result.authorMetadata).not.toHaveProperty("statedBudget");
    expect(result.authorMetadata).not.toHaveProperty("statedTimeline");
  });

  it("generates distinct externalIds for two submissions, even in the same millisecond", () => {
    const first = normalizeContactFormSubmission(validSubmission);
    const second = normalizeContactFormSubmission(validSubmission);
    expect(first.externalId).not.toBe(second.externalId);
  });

  it("produces output that passes the shared normalized-opportunity schema", () => {
    const result = normalizeContactFormSubmission(validSubmission);
    expect(normalizedOpportunitySchema.safeParse(result).success).toBe(true);
  });
});
