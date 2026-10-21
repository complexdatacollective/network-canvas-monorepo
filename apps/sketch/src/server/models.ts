// Which model runs each step, what it is called on screen, and what it costs.

import { z } from 'zod';

import type { JobModels, Provider, ProviderConfig } from '../shared/api.ts';
import type { TokenUsage } from './providers/types.ts';

export type StepModels = {
  // Step 2, "Designing the study".
  design: string;
  // Step 3, "Writing titles and prompts".
  wording: string;
  // Step 1, "Reading your research questions".
  screening: string;
};

const ANTHROPIC = {
  opus: 'claude-opus-5-5',
  haiku: 'claude-haiku-5-5',
} as const;

const openaiDesignModel = () =>
  process.env.OPENAI_DESIGN_MODEL ?? 'gpt-6-astra';
const openaiWordingModel = () =>
  process.env.OPENAI_WORDING_MODEL ?? 'gpt-6-luna';

export const getStepModels = (provider: Provider): StepModels => {
  if (provider === 'anthropic') {
    return {
      design: ANTHROPIC.opus,
      wording: ANTHROPIC.haiku,
      screening: ANTHROPIC.haiku,
    };
  }
  return {
    design: openaiDesignModel(),
    wording: openaiWordingModel(),
    screening: openaiWordingModel(),
  };
};

const LABELS: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-haiku-5-5': 'Claude Haiku 5.5',
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-6-luna': 'GPT-6 Luna',
};

export const modelLabel = (model: string): string => LABELS[model] ?? model;

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT',
};

const jobModels = (models: StepModels): JobModels => ({
  design: models.design,
  wording: models.wording,
});

export const jobModelLabels = (models: StepModels): JobModels => ({
  design: modelLabel(models.design),
  wording: modelLabel(models.wording),
});

export const providerConfig = (
  provider: Provider,
  available: boolean,
): ProviderConfig => {
  const models = getStepModels(provider);
  return {
    provider,
    available,
    label: PROVIDER_LABELS[provider],
    models: { ...jobModels(models), labels: jobModelLabels(models) },
  };
};

// ---------------------------------------------------------------------------
// Pricing, USD per million tokens
// ---------------------------------------------------------------------------

type ModelPrice = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

const DEFAULT_PRICING: Record<string, ModelPrice> = {
  // Kept so older log entries and SKETCH_PRICING overrides still price.
  'claude-sonnet-5-5': {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
  },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
  },
  // UNVERIFIED: OpenAI prices come from third-party roundups, not
  // openai.com/api/pricing. Correct them with SKETCH_PRICING. OpenAI bills
  // cache writes at the input price.
  'gpt-6-astra': { input: 10, output: 50, cacheRead: 1, cacheWrite: 10 },
  'gpt-6-luna': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.1 },
};

// Unknown models are priced like the most expensive known one, so the
// budget guard errs on the side of stopping.
const FALLBACK_PRICE: ModelPrice = {
  input: 10,
  output: 50,
  cacheRead: 1,
  cacheWrite: 10,
};

const PriceSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});

const isPrice = (value: unknown): value is ModelPrice =>
  PriceSchema.safeParse(value).success;

// SKETCH_PRICING is a JSON object of {model: {input, output, cacheRead,
// cacheWrite}}; entries override the defaults above. Bad JSON is ignored.
export const getPricing = (
  env: string | undefined = process.env.SKETCH_PRICING,
): Record<string, ModelPrice> => {
  if (!env) return DEFAULT_PRICING;
  try {
    const parsed = JSON.parse(env) as unknown;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PRICING;
    const overrides = Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, ModelPrice] =>
        isPrice(entry[1]),
      ),
    );
    return { ...DEFAULT_PRICING, ...overrides };
  } catch {
    return DEFAULT_PRICING;
  }
};

export const costUsd = (
  usage: TokenUsage,
  model: string,
  pricing: Record<string, ModelPrice> = getPricing(),
): number => {
  const price = pricing[model] ?? FALLBACK_PRICE;
  return (
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000
  );
};
