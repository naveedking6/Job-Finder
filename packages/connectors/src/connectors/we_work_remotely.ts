import { XMLParser } from "fast-xml-parser";
import type { NormalizedOpportunity } from "@ai-sales-agent/shared";
import type { Connector } from "../types.js";

/**
 * We Work Remotely publishes public RSS feeds per category — intended
 * for programmatic consumption, hence seeded discoveryAllowed=true. See
 * docs/ADR.md section 8. Using the programming-jobs category feed as
 * the default; other category feeds share the same item structure.
 */
const WWR_RSS_URL = "https://weworkremotely.com/categories/remote-programming-jobs.rss";

export interface WeWorkRemotelyRawItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  region?: string;
  guid?: { "#text"?: string } | string;
}

function extractExternalId(item: WeWorkRemotelyRawItem): string | null {
  const guidText = typeof item.guid === "string" ? item.guid : item.guid?.["#text"];
  if (guidText) {
    // WWR guids look like "12345 at https://weworkremotely.com" — the
    // leading number is their internal job id.
    const match = guidText.match(/^(\d+)/);
    if (match) return match[1]!;
  }
  // Fall back to the link URL itself if no usable guid is present — not
  // as clean an id, but still stable and unique per listing.
  return item.link ?? null;
}

export function normalizeWeWorkRemotelyItem(
  raw: WeWorkRemotelyRawItem,
): NormalizedOpportunity | null {
  if (!raw.title || !raw.link) {
    return null;
  }

  const externalId = extractExternalId(raw);
  if (!externalId) {
    return null;
  }

  // WWR titles are conventionally "Company Name: Job Title" — split on
  // the FIRST colon so a job title that itself contains a colon doesn't
  // get mis-split.
  const colonIndex = raw.title.indexOf(":");
  const company = colonIndex > -1 ? raw.title.slice(0, colonIndex).trim() : undefined;
  const position = colonIndex > -1 ? raw.title.slice(colonIndex + 1).trim() : raw.title.trim();

  if (!position) {
    return null;
  }

  return {
    sourcePlatformKey: "we_work_remotely",
    externalId,
    sourceUrl: raw.link,
    title: position,
    description: raw.description ?? position,
    country: raw.region,
    authorName: company,
    authorMetadata: company ? { company } : undefined,
    sourceCreatedAt: raw.pubDate ? new Date(raw.pubDate) : undefined,
  };
}

export const weWorkRemotelyConnector: Connector<WeWorkRemotelyRawItem> = {
  platformKey: "we_work_remotely",

  async fetch(): Promise<WeWorkRemotelyRawItem[]> {
    const response = await fetch(WWR_RSS_URL, {
      headers: { "User-Agent": "ai-sales-agent-connector/0.1 (discovery-only)" },
    });
    if (!response.ok) {
      throw new Error(`We Work Remotely RSS returned ${response.status} ${response.statusText}`);
    }
    const xml = await response.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const parsed = parser.parse(xml) as {
      rss?: { channel?: { item?: WeWorkRemotelyRawItem | WeWorkRemotelyRawItem[] } };
    };

    const items = parsed.rss?.channel?.item;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  },

  normalize: normalizeWeWorkRemotelyItem,
};
