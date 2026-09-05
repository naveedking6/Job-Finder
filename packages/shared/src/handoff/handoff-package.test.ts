import { describe, expect, it } from "vitest";
import { buildHandoffPackage, type HandoffPackageInput } from "./handoff-package.js";

const baseInput: HandoffPackageInput = {
  clientName: "Jane",
  platformName: "RemoteOK",
  country: "United States",
  projectSummary: "Needs a Shopify store for a clothing business.",
  requirements: { pages: 5, paymentGateway: "stripe" },
  budget: "$2000",
  timeline: "1 month",
  leadScore: 75,
  riskScore: 10,
  conversationSummary: "Client Jane discussed a Shopify store, budget $2000, timeline 1 month.",
  handoffReasons: ["Lead score 75 reached the configured handoff threshold (71)."],
  contactEmail: "jane@example.com",
  contactPhone: null,
};

describe("buildHandoffPackage — includes every field the brief requires", () => {
  it("passes through Client Name, Platform, Country", () => {
    const pkg = buildHandoffPackage(baseInput);
    expect(pkg.clientName).toBe("Jane");
    expect(pkg.platformName).toBe("RemoteOK");
    expect(pkg.country).toBe("United States");
  });

  it("passes through Project Summary, Requirements, Budget, Timeline", () => {
    const pkg = buildHandoffPackage(baseInput);
    expect(pkg.projectSummary).toContain("Shopify");
    expect(pkg.requirements).toEqual({ pages: 5, paymentGateway: "stripe" });
    expect(pkg.budget).toBe("$2000");
    expect(pkg.timeline).toBe("1 month");
  });

  it("passes through Lead Score, Risk Score, Conversation Summary", () => {
    const pkg = buildHandoffPackage(baseInput);
    expect(pkg.leadScore).toBe(75);
    expect(pkg.riskScore).toBe(10);
    expect(pkg.conversationSummary).toContain("Jane");
  });

  it("passes through Contact Details when legitimately provided", () => {
    const pkg = buildHandoffPackage(baseInput);
    expect(pkg.contactEmail).toBe("jane@example.com");
    expect(pkg.contactPhone).toBeNull();
  });

  it("includes a computed Recommended Next Action", () => {
    const pkg = buildHandoffPackage(baseInput);
    expect(pkg.recommendedNextAction.length).toBeGreaterThan(0);
  });
});

describe("buildHandoffPackage — recommended next action logic", () => {
  it("prioritizes a risk warning above everything else when risk is high", () => {
    const pkg = buildHandoffPackage({ ...baseInput, riskScore: 80, leadScore: 90 });
    expect(pkg.recommendedNextAction).toMatch(/review carefully/i);
  });

  it("recommends prompt follow-up for a hot lead (86+) with low risk", () => {
    const pkg = buildHandoffPackage({ ...baseInput, leadScore: 90, riskScore: 5 });
    expect(pkg.recommendedNextAction).toMatch(/hot lead/i);
  });

  it("recommends moving toward a proposal for a strong lead (71-85) with low risk", () => {
    const pkg = buildHandoffPackage({ ...baseInput, leadScore: 75, riskScore: 5 });
    expect(pkg.recommendedNextAction).toMatch(/strong lead/i);
  });

  it("gives a generic review recommendation for a middling lead with low risk", () => {
    const pkg = buildHandoffPackage({ ...baseInput, leadScore: 40, riskScore: 5 });
    expect(pkg.recommendedNextAction).toMatch(/review the conversation/i);
  });

  it("risk warning wins even for an otherwise-hot lead", () => {
    const pkg = buildHandoffPackage({ ...baseInput, leadScore: 95, riskScore: 65 });
    expect(pkg.recommendedNextAction).toMatch(/review carefully/i);
    expect(pkg.recommendedNextAction).not.toMatch(/hot lead/i);
  });
});

describe("buildHandoffPackage — handles missing/null optional fields gracefully", () => {
  it("does not throw when every optional field is null", () => {
    const minimalInput: HandoffPackageInput = {
      clientName: null,
      platformName: "Own Website",
      country: null,
      projectSummary: null,
      requirements: null,
      budget: null,
      timeline: null,
      leadScore: 0,
      riskScore: 0,
      conversationSummary: null,
      handoffReasons: [],
      contactEmail: null,
      contactPhone: null,
    };
    expect(() => buildHandoffPackage(minimalInput)).not.toThrow();
  });
});
