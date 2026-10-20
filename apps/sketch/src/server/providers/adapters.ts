import { type Provider, PROVIDERS } from '../../shared/api.ts';
import { createAnthropicAdapter } from './anthropic.ts';
import { createOpenAIAdapter } from './openai.ts';
import type { ProviderAdapter, ProviderAdapters } from './types.ts';

const DEFAULT_PROVIDERS = 'anthropic';

/**
 * The providers SKETCH_PROVIDERS switches on (a comma list, Claude only by
 * default). A key alone is not enough: Netlify's AI Gateway injects a key for
 * every provider it proxies, so ChatGPT would otherwise show as available on a
 * site that never meant to offer it.
 */
export const enabledProviders = (value: string | undefined): Set<Provider> => {
  const names = (value?.trim() ? value : DEFAULT_PROVIDERS)
    .split(',')
    .map((name) => name.trim().toLowerCase());
  return new Set(PROVIDERS.filter((p) => names.includes(p)));
};

const gate = (adapter: ProviderAdapter, on: boolean): ProviderAdapter => ({
  ...adapter,
  isConfigured: () => on && adapter.isConfigured(),
});

// The production adapters, keyed by provider. Keys come from process.env.
export const createDefaultAdapters = (): ProviderAdapters => {
  const enabled = enabledProviders(process.env.SKETCH_PROVIDERS);
  return {
    anthropic: gate(createAnthropicAdapter(), enabled.has('anthropic')),
    openai: gate(createOpenAIAdapter(), enabled.has('openai')),
  };
};
