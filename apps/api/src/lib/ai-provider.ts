import { createProvider, type AiProvider } from "@ai-sales-agent/ai-core";

/**
 * Selects and constructs the AI provider for this process based on env
 * config. Defaults to "mock" when nothing is explicitly configured —
 * this is a deliberate safety choice: the system should never
 * accidentally start making real, paid API calls just because a real
 * key happened to be present without DEFAULT_AI_PROVIDER being set
 * intentionally. See docs/ENVIRONMENT.md.
 */
export function getConfiguredAiProvider(): AiProvider {
  const providerKey = process.env.DEFAULT_AI_PROVIDER ?? "mock";

  if (providerKey === "anthropic") {
    return createProvider("anthropic", {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL,
    });
  }

  if (providerKey === "openai") {
    return createProvider("openai", {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
    });
  }

  return createProvider("mock");
}
