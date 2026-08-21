import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  CurrentProtocolSchema,
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_NOMINATION_MEAN,
  DEFAULT_NOMINATION_SD,
  DEFAULT_RESPONSE_BURDEN,
  MAX_SYNTHETIC_POPULATION,
  type StageEdgeSynthetic,
  type StageNodeSynthetic,
} from '@codaco/protocol-validation';

import {
  formatEdgeTopology,
  formatProbability,
  formatResponseBurden,
  formatSyntheticCount,
  formatSyntheticDistribution,
  formatWindowEndpoint,
} from '../summaries';

/**
 * The collapsed-summary formatters. The resolved-value cases go through the
 * REAL schema — the summaries' whole contract is that they render what a
 * parse of the draft resolves, so a hand-built descriptor would prove
 * formatting of shapes no parse produces.
 */

const parseProtocol = (): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Summary formatting protocol',
    description: 'Resolved-descriptor fixtures for the summary formatters.',
    schemaVersion: 8,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: { name: 'name', type: 'text', component: 'Text' },
          },
        },
      },
      edge: {
        friend: {
          name: 'Friend',
          color: 'edge-color-seq-1',
        },
      },
    },
    stages: [
      // Declares no synthetic block: the parse resolves the schema default,
      // fitted to the stage's (absent) behaviours window.
      {
        id: 'quick',
        type: 'NameGeneratorQuickAdd',
        label: 'Quick add',
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name',
        prompts: [{ id: 'quick-p1', text: 'Who do you know?' }],
      },
      // Declares no synthetic block: the prefault resolves the default
      // topology and the stage type's default burden.
      {
        id: 'census',
        type: 'DyadCensus',
        label: 'Dyad census',
        subject: { entity: 'node', type: 'person' },
        introductionPanel: { title: 'Pairs', text: 'About each pair.' },
        prompts: [
          {
            id: 'census-p1',
            text: 'Do these two know each other?',
            createEdge: 'friend',
          },
        ],
      },
    ],
  });

const syntheticOf = (protocol: CurrentProtocol, stageId: string): unknown => {
  const stage = protocol.stages.find(({ id }) => id === stageId);
  if (!stage || !('synthetic' in stage) || stage.synthetic === undefined) {
    throw new Error(`stage "${stageId}" resolved no synthetic descriptor`);
  }
  return stage.synthetic;
};

describe('resolved schema defaults (the spec rule-5 summary examples)', () => {
  it('renders the resolved default count without its structural window bounds', () => {
    const synthetic = syntheticOf(
      parseProtocol(),
      'quick',
    ) as StageNodeSynthetic;

    // The parse fitted the default to the stage window, writing that window
    // into the count's min/max; passing the same window elides them, leaving
    // the parameters the author reasons about.
    expect(
      formatSyntheticCount(synthetic.count, {
        window: { min: 0, max: MAX_SYNTHETIC_POPULATION },
      }),
    ).toBe(
      `normal(mean ${DEFAULT_NOMINATION_MEAN}, sd ${DEFAULT_NOMINATION_SD})`,
    );
  });

  it('renders the resolved default topology', () => {
    const synthetic = syntheticOf(
      parseProtocol(),
      'census',
    ) as StageEdgeSynthetic;

    expect(synthetic.topology).toEqual(DEFAULT_EDGE_TOPOLOGY);
    expect(formatEdgeTopology(synthetic.topology)).toBe(
      'mean degree normal(mean 3, sd 1)',
    );
  });

  it('renders the resolved default burden', () => {
    const synthetic = syntheticOf(
      parseProtocol(),
      'census',
    ) as StageEdgeSynthetic;

    expect(formatResponseBurden(synthetic.responseBurden)).toBe(
      formatResponseBurden(DEFAULT_RESPONSE_BURDEN.DyadCensus),
    );
  });
});

