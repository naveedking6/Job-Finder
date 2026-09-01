import { describe, expect, it } from "vitest";
import { computeRuleBasedLeadScore, detectLeadSignals } from "./lead-signals.js";
import type { ConversationMemoryData } from "../conversation/conversation-memory.js";

const emptyMemory: ConversationMemoryData = {};

describe("detectLeadSignals", () => {
  it("detects no signals from an empty memory and no messages", () => {
    const signals = detectLeadSignals(emptyMemory, 0, "");
    expect(Object.values(signals).every((v) => v === false)).toBe(true);
  });

  it("detects hasDetailedRequirements when 2+ requirement keys exist", () => {
    const memory: ConversationMemoryData = { requirements: { pages: 5, paymentGateway: "stripe" } };
    expect(detectLeadSignals(memory, 0, "").hasDetailedRequirements).toBe(true);
  });

  it("does not flag hasDetailedRequirements for just 1 key", () => {
    const memory: ConversationMemoryData = { requirements: { pages: 5 } };
    expect(detectLeadSignals(memory, 0, "").hasDetailedRequirements).toBe(false);
  });

  it("detects hasBudgetDiscussed and hasTimelineDiscussed", () => {
    const memory: ConversationMemoryData = { budgetDiscussed: "$1000", timelineDiscussed: "2 weeks" };
    const signals = detectLeadSignals(memory, 0, "");
    expect(signals.hasBudgetDiscussed).toBe(true);
    expect(signals.hasTimelineDiscussed).toBe(true);
  });

  it("detects portfolioShown when portfolioSharedIds is non-empty", () => {
    const memory: ConversationMemoryData = { portfolioSharedIds: ["item-1"] };
    expect(detectLeadSignals(memory, 0, "").portfolioShown).toBe(true);
  });

  it("detects respondedMultipleTimes at exactly 3 client messages, not below", () => {
    expect(detectLeadSignals(emptyMemory, 3, "").respondedMultipleTimes).toBe(true);
    expect(detectLeadSignals(emptyMemory, 2, "").respondedMultipleTimes).toBe(false);
  });

  it("detects mentionsReadyToStart from recent message text", () => {
    expect(
      detectLeadSignals(emptyMemory, 0, "Great, let's move forward with this.")
        .mentionsReadyToStart,
    ).toBe(true);
  });

  it("does not false-positive mentionsReadyToStart on unrelated text", () => {
    expect(detectLeadSignals(emptyMemory, 0, "What's included in the price?").mentionsReadyToStart).toBe(
      false,
    );
  });

  it("detects requestsDirectContact from recent message text", () => {
    expect(
      detectLeadSignals(emptyMemory, 0, "Can you call me on WhatsApp?").requestsDirectContact,
    ).toBe(true);
  });
});

describe("computeRuleBasedLeadScore", () => {
  it("returns 0 for no signals present", () => {
    const signals = detectLeadSignals(emptyMemory, 0, "");
    expect(computeRuleBasedLeadScore(signals)).toBe(0);
  });

  it("returns a higher score as more positive signals accumulate", () => {
    const fewSignals = detectLeadSignals({ budgetDiscussed: "$500" }, 0, "");
    const moreSignals = detectLeadSignals(
      { budgetDiscussed: "$500", timelineDiscussed: "1 month", business: "Acme Co" },
      3,
      "",
    );
    expect(computeRuleBasedLeadScore(moreSignals)).toBeGreaterThan(
      computeRuleBasedLeadScore(fewSignals),
    );
  });

  it("clamps the score at 100 even with every signal present", () => {
    const memory: ConversationMemoryData = {
      requirements: { pages: 5, products: 10 },
      budgetDiscussed: "$5000",
      timelineDiscussed: "1 month",
      business: "Acme Co",
      portfolioSharedIds: ["item-1"],
    };
    const signals = detectLeadSignals(
      memory,
      5,
      "Let's move forward — can you call me on WhatsApp?",
    );
    expect(computeRuleBasedLeadScore(signals)).toBe(100);
  });

  it("never returns a negative score", () => {
    const signals = detectLeadSignals(emptyMemory, 0, "");
    expect(computeRuleBasedLeadScore(signals)).toBeGreaterThanOrEqual(0);
  });
});
