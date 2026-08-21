import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_RESPONSE_BURDEN,
  MAX_SYNTHETIC_POPULATION,
} from '@codaco/protocol-validation';

import {
  isSyntheticAuthored,
  resolveStageSynthetic,
  stageCountWindow,
  stageCreatesEdges,
  stageSyntheticSupport,
  syntheticBlockForChange,
  syntheticIssues,
  topologyMetricWindow,
} from '../stageSynthetic';

/**
 * The schema-derivation layer. Every expectation here is about agreeing with
 * `@codaco/protocol-validation` — which parameters a stage type admits, what
 * the effective values are, and which candidate blocks it will accept — so the
 * real schema is used throughout and nothing is mocked.
 */

const nameGenerator = (overrides: Record<string, unknown> = {}) => ({
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name some people',
  subject: { entity: 'node', type: 'person' },
  form: { title: 'Add person', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'prompt-1', text: 'Who do you know?' }],
  ...overrides,
});

const sociogram = (overrides: Record<string, unknown> = {}) => ({
  id: 'stage-2',
  type: 'Sociogram',
  label: 'Position people',
  subject: { entity: 'node', type: 'person' },
  background: { concentricCircles: 4, skewedTowardCenter: true },
  prompts: [
    {
      id: 'prompt-1',
      text: 'Position them',
      layout: { layoutVariable: 'layout' },
    },
  ],
  ...overrides,
});

const information = (overrides: Record<string, unknown> = {}) => ({
  id: 'stage-3',
  type: 'Information',
  label: 'Read this',
  title: 'Welcome',
  items: [],
  ...overrides,
});

const egoForm = (overrides: Record<string, unknown> = {}) => ({
  id: 'stage-4',
  type: 'EgoForm',
  label: 'About you',
  form: { title: 'About you', fields: [{ variable: 'age', prompt: 'Age' }] },
  ...overrides,
});

const networkComposer = (overrides: Record<string, unknown> = {}) => ({
  id: 'stage-5',
  type: 'NetworkComposer',
  label: 'Build the network',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layout',
  ...overrides,
});

describe('which parameters a stage type admits', () => {
  it('gives a node-creating stage a count and no topology', () => {
    expect(stageSyntheticSupport(nameGenerator())).toEqual({
      supportsCount: true,
      supportsTopology: false,
      generatesData: true,
    });
  });

  it('gives an edge-creating stage a topology and no count', () => {
    expect(stageSyntheticSupport(sociogram())).toEqual({
      supportsCount: false,
      supportsTopology: true,
      generatesData: true,
    });
  });

  it('gives the composer both', () => {
    expect(stageSyntheticSupport(networkComposer())).toEqual({
      supportsCount: true,
      supportsTopology: true,
      generatesData: true,
    });
  });

  it('gives a values-only stage neither, and still says it generates data', () => {
    expect(stageSyntheticSupport(egoForm())).toEqual({
      supportsCount: false,
      supportsTopology: false,
      generatesData: true,
    });
  });

  it('reports a non-generating stage as such', () => {
    expect(stageSyntheticSupport(information())).toEqual({
      supportsCount: false,
      supportsTopology: false,
      generatesData: false,
    });
  });

  it('answers for a stage that is invalid elsewhere', () => {
    // A stage under edit routinely fails to parse for unrelated reasons; the
    // descriptor's own keys are still reported, which is what keeps the
    // section from blanking out mid-edit.
    const halfWritten = nameGenerator({ form: { fields: [] }, prompts: [] });
    expect(syntheticIssues(halfWritten)).toEqual([]);
    expect(stageSyntheticSupport(halfWritten).supportsCount).toBe(true);
  });
});

describe('resolved effective values', () => {
  it('resolves an unauthored name generator to the schema default count', () => {
    const resolved = resolveStageSynthetic(nameGenerator());

    expect(resolved.responseBurden).toBe(DEFAULT_RESPONSE_BURDEN.NameGenerator);
    expect(resolved.count).toEqual({
      distribution: 'normal',
      mean: 8,
      sd: 3,
      min: 0,
      max: MAX_SYNTHETIC_POPULATION,
    });
    expect(resolved.topology).toBeUndefined();
  });

  it('resolves an unauthored sociogram to the schema default topology', () => {
    const resolved = resolveStageSynthetic(sociogram());

    expect(resolved.topology).toEqual(DEFAULT_EDGE_TOPOLOGY);
    expect(resolved.responseBurden).toBe(DEFAULT_RESPONSE_BURDEN.Sociogram);
    expect(resolved.count).toBeUndefined();
  });

  it('shows an authored burden rather than the table default', () => {
    const resolved = resolveStageSynthetic(
      sociogram({ synthetic: { responseBurden: 1.5 } }),
    );

    expect(resolved.responseBurden).toBe(1.5);
  });

  it('agrees with the parse when the draft does not parse', () => {
    // The fallback exists for stages under edit. It has to reach the same
    // answer the parse would, or a summary would change meaning the moment an
    // unrelated field went briefly invalid.
    const valid = nameGenerator({ behaviours: { minNodes: 2, maxNodes: 6 } });
    const broken = { ...valid, prompts: [] };

    expect(resolveStageSynthetic(broken)).toEqual(resolveStageSynthetic(valid));
  });

  it('reports a non-generating stage with a burden and nothing else', () => {
    const resolved = resolveStageSynthetic(information());

    expect(resolved.generatesData).toBe(false);
    expect(resolved.responseBurden).toBe(DEFAULT_RESPONSE_BURDEN.Information);
    expect(resolved.count).toBeUndefined();
    expect(resolved.topology).toBeUndefined();
  });
});

