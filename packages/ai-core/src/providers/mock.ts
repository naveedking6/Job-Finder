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
    // A deliberately simple but non-trivial heuristic — unlike a naive
    // "always echo something back" stub, this only reports a
    // requirement/budget/timeline when the message actually contains
    // recognizable signal for one, so filler messages like "just
    // checking in" correctly produce nothing new. This matters for
    // realistic testing of the conversation state machine and memory
    // merge logic downstream — see docs/ADR.md Round 6 section.
    const text = input.conversationText.toLowerCase();
    const requirements: Record<string, unknown> = {};

    if (/\bwebsite|store|shop|app\b/.test(text)) {
      requirements.projectType = "website";
    }
    if (/\bpage/.test(text)) {
      requirements.mentionsPages = true;
    }

    const budgetMatch = text.match(/\$\s?\d[\d,]*/);
    const timelineMatch = text.match(/\b(\d+\s*(day|week|month)s?|asap)\b/);

    return {
      requirements,
      budget: budgetMatch ? budgetMatch[0] : undefined,
      timeline: timelineMatch ? timelineMatch[0] : undefined,
    };
  }

  async summarizeConversation(
    input: SummarizeConversationInput,
  ): Promise<SummarizeConversationOutput> {
    return {
      summary: `Conversation with ${input.messages.length} message(s).`,
    };
  }

  async scoreLead(input: ScoreLeadInput): Promise<ScoreLeadOutput> {
    // Deterministic: count how many provided signals are truthy, scale
    // to 0-100. Mirrors the shape of the real rule-based scoring in
    // packages/shared/src/scoring-signals/ without depending on that
    // package directly — ai-core only sees whatever signals object the
    // caller already computed and passed in.
    const signalEntries = Object.values(input.signals ?? {});
    const truthyCount = signalEntries.filter(Boolean).length;
    const score =
      signalEntries.length > 0
        ? Math.round((truthyCount / signalEntries.length) * 100)
        : 30; // no signals at all — a mildly cold default, not zero

    return {
      score,
      reasoning: `Mock provider: ${truthyCount}/${signalEntries.length || 0} positive signals detected.`,
    };
  }

  async analyzeRisk(input: AnalyzeRiskInput): Promise<AnalyzeRiskOutput> {
    const signalEntries = Object.entries(input.clientMetadata ?? {});
    const firedSignals = signalEntries.filter(([, value]) => Boolean(value)).map(([key]) => key);
    const score = Math.min(100, firedSignals.length * 25);

    return {
      score,
      signals: firedSignals,
      reasoning:
        firedSignals.length > 0
          ? `Mock provider: risk signals fired: ${firedSignals.join(", ")}.`
          : "Mock provider: no risk signals detected.",
    };
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
