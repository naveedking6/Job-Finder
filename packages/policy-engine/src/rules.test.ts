import { describe, expect, it } from "vitest";
import {
  evaluateAutomationRule,
  evaluateCooldown,
  evaluateDailyLimit,
  evaluateDuplicateContactBlock,
  evaluateRateLimit,
  evaluateWorkingHours,
} from "./rules.js";

describe("evaluateRateLimit", () => {
  it("allows when under the limit", () => {
    const result = evaluateRateLimit(
      { maxActions: 10, windowMinutes: 60 },
      { now: new Date(), actionsInWindow: 5 },
    );
    expect(result.allowed).toBe(true);
  });

  it("denies at exactly the limit (limit is a ceiling, not exclusive)", () => {
    const result = evaluateRateLimit(
      { maxActions: 10, windowMinutes: 60 },
      { now: new Date(), actionsInWindow: 10 },
    );
    expect(result.allowed).toBe(false);
  });

  it("treats a missing actionsInWindow as zero", () => {
    const result = evaluateRateLimit(
      { maxActions: 10, windowMinutes: 60 },
      { now: new Date() },
    );
    expect(result.allowed).toBe(true);
  });
});

describe("evaluateDailyLimit", () => {
  it("allows when under the daily cap", () => {
    const result = evaluateDailyLimit({ maxPerDay: 20 }, { now: new Date(), actionsInWindow: 19 });
    expect(result.allowed).toBe(true);
  });

  it("denies once the daily cap is reached", () => {
    const result = evaluateDailyLimit({ maxPerDay: 20 }, { now: new Date(), actionsInWindow: 20 });
    expect(result.allowed).toBe(false);
  });
});

describe("evaluateCooldown", () => {
  it("allows when there's no prior contact at all", () => {
    const result = evaluateCooldown({ cooldownHours: 48 }, { now: new Date(), lastActionAt: null });
    expect(result.allowed).toBe(true);
  });

  it("denies when the cooldown period hasn't elapsed", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const lastActionAt = new Date("2026-01-10T00:00:00Z"); // 12 hours ago
    const result = evaluateCooldown({ cooldownHours: 48 }, { now, lastActionAt });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/12\.0h ago/);
  });

  it("allows once the cooldown period has fully elapsed", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const lastActionAt = new Date("2026-01-08T00:00:00Z"); // 60 hours ago
    const result = evaluateCooldown({ cooldownHours: 48 }, { now, lastActionAt });
    expect(result.allowed).toBe(true);
  });

  it("is right on the boundary — exactly cooldownHours elapsed is allowed (not strictly less than)", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const lastActionAt = new Date("2026-01-08T12:00:00Z"); // exactly 48h ago
    const result = evaluateCooldown({ cooldownHours: 48 }, { now, lastActionAt });
    expect(result.allowed).toBe(true);
  });
});

describe("evaluateDuplicateContactBlock", () => {
  it("blocks contacting the same lead again within the window", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const lastActionAt = new Date("2026-01-10T10:00:00Z"); // 2h ago
    const result = evaluateDuplicateContactBlock({ cooldownHours: 24 }, { now, lastActionAt });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already contacted/i);
  });

  it("allows contacting again once the window has passed", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const lastActionAt = new Date("2026-01-08T12:00:00Z"); // 48h ago
    const result = evaluateDuplicateContactBlock({ cooldownHours: 24 }, { now, lastActionAt });
    expect(result.allowed).toBe(true);
  });
});

describe("evaluateWorkingHours — normal (non-overnight) window", () => {
  const config = { start: "09:00", end: "21:00", timezone: "UTC" };

  it("allows a time in the middle of the window", () => {
    const now = new Date("2026-01-10T14:00:00Z");
    const result = evaluateWorkingHours(config, { now });
    expect(result.allowed).toBe(true);
  });

  it("allows exactly at the start boundary (inclusive)", () => {
    const now = new Date("2026-01-10T09:00:00Z");
    const result = evaluateWorkingHours(config, { now });
    expect(result.allowed).toBe(true);
  });

  it("denies exactly at the end boundary (exclusive)", () => {
    const now = new Date("2026-01-10T21:00:00Z");
    const result = evaluateWorkingHours(config, { now });
    expect(result.allowed).toBe(false);
  });

  it("denies before the window opens", () => {
    const now = new Date("2026-01-10T05:00:00Z");
    const result = evaluateWorkingHours(config, { now });
    expect(result.allowed).toBe(false);
  });

  it("denies after the window closes", () => {
    const now = new Date("2026-01-10T23:00:00Z");
    const result = evaluateWorkingHours(config, { now });
    expect(result.allowed).toBe(false);
  });
});

describe("evaluateWorkingHours — overnight window (wraps midnight)", () => {
  const config = { start: "22:00", end: "06:00", timezone: "UTC" };

  it("allows late at night, before midnight", () => {
    const now = new Date("2026-01-10T23:00:00Z");
    expect(evaluateWorkingHours(config, { now }).allowed).toBe(true);
  });

  it("allows early morning, after midnight, before the end time", () => {
    const now = new Date("2026-01-10T03:00:00Z");
    expect(evaluateWorkingHours(config, { now }).allowed).toBe(true);
  });

  it("denies during the daytime gap", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    expect(evaluateWorkingHours(config, { now }).allowed).toBe(false);
  });
});

describe("evaluateWorkingHours — timezone conversion", () => {
  it("correctly evaluates a non-UTC timezone (Asia/Karachi is UTC+5)", () => {
    const config = { start: "09:00", end: "21:00", timezone: "Asia/Karachi" };
    // 06:00 UTC = 11:00 in Karachi — within 09:00-21:00 Karachi time.
    const withinKarachiHours = new Date("2026-01-10T06:00:00Z");
    expect(evaluateWorkingHours(config, { now: withinKarachiHours }).allowed).toBe(true);

    // 01:00 UTC = 06:00 in Karachi — before the 09:00 Karachi opening.
    const beforeKarachiHours = new Date("2026-01-10T01:00:00Z");
    expect(evaluateWorkingHours(config, { now: beforeKarachiHours }).allowed).toBe(false);
  });

  it("fails closed (denies) on an invalid timezone rather than throwing or silently allowing", () => {
    const config = { start: "09:00", end: "21:00", timezone: "Not/A/Real/Zone" };
    const result = evaluateWorkingHours(config, { now: new Date() });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/invalid timezone/i);
  });
});

describe("evaluateAutomationRule — dispatcher", () => {
  it("routes to the correct evaluator based on ruleType string", () => {
    const result = evaluateAutomationRule(
      "DAILY_LIMIT",
      { maxPerDay: 5 },
      { now: new Date(), actionsInWindow: 5 },
    );
    expect(result.ruleType).toBe("DAILY_LIMIT");
    expect(result.allowed).toBe(false);
  });

  it("throws on an unknown rule type rather than silently passing", () => {
    expect(() =>
      evaluateAutomationRule("NOT_A_REAL_RULE_TYPE", {}, { now: new Date() }),
    ).toThrow(/unknown automation rule type/i);
  });

  it("throws on a malformed config for a known rule type", () => {
    expect(() =>
      evaluateAutomationRule("DAILY_LIMIT", { maxPerDay: "not-a-number" }, { now: new Date() }),
    ).toThrow();
  });
});
