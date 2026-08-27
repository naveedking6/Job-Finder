import type { PlatformPolicyInput, PolicyAction, PolicyDecision } from "./types.js";

function deny(action: PolicyAction, platformKey: string, reason: string): PolicyDecision {
  return { allowed: false, action, platformKey, reason };
}

function allow(action: PolicyAction, platformKey: string, reason: string): PolicyDecision {
  return { allowed: true, action, platformKey, reason };
}

/**
 * The single gate every connector action must pass through before doing
 * anything. This function makes NO network calls, touches NO database —
 * it is a pure decision given the platform's configured flags and the
 * global automation switch. That's deliberate: a policy decision should
 * be reproducible and testable without spinning up any infrastructure,
 * and a connector has no legitimate way to "convince" this function to
 * say yes by any means other than the actual configured flags being true.
 *
 * Evaluation order (first failing check wins, so the reason is always
 * the *most specific* blocker, not a vague catch-all):
 *   1. Is the platform enabled at all?
 *   2. Does the platform allow this specific action?
 *   3. (For anything beyond DISCOVER) Is automation globally enabled?
 *      — this is the brief's "Emergency Stop": discovery/data-collection
 *      continues even when automation is globally off, but no automated
 *      outbound action does. See docs/ADR.md Round 3 section.
 */
export function evaluatePolicy(
  platform: PlatformPolicyInput,
  action: PolicyAction,
  globalAutomationEnabled: boolean,
): PolicyDecision {
  if (!platform.isEnabled) {
    return deny(action, platform.key, `Platform "${platform.name}" is disabled.`);
  }

  switch (action) {
    case "DISCOVER": {
      if (!platform.discoveryAllowed) {
        return deny(
          action,
          platform.key,
          `Discovery is not permitted on "${platform.name}" (discoveryAllowed=false).`,
        );
      }
      return allow(action, platform.key, `Discovery permitted on "${platform.name}".`);
    }

    case "AUTOMATE": {
      if (!platform.automationAllowed) {
        return deny(
          action,
          platform.key,
          `Automation is not permitted on "${platform.name}" (automationAllowed=false). This is a compliance decision, not a temporary block — see the platform's complianceNotes.`,
        );
      }
      if (!globalAutomationEnabled) {
        return deny(
          action,
          platform.key,
          "Automation is globally disabled (emergency stop is active). Turn it back on via POST /automation/start.",
        );
      }
      return allow(action, platform.key, `Automation permitted on "${platform.name}".`);
    }

    case "AUTO_MESSAGE": {
      if (!platform.automationAllowed) {
        return deny(
          action,
          platform.key,
          `Automation is not permitted on "${platform.name}" (automationAllowed=false), so automated messaging cannot proceed either.`,
        );
      }
      if (!platform.autoMessageAllowed) {
        return deny(
          action,
          platform.key,
          `Automated messaging is specifically not permitted on "${platform.name}" (autoMessageAllowed=false), even though other automation may be.`,
        );
      }
      if (!globalAutomationEnabled) {
        return deny(
          action,
          platform.key,
          "Automation is globally disabled (emergency stop is active). Turn it back on via POST /automation/start.",
        );
      }
      return allow(action, platform.key, `Automated messaging permitted on "${platform.name}".`);
    }

    case "AUTO_COMMENT": {
      if (!platform.automationAllowed) {
        return deny(
          action,
          platform.key,
          `Automation is not permitted on "${platform.name}" (automationAllowed=false), so automated commenting cannot proceed either.`,
        );
      }
      if (!platform.autoCommentAllowed) {
        return deny(
          action,
          platform.key,
          `Automated commenting is specifically not permitted on "${platform.name}" (autoCommentAllowed=false), even though other automation may be.`,
        );
      }
      if (!globalAutomationEnabled) {
        return deny(
          action,
          platform.key,
          "Automation is globally disabled (emergency stop is active). Turn it back on via POST /automation/start.",
        );
      }
      return allow(action, platform.key, `Automated commenting permitted on "${platform.name}".`);
    }
  }
}
