import { describe, expect, it } from "vitest";
import { createProvider } from "./registry.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAiProvider } from "./providers/openai.js";
import { MockAiProvider } from "./providers/mock.js";

describe("createProvider", () => {
  it('creates an AnthropicProvider for key "anthropic"', () => {
    const provider = createProvider("anthropic", { apiKey: "test-key" });
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.key).toBe("anthropic");
  });

  it('creates an OpenAiProvider for key "openai"', () => {
    const provider = createProvider("openai", { apiKey: "test-key" });
    expect(provider).toBeInstanceOf(OpenAiProvider);
    expect(provider.key).toBe("openai");
  });

  it('creates a MockAiProvider for key "mock", no apiKey needed', () => {
    const provider = createProvider("mock");
    expect(provider).toBeInstanceOf(MockAiProvider);
    expect(provider.key).toBe("mock");
  });

  it("throws a clear error for an unknown provider key", () => {
    expect(() => createProvider("gemini")).toThrow(/unknown ai provider/i);
  });

  it("throws a clear error when anthropic is requested without an apiKey", () => {
    expect(() => createProvider("anthropic")).toThrow(/requires an apiKey/);
  });

  it("throws a clear error when openai is requested without an apiKey", () => {
    expect(() => createProvider("openai")).toThrow(/requires an apiKey/);
  });
});