describe('formatSyntheticDistribution', () => {
  it('formats a constant', () => {
    expect(
      formatSyntheticDistribution({ distribution: 'constant', value: 8 }),
    ).toBe('constant(8)');
  });

  it('formats a uniform with both bounds', () => {
    expect(
      formatSyntheticDistribution({ distribution: 'uniform', min: 2, max: 6 }),
    ).toBe('uniform(min 2, max 6)');
  });

  it('formats a uniform with unstated bounds by omitting them', () => {
    expect(formatSyntheticDistribution({ distribution: 'uniform' })).toBe(
      'uniform',
    );
    expect(
      formatSyntheticDistribution({ distribution: 'uniform', max: 0.5 }),
    ).toBe('uniform(max 0.5)');
  });

  it('never elides a uniform bound, window or no window', () => {
    // A uniform's bounds ARE its parameters.
    expect(
      formatSyntheticDistribution(
        { distribution: 'uniform', min: 0, max: 1 },
        { window: { min: 0, max: 1 } },
      ),
    ).toBe('uniform(min 0, max 1)');
  });

  it('formats a poisson', () => {
    expect(
      formatSyntheticDistribution({ distribution: 'poisson', mean: 4 }),
    ).toBe('poisson(mean 4)');
  });

  it('shows poisson truncation bounds only where they narrow the window', () => {
    expect(
      formatSyntheticDistribution(
        { distribution: 'poisson', mean: 4, min: 1, max: 10 },
        { window: { min: 0, max: 100 } },
      ),
    ).toBe('poisson(mean 4, min 1, max 10)');
    expect(
      formatSyntheticDistribution(
        { distribution: 'poisson', mean: 4, min: 0, max: 100 },
        { window: { min: 0, max: 100 } },
      ),
    ).toBe('poisson(mean 4)');
  });

  it('formats a normal with narrowing bounds', () => {
    expect(
      formatSyntheticDistribution(
        { distribution: 'normal', mean: 8, sd: 3, min: 2, max: 10 },
        { window: { min: 0, max: 100 } },
      ),
    ).toBe('normal(mean 8, sd 3, min 2, max 10)');
  });

  it('shows every stated bound when no window is given', () => {
    expect(
      formatSyntheticDistribution({
        distribution: 'normal',
        mean: 8,
        sd: 3,
        min: 0,
        max: 100,
      }),
    ).toBe('normal(mean 8, sd 3, min 0, max 100)');
  });

  it('formats a lognormal', () => {
    expect(
      formatSyntheticDistribution({
        distribution: 'lognormal',
        mean: 2,
        sd: 1,
      }),
    ).toBe('lognormal(mean 2, sd 1)');
  });

  it('formats a beta', () => {
    expect(
      formatSyntheticDistribution({
        distribution: 'beta',
        mean: 0.3,
        sd: 0.15,
      }),
    ).toBe('beta(mean 0.3, sd 0.15)');
  });

  it('rounds float noise out of parameters', () => {
    expect(
      formatSyntheticDistribution({
        distribution: 'normal',
        mean: 0.30000000000000004,
        sd: 0.12345,
      }),
    ).toBe('normal(mean 0.3, sd 0.123)');
  });
});

describe('formatEdgeTopology', () => {
  it('labels each metric', () => {
    expect(
      formatEdgeTopology({
        metric: 'density',
        distribution: { distribution: 'beta', mean: 0.3, sd: 0.15 },
      }),
    ).toBe('density beta(mean 0.3, sd 0.15)');
    expect(
      formatEdgeTopology({
        metric: 'meanDegree',
        distribution: { distribution: 'constant', value: 3 },
      }),
    ).toBe('mean degree constant(3)');
  });

  it('formats every density distribution family', () => {
    expect(
      formatEdgeTopology({
        metric: 'density',
        distribution: { distribution: 'constant', value: 0.4 },
      }),
    ).toBe('density constant(0.4)');
    expect(
      formatEdgeTopology({
        metric: 'density',
        distribution: { distribution: 'uniform', min: 0.2, max: 0.5 },
      }),
    ).toBe('density uniform(min 0.2, max 0.5)');
    expect(
      formatEdgeTopology({
        metric: 'density',
        distribution: { distribution: 'normal', mean: 0.3, sd: 0.1 },
      }),
    ).toBe('density normal(mean 0.3, sd 0.1)');
  });

  it('formats every mean-degree distribution family', () => {
    expect(
      formatEdgeTopology({
        metric: 'meanDegree',
        distribution: { distribution: 'uniform', min: 1, max: 4 },
      }),
    ).toBe('mean degree uniform(min 1, max 4)');
    expect(
      formatEdgeTopology({
        metric: 'meanDegree',
        distribution: { distribution: 'normal', mean: 3, sd: 1 },
      }),
    ).toBe('mean degree normal(mean 3, sd 1)');
  });
});

describe('formatProbability', () => {
  it('renders probabilities as percentages', () => {
    expect(formatProbability(0.3)).toBe('30%');
    expect(formatProbability(0.125)).toBe('12.5%');
    expect(formatProbability(0)).toBe('0%');
    expect(formatProbability(1)).toBe('100%');
  });
});

describe('formatResponseBurden', () => {
  it('renders burdens as plain rates', () => {
    expect(formatResponseBurden(0.6)).toBe('0.6');
    expect(formatResponseBurden(1.5)).toBe('1.5');
    expect(formatResponseBurden(0)).toBe('0');
  });
});

describe('formatWindowEndpoint', () => {
  it('renders finite endpoints as numbers and open ones as infinities', () => {
    expect(formatWindowEndpoint(0)).toBe('0');
    expect(formatWindowEndpoint(100)).toBe('100');
    expect(formatWindowEndpoint(0.15)).toBe('0.15');
    expect(formatWindowEndpoint(Number.POSITIVE_INFINITY)).toBe('∞');
    expect(formatWindowEndpoint(Number.NEGATIVE_INFINITY)).toBe('−∞');
  });
});
