import { z } from "zod";

/**
 * The Settings table is a generic key/value store (see schema.prisma) so
 * that adding a new setting never requires a migration. This module is
 * what keeps that flexibility from turning into chaos: every key the
 * system actually reads or writes is declared here, with a Zod schema
 * for its value, and both the API and (later) the dashboard import from
 * here rather than inventing key strings inline.
 */

export const SETTINGS_SCHEMAS = {
  /**
   * The global emergency-stop flag from the brief. Defaults to false —
   * automation must be explicitly turned on by a human, never on by
   * default. When false: no new automated outreach, no automatic
   * messages. Incoming data collection and dashboard access continue
   * regardless (see brief's "Emergency Stop" section).
   */
  AUTOMATION_ENABLED: z.boolean(),

  /** Lead score at/above which a human handoff is triggered automatically. */
  LEAD_SCORE_HANDOFF_THRESHOLD: z.number().int().min(0).max(100),

  /** Risk score at/above which a lead is flagged for mandatory human review. */
  RISK_SCORE_REVIEW_THRESHOLD: z.number().int().min(0).max(100),

  /** Maximum automated outreach messages sent per platform per day. */
  DAILY_OUTREACH_LIMIT_PER_PLATFORM: z.number().int().min(0),

  /** Hours (in the configured timezone) during which automated outreach may be sent. */
  WORKING_HOURS: z.object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM"),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM"),
    timezone: z.string().min(1),
  }),

  /** E.164 phone number used to build wa.me handoff links. */
  WHATSAPP_BUSINESS_NUMBER: z.string().regex(/^\+[1-9]\d{6,14}$/, "expected E.164 format"),

  /** Operator display name used in generated outreach/handoff messages. */
  OPERATOR_NAME: z.string().min(1),
} as const;

export type SettingKey = keyof typeof SETTINGS_SCHEMAS;

export const SETTING_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingKey[];

export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

/** Validates a value against the schema for a given settings key. */
export function validateSettingValue<K extends SettingKey>(
  key: K,
  value: unknown,
): SettingValue<K> {
  return SETTINGS_SCHEMAS[key].parse(value) as SettingValue<K>;
}

export function isKnownSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as string[]).includes(key);
}

/**
 * Safe defaults applied by the seed script. Automation is OFF by default
 * — this is a deliberate safety choice, not an oversight.
 */
export const DEFAULT_SETTINGS: { [K in SettingKey]: SettingValue<K> } = {
  AUTOMATION_ENABLED: false,
  LEAD_SCORE_HANDOFF_THRESHOLD: 71,
  RISK_SCORE_REVIEW_THRESHOLD: 61,
  DAILY_OUTREACH_LIMIT_PER_PLATFORM: 20,
  WORKING_HOURS: { start: "09:00", end: "21:00", timezone: "Asia/Karachi" },
  WHATSAPP_BUSINESS_NUMBER: "+10000000000",
  OPERATOR_NAME: "Muhammad Naveed",
};
