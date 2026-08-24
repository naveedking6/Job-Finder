/**
 * Score band definitions. Thresholds are deliberately data, not
 * hardcoded conditionals — the brief requires these to be configurable.
 * The defaults below match the brief's suggested bands and are meant to
 * be overridden via Settings once that's built (Round 2+), not edited
 * here in code.
 */

export interface ScoreBand {
  label: string;
  min: number;
  max: number;
}

export const DEFAULT_RELEVANCE_BANDS: ScoreBand[] = [
  { label: "Ignore", min: 0, max: 30 },
  { label: "Low priority", min: 31, max: 50 },
  { label: "Possible opportunity", min: 51, max: 70 },
  { label: "High priority", min: 71, max: 85 },
  { label: "Excellent opportunity", min: 86, max: 100 },
];

export const DEFAULT_LEAD_SCORE_BANDS: ScoreBand[] = [
  { label: "Cold", min: 0, max: 30 },
  { label: "Possible", min: 31, max: 50 },
  { label: "Interested", min: 51, max: 70 },
  { label: "Strong Lead", min: 71, max: 85 },
  { label: "Hot Lead", min: 86, max: 100 },
];

/**
 * Risk has no "good/bad" band labels in the same sense — it's a single
 * continuum where higher always means riskier — but we still expose a
 * banding function for consistent dashboard display.
 */
export const DEFAULT_RISK_BANDS: ScoreBand[] = [
  { label: "Low risk", min: 0, max: 30 },
  { label: "Moderate risk", min: 31, max: 60 },
  { label: "High risk", min: 61, max: 100 },
];

export function bandForScore(score: number, bands: ScoreBand[]): ScoreBand {
  const clamped = Math.max(0, Math.min(100, score));
  const match = bands.find((b) => clamped >= b.min && clamped <= b.max);
  // Fall back to the last band if bands don't fully cover 0-100 due to a
  // misconfiguration — better to degrade than throw during scoring.
  return match ?? bands[bands.length - 1]!;
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
