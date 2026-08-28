import { describe, expect, it } from "vitest";
import { normalizedOpportunitySchema } from "@ai-sales-agent/shared";
import { normalizeRemoteOkItem, type RemoteOkRawItem } from "./remoteok.js";
import { remoteOkFixture } from "../fixtures/remoteok.fixture.js";

describe("normalizeRemoteOkItem", () => {
  it("returns null for the feed's leading legal-notice object", () => {
    const result = normalizeRemoteOkItem(remoteOkFixture[0] as RemoteOkRawItem);
    expect(result).toBeNull();
  });

  it("normalizes a well-formed job listing", () => {
    const result = normalizeRemoteOkItem(remoteOkFixture[1] as RemoteOkRawItem);
    expect(result).not.toBeNull();
    expect(result?.sourcePlatformKey).toBe("remoteok");
    expect(result?.externalId).toBe("1097789");
    expect(result?.title).toBe("Senior Shopify Developer");
    expect(result?.authorName).toBe("Acme Co");
    expect(result?.budgetMin).toBe(60000);
    expect(result?.budgetMax).toBe(90000);
    expect(result?.currency).toBe("USD");
    expect(result?.skillsDetected).toEqual(["shopify", "ecommerce", "php"]);
  });

  it("handles a listing with no salary specified", () => {
    const result = normalizeRemoteOkItem(remoteOkFixture[2] as RemoteOkRawItem);
    expect(result).not.toBeNull();
    expect(result?.budgetMin).toBeUndefined();
    expect(result?.budgetMax).toBeUndefined();
    expect(result?.currency).toBeUndefined();
  });

  it("returns null for an entry missing required fields (position/company)", () => {
    const result = normalizeRemoteOkItem(remoteOkFixture[3] as RemoteOkRawItem);
    expect(result).toBeNull();
  });

  it("returns null for a completely empty object", () => {
    expect(normalizeRemoteOkItem({})).toBeNull();
  });

  it("converts the date string into a real Date, not a raw string", () => {
    const result = normalizeRemoteOkItem(remoteOkFixture[1] as RemoteOkRawItem);
    expect(result?.sourceCreatedAt).toBeInstanceOf(Date);
  });

  it("every successfully normalized fixture item passes the shared schema's own validation", () => {
    for (const raw of remoteOkFixture) {
      const normalized = normalizeRemoteOkItem(raw as RemoteOkRawItem);
      if (normalized !== null) {
        const validation = normalizedOpportunitySchema.safeParse(normalized);
        expect(validation.success).toBe(true);
      }
    }
  });
});
