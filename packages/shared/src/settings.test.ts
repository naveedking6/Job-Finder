import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  isKnownSettingKey,
  SETTING_KEYS,
  validateSettingValue,
} from "./settings.js";

describe("validateSettingValue", () => {
  it("accepts a valid AUTOMATION_ENABLED boolean", () => {
    expect(validateSettingValue("AUTOMATION_ENABLED", true)).toBe(true);
    expect(validateSettingValue("AUTOMATION_ENABLED", false)).toBe(false);
  });

  it("rejects a non-boolean AUTOMATION_ENABLED value", () => {
    expect(() => validateSettingValue("AUTOMATION_ENABLED", "yes")).toThrow();
    expect(() => validateSettingValue("AUTOMATION_ENABLED", 1)).toThrow();
  });

  it("accepts a lead score threshold within 0-100", () => {
    expect(validateSettingValue("LEAD_SCORE_HANDOFF_THRESHOLD", 71)).toBe(71);
  });

  it("rejects a lead score threshold above 100", () => {
    expect(() => validateSettingValue("LEAD_SCORE_HANDOFF_THRESHOLD", 150)).toThrow();
  });

  it("rejects a negative risk threshold", () => {
    expect(() => validateSettingValue("RISK_SCORE_REVIEW_THRESHOLD", -5)).toThrow();
  });

  it("accepts valid working hours", () => {
    const value = { start: "09:00", end: "21:00", timezone: "Asia/Karachi" };
    expect(validateSettingValue("WORKING_HOURS", value)).toEqual(value);
  });

  it("rejects working hours with a malformed time", () => {
    expect(() =>
      validateSettingValue("WORKING_HOURS", { start: "9am", end: "21:00", timezone: "UTC" }),
    ).toThrow();
  });

  it("accepts a valid E.164 WhatsApp number", () => {
    expect(validateSettingValue("WHATSAPP_BUSINESS_NUMBER", "+923001234567")).toBe(
      "+923001234567",
    );
  });

  it("rejects a WhatsApp number without a leading +", () => {
    expect(() => validateSettingValue("WHATSAPP_BUSINESS_NUMBER", "923001234567")).toThrow();
  });

  it("rejects an empty operator name", () => {
    expect(() => validateSettingValue("OPERATOR_NAME", "")).toThrow();
  });
});

describe("isKnownSettingKey", () => {
  it("recognizes every declared key", () => {
    for (const key of SETTING_KEYS) {
      expect(isKnownSettingKey(key)).toBe(true);
    }
  });

  it("rejects an arbitrary unknown key", () => {
    expect(isKnownSettingKey("SOME_RANDOM_KEY")).toBe(false);
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("has a value for every declared key", () => {
    for (const key of SETTING_KEYS) {
      expect(DEFAULT_SETTINGS).toHaveProperty(key);
    }
  });

  it("every default value actually passes its own schema", () => {
    for (const key of SETTING_KEYS) {
      expect(() => validateSettingValue(key, DEFAULT_SETTINGS[key])).not.toThrow();
    }
  });

  it("defaults automation to OFF — safety default, not an oversight", () => {
    expect(DEFAULT_SETTINGS.AUTOMATION_ENABLED).toBe(false);
  });
});
