import { DateTime } from "luxon";
import {
  cooldownConfigSchema,
  dailyLimitConfigSchema,
  duplicateContactBlockConfigSchema,
  rateLimitConfigSchema,
  workingHoursConfigSchema,
  type AutomationRuleContext,
  type AutomationRuleResult,
  type CooldownConfig,
  type DailyLimitConfig,
  type DuplicateContactBlockConfig,
  type RateLimitConfig,
  type WorkingHoursConfig,
} from "./rule-types.js";

function pass(ruleType: string, reason: string): AutomationRuleResult {
  return { allowed: true, ruleType, reason };
}

function fail(ruleType: string, reason: string): AutomationRuleResult {
  return { allowed: false, ruleType, reason };
}

export function evaluateRateLimit(
  config: RateLimitConfig,
  context: AutomationRuleContext,
): AutomationRuleResult {
  const count = context.actionsInWindow ?? 0;
  if (count >= config.maxActions) {
    return fail(
      "RATE_LIMIT",
      `Rate limit reached: ${count}/${config.maxActions} actions in the last ${config.windowMinutes} minutes.`,
    );
  }
  return pass(
    "RATE_LIMIT",
    `Within rate limit: ${count}/${config.maxActions} actions in the last ${config.windowMinutes} minutes.`,
  );
}

export function evaluateDailyLimit(
  config: DailyLimitConfig,
  context: AutomationRuleContext,
): AutomationRuleResult {
  const count = context.actionsInWindow ?? 0;
  if (count >= config.maxPerDay) {
    return fail("DAILY_LIMIT", `Daily limit reached: ${count}/${config.maxPerDay} today.`);
  }
  return pass("DAILY_LIMIT", `Within daily limit: ${count}/${config.maxPerDay} today.`);
}

export function evaluateCooldown(
  config: CooldownConfig,
  context: AutomationRuleContext,
): AutomationRuleResult {
  if (!context.lastActionAt) {
    return pass("COOLDOWN", "No prior contact recorded — cooldown does not apply.");
  }
  const hoursSinceLastAction =
    (context.now.getTime() - context.lastActionAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastAction < config.cooldownHours) {
    const remaining = (config.cooldownHours - hoursSinceLastAction).toFixed(1);
    return fail(
      "COOLDOWN",
      `Cooldown active: last contact was ${hoursSinceLastAction.toFixed(1)}h ago, ${remaining}h remaining of the ${config.cooldownHours}h cooldown.`,
    );
  }
  return pass(
    "COOLDOWN",
    `Cooldown satisfied: last contact was ${hoursSinceLastAction.toFixed(1)}h ago (>= ${config.cooldownHours}h required).`,
  );
}

export function evaluateDuplicateContactBlock(
  config: DuplicateContactBlockConfig,
  context: AutomationRuleContext,
): AutomationRuleResult {
  // Same underlying mechanics as COOLDOWN — the distinction is purely
  // semantic (this rule exists specifically to stop the same lead being
  // messaged twice, whereas COOLDOWN is a general per-platform pacing
  // rule) — kept as a separate function so the reason text and rule type
  // stay accurate to what's actually being enforced.
  if (!context.lastActionAt) {
    return pass("DUPLICATE_CONTACT_BLOCK", "No prior contact recorded for this lead.");
  }
  const hoursSinceLastAction =
    (context.now.getTime() - context.lastActionAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastAction < config.cooldownHours) {
    return fail(
      "DUPLICATE_CONTACT_BLOCK",
      `This lead was already contacted ${hoursSinceLastAction.toFixed(1)}h ago; blocking duplicate contact for ${config.cooldownHours}h.`,
    );
  }
  return pass(
    "DUPLICATE_CONTACT_BLOCK",
    `Last contact with this lead was ${hoursSinceLastAction.toFixed(1)}h ago — duplicate-contact window has passed.`,
  );
}

export function evaluateWorkingHours(
  config: WorkingHoursConfig,
  context: AutomationRuleContext,
): AutomationRuleResult {
  const nowInZone = DateTime.fromJSDate(context.now, { zone: config.timezone });
  if (!nowInZone.isValid) {
    return fail(
      "WORKING_HOURS",
      `Invalid timezone "${config.timezone}" — cannot evaluate working hours. Failing closed (denying) rather than risking sending outside intended hours.`,
    );
  }

  const [startHour, startMinute] = config.start.split(":").map(Number) as [number, number];
  const [endHour, endMinute] = config.end.split(":").map(Number) as [number, number];

  const startMinutesOfDay = startHour * 60 + startMinute;
  const endMinutesOfDay = endHour * 60 + endMinute;
  const nowMinutesOfDay = nowInZone.hour * 60 + nowInZone.minute;

  const withinHours =
    startMinutesOfDay <= endMinutesOfDay
      ? nowMinutesOfDay >= startMinutesOfDay && nowMinutesOfDay < endMinutesOfDay
      : // Overnight window (e.g. 22:00-06:00) — currently "now" is within
        // hours if it's after start OR before end.
        nowMinutesOfDay >= startMinutesOfDay || nowMinutesOfDay < endMinutesOfDay;

  const nowLabel = nowInZone.toFormat("HH:mm");
  if (!withinHours) {
    return fail(
      "WORKING_HOURS",
      `Current time ${nowLabel} (${config.timezone}) is outside the configured working hours ${config.start}-${config.end}.`,
    );
  }
  return pass(
    "WORKING_HOURS",
    `Current time ${nowLabel} (${config.timezone}) is within working hours ${config.start}-${config.end}.`,
  );
}

/**
 * Validates a rule's raw JSON config against the expected schema for its
 * type, then evaluates it. Throws on a malformed config — a bad config
 * is an operator/setup error that should surface loudly, not silently
 * allow or silently deny automation.
 */
export function evaluateAutomationRule(
  ruleType: string,
  rawConfig: unknown,
  context: AutomationRuleContext,
): AutomationRuleResult {
  switch (ruleType) {
    case "RATE_LIMIT":
      return evaluateRateLimit(rateLimitConfigSchema.parse(rawConfig), context);
    case "DAILY_LIMIT":
      return evaluateDailyLimit(dailyLimitConfigSchema.parse(rawConfig), context);
    case "COOLDOWN":
      return evaluateCooldown(cooldownConfigSchema.parse(rawConfig), context);
    case "WORKING_HOURS":
      return evaluateWorkingHours(workingHoursConfigSchema.parse(rawConfig), context);
    case "DUPLICATE_CONTACT_BLOCK":
      return evaluateDuplicateContactBlock(
        duplicateContactBlockConfigSchema.parse(rawConfig),
        context,
      );
    default:
      throw new Error(`Unknown automation rule type: "${ruleType}"`);
  }
}
