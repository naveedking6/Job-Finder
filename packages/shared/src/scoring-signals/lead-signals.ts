import type { ConversationMemoryData } from "../conversation/conversation-memory.js";

/**
 * Structured signals detected from a conversation's accumulated memory
 * and recent message text. Deliberately NOT an AI call — these are
 * facts a simple, deterministic check can establish directly, matching
 * the brief's own list of positive lead signals. The AI-based
 * scoreLead() capability (ai-core, Round 7) takes these as grounding
 * context for a more nuanced qualitative judgment, rather than
 * reasoning from scratch with no structure to anchor to.
 */
export interface LeadSignals {
  hasDetailedRequirements: boolean;
  hasBudgetDiscussed: boolean;
  hasTimelineDiscussed: boolean;
  hasBusinessInfo: boolean;
  portfolioShown: boolean;
  respondedMultipleTimes: boolean;
  mentionsReadyToStart: boolean;
  requestsDirectContact: boolean;
}

const READY_TO_START_PATTERN = /\b(start|begin|proceed|move forward|ready to|let'?s do it|kick off)\b/i;
const DIRECT_CONTACT_PATTERN = /\b(phone|whatsapp|call me|email me directly|skype|zoom call)\b/i;

export function detectLeadSignals(
  memory: ConversationMemoryData,
  clientMessageCount: number,
  recentMessagesText: string,
): LeadSignals {
  return {
    hasDetailedRequirements: Object.keys(memory.requirements ?? {}).length >= 2,
    hasBudgetDiscussed: Boolean(memory.budgetDiscussed),
    hasTimelineDiscussed: Boolean(memory.timelineDiscussed),
    hasBusinessInfo: Boolean(memory.business),
    portfolioShown: (memory.portfolioSharedIds?.length ?? 0) > 0,
    respondedMultipleTimes: clientMessageCount >= 3,
    mentionsReadyToStart: READY_TO_START_PATTERN.test(recentMessagesText),
    requestsDirectContact: DIRECT_CONTACT_PATTERN.test(recentMessagesText),
  };
}

/**
 * Weights are deliberately simple integers, not tuned coefficients from
 * real data (there isn't any real usage data yet — see docs/ADR.md
 * Round 7 section). Each signal's contribution is stated plainly so the
 * scoring is auditable, and the whole thing is configurable-in-spirit:
 * changing a weight here is a one-line, fully-tested change, not a
 * buried magic number.
 */
const LEAD_SIGNAL_WEIGHTS: Record<keyof LeadSignals, number> = {
  hasDetailedRequirements: 20,
  hasBudgetDiscussed: 15,
  hasTimelineDiscussed: 10,
  hasBusinessInfo: 10,
  portfolioShown: 5,
  respondedMultipleTimes: 15,
  mentionsReadyToStart: 20,
  requestsDirectContact: 15,
};

export function computeRuleBasedLeadScore(signals: LeadSignals): number {
  let score = 0;
  for (const [key, isPresent] of Object.entries(signals) as [keyof LeadSignals, boolean][]) {
    if (isPresent) score += LEAD_SIGNAL_WEIGHTS[key];
  }
  return Math.max(0, Math.min(100, score));
}
