import { describe, expect, it } from "vitest";
import { computeRuleBasedRiskScore, detectRiskSignals } from "./risk-signals.js";
import type { ConversationMemoryData } from "../conversation/conversation-memory.js";

const emptyMemory: ConversationMemoryData = {};

describe("detectRiskSignals", () => {
  it("detects no signals from clean text", () => {
    const signals = detectRiskSignals(emptyMemory, "I'd like a quote for a Shopify store.");
    expect(Object.values(signals).every((v) => v === false)).toBe(true);
  });

  it("detects scamLanguageDetected for well-known scam-adjacent phrases", () => {
    expect(
      detectRiskSignals(emptyMemory, "I can only pay via Western Union.").scamLanguageDetected,
    ).toBe(true);
    expect(
      detectRiskSignals(emptyMemory, "This is related to a lottery winning.").scamLanguageDetected,
    ).toBe(true);
  });

  it("does not false-positive scamLanguageDetected on legitimate crypto-industry clients", () => {
    // A client building a crypto-related website is not itself a scam
    // signal — only the specific "crypto only" PAYMENT demand phrase is.
    const signals = detectRiskSignals(emptyMemory, "I run a cryptocurrency exchange startup.");
    expect(signals.scamLanguageDetected).toBe(false);
  });

  it("detects paymentAvoidanceLanguage", () => {
    expect(
      detectRiskSignals(emptyMemory, "I'll pay you only after full completion, no upfront payment.")
        .paymentAvoidanceLanguage,
    ).toBe(true);
  });

  it("detects unrealisticBudgetForScope when many requirements + tiny budget", () => {
    const memory: ConversationMemoryData = {
      requirements: { pages: 10, products: 500, paymentGateway: "stripe", multiLanguage: true, cms: true },
      budgetDiscussed: "$50",
    };
    expect(detectRiskSignals(memory, "").unrealisticBudgetForScope).toBe(true);
  });

  it("does not flag unrealisticBudgetForScope for a small project with a small budget", () => {
    const memory: ConversationMemoryData = {
      requirements: { pages: 1 },
      budgetDiscussed: "$50",
    };
    expect(detectRiskSignals(memory, "").unrealisticBudgetForScope).toBe(false);
  });

  it("does not flag unrealisticBudgetForScope for a large detailed project with a realistic budget", () => {
    const memory: ConversationMemoryData = {
      requirements: { pages: 10, products: 500, paymentGateway: "stripe", multiLanguage: true, cms: true },
      budgetDiscussed: "$8000",
    };
    expect(detectRiskSignals(memory, "").unrealisticBudgetForScope).toBe(false);
  });

  it("detects suspiciousLinkPattern for shortened URLs", () => {
    expect(
      detectRiskSignals(emptyMemory, "Check this out: bit.ly/abc123").suspiciousLinkPattern,
    ).toBe(true);
  });

  it("does not flag a normal https link as suspicious", () => {
    expect(
      detectRiskSignals(emptyMemory, "Here's my current site: https://example.com")
        .suspiciousLinkPattern,
    ).toBe(false);
  });

  it("detects urgencyPressureLanguage", () => {
    expect(detectRiskSignals(emptyMemory, "I need this done ASAP, today only!").urgencyPressureLanguage).toBe(
      true,
    );
  });
});

describe("computeRuleBasedRiskScore", () => {
  it("returns 0 for no signals present", () => {
    const signals = detectRiskSignals(emptyMemory, "Normal legitimate inquiry.");
    expect(computeRuleBasedRiskScore(signals)).toBe(0);
  });

  it("urgency language alone stays in the low-risk band (weak signal, not sufficient alone)", () => {
    const signals = detectRiskSignals(emptyMemory, "Need this ASAP please.");
    expect(computeRuleBasedRiskScore(signals)).toBeLessThan(30);
  });

  it("scam language alone pushes well into the risk range", () => {
    const signals = detectRiskSignals(emptyMemory, "Payment only via Western Union.");
    expect(computeRuleBasedRiskScore(signals)).toBeGreaterThanOrEqual(50);
  });

  it("multiple signals compound to a higher score than any single one", () => {
    const singleSignal = detectRiskSignals(emptyMemory, "Need this urgently.");
    const multipleSignals = detectRiskSignals(
      emptyMemory,
      "Need this urgently — pay you only after full completion, no upfront payment, check bit.ly/xyz",
    );
    expect(computeRuleBasedRiskScore(multipleSignals)).toBeGreaterThan(
      computeRuleBasedRiskScore(singleSignal),
    );
  });

  it("clamps at 100 even with every signal present", () => {
    const memory: ConversationMemoryData = {
      requirements: { a: 1, b: 2, c: 3, d: 4, e: 5 },
      budgetDiscussed: "$10",
    };
    const signals = detectRiskSignals(
      memory,
      "Urgent! Wire transfer only, pay only after completion, no upfront payment, bit.ly/scam",
    );
    expect(computeRuleBasedRiskScore(signals)).toBeLessThanOrEqual(100);
  });

  it("never returns a negative score", () => {
    const signals = detectRiskSignals(emptyMemory, "");
    expect(computeRuleBasedRiskScore(signals)).toBeGreaterThanOrEqual(0);
  });
});
