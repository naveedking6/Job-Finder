import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { normalizedOpportunitySchema } from "@ai-sales-agent/shared";
import {
  normalizeWeWorkRemotelyItem,
  type WeWorkRemotelyRawItem,
} from "./we_work_remotely.js";
import {
  singleItemRssFixture,
  weWorkRemotelyRssFixture,
} from "../fixtures/we_work_remotely.fixture.js";

function parseItems(xml: string): WeWorkRemotelyRawItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: WeWorkRemotelyRawItem | WeWorkRemotelyRawItem[] } };
  };
  const items = parsed.rss?.channel?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

describe("We Work Remotely — real XML parsing end-to-end", () => {
  it("parses a multi-item RSS feed into an array of items", () => {
    const items = parseItems(weWorkRemotelyRssFixture);
    expect(items).toHaveLength(2);
  });

  it("does NOT collapse a single-item feed into a bare object (a common XML-parser footgun)", () => {
    const items = parseItems(singleItemRssFixture);
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(1);
  });

  it("extracts the guid's text content correctly despite the isPermaLink attribute", () => {
    const items = parseItems(weWorkRemotelyRssFixture);
    const normalized = normalizeWeWorkRemotelyItem(items[0]!);
    expect(normalized?.externalId).toBe("555001");
  });
});

describe("normalizeWeWorkRemotelyItem", () => {
  const items = parseItems(weWorkRemotelyRssFixture);

  it("splits 'Company: Title' correctly", () => {
    const result = normalizeWeWorkRemotelyItem(items[0]!);
    expect(result?.authorName).toBe("Acme Co");
    expect(result?.title).toBe("Senior WordPress Developer");
  });

  it("falls back to using the whole title when there's no colon separator", () => {
    const result = normalizeWeWorkRemotelyItem(items[1]!);
    expect(result?.title).toBe("Odd Title With No Colon Separator");
    expect(result?.authorName).toBeUndefined();
  });

  it("returns null when both title and link are missing", () => {
    expect(normalizeWeWorkRemotelyItem({})).toBeNull();
  });

  it("returns null when link is present but title is missing", () => {
    expect(normalizeWeWorkRemotelyItem({ link: "https://example.com" })).toBeNull();
  });

  it("falls back to the link as externalId when guid is entirely absent", () => {
    const result = normalizeWeWorkRemotelyItem({
      title: "Some Co: Some Job",
      link: "https://weworkremotely.com/remote-jobs/some-job",
    });
    expect(result?.externalId).toBe("https://weworkremotely.com/remote-jobs/some-job");
  });

  it("every normalized fixture item passes the shared schema's own validation", () => {
    for (const item of items) {
      const normalized = normalizeWeWorkRemotelyItem(item);
      if (normalized !== null) {
        expect(normalizedOpportunitySchema.safeParse(normalized).success).toBe(true);
      }
    }
  });
});
