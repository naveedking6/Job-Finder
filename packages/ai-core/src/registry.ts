import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAiProvider } from "./providers/openai.js";
import { MockAiProvider } from "./providers/mock.js";
import type { AiProvider } from "./provider.js";

export interface CreateProviderOptions {
  apiKey?: string;
  model?: string;
}

/**
 * The one place a provider key string turns into an actual AiProvider
 * instance. Adding a new provider (Gemini, a local OpenAI-compatible
 * endpoint, etc. — the brief explicitly asks for extensibility here)
 * means adding one case here and one new file in providers/, nothing
 * elsewhere in the codebase needs to know provider keys exist.
 */
export function createProvider(key: string, options: CreateProviderOptions = {}): AiProvider {
  switch (key) {
    case "anthropic":
      if (!options.apiKey) {
        throw new Error('createProvider("anthropic") requires an apiKey');
      }
      return new AnthropicProvider({ apiKey: options.apiKey, model: options.model });

    case "openai":
      if (!options.apiKey) {
        throw new Error('createProvider("openai") requires an apiKey');
      }
      return new OpenAiProvider({ apiKey: options.apiKey, model: options.model });

    case "mock":
      return new MockAiProvider();

    default:
      throw new Error(
        `Unknown AI provider key "${key}". Available: anthropic, openai, mock.`,
      );
  }
}
