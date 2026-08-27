import { z } from "zod";

export const rateLimitConfigSchema = z.object({
  maxActions: z.number().int().positive(),
  windowMinutes: z.number().int().positive(),
});
export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;

export const dailyLimitConfigSchema = z.object({
  maxPerDay: z.number().int().positive(),
});
export type DailyLimitConfig = z.infer<typeof dailyLimitConfigSchema>;

export const cooldownConfigSchema = z.object({
  cooldownHours: z.number().positive(),
});
export type CooldownConfig = z.infer<typeof cooldownConfigSchema>;

export const workingHoursConfigSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM"),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM"),
  timezone: z.string().min(1),
});
export type WorkingHoursConfig = z.infer<typeof workingHoursConfigSchema>;

export const duplicateContactBlockConfigSchema = z.object({
  cooldownHours: z.number().positive(),
});
export type DuplicateContactBlockConfig = z.infer<typeof duplicateContactBlockConfigSchema>;

/**
 * Everything a rule evaluator might need, gathered by the caller (the API
 * layer, which has database access) BEFORE calling into this package.
 * This package never queries anything itself — it's handed the already-
 * known facts and makes a pure decision from them.
 */
export interface AutomationRuleContext {
  now: Date;
  /** Count of automated actions already taken in the relevant window
   *  (today, for DAILY_LIMIT; the rule's windowMinutes, for RATE_LIMIT). */
  actionsInWindow?: number;
  /** Timestamp of the last automated contact with this specific lead/
   *  target, for COOLDOWN and DUPLICATE_CONTACT_BLOCK. */
  lastActionAt?: Date | null;
}

export interface AutomationRuleResult {
  allowed: boolean;
  ruleType: string;
  reason: string;
}
