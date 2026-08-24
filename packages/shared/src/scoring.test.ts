import { describe, expect, it } from "vitest";
import {
  bandForScore,
  clampScore,
  DEFAULT_LEAD_SCORE_BANDS,
  DEFAULT_RELEVANCE_BANDS,
  DEFAULT_RISK_BANDS,
} from "./scoring.js";

describe("clampScore", () => {
  it("clamps values above 100 down to 100", () => {
    expect(clampScore(150)).toBe(100);
  });

  it("clamps negative values up to 0", () => {
    expect(clampScore(-20)).toBe(0);
  });

  it("rounds fractional scores", () => {
    expect(clampScore(72.6)).toBe(73);
  });

  it("leaves in-range integer scores unchanged", () => {
    expect(clampScore(55)).toBe(55);
  });
});

describe("bandForScore — relevance bands (per spec thresholds)", () => {
  it("0-30 is Ignore", () => {
    expect(bandForScore(0, DEFAULT_RELEVANCE_BANDS).label).toBe("Ignore");
    expect(bandForScore(30, DEFAULT_RELEVANCE_BANDS).label).toBe("Ignore");
  });

  it("31-50 is Low priority", () => {
    expect(bandForScore(31, DEFAULT_RELEVANCE_BANDS).label).toBe("Low priority");
    expect(bandForScore(50, DEFAULT_RELEVANCE_BANDS).label).toBe("Low priority");
  });

  it("86-100 is Excellent opportunity", () => {
    expect(bandForScore(86, DEFAULT_RELEVANCE_BANDS).label).toBe("Excellent opportunity");
    expect(bandForScore(100, DEFAULT_RELEVANCE_BANDS).label).toBe("Excellent opportunity");
  });

  it("every integer 0-100 falls into exactly one band", () => {
    for (let score = 0; score <= 100; score++) {
      const matches = DEFAULT_RELEVANCE_BANDS.filter((b) => score >= b.min && score <= b.max);
      expect(matches.length).toBe(1);
    }
  });
});

describe("bandForScore — lead score bands (per spec thresholds)", () => {
  it("86-100 is Hot Lead", () => {
    expect(bandForScore(90, DEFAULT_LEAD_SCORE_BANDS).label).toBe("Hot Lead");
  });

  it("0-30 is Cold", () => {
    expect(bandForScore(15, DEFAULT_LEAD_SCORE_BANDS).label).toBe("Cold");
  });

  it("every integer 0-100 falls into exactly one band", () => {
    for (let score = 0; score <= 100; score++) {
      const matches = DEFAULT_LEAD_SCORE_BANDS.filter((b) => score >= b.min && score <= b.max);
      expect(matches.length).toBe(1);
    }
  });
});

describe("bandForScore — risk bands", () => {
  it("every integer 0-100 falls into exactly one band", () => {
    for (let score = 0; score <= 100; score++) {
      const matches = DEFAULT_RISK_BANDS.filter((b) => score >= b.min && score <= b.max);
      expect(matches.length).toBe(1);
    }
  });

  it("higher score is always higher or equal risk band ordering", () => {
    const low = bandForScore(10, DEFAULT_RISK_BANDS);
    const high = bandForScore(90, DEFAULT_RISK_BANDS);
    expect(low.label).toBe("Low risk");
    expect(high.label).toBe("High risk");
  });
});

describe("bandForScore — out-of-range input safety", () => {
  it("clamps scores above 100 into the top band", () => {
    expect(bandForScore(150, DEFAULT_RELEVANCE_BANDS).label).toBe("Excellent opportunity");
  });

  it("clamps negative scores into the bottom band", () => {
    expect(bandForScore(-10, DEFAULT_RELEVANCE_BANDS).label).toBe("Ignore");
  });
});
