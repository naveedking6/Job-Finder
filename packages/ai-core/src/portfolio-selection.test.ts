import { describe, expect, it } from "vitest";
import { selectRelevantPortfolioItems, type PortfolioItemRef } from "./portfolio-selection.js";

function makeItem(overrides: Partial<PortfolioItemRef> & { id: string }): PortfolioItemRef {
  return { serviceCategory: null, createdAt: new Date("2026-01-01"), ...overrides };
}

describe("selectRelevantPortfolioItems", () => {
  it("returns items matching any of the given service slugs", () => {
    const items = [
      makeItem({ id: "1", serviceCategory: "shopify" }),
      makeItem({ id: "2", serviceCategory: "wordpress" }),
      makeItem({ id: "3", serviceCategory: "shopify" }),
    ];
    const result = selectRelevantPortfolioItems(["shopify"], items);
    expect(result.map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("returns an empty array when no matched service slugs are given", () => {
    const items = [makeItem({ id: "1", serviceCategory: "shopify" })];
    expect(selectRelevantPortfolioItems([], items)).toEqual([]);
  });

  it("excludes items with no serviceCategory set", () => {
    const items = [
      makeItem({ id: "1", serviceCategory: null }),
      makeItem({ id: "2", serviceCategory: "shopify" }),
    ];
    const result = selectRelevantPortfolioItems(["shopify"], items);
    expect(result.map((i) => i.id)).toEqual(["2"]);
  });

  it("respects the maxItems cap, most recent first", () => {
    const items = [
      makeItem({ id: "old", serviceCategory: "shopify", createdAt: new Date("2026-01-01") }),
      makeItem({ id: "newest", serviceCategory: "shopify", createdAt: new Date("2026-03-01") }),
      makeItem({ id: "mid", serviceCategory: "shopify", createdAt: new Date("2026-02-01") }),
    ];
    const result = selectRelevantPortfolioItems(["shopify"], items, 2);
    expect(result.map((i) => i.id)).toEqual(["newest", "mid"]);
  });

  it("defaults to a cap of 3 items — never spams the full portfolio", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: `item-${i}`, serviceCategory: "shopify" }),
    );
    const result = selectRelevantPortfolioItems(["shopify"], items);
    expect(result).toHaveLength(3);
  });

  it("matches across multiple given service slugs", () => {
    const items = [
      makeItem({ id: "1", serviceCategory: "shopify" }),
      makeItem({ id: "2", serviceCategory: "woocommerce" }),
      makeItem({ id: "3", serviceCategory: "design" }),
    ];
    const result = selectRelevantPortfolioItems(["shopify", "woocommerce"], items);
    expect(result.map((i) => i.id).sort()).toEqual(["1", "2"]);
  });

  it("returns an empty array when there are no portfolio items at all", () => {
    expect(selectRelevantPortfolioItems(["shopify"], [])).toEqual([]);
  });
});
