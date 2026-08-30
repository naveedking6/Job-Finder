import { describe, expect, it } from "vitest";
import {
  buildGenerateResponsePrompt,
  parseGenerateResponseResponse,
} from "./generate-response.js";
import { AiResponseParseError } from "../provider.js";
import type { GenerateResponseInput } from "../schemas.js";

const sampleInput: GenerateResponseInput = {
  conversationSummary: "Client Jane needs a Shopify store for her clothing business.",
  recentMessages: [
    { sender: "CLIENT", content: "What would this cost roughly?" },
  ],
};

describe("buildGenerateResponsePrompt", () => {
  it("includes the conversation summary when present", () => {
    const prompt = buildGenerateResponsePrompt(sampleInput);
    expect(prompt.user).toContain(sampleInput.conversationSummary);
  });

  it("indicates a fresh conversation when no summary is given", () => {
    const prompt = buildGenerateResponsePrompt({ recentMessages: [] });
    expect(prompt.user).toMatch(/start of the conversation/i);
  });

  it("includes recent messages with sender labels", () => {
    const prompt = buildGenerateResponsePrompt(sampleInput);
    expect(prompt.user).toContain("CLIENT: What would this cost roughly?");
  });

  it("includes knowledge base context when provided", () => {
    const withKb: GenerateResponseInput = {
      ...sampleInput,
      knowledgeBaseContext: ["Standard Shopify builds start at $800."],
    };
    const prompt = buildGenerateResponsePrompt(withKb);
    expect(prompt.user).toContain("Standard Shopify builds start at $800.");
  });

  it("omits the knowledge base section entirely when none is provided", () => {
    const prompt = buildGenerateResponsePrompt(sampleInput);
    expect(prompt.user).not.toContain("knowledge base");
  });

  it("instructs the model not to repeat already-answered questions", () => {
    const prompt = buildGenerateResponsePrompt(sampleInput);
    expect(prompt.system).toMatch(/never repeat a question/i);
  });

  it("instructs against AI-disclosure phrases unless required", () => {
    const prompt = buildGenerateResponsePrompt(sampleInput);
    expect(prompt.system).toMatch(/as an ai/i);
  });
});

describe("parseGenerateResponseResponse", () => {
  it("parses a valid response", () => {
    const raw = JSON.stringify({ response: "Sure! A Shopify store like this typically runs..." });
    const result = parseGenerateResponseResponse(raw);
    expect(result.response).toContain("Shopify store");
  });

  it("parses a response including an optional suggestedNextStage", () => {
    const raw = JSON.stringify({
      response: "Thanks for reaching out!",
      suggestedNextStage: "CLIENT_RESPONDED",
    });
    const result = parseGenerateResponseResponse(raw);
    expect(result.suggestedNextStage).toBe("CLIENT_RESPONDED");
  });

  it("tolerates a markdown-fenced response", () => {
    const raw = "```json\n" + JSON.stringify({ response: "Hello!" }) + "\n```";
    const result = parseGenerateResponseResponse(raw);
    expect(result.response).toBe("Hello!");
  });

  it("throws AiResponseParseError for an empty response string field", () => {
    const raw = JSON.stringify({ response: "" });
    expect(() => parseGenerateResponseResponse(raw)).toThrow(AiResponseParseError);
  });

  it("throws AiResponseParseError for non-JSON text", () => {
    expect(() => parseGenerateResponseResponse("Just a plain reply, not JSON")).toThrow(
      AiResponseParseError,
    );
  });
});
