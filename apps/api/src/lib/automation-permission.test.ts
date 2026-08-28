import { describe, expect, it } from "vitest";
import { deriveAutomationPermission } from "./automation-permission.js";

describe("deriveAutomationPermission", () => {
  it("returns ALLOWED when automationAllowed is true, regardless of discoveryAllowed", () => {
    expect(
      deriveAutomationPermission({ automationAllowed: true, discoveryAllowed: false }),
    ).toBe("ALLOWED");
    expect(
      deriveAutomationPermission({ automationAllowed: true, discoveryAllowed: true }),
    ).toBe("ALLOWED");
  });

  it("returns DISCOVERY_ONLY when automationAllowed is false but discoveryAllowed is true", () => {
    expect(
      deriveAutomationPermission({ automationAllowed: false, discoveryAllowed: true }),
    ).toBe("DISCOVERY_ONLY");
  });

  it("returns DISABLED when both flags are false", () => {
    expect(
      deriveAutomationPermission({ automationAllowed: false, discoveryAllowed: false }),
    ).toBe("DISABLED");
  });
});
