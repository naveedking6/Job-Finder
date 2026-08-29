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
} from "./schemas.js";

/**
 * The full abstraction layer the brief calls for — every method it
 * explicitly names. Round 5 fully implements analyzeOpportunity in both
 * real adapters (Anthropic, OpenAI); the rest are defined here so the
 * interface is complete and stable for later rounds to build against,
 * but real adapters throw NotImplementedYetError for them until their
 * turn (see each method's schema comment in schemas.ts for which round).
 *
 * Note: selectPortfolio from the brief is intentionally NOT part of this
 * interface — see selectRelevantPortfolioItems in portfolio-selection.ts
 * and docs/ADR.md Round 5 section for why that one doesn't need an LLM
 * call at all.
 */
export interface AiProvider {
  /** Matches an AiProvider.key row in the database (e.g. "anthropic"). */
  readonly key: string;

  analyzeOpportunity(input: AnalyzeOpportunityInput): Promise<AnalyzeOpportunityOutput>;
  generateResponse(input: GenerateResponseInput): Promise<GenerateResponseOutput>;
  extractRequirements(input: ExtractRequirementsInput): Promise<ExtractRequirementsOutput>;
  summarizeConversation(
    input: SummarizeConversationInput,
  ): Promise<SummarizeConversationOutput>;
  scoreLead(input: ScoreLeadInput): Promise<ScoreLeadOutput>;
  analyzeRisk(input: AnalyzeRiskInput): Promise<AnalyzeRiskOutput>;
  recommendSolution(input: RecommendSolutionInput): Promise<RecommendSolutionOutput>;
}

export class NotImplementedYetError extends Error {
  constructor(methodName: string, providerKey: string, plannedRound: string) {
    super(
      `${providerKey} provider: "${methodName}" is not implemented yet — planned for ${plannedRound}. See docs/ADR.md Round 5 section.`,
    );
    this.name = "NotImplementedYetError";
  }
}

/** Thrown when a model's response can't be parsed into the expected
 *  shape — kept distinct from NotImplementedYetError and from generic
 *  errors so callers can decide whether a retry makes sense. */
export class AiResponseParseError extends Error {
  constructor(
    public readonly rawResponse: string,
    public readonly validationIssues: string,
  ) {
    super(`AI response failed schema validation: ${validationIssues}`);
    this.name = "AiResponseParseError";
  }
}
