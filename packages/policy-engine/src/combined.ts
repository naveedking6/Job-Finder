import { evaluatePolicy } from "./evaluate.js";
import { evaluateAutomationRule } from "./rules.js";
import type { AutomationRuleContext, AutomationRuleResult } from "./rule-types.js";
import type { PlatformPolicyInput, PolicyAction, PolicyDecision } from "./types.js";

export interface AutomationRuleInput {
  type: string;
  config: unknown;
}

export interface CombinedPolicyResult {
  allowed: boolean;
  platformDecision: PolicyDecision;
  ruleResults: AutomationRuleResult[];
  /** The single reason the action was blocked, if it was — whichever
   *  check (platform policy or a rule) failed first. Undefined if allowed. */
  blockedBy?: string;
}

/**
 * The real entry point a connector (or, for now, the API's manual policy-
 * check endpoint — connectors themselves are Round 4) should call before
 * taking ANY outbound action. Checks the platform policy gate FIRST
 * (cheapest check, and the one with zero tolerance — no automation rule
 * can override a platform-level "not permitted"), then every applicable
 * automation rule. All rules must pass for the action to be allowed.
 */
export function evaluateCombinedPolicy(
  platform: PlatformPolicyInput,
  action: PolicyAction,
  globalAutomationEnabled: boolean,
  rules: AutomationRuleInput[],
  ruleContext: AutomationRuleContext,
): CombinedPolicyResult {
  const platformDecision = evaluatePolicy(platform, action, globalAutomationEnabled);

  if (!platformDecision.allowed) {
    return {
      allowed: false,
      platformDecision,
      ruleResults: [],
      blockedBy: platformDecision.reason,
    };
  }

  const ruleResults = rules.map((rule) =>
    evaluateAutomationRule(rule.type, rule.config, ruleContext),
  );

  const firstFailedRule = ruleResults.find((r) => !r.allowed);

  return {
    allowed: !firstFailedRule,
    platformDecision,
    ruleResults,
    blockedBy: firstFailedRule?.reason,
  };
}
