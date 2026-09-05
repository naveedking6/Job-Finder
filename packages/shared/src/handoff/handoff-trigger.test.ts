import { describe, expect, it } from "vitest";
import { shouldTriggerHandoff, type HandoffTriggerContext } from "./handoff-trigger.js";

const baseContext: HandoffTriggerContext = {
  leadScore: 20,
  riskScore: 10,
  leadScoreThreshold: 71,
  riskScoreThreshold: 61,
  requestsDirectContact: false,
  mentionsReadyToStart: false,
};

describe("shouldTriggerHandoff — no triggers", () => {
  it("does not trigger when nothing crosses any threshold or signal", () => {
    const result = shouldTriggerHandoff(baseContext);
    expect(result.shouldHandoff).toBe(false);
    expect(result.reasons).toEqual([]);
  });
});

describe("shouldTriggerHandoff — lead score threshold", () => {
  it("triggers exactly at the threshold (inclusive)", () => {
    const result = shouldTriggerHandoff({ ...baseContext, leadScore: 71 });
    expect(result.shouldHandoff).toBe(true);
    expect(result.reasons[0]).toMatch(/lead score/i);
  });

  it("does not trigger just below the threshold", () => {
    const result = shouldTriggerHandoff({ ...baseContext, leadScore: 70 });
    expect(result.shouldHandoff).toBe(false);
  });
});

describe("shouldTriggerHandoff — risk score threshold", () => {
  it("triggers exactly at the threshold (inclusive)", () => {
    const result = shouldTriggerHandoff({ ...baseContext, riskScore: 61 });
    expect(result.shouldHandoff).toBe(true);
    expect(result.reasons[0]).toMatch(/risk score/i);
  });

  it("does not trigger just below the threshold", () => {
    const result = shouldTriggerHandoff({ ...baseContext, riskScore: 60 });
    expect(result.shouldHandoff).toBe(false);
  });
});

describe("shouldTriggerHandoff — client signals", () => {
  it("triggers on requestsDirectContact alone, regardless of scores", () => {
    const result = shouldTriggerHandoff({ ...baseContext, requestsDirectContact: true });
    expect(result.shouldHandoff).toBe(true);
    expect(result.reasons[0]).toMatch(/direct communication/i);
  });

  it("triggers on mentionsReadyToStart alone, regardless of scores", () => {
    const result = shouldTriggerHandoff({ ...baseContext, mentionsReadyToStart: true });
    expect(result.shouldHandoff).toBe(true);
    expect(result.reasons[0]).toMatch(/readiness to start/i);
  });
});

describe("shouldTriggerHandoff — multiple simultaneous triggers", () => {
  it("lists every triggered reason, not just the first", () => {
    const result = shouldTriggerHandoff({
      ...baseContext,
      leadScore: 90,
      requestsDirectContact: true,
      mentionsReadyToStart: true,
    });
    expect(result.reasons).toHaveLength(3);
  });

  it("high risk and high lead score can both fire together", () => {
    const result = shouldTriggerHandoff({ ...baseContext, leadScore: 90, riskScore: 80 });
    expect(result.reasons).toHaveLength(2);
  });
});
