import { describe, expect, it } from "vitest";
import {
  buildSummarizeConversationPrompt,
  parseSummarizeConversationResponse,
} from "./summarize-conversation.js";
import { AiResponseParseError } from "../provider.js";

describe("buildSummarizeConversationPrompt", () => {
  it("includes every message with its sender", () => {
    const prompt = buildSummarizeConversationPrompt({
      messages: [
        { sender: "CLIENT", content: "I need a store." },
        { sender: "AI", content: "Happy to help!" },
      ],
    });
    expect(prompt.user).toContain("CLIENT: I need a store.");
    expect(prompt.user).toContain("AI: Happy to help!");
  });

  it("instructs the model to be concrete rather than vague", () => {
    const prompt = buildSummarizeConversationPrompt({ messages: [] });
    expect(prompt.system).toMatch(/concrete/i);
  });
});

describe("parseSummarizeConversationResponse", () => {
  it("parses a valid summary", () => {
    const raw = JSON.stringify({ summary: "Client Jane wants a Shopify store, budget $1500." });
    const result = parseSummarizeConversationResponse(raw);
    expect(result.summary).toContain("Jane");
  });

  it("tolerates a markdown-fenced response", () => {
    const raw = "```json\n" + JSON.stringify({ summary: "A summary." }) + "\n```";
    const result = parseSummarizeConversationResponse(raw);
    expect(result.summary).toBe("A summary.");
  });

  it("throws AiResponseParseError for an empty summary string", () => {
    const raw = JSON.stringify({ summary: "" });
    expect(() => parseSummarizeConversationResponse(raw)).toThrow(AiResponseParseError);
  });

  it("throws AiResponseParseError for missing summary field", () => {
    const raw = JSON.stringify({ notes: "wrong field name" });
    expect(() => parseSummarizeConversationResponse(raw)).toThrow(AiResponseParseError);
  });
});
