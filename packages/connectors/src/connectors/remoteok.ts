import type { NormalizedOpportunity } from "@ai-sales-agent/shared";
import type { Connector } from "../types.js";

/**
 * RemoteOK's public JSON feed (https://remoteok.com/api) — documented as
 * intended for programmatic consumption, hence seeded discoveryAllowed=true
 * in prisma/seed.ts. See docs/ADR.md section 8.
 *
 * Format note: the feed's first array element is a legal/attribution
 * notice, not a job — real jobs start at index 1. This connector doesn't
 * assume that structurally; it just skips any item missing the fields a
 * real listing needs (see normalize()), which handles the notice object
 * along with any other malformed entries the same way.
 */
export interface RemoteOkRawItem {
  id?: string;
  slug?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  date?: string;
  url?: string;
  salary_min?: number;
  salary_max?: number;
}

const REMOTEOK_API_URL = "https://remoteok.com/api";

export function normalizeRemoteOkItem(raw: RemoteOkRawItem): NormalizedOpportunity | null {
  // A real job listing always has an id, a position (title), and a
  // company — the feed's leading notice object and any malformed entries
  // are missing at least one of these.
  if (!raw.id || !raw.position || !raw.company) {
    return null;
  }

  return {
    sourcePlatformKey: "remoteok",
    externalId: String(raw.id),
    sourceUrl: raw.url,
    title: raw.position,
    description: raw.description ?? `${raw.position} at ${raw.company}`,
    country: raw.location,
    authorName: raw.company,
    authorMetadata: raw.company ? { company: raw.company } : undefined,
    budgetMin: typeof raw.salary_min === "number" ? raw.salary_min : undefined,
    budgetMax: typeof raw.salary_max === "number" ? raw.salary_max : undefined,
    currency: typeof raw.salary_min === "number" ? "USD" : undefined,
    skillsDetected: Array.isArray(raw.tags) ? raw.tags : undefined,
    sourceCreatedAt: raw.date ? new Date(raw.date) : undefined,
  };
}

export const remoteOkConnector: Connector<RemoteOkRawItem> = {
  platformKey: "remoteok",

  async fetch(): Promise<RemoteOkRawItem[]> {
    const response = await fetch(REMOTEOK_API_URL, {
      headers: { "User-Agent": "ai-sales-agent-connector/0.1 (discovery-only, see robots.txt)" },
    });
    if (!response.ok) {
      throw new Error(`RemoteOK API returned ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error("RemoteOK API returned an unexpected (non-array) response shape");
    }
    return data as RemoteOkRawItem[];
  },

  normalize: normalizeRemoteOkItem,
};
