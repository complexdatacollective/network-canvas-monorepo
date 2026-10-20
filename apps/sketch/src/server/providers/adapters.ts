import { createAnthropicAdapter } from './anthropic.ts';
import { createOpenAIAdapter } from './openai.ts';
import type { ProviderAdapters } from './types.ts';

// The production adapters, keyed by provider. Keys come from process.env.
export const createDefaultAdapters = (): ProviderAdapters => ({
  anthropic: createAnthropicAdapter(),
  openai: createOpenAIAdapter(),
});
