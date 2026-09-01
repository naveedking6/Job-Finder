import { describe, expect, it } from "vitest";
import { buildScoreLeadPrompt, parseScoreLeadResponse } from "./score-lead.js";
import { AiResponseParseError } from "../provider.js";

describe("buildScoreLeadPrompt", () => {
  it("includes the conversation summary", () => {
    const prompt = buildScoreLeadPrompt({ conversationSummary: "Client wants a Shopify store." });
    expect(prompt.user).toContain("Client wants a Shopify store.");
  });

  it("includes detected signals as JSON when provided", () => {
    const prompt = buildScoreLeadPrompt({
      conversationSummary: "Test.",
      signals: { hasBudgetDiscussed: true, respondedMultipleTimes: true },
    });
    expect(prompt.user).toContain("hasBudgetDiscussed");
    expect(prompt.user).toContain("true");
  });

  it("omits the signals section entirely when none are provided", () => {
    const prompt = buildScoreLeadPrompt({ conversationSummary: "Test." });
    expect(prompt.user).not.toContain("Detected structured signals");
  });

  it("includes the scoring band guide", () => {
    const prompt = buildScoreLeadPrompt({ conversationSummary: "Test." });
    expect(prompt.system).toMatch(/0-30 Cold/);
    expect(prompt.system).toMatch(/86-100 Hot Lead/);
  });

  it("instructs treating signals as reliable but weighing conversation tone too", () => {
    const prompt = buildScoreLeadPrompt({ conversationSummary: "Test." });
    expect(prompt.system).toMatch(/reliable ground truth/i);
  });
});

describe("parseScoreLeadResponse", () => {
  it("parses a valid response", () => {
    const raw = JSON.stringify({ score: 75, reasoning: "Detailed requirements and budget discussed." });
    const result = parseScoreLeadResponse(raw);
    expect(result.score).toBe(75);
  });

  it("tolerates a markdown-fenced response", () => {
    const raw = "```json\n" + JSON.stringify({ score: 50, reasoning: "Test." }) + "\n```";
    const result = parseScoreLeadResponse(raw);
    expect(result.score).toBe(50);
  });

  it("throws AiResponseParseError for a score outside 0-100", () => {
    const raw = JSON.stringify({ score: 150, reasoning: "Test." });
    expect(() => parseScoreLeadResponse(raw)).toThrow(AiResponseParseError);
  });

  it("throws AiResponseParseError for a missing reasoning field", () => {
    const raw = JSON.stringify({ score: 50 });
    expect(() => parseScoreLeadResponse(raw)).toThrow(AiResponseParseError);
  });

  it("throws AiResponseParseError for non-JSON text", () => {
    expect(() => parseScoreLeadResponse("This lead looks great!")).toThrow(AiResponseParseError);
  });
});
