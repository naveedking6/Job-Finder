import OpenAI from "openai";
import {
  buildAnalyzeOpportunityPrompt,
  parseAnalyzeOpportunityResponse,
} from "../capabilities/analyze-opportunity.js";
import {
  buildGenerateResponsePrompt,
  parseGenerateResponseResponse,
} from "../capabilities/generate-response.js";
import {
  buildExtractRequirementsPrompt,
  parseExtractRequirementsResponse,
} from "../capabilities/extract-requirements.js";
import {
  buildSummarizeConversationPrompt,
  parseSummarizeConversationResponse,
} from "../capabilities/summarize-conversation.js";
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

  private async callWithPrompt(prompt: { system: string; user: string }): Promise<string> {
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
    return text;
  }

  async analyzeOpportunity(input: AnalyzeOpportunityInput): Promise<AnalyzeOpportunityOutput> {
    const prompt = buildAnalyzeOpportunityPrompt(input);
    const text = await this.callWithPrompt(prompt);
    return parseAnalyzeOpportunityResponse(text, input);
  }

  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseOutput> {
    const prompt = buildGenerateResponsePrompt(input);
    const text = await this.callWithPrompt(prompt);
    return parseGenerateResponseResponse(text);
  }

  async extractRequirements(
    input: ExtractRequirementsInput,
  ): Promise<ExtractRequirementsOutput> {
    const prompt = buildExtractRequirementsPrompt(input);
    const text = await this.callWithPrompt(prompt);
    return parseExtractRequirementsResponse(text);
  }

  async summarizeConversation(
    input: SummarizeConversationInput,
  ): Promise<SummarizeConversationOutput> {
    const prompt = buildSummarizeConversationPrompt(input);
    const text = await this.callWithPrompt(prompt);
    return parseSummarizeConversationResponse(text);
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
