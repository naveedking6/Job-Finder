import Anthropic from "@anthropic-ai/sdk";
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

export interface AnthropicProviderConfig {
  apiKey: string;
  model?: string;
}

/**
 * Thin wrapper around @anthropic-ai/sdk. All the actual logic (prompt
 * construction, response validation) lives in capabilities/, shared with
 * the OpenAI adapter — this class's job is just "call the API, hand the
 * text response to the shared parser". This is the one part of the AI
 * layer that costs real money per call (see docs/ADR.md section 7) and
 * can't be exercised in automated tests without a live API key — see
 * providers/mock.ts for what actually runs in CI.
 */
export class AnthropicProvider implements AiProvider {
  readonly key = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: AnthropicProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? "claude-sonnet-4-5";
  }

  private async callWithPrompt(prompt: { system: string; user: string }): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic response contained no text content block");
    }
    return textBlock.text;
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
