import { describe, expect, it } from "vitest";
import { evaluateCombinedPolicy } from "./combined.js";
import type { PlatformPolicyInput } from "./types.js";

const openPlatform: PlatformPolicyInput = {
  key: "own_website",
  name: "Own Website",
  isEnabled: true,
  discoveryAllowed: true,
  automationAllowed: true,
  autoMessageAllowed: true,
  autoCommentAllowed: true,
};

const lockedPlatform: PlatformPolicyInput = {
  key: "upwork",
  name: "Upwork",
  isEnabled: true,
  discoveryAllowed: true,
  automationAllowed: false,
  autoMessageAllowed: false,
  autoCommentAllowed: false,
};

describe("evaluateCombinedPolicy — platform gate short-circuits rules", () => {
  it("denies immediately on a platform-policy failure WITHOUT evaluating any rules", () => {
    const result = evaluateCombinedPolicy(
      lockedPlatform,
      "AUTO_MESSAGE",
      true,
      [{ type: "DAILY_LIMIT", config: { maxPerDay: 1 } }],
      { now: new Date(), actionsInWindow: 0 },
    );
    expect(result.allowed).toBe(false);
    expect(result.ruleResults).toEqual([]); // rules never ran
    expect(result.blockedBy).toMatch(/automationAllowed=false/);
  });
});

describe("evaluateCombinedPolicy — all rules must pass", () => {
  it("allows when the platform permits it and every rule passes", () => {
    const result = evaluateCombinedPolicy(
      openPlatform,
      "AUTO_MESSAGE",
      true,
      [
        { type: "DAILY_LIMIT", config: { maxPerDay: 20 } },
        { type: "COOLDOWN", config: { cooldownHours: 48 } },
      ],
      { now: new Date(), actionsInWindow: 5, lastActionAt: null },
    );
    expect(result.allowed).toBe(true);
    expect(result.ruleResults).toHaveLength(2);
    expect(result.blockedBy).toBeUndefined();
  });

  it("denies when the platform permits it but ONE rule fails", () => {
    const result = evaluateCombinedPolicy(
      openPlatform,
      "AUTO_MESSAGE",
      true,
      [
        { type: "DAILY_LIMIT", config: { maxPerDay: 20 } },
        { type: "COOLDOWN", config: { cooldownHours: 48 } },
      ],
      {
        now: new Date("2026-01-10T12:00:00Z"),
        actionsInWindow: 5,
        lastActionAt: new Date("2026-01-10T11:00:00Z"), // 1h ago, cooldown not satisfied
      },
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toMatch(/cooldown active/i);
    // Both rules still get evaluated (not short-circuited), so the full
    // picture is visible for auditing/debugging even though one failed.
    expect(result.ruleResults).toHaveLength(2);
  });

  it("reports the FIRST failing rule when multiple rules fail", () => {
    const result = evaluateCombinedPolicy(
      openPlatform,
      "AUTO_MESSAGE",
      true,
      [
        { type: "DAILY_LIMIT", config: { maxPerDay: 5 } },
        { type: "COOLDOWN", config: { cooldownHours: 48 } },
      ],
      {
        now: new Date("2026-01-10T12:00:00Z"),
        actionsInWindow: 5, // daily limit reached
        lastActionAt: new Date("2026-01-10T11:00:00Z"), // cooldown also not satisfied
      },
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toMatch(/daily limit reached/i);
  });

  it("allows with zero rules configured (an empty rule set is not a failure)", () => {
    const result = evaluateCombinedPolicy(
      openPlatform,
      "AUTO_MESSAGE",
      true,
      [],
      { now: new Date() },
    );
    expect(result.allowed).toBe(true);
  });
});

describe("evaluateCombinedPolicy — emergency stop still applies even with permissive rules", () => {
  it("denies when global automation is off, regardless of how permissive the rules are", () => {
    const result = evaluateCombinedPolicy(
      openPlatform,
      "AUTO_MESSAGE",
      false, // emergency stop active
      [{ type: "DAILY_LIMIT", config: { maxPerDay: 1000 } }],
      { now: new Date(), actionsInWindow: 0 },
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toMatch(/globally disabled/i);
    expect(result.ruleResults).toEqual([]);
  });
});
