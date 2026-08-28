import type { RemoteOkRawItem } from "../connectors/remoteok.js";

/**
 * Mirrors RemoteOK's real, documented response shape: the first element
 * is a legal/attribution notice (no id/position/company), followed by
 * real job listings. Field names and general shape are from RemoteOK's
 * public API documentation — this is a representative fixture, not a
 * captured live response (this sandbox can't reach remoteok.com to
 * capture one — see docs/ADR.md Round 4 section).
 */
export const remoteOkFixture: Array<Record<string, unknown>> = [
  {
    legal: "Notice: by using our API you agree to our terms https://remoteok.com/tos",
  },
  {
    id: "1097789",
    slug: "senior-shopify-developer-acme-co",
    company: "Acme Co",
    position: "Senior Shopify Developer",
    tags: ["shopify", "ecommerce", "php"],
    description: "We're looking for an experienced Shopify developer to join our team...",
    location: "Worldwide",
    date: "2026-08-01T09:00:00+00:00",
    url: "https://remoteok.com/remote-jobs/1097789",
    salary_min: 60000,
    salary_max: 90000,
  } satisfies RemoteOkRawItem,
  {
    id: "1097790",
    slug: "wordpress-developer-widgetco",
    company: "WidgetCo",
    position: "WordPress Developer (Contract)",
    tags: ["wordpress", "php", "mysql"],
    description: "Contract WordPress developer needed for a 3-month engagement.",
    location: "Europe",
    date: "2026-08-02T09:00:00+00:00",
    url: "https://remoteok.com/remote-jobs/1097790",
    // No salary specified — a common real-world case this connector
    // must handle gracefully.
  } satisfies RemoteOkRawItem,
  {
    // Malformed entry — missing "position" and "company". Should be
    // skipped by normalize(), not crash the batch.
    id: "1097791",
    tags: ["design"],
  },
];
