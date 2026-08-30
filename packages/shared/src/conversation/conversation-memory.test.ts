import { describe, expect, it } from "vitest";
import { mergeConversationMemory, type ConversationMemoryData } from "./conversation-memory.js";

const emptyMemory: ConversationMemoryData = {};

describe("mergeConversationMemory — scalar fields never regress", () => {
  it("sets clientName from empty when first provided", () => {
    const result = mergeConversationMemory(emptyMemory, { clientName: "Jane" });
    expect(result.clientName).toBe("Jane");
  });

  it("keeps the existing clientName when a later message doesn't mention a name", () => {
    const existing: ConversationMemoryData = { clientName: "Jane" };
    const result = mergeConversationMemory(existing, {});
    expect(result.clientName).toBe("Jane");
  });

  it("keeps the existing clientName when the update explicitly sends null", () => {
    const existing: ConversationMemoryData = { clientName: "Jane" };
    const result = mergeConversationMemory(existing, { clientName: null });
    expect(result.clientName).toBe("Jane");
  });

  it("keeps the existing clientName when the update sends an empty string", () => {
    const existing: ConversationMemoryData = { clientName: "Jane" };
    const result = mergeConversationMemory(existing, { clientName: "" });
    expect(result.clientName).toBe("Jane");
  });

  it("DOES update clientName when a genuinely new non-empty value is provided", () => {
    // Legitimate case: the AI extracted a corrected/updated name.
    const existing: ConversationMemoryData = { clientName: "Jane" };
    const result = mergeConversationMemory(existing, { clientName: "Jane Smith" });
    expect(result.clientName).toBe("Jane Smith");
  });

  it("same never-regress behavior applies to budgetDiscussed", () => {
    const existing: ConversationMemoryData = { budgetDiscussed: "$1000-1500" };
    const result = mergeConversationMemory(existing, {});
    expect(result.budgetDiscussed).toBe("$1000-1500");
  });

  it("same never-regress behavior applies to timelineDiscussed", () => {
    const existing: ConversationMemoryData = { timelineDiscussed: "2 weeks" };
    const result = mergeConversationMemory(existing, { timelineDiscussed: null });
    expect(result.timelineDiscussed).toBe("2 weeks");
  });

  it("same never-regress behavior applies to recommendedSolution", () => {
    const existing: ConversationMemoryData = { recommendedSolution: "WooCommerce" };
    const result = mergeConversationMemory(existing, {});
    expect(result.recommendedSolution).toBe("WooCommerce");
  });
});

describe("mergeConversationMemory — array fields accumulate, never lose entries", () => {
  it("adds new features to an empty list", () => {
    const result = mergeConversationMemory(emptyMemory, { featuresDiscussed: ["cart"] });
    expect(result.featuresDiscussed).toEqual(["cart"]);
  });

  it("accumulates features across multiple merges without losing earlier ones", () => {
    const existing: ConversationMemoryData = { featuresDiscussed: ["cart", "checkout"] };
    const result = mergeConversationMemory(existing, { featuresDiscussed: ["payment gateway"] });
    expect(result.featuresDiscussed).toEqual(["cart", "checkout", "payment gateway"]);
  });

  it("does not duplicate a feature mentioned again in a later message", () => {
    const existing: ConversationMemoryData = { featuresDiscussed: ["cart"] };
    const result = mergeConversationMemory(existing, { featuresDiscussed: ["cart", "checkout"] });
    expect(result.featuresDiscussed).toEqual(["cart", "checkout"]);
  });

  it("keeps existing questionsAnswered when the update has none", () => {
    const existing: ConversationMemoryData = { questionsAnswered: ["What platform?"] };
    const result = mergeConversationMemory(existing, {});
    expect(result.questionsAnswered).toEqual(["What platform?"]);
  });

  it("accumulates portfolioSharedIds across multiple shares without duplicating", () => {
    const existing: ConversationMemoryData = { portfolioSharedIds: ["item-1"] };
    const result = mergeConversationMemory(existing, {
      portfolioSharedIds: ["item-1", "item-2"],
    });
    expect(result.portfolioSharedIds).toEqual(["item-1", "item-2"]);
  });
});

describe("mergeConversationMemory — requirements object merges by key", () => {
  it("adds new requirement keys without touching existing ones", () => {
    const existing: ConversationMemoryData = { requirements: { pages: 5 } };
    const result = mergeConversationMemory(existing, { requirements: { products: 20 } });
    expect(result.requirements).toEqual({ pages: 5, products: 20 });
  });

  it("overwrites a requirement key ONLY when the update explicitly supplies that same key", () => {
    const existing: ConversationMemoryData = { requirements: { pages: 5 } };
    const result = mergeConversationMemory(existing, { requirements: { pages: 8 } });
    expect(result.requirements).toEqual({ pages: 8 });
  });

  it("preserves requirement keys the update doesn't mention at all", () => {
    const existing: ConversationMemoryData = {
      requirements: { pages: 5, products: 20, paymentGateway: "stripe" },
    };
    const result = mergeConversationMemory(existing, { requirements: { products: 25 } });
    expect(result.requirements).toEqual({ pages: 5, products: 25, paymentGateway: "stripe" });
  });

  it("handles a completely empty starting memory", () => {
    const result = mergeConversationMemory(emptyMemory, { requirements: { pages: 3 } });
    expect(result.requirements).toEqual({ pages: 3 });
  });
});

describe("mergeConversationMemory — full realistic multi-turn scenario", () => {
  it("accumulates a complete picture across a simulated 4-message conversation, never losing earlier context", () => {
    let memory: ConversationMemoryData = {};

    // Turn 1: client introduces themselves and the business.
    memory = mergeConversationMemory(memory, {
      clientName: "Jane",
      business: "Jane's Clothing Co",
    });

    // Turn 2: client mentions a feature, AI asks about budget (name/business not repeated).
    memory = mergeConversationMemory(memory, {
      featuresDiscussed: ["online store"],
      questionsAnswered: ["What kind of website do you need?"],
    });

    // Turn 3: client gives budget, mentions another feature.
    memory = mergeConversationMemory(memory, {
      budgetDiscussed: "$1500",
      featuresDiscussed: ["payment gateway"],
    });

    // Turn 4: client gives timeline only — nothing else repeated.
    memory = mergeConversationMemory(memory, { timelineDiscussed: "1 month" });

    // Everything from every turn should still be present.
    expect(memory).toMatchObject({
      clientName: "Jane",
      business: "Jane's Clothing Co",
      featuresDiscussed: ["online store", "payment gateway"],
      questionsAnswered: ["What kind of website do you need?"],
      budgetDiscussed: "$1500",
      timelineDiscussed: "1 month",
    });
  });
});
