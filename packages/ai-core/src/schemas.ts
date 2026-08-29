import { z } from "zod";

/**
 * One schema pair per capability the brief specifies for the AI provider
 * abstraction. Fully implemented and used this round: analyzeOpportunity.
 * The rest have their contracts defined now (so adapters have a stable
 * interface to build against) but throw NotImplementedYetError in the
 * real provider adapters until their own round — see provider.ts and
 * docs/ADR.md Round 5 section for exactly which round implements each.
 */

// --- analyzeOpportunity (THE Round 5 deliverable — the "AI Relevance Engine") ---

export const analyzeOpportunityInputSchema = z.object({
  opportunity: z.object({
    title: z.string(),
    description: z.string(),
    budgetMin: z.number().optional(),
    budgetMax: z.number().optional(),
    currency: z.string().optional(),
    skillsDetected: z.array(z.string()).optional(),
  }),
  /** The operator's service catalog — what they actually offer, so the
   *  model is grounded in real capabilities, not guessing. */
  services: z.array(z.object({ name: z.string(), slug: z.string() })),
});
export type AnalyzeOpportunityInput = z.infer<typeof analyzeOpportunityInputSchema>;

export const analyzeOpportunityOutputSchema = z.object({
  relevanceScore: z.number().int().min(0).max(100),
  /** Service slugs (from the input catalog) the model judged this
   *  opportunity actually needs — MUST be a subset of what was offered,
   *  enforced by parseAndValidate, not just hoped for. */
  matchedServiceSlugs: z.array(z.string()),
  /** 0-1 — how confident the model is in its own match, distinct from
   *  the relevance score itself (a confident "this is a 20" is different
   *  from an unsure "maybe this is a 20"). */
  confidence: z.number().min(0).max(1),
  /** Short, specific reasoning — grounds the score in something a human
   *  reviewing the dashboard can actually check against the listing. */
  reasoning: z.string().min(1),
  /** Whether the client's stated needs/budget/tone suggest a genuine,
   *  serious inquiry vs. a vague or likely-unserious posting. Separate
   *  from relevance — a highly relevant listing can still read as
   *  low-seriousness, and vice versa. */
  likelySerious: z.boolean(),
  suggestedSolution: z.string().min(1),
});
export type AnalyzeOpportunityOutput = z.infer<typeof analyzeOpportunityOutputSchema>;

// --- generateResponse (Round 6 — conversation memory/state) ---

export const generateResponseInputSchema = z.object({
  conversationSummary: z.string().optional(),
  recentMessages: z.array(z.object({ sender: z.string(), content: z.string() })),
  knowledgeBaseContext: z.array(z.string()).optional(),
});
export type GenerateResponseInput = z.infer<typeof generateResponseInputSchema>;

export const generateResponseOutputSchema = z.object({
  response: z.string().min(1),
  suggestedNextStage: z.string().optional(),
});
export type GenerateResponseOutput = z.infer<typeof generateResponseOutputSchema>;

// --- extractRequirements (Round 6) ---

export const extractRequirementsInputSchema = z.object({
  conversationText: z.string(),
});
export type ExtractRequirementsInput = z.infer<typeof extractRequirementsInputSchema>;

export const extractRequirementsOutputSchema = z.object({
  requirements: z.record(z.string(), z.unknown()),
  budget: z.string().optional(),
  timeline: z.string().optional(),
});
export type ExtractRequirementsOutput = z.infer<typeof extractRequirementsOutputSchema>;

// --- summarizeConversation (Round 6) ---

export const summarizeConversationInputSchema = z.object({
  messages: z.array(z.object({ sender: z.string(), content: z.string() })),
});
export type SummarizeConversationInput = z.infer<typeof summarizeConversationInputSchema>;

export const summarizeConversationOutputSchema = z.object({
  summary: z.string().min(1),
});
export type SummarizeConversationOutput = z.infer<typeof summarizeConversationOutputSchema>;

// --- scoreLead (Round 7 — lead scoring) ---

export const scoreLeadInputSchema = z.object({
  conversationSummary: z.string(),
  signals: z.record(z.string(), z.unknown()).optional(),
});
export type ScoreLeadInput = z.infer<typeof scoreLeadInputSchema>;

export const scoreLeadOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasoning: z.string().min(1),
});
export type ScoreLeadOutput = z.infer<typeof scoreLeadOutputSchema>;

// --- analyzeRisk (Round 7 — risk scoring) ---

export const analyzeRiskInputSchema = z.object({
  conversationSummary: z.string(),
  clientMetadata: z.record(z.string(), z.unknown()).optional(),
});
export type AnalyzeRiskInput = z.infer<typeof analyzeRiskInputSchema>;

export const analyzeRiskOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  signals: z.array(z.string()),
  reasoning: z.string().min(1),
});
export type AnalyzeRiskOutput = z.infer<typeof analyzeRiskOutputSchema>;

// --- recommendSolution (Round 6+ — standalone re-recommendation after
// requirements gathering; the INITIAL recommendation happens inside
// analyzeOpportunity's output instead, see docs/ADR.md Round 5 section) ---

export const recommendSolutionInputSchema = z.object({
  requirements: z.record(z.string(), z.unknown()),
  services: z.array(z.object({ name: z.string(), slug: z.string() })),
});
export type RecommendSolutionInput = z.infer<typeof recommendSolutionInputSchema>;

export const recommendSolutionOutputSchema = z.object({
  recommendation: z.string().min(1),
  matchedServiceSlugs: z.array(z.string()),
});
export type RecommendSolutionOutput = z.infer<typeof recommendSolutionOutputSchema>;
