import OpenAI from "openai";
import {
  buildAnalyzeOpportunityPrompt,
  parseAnalyzeOpportunityResponse,
} from "../capabilities/analyze-opportunity.js";
import { NotImplementedYetError, type AiProvider } from "../provider.js";
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

export interface OpenAiProviderConfig {
  apiKey: string;
  model?: string;
}

/** Same shape and reasoning as AnthropicProvider — see that file's
 *  comment. Kept as a genuinely separate adapter (not a shared base
 *  class attempting to unify two different SDKs' call shapes) since the
 *  actual API surface differs enough that a shared abstraction would add
 *  more complexity than it removes for two providers. */
export class OpenAiProvider implements AiProvider {
  readonly key = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: OpenAiProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model ?? "gpt-4o";
  }

  async analyzeOpportunity(input: AnalyzeOpportunityInput): Promise<AnalyzeOpportunityOutput> {
    const prompt = buildAnalyzeOpportunityPrompt(input);
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error("OpenAI response contained no message content");
    }

    return parseAnalyzeOpportunityResponse(text, input);
  }

  async generateResponse(_input: GenerateResponseInput): Promise<GenerateResponseOutput> {
    throw new NotImplementedYetError("generateResponse", this.key, "Round 6");
  }

  async extractRequirements(
    _input: ExtractRequirementsInput,
  ): Promise<ExtractRequirementsOutput> {
    throw new NotImplementedYetError("extractRequirements", this.key, "Round 6");
  }

  async summarizeConversation(
    _input: SummarizeConversationInput,
  ): Promise<SummarizeConversationOutput> {
    throw new NotImplementedYetError("summarizeConversation", this.key, "Round 6");
  }

  async scoreLead(_input: ScoreLeadInput): Promise<ScoreLeadOutput> {
    throw new NotImplementedYetError("scoreLead", this.key, "Round 7");
  }

  async analyzeRisk(_input: AnalyzeRiskInput): Promise<AnalyzeRiskOutput> {
    throw new NotImplementedYetError("analyzeRisk", this.key, "Round 7");
  }

  async recommendSolution(_input: RecommendSolutionInput): Promise<RecommendSolutionOutput> {
    throw new NotImplementedYetError("recommendSolution", this.key, "Round 6+");
  }
}