describe('windows', () => {
  it('takes the count window from the behaviours floor and ceiling', () => {
    expect(
      stageCountWindow(
        nameGenerator({ behaviours: { minNodes: 2, maxNodes: 6 } }),
      ),
    ).toEqual({ min: 2, max: 6 });
  });

  it('falls back to the population ceiling where the stage sets none', () => {
    expect(stageCountWindow(nameGenerator())).toEqual({
      min: 0,
      max: MAX_SYNTHETIC_POPULATION,
    });
  });

  it('holds the count ceiling to the population cap however wide the stage is', () => {
    expect(
      stageCountWindow(
        nameGenerator({
          behaviours: { maxNodes: MAX_SYNTHETIC_POPULATION * 10 },
        }),
      ).max,
    ).toBe(MAX_SYNTHETIC_POPULATION);
  });

  it('gives each topology metric its own domain', () => {
    expect(topologyMetricWindow('density')).toEqual({ min: 0, max: 1 });
    expect(topologyMetricWindow('meanDegree')).toEqual({
      min: 0,
      max: Number.POSITIVE_INFINITY,
    });
  });
});

describe('edge-creating prompts', () => {
  it('is false for a sociogram whose prompts only display edges', () => {
    expect(
      stageCreatesEdges(
        sociogram({
          prompts: [
            {
              id: 'p1',
              text: 'Look',
              layout: { layoutVariable: 'layout' },
              edges: { display: ['friend'] },
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('is true once a prompt creates one', () => {
    expect(
      stageCreatesEdges(
        sociogram({
          prompts: [
            {
              id: 'p1',
              text: 'Link them',
              layout: { layoutVariable: 'layout' },
              edges: { create: 'friend' },
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('reads a census prompt’s own edge declaration', () => {
    expect(
      stageCreatesEdges({
        type: 'DyadCensus',
        prompts: [
          { id: 'p1', text: 'Do they know each other?', createEdge: 'friend' },
        ],
      }),
    ).toBe(true);
  });

  it('reads the composer’s drawable edge types instead of prompts', () => {
    expect(stageCreatesEdges(networkComposer({ edges: [] }))).toBe(false);
    expect(
      stageCreatesEdges(
        networkComposer({
          edges: [{ subject: { entity: 'edge', type: 'friend' } }],
        }),
      ),
    ).toBe(true);
  });
});

describe('authored state', () => {
  it('is false with no block and with an empty one', () => {
    expect(isSyntheticAuthored(sociogram())).toBe(false);
    expect(isSyntheticAuthored(sociogram({ synthetic: {} }))).toBe(false);
  });

  it('is true once any key is present', () => {
    expect(
      isSyntheticAuthored(sociogram({ synthetic: { responseBurden: 1 } })),
    ).toBe(true);
  });
});

describe('the block written for a change', () => {
  it('writes only what changed where the schema accepts it', () => {
    const { block, issues } = syntheticBlockForChange(sociogram(), {
      responseBurden: 1.2,
    });

    expect(issues).toEqual([]);
    expect(block).toEqual({ responseBurden: 1.2 });
  });

  it('adds the companion a node-creating descriptor requires', () => {
    // `stageNodeSynthetic` requires a count, so a burden-only block is one the
    // schema refuses — the resolved count comes with it rather than the author
    // being handed a refusal they cannot act on.
    const { block, issues } = syntheticBlockForChange(nameGenerator(), {
      responseBurden: 0.9,
    });

    expect(issues).toEqual([]);
    expect(block).toEqual({
      responseBurden: 0.9,
      count: {
        distribution: 'normal',
        mean: 8,
        sd: 3,
        min: 0,
        max: MAX_SYNTHETIC_POPULATION,
      },
    });
  });

  it('states generatesData where the descriptor pins it to false', () => {
    const { block, issues } = syntheticBlockForChange(information(), {
      responseBurden: 0.5,
    });

    expect(issues).toEqual([]);
    expect(block).toEqual({ generatesData: false, responseBurden: 0.5 });
  });

  it('gives the composer the count and topology its descriptor demands', () => {
    const { block, issues } = syntheticBlockForChange(networkComposer(), {
      responseBurden: 0.25,
    });

    expect(issues).toEqual([]);
    expect(block).toMatchObject({ responseBurden: 0.25 });
    expect(block).toHaveProperty('count');
    expect(block).toHaveProperty('topology');
  });

  it('refuses a count the stage’s own behaviours window cannot hold', () => {
    const { issues } = syntheticBlockForChange(
      nameGenerator({ behaviours: { maxNodes: 3 } }),
      { count: { distribution: 'constant', value: 20 } },
    );

    expect(issues.length).toBeGreaterThan(0);
    // The schema's wording, not a paraphrase of it.
    expect(issues[0]?.message).toContain('behaviours.maxNodes');
  });

  it('refuses a beta density whose spread its own mean cannot support', () => {
    const { issues } = syntheticBlockForChange(sociogram(), {
      topology: {
        metric: 'density',
        distribution: { distribution: 'beta', mean: 0.5, sd: 0.9 },
      },
    });

    expect(issues.map((issue) => issue.message)).toContain(
      'A beta distribution requires sd² < mean × (1 − mean)',
    );
  });

  it('refuses a topology on a stage whose descriptor has no such key', () => {
    const { issues } = syntheticBlockForChange(nameGenerator(), {
      topology: DEFAULT_EDGE_TOPOLOGY,
    });

    expect(
      issues.some((issue) => issue.unrecognisedKeys.includes('topology')),
    ).toBe(true);
  });
});
