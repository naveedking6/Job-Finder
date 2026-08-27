import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./evaluate.js";
import type { PlatformPolicyInput } from "./types.js";

const fullyOpenPlatform: PlatformPolicyInput = {
  key: "own_website",
  name: "Own Website",
  isEnabled: true,
  discoveryAllowed: true,
  automationAllowed: true,
  autoMessageAllowed: true,
  autoCommentAllowed: true,
};

const fullyLockedPlatform: PlatformPolicyInput = {
  key: "upwork",
  name: "Upwork",
  isEnabled: false,
  discoveryAllowed: false,
  automationAllowed: false,
  autoMessageAllowed: false,
  autoCommentAllowed: false,
};

const discoveryOnlyPlatform: PlatformPolicyInput = {
  key: "remoteok",
  name: "RemoteOK",
  isEnabled: true,
  discoveryAllowed: true,
  automationAllowed: false,
  autoMessageAllowed: false,
  autoCommentAllowed: false,
};

describe("evaluatePolicy — platform disabled overrides everything", () => {
  it("denies DISCOVER when the platform itself is disabled, even if discoveryAllowed=true", () => {
    const platform: PlatformPolicyInput = { ...fullyOpenPlatform, isEnabled: false };
    const result = evaluatePolicy(platform, "DISCOVER", true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/disabled/i);
  });

  it("denies AUTOMATE when the platform itself is disabled, even if automationAllowed=true and global automation is on", () => {
    const platform: PlatformPolicyInput = { ...fullyOpenPlatform, isEnabled: false };
    const result = evaluatePolicy(platform, "AUTOMATE", true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/disabled/i);
  });
});

describe("evaluatePolicy — DISCOVER", () => {
  it("allows discovery when discoveryAllowed=true", () => {
    const result = evaluatePolicy(fullyOpenPlatform, "DISCOVER", false);
    expect(result.allowed).toBe(true);
  });

  it("denies discovery when discoveryAllowed=false but the platform itself is enabled", () => {
    const platform: PlatformPolicyInput = {
      ...fullyOpenPlatform,
      discoveryAllowed: false,
    };
    const result = evaluatePolicy(platform, "DISCOVER", false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/discoveryAllowed=false/);
  });

  it("DISCOVER is NOT affected by the global automation switch (brief: 'preserve incoming data')", () => {
    const withAutomationOff = evaluatePolicy(fullyOpenPlatform, "DISCOVER", false);
    const withAutomationOn = evaluatePolicy(fullyOpenPlatform, "DISCOVER", true);
    expect(withAutomationOff.allowed).toBe(true);
    expect(withAutomationOn.allowed).toBe(true);
  });
});

describe("evaluatePolicy — AUTOMATE", () => {
  it("allows automation when automationAllowed=true AND global automation is on", () => {
    const result = evaluatePolicy(fullyOpenPlatform, "AUTOMATE", true);
    expect(result.allowed).toBe(true);
  });

  it("denies automation when automationAllowed=false, regardless of global switch", () => {
    const result = evaluatePolicy(discoveryOnlyPlatform, "AUTOMATE", true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/automationAllowed=false/);
  });

  it("denies automation when the platform allows it but the GLOBAL emergency stop is active", () => {
    const result = evaluatePolicy(fullyOpenPlatform, "AUTOMATE", false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/globally disabled/i);
  });
});

describe("evaluatePolicy — AUTO_MESSAGE", () => {
  it("allows auto-message when automationAllowed AND autoMessageAllowed AND global automation are all true", () => {
    const result = evaluatePolicy(fullyOpenPlatform, "AUTO_MESSAGE", true);
    expect(result.allowed).toBe(true);
  });

  it("denies auto-message when automationAllowed=true but autoMessageAllowed=false specifically", () => {
    const platform: PlatformPolicyInput = {
      ...fullyOpenPlatform,
      autoMessageAllowed: false,
    };
    const result = evaluatePolicy(platform, "AUTO_MESSAGE", true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/autoMessageAllowed=false/);
  });

  it("denies auto-message when automationAllowed=false (checked before autoMessageAllowed)", () => {
    const result = evaluatePolicy(discoveryOnlyPlatform, "AUTO_MESSAGE", true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/automationAllowed=false/);
  });

  it("denies auto-message when the global emergency stop is active", () => {
    const result = evaluatePolicy(fullyOpenPlatform, "AUTO_MESSAGE", false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/globally disabled/i);
  });
});

describe("evaluatePolicy — AUTO_COMMENT", () => {
  it("allows auto-comment when all three relevant flags are true", () => {
    const result = evaluatePolicy(fullyOpenPlatform, "AUTO_COMMENT", true);
    expect(result.allowed).toBe(true);
  });

  it("denies auto-comment when autoCommentAllowed=false specifically", () => {
    const platform: PlatformPolicyInput = { ...fullyOpenPlatform, autoCommentAllowed: false };
    const result = evaluatePolicy(platform, "AUTO_COMMENT", true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/autoCommentAllowed=false/);
  });
});

describe("evaluatePolicy — compliance-critical platforms seeded disabled (see seed.ts)", () => {
  it("Upwork-shaped config denies every non-trivial action", () => {
    for (const action of ["DISCOVER", "AUTOMATE", "AUTO_MESSAGE", "AUTO_COMMENT"] as const) {
      const result = evaluatePolicy(fullyLockedPlatform, action, true);
      expect(result.allowed).toBe(false);
    }
  });
});

describe("evaluatePolicy — decision reason is always present and non-empty", () => {
  it("every decision, allowed or not, includes a human-readable reason", () => {
    const platforms = [fullyOpenPlatform, fullyLockedPlatform, discoveryOnlyPlatform];
    const actions = ["DISCOVER", "AUTOMATE", "AUTO_MESSAGE", "AUTO_COMMENT"] as const;
    for (const platform of platforms) {
      for (const action of actions) {
        for (const globalFlag of [true, false]) {
          const result = evaluatePolicy(platform, action, globalFlag);
          expect(result.reason.length).toBeGreaterThan(0);
          expect(result.platformKey).toBe(platform.key);
          expect(result.action).toBe(action);
        }
      }
    }
  });
});
