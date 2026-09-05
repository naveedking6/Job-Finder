import { describe, expect, it } from "vitest";
import { buildWhatsAppContextMessage, buildWhatsAppHandoffLink } from "./whatsapp.js";

const sampleInput = {
  phoneNumber: "+923001234567",
  operatorName: "Muhammad Naveed",
  projectLabel: "website project",
};

describe("buildWhatsAppContextMessage", () => {
  it("matches the brief's exact example format", () => {
    const message = buildWhatsAppContextMessage(sampleInput);
    expect(message).toBe(
      "Hi Muhammad Naveed, I was discussing my website project and would like to continue the conversation.",
    );
  });

  it("substitutes a different project label correctly", () => {
    const message = buildWhatsAppContextMessage({ ...sampleInput, projectLabel: "Shopify store" });
    expect(message).toContain("my Shopify store");
  });
});

describe("buildWhatsAppHandoffLink", () => {
  it("produces a URL starting with https://wa.me/", () => {
    const link = buildWhatsAppHandoffLink(sampleInput);
    expect(link).toMatch(/^https:\/\/wa\.me\//);
  });

  it("strips the leading + and any non-digit characters from the phone number", () => {
    const link = buildWhatsAppHandoffLink(sampleInput);
    expect(link).toContain("923001234567");
    expect(link).not.toContain("+");
  });

  it("strips spaces and dashes from a loosely formatted number", () => {
    const link = buildWhatsAppHandoffLink({ ...sampleInput, phoneNumber: "+92 300-123-4567" });
    expect(link).toContain("923001234567");
  });

  it("URL-encodes the contextual message in the query string", () => {
    const link = buildWhatsAppHandoffLink(sampleInput);
    expect(link).toContain("text=");
    expect(link).toContain(encodeURIComponent("Hi Muhammad Naveed"));
  });

  it("produces a valid, parseable URL", () => {
    const link = buildWhatsAppHandoffLink(sampleInput);
    expect(() => new URL(link)).not.toThrow();
    const parsed = new URL(link);
    expect(parsed.searchParams.get("text")).toContain("Muhammad Naveed");
  });
});
