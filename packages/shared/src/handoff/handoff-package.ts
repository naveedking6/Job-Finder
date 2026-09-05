/**
 * Assembles exactly the fields the brief specifies a human handoff must
 * provide: Client Name, Platform, Country, Project Summary,
 * Requirements, Budget, Timeline, Lead Score, Risk Score, Conversation
 * Summary, Recommended Next Action, Contact Details (if legitimately
 * provided). Pure — takes already-fetched data, computes the one
 * genuinely derived field (recommendedNextAction), returns a flat
 * structure ready to serialize as an API response or (Round 9) render
 * on a dashboard.
 */
export interface HandoffPackageInput {
  clientName: string | null;
  platformName: string;
  country: string | null;
  projectSummary: string | null;
  requirements: Record<string, unknown> | null;
  budget: string | null;
  timeline: string | null;
  leadScore: number;
  riskScore: number;
  conversationSummary: string | null;
  handoffReasons: string[];
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface HandoffPackage extends HandoffPackageInput {
  recommendedNextAction: string;
}

function computeRecommendedNextAction(input: HandoffPackageInput): string {
  // High risk always takes priority in the recommendation, regardless
  // of how promising the lead otherwise looks — the brief is explicit
  // that high-risk leads should "never automatically receive sensitive
  // information", and the human reviewing this package should see that
  // caution first, not buried after a generic "follow up" line.
  if (input.riskScore >= 61) {
    return "Review carefully before sharing further details, pricing, or agreeing to any terms — risk signals were detected.";
  }
  if (input.leadScore >= 86) {
    return "Follow up promptly — this is a hot lead and delay risks losing momentum.";
  }
  if (input.leadScore >= 71) {
    return "Strong lead — review the conversation and respond directly to move toward a proposal.";
  }
  return "Review the conversation and decide whether to continue engaging directly.";
}

export function buildHandoffPackage(input: HandoffPackageInput): HandoffPackage {
  return {
    ...input,
    recommendedNextAction: computeRecommendedNextAction(input),
  };
}
