import type { AiProvider } from "../provider.js";
import type {
  AnalyzeOpportunityInput,
  AnalyzeOpportunityOutput,
  AnalyzeRiskInput,
  AnalyzeRiskOutput,
  ExtractRequirementsInput,
  ExtractRequirementsOutput,
  GenerateResponseInput,
  GenerateResponseOutput,
  RecommendSolutionInput,
  RecommendSolutionOutput,
  ScoreLeadInput,
  ScoreLeadOutput,
  SummarizeConversationInput,
  SummarizeConversationOutput,
} from "../schemas.js";

/**
 * Deterministic, zero-cost, no-network provider. This is what CI's
 * integration tests actually configure as DEFAULT_AI_PROVIDER — testing
 * "does the API correctly call whatever provider is configured and
 * handle its response" without depending on a live Anthropic/OpenAI key
 * or spending real money on every CI run. See docs/ADR.md Round 5
 * section.
 *
 * Also genuinely useful standing in for the brief's "Local/Hosted
 * OpenAI-compatible provider" option during development — it's not a
 * real local LLM, but it serves the same "doesn't require a paid API
 * key" purpose for anyone developing against this system without
 * provider credentials yet. That distinction is documented here, not
 * glossed over: this is a rule-based mock, not a genuine local model.
 */
export class MockAiProvider implements AiProvider {
  readonly key = "mock";

  async analyzeOpportunity(input: AnalyzeOpportunityInput): Promise<AnalyzeOpportunityOutput> {
    const opportunityWords = new Set(
      `${input.opportunity.title} ${input.opportunity.description}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean),
    );

    const matchedServiceSlugs = input.services
      .filter((service) => {
        const serviceWords = service.name.toLowerCase().split(/\s+/);
        // Whole-word matching, not substring — "designer" must not
        // false-match a service word "design" the way .includes() would.
        return serviceWords.some((word) => word.length > 3 && opportunityWords.has(word));
      })
      .map((s) => s.slug);

    const hasBudget = Boolean(input.opportunity.budgetMin ?? input.opportunity.budgetMax);
    const relevanceScore = matchedServiceSlugs.length > 0 ? 75 : 20;

    return {
      relevanceScore,
      matchedServiceSlugs,
      confidence: matchedServiceSlugs.length > 0 ? 0.7 : 0.4,
      reasoning:
        matchedServiceSlugs.length > 0
          ? `Keyword overlap found with: ${matchedServiceSlugs.join(", ")}.`
          : "No keyword overlap found with any offered service.",
      likelySerious: hasBudget,
      suggestedSolution:
        matchedServiceSlugs.length > 0
          ? `Consider ${matchedServiceSlugs[0]} for this opportunity.`
          : "No clear service match — needs human review.",
    };
  }

  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseOutput> {
    return {
      response: `Thanks for reaching out! I'd be happy to help with your project. Could you tell me more about what you're looking for?`,
      suggestedNextStage: input.recentMessages.length === 0 ? "OUTREACH_SENT" : undefined,
    };
  }

  async extractRequirements(
    input: ExtractRequirementsInput,
  ): Promise<ExtractRequirementsOutput> {
    return {
      requirements: { rawText: input.conversationText.slice(0, 200) },
    };
  }

  async summarizeConversation(
    input: SummarizeConversationInput,
  ): Promise<SummarizeConversationOutput> {
    return {
      summary: `Conversation with ${input.messages.length} message(s).`,
    };
  }

  async scoreLead(_input: ScoreLeadInput): Promise<ScoreLeadOutput> {
    return { score: 50, reasoning: "Mock provider default score." };
  }

  async analyzeRisk(_input: AnalyzeRiskInput): Promise<AnalyzeRiskOutput> {
    return { score: 20, signals: [], reasoning: "Mock provider default risk assessment." };
  }

  async recommendSolution(input: RecommendSolutionInput): Promise<RecommendSolutionOutput> {
    const firstService = input.services[0];
    return {
      recommendation: firstService
        ? `Consider ${firstService.name}.`
        : "No services available to recommend from.",
      matchedServiceSlugs: firstService ? [firstService.slug] : [],
    };
  }
}
