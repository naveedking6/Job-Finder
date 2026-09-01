import { describe, expect, it } from "vitest";
import { buildAnalyzeRiskPrompt, parseAnalyzeRiskResponse } from "./analyze-risk.js";
import { AiResponseParseError } from "../provider.js";

describe("buildAnalyzeRiskPrompt", () => {
  it("includes the conversation summary", () => {
    const prompt = buildAnalyzeRiskPrompt({ conversationSummary: "Client requests wire transfer only." });
    expect(prompt.user).toContain("Client requests wire transfer only.");
  });

  it("includes detected signals when provided", () => {
    const prompt = buildAnalyzeRiskPrompt({
      conversationSummary: "Test.",
      clientMetadata: { scamLanguageDetected: true },
    });
    expect(prompt.user).toContain("scamLanguageDetected");
  });

  it("frames this explicitly as NOT an accusation of fraud", () => {
    const prompt = buildAnalyzeRiskPrompt({ conversationSummary: "Test." });
    expect(prompt.system).toMatch(/not an accusation/i);
  });

  it("instructs that a single weak signal shouldn't push into high risk alone", () => {
    const prompt = buildAnalyzeRiskPrompt({ conversationSummary: "Test." });
    expect(prompt.system).toMatch(/single weak signal/i);
  });
});

describe("parseAnalyzeRiskResponse", () => {
  it("parses a valid response with signals array", () => {
    const raw = JSON.stringify({
      score: 65,
      signals: ["payment avoidance language"],
      reasoning: "Client asked to pay only after completion.",
    });
    const result = parseAnalyzeRiskResponse(raw);
    expect(result.score).toBe(65);
    expect(result.signals).toEqual(["payment avoidance language"]);
  });

  it("parses a response with an empty signals array (no risk found)", () => {
    const raw = JSON.stringify({ score: 5, signals: [], reasoning: "Normal inquiry, no concerns." });
    const result = parseAnalyzeRiskResponse(raw);
    expect(result.signals).toEqual([]);
  });

  it("throws AiResponseParseError when signals field is missing entirely", () => {
    const raw = JSON.stringify({ score: 50, reasoning: "Test." });
    expect(() => parseAnalyzeRiskResponse(raw)).toThrow(AiResponseParseError);
  });

  it("throws AiResponseParseError for a score outside 0-100", () => {
    const raw = JSON.stringify({ score: -10, signals: [], reasoning: "Test." });
    expect(() => parseAnalyzeRiskResponse(raw)).toThrow(AiResponseParseError);
  });

  it("throws AiResponseParseError for non-JSON text", () => {
    expect(() => parseAnalyzeRiskResponse("Seems risky to me")).toThrow(AiResponseParseError);
  });
});
