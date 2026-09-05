/**
 * The brief lists six triggers for human handoff. Four are concretely
 * groundable from data this system already computes (Rounds 6-7) and
 * are implemented here:
 *   - Lead score reaches a configured threshold
 *   - Risk score reaches a configured threshold (the brief frames risk
 *     as needing human review before sensitive info is shared — that's
 *     a handoff trigger, not just a dashboard flag)
 *   - Client requests direct communication (requestsDirectContact signal)
 *   - Client is ready to start (mentionsReadyToStart signal)
 *
 * Two are NOT implemented here, stated plainly rather than faked:
 *   - "A pricing decision requires my approval" and "a technical
 *     decision exceeds the AI's authority" would need the AI to
 *     actively reason about specific pricing/technical requests against
 *     PricingRule data — that table exists in the schema but isn't
 *     wired into any live route yet. A reasonable future extension once
 *     pricing rules are actively used, not a gap worth faking coverage
 *     for now. See docs/ADR.md Round 8 section.
 */
export interface HandoffTriggerContext {
  leadScore: number;
  riskScore: number;
  leadScoreThreshold: number;
  riskScoreThreshold: number;
  requestsDirectContact: boolean;
  mentionsReadyToStart: boolean;
}

export interface HandoffTriggerResult {
  shouldHandoff: boolean;
  reasons: string[];
}

export function shouldTriggerHandoff(context: HandoffTriggerContext): HandoffTriggerResult {
  const reasons: string[] = [];

  if (context.leadScore >= context.leadScoreThreshold) {
    reasons.push(
      `Lead score ${context.leadScore} reached the configured handoff threshold (${context.leadScoreThreshold}).`,
    );
  }
  if (context.riskScore >= context.riskScoreThreshold) {
    reasons.push(
      `Risk score ${context.riskScore} reached the configured review threshold (${context.riskScoreThreshold}) — recommend human review before sharing further details.`,
    );
  }
  if (context.requestsDirectContact) {
    reasons.push("Client explicitly requested direct communication.");
  }
  if (context.mentionsReadyToStart) {
    reasons.push("Client indicated readiness to start the project.");
  }

  return { shouldHandoff: reasons.length > 0, reasons };
}
