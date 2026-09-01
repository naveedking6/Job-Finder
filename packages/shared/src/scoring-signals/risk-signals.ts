import type { ConversationMemoryData } from "../conversation/conversation-memory.js";

/**
 * Structured risk signals — same philosophy as lead-signals.ts. These
 * are deliberately conservative pattern matches, not accusations: the
 * brief is explicit that "the purpose is not to claim that someone is
 * definitely fraudulent," just to compute a configurable risk score. A
 * signal firing means "worth a closer look", not "confirmed scam".
 */
export interface RiskSignals {
  scamLanguageDetected: boolean;
  paymentAvoidanceLanguage: boolean;
  unrealisticBudgetForScope: boolean;
  suspiciousLinkPattern: boolean;
  urgencyPressureLanguage: boolean;
}

// Deliberately well-known, low-ambiguity scam-adjacent phrases — not a
// list of every possible red flag, which would drift into false
// positives on legitimate international clients. See docs/ADR.md
// Round 7 section for why this stays conservative.
const SCAM_LANGUAGE_PATTERN =
  /\b(wire transfer only|western union|advance fee|inheritance|lottery winnings?|gift cards? only|crypto(currency)? only|moneygram)\b/i;

const PAYMENT_AVOIDANCE_PATTERN =
  /\b(pay (you )?only after (full )?completion|no upfront payment|release funds? only after|pay off-platform|avoid (the )?platform fees?)\b/i;

const URGENCY_PATTERN = /\b(urgent(ly)?|asap|right now|immediately|today only)\b/i;

const SHORTENED_URL_PATTERN = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl)\/\S+/i;

export function detectRiskSignals(
  memory: ConversationMemoryData,
  recentMessagesText: string,
): RiskSignals {
  const requirementsCount = Object.keys(memory.requirements ?? {}).length;
  const budgetMatch = memory.budgetDiscussed?.match(/\$\s?(\d[\d,]*)/);
  const budgetValue = budgetMatch ? Number(budgetMatch[1]!.replace(/,/g, "")) : null;

  return {
    scamLanguageDetected: SCAM_LANGUAGE_PATTERN.test(recentMessagesText),
    paymentAvoidanceLanguage: PAYMENT_AVOIDANCE_PATTERN.test(recentMessagesText),
    // A large, detailed feature list paired with a suspiciously tiny
    // stated budget — a genuine mismatch signal, not just "low budget"
    // on its own (plenty of legitimate small-budget projects exist).
    unrealisticBudgetForScope: requirementsCount >= 5 && budgetValue !== null && budgetValue < 100,
    suspiciousLinkPattern: SHORTENED_URL_PATTERN.test(recentMessagesText),
    urgencyPressureLanguage: URGENCY_PATTERN.test(recentMessagesText),
  };
}

const RISK_SIGNAL_WEIGHTS: Record<keyof RiskSignals, number> = {
  scamLanguageDetected: 50,
  paymentAvoidanceLanguage: 35,
  unrealisticBudgetForScope: 20,
  suspiciousLinkPattern: 15,
  // Urgency alone is a weak, easily-false-positive signal (legitimate
  // clients are sometimes genuinely in a hurry) — kept low weight and
  // never sufficient on its own to push a lead into the high-risk band.
  urgencyPressureLanguage: 10,
};

export function computeRuleBasedRiskScore(signals: RiskSignals): number {
  let score = 0;
  for (const [key, isPresent] of Object.entries(signals) as [keyof RiskSignals, boolean][]) {
    if (isPresent) score += RISK_SIGNAL_WEIGHTS[key];
  }
  return Math.max(0, Math.min(100, score));
}
