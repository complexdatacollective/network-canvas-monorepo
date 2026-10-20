// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  costUsd,
  getPricing,
  getStepModels,
  modelLabel,
  providerConfig,
} from '../models.ts';

const usage = {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheReadTokens: 1_000_000,
  cacheWriteTokens: 1_000_000,
};

describe('costUsd', () => {
  it('prices each token class per million', () => {
    expect(costUsd(usage, 'claude-sonnet-5-5', getPricing(''))).toBeCloseTo(
      2 + 10 + 0.2 + 2.5,
    );
    expect(costUsd(usage, 'claude-opus-5-5', getPricing(''))).toBeCloseTo(
      4 + 20 + 0.2 + 5,
    );
    expect(costUsd(usage, 'claude-haiku-5-5', getPricing(''))).toBeCloseTo(
      0.1 + 0.5 + 0.01 + 0.125,
    );
    expect(
      costUsd(
        {
          ...usage,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 2000,
        },
        'claude-sonnet-5-5',
        getPricing(''),
      ),
    ).toBeCloseTo(2 + 0.02);
  });

  it('takes overrides from SKETCH_PRICING and ignores bad entries', () => {
    const pricing = getPricing(
      JSON.stringify({
        'gpt-6-astra': { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1 },
        'broken': { input: 'cheap' },
      }),
    );
    expect(costUsd(usage, 'gpt-6-astra', pricing)).toBeCloseTo(4.5);
    expect(pricing.broken).toBeUndefined();
    expect(getPricing('{not json')['claude-sonnet-5-5']?.input).toBe(2);
  });

  it('prices unknown models high so the budget errs safe', () => {
    expect(costUsd(usage, 'mystery-model', getPricing(''))).toBeGreaterThan(
      costUsd(usage, 'claude-opus-5-5', getPricing('')),
    );
  });
});

describe('model registry', () => {
  it('picks a model per provider, tier and step', () => {
    expect(getStepModels('anthropic', 'standard')).toEqual({
      design: 'claude-sonnet-5-5',
      wording: 'claude-haiku-5-5',
      screening: 'claude-haiku-5-5',
    });
    expect(getStepModels('anthropic', 'strong').design).toBe('claude-opus-5-5');
    expect(getStepModels('openai', 'strong').design).toBe(
      getStepModels('openai', 'standard').design,
    );
  });

  it('labels models and providers', () => {
    expect(modelLabel('claude-sonnet-5-5')).toBe('Claude Sonnet 5.5');
    expect(modelLabel('unknown-1')).toBe('unknown-1');
    expect(providerConfig('anthropic', true)).toMatchObject({
      provider: 'anthropic',
      available: true,
      label: 'Claude',
      models: {
        strong: {
          design: 'claude-opus-5-5',
          labels: { design: 'Claude Opus 5.5', wording: 'Claude Haiku 5.5' },
        },
      },
    });
    expect(providerConfig('openai', false).label).toBe('ChatGPT');
  });
});
