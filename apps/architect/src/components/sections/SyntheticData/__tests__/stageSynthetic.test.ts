import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_RESPONSE_BURDEN,
  MAX_SYNTHETIC_POPULATION,
} from '@codaco/protocol-validation';

import {
  defaultTopologyForMetric,
  isSyntheticAuthored,
  resolveStageSynthetic,
  stageCountWindow,
  stageSyntheticEditorValues,
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
    const { block, issues } = syntheticBlockForChange(
      networkComposer({
        edges: [{ id: 'e1', subject: { entity: 'edge', type: 'friend' } }],
      }),
      { responseBurden: 0.25 },
    );

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

describe('a composer’s two optional halves', () => {
  /**
   * The composer is the one descriptor where a PRESENT block and an ABSENT one
   * mean different things: absence prefaults both halves, while a block naming
   * only a topology means "create no nodes" — the simulator returns before
   * building any (`NetworkComposer.ts`: `if (count === undefined) return`).
   *
   * The oracle is the PARSE of the stage the editor would save, so a block that
   * looked complete but resolved to nothing still fails here.
   */
  const resolvedFor = (
    block: Record<string, unknown> | undefined,
    overrides: Record<string, unknown> = {},
  ) =>
    resolveStageSynthetic(
      networkComposer({
        ...overrides,
        ...(block === undefined ? {} : { synthetic: block }),
      }),
    );

  const withEdgeTypes = {
    edges: [{ id: 'e1', subject: { entity: 'edge', type: 'friend' } }],
  };

  it('states the count when only the topology was edited', () => {
    const composer = networkComposer(withEdgeTypes);
    const { block, issues } = syntheticBlockForChange(composer, {
      topology: {
        metric: 'density',
        distribution: { distribution: 'constant', value: 0.25 },
      },
    });

    expect(issues).toEqual([]);
    // The half the author never touched, at the value the schema resolves for
    // it — so the stage goes on creating the people it created before.
    expect(resolvedFor(block, withEdgeTypes).count).toEqual(
      resolvedFor(undefined, withEdgeTypes).count,
    );
    expect(resolvedFor(block, withEdgeTypes).count).toBeDefined();
  });

  it('states the topology when only the count was edited', () => {
    const composer = networkComposer(withEdgeTypes);
    const { block, issues } = syntheticBlockForChange(composer, {
      count: { distribution: 'constant', value: 4 },
    });

    expect(issues).toEqual([]);
    expect(resolvedFor(block, withEdgeTypes).topology).toEqual(
      DEFAULT_EDGE_TOPOLOGY,
    );
    expect(resolvedFor(block, withEdgeTypes).count).toEqual({
      distribution: 'constant',
      value: 4,
    });
  });

  it('writes no topology where the stage has no drawable edge types', () => {
    // Nothing on screen shows a topology there, so nothing is authored for it.
    const { block, issues } = syntheticBlockForChange(networkComposer(), {
      count: { distribution: 'constant', value: 4 },
    });

    expect(issues).toEqual([]);
    expect(block).not.toHaveProperty('topology');
    expect(block).toHaveProperty('count');
  });

  it('reports a half a present block leaves out as creating nothing', () => {
    const stated = { topology: DEFAULT_EDGE_TOPOLOGY };

    // What a RUN would do: no nodes at all.
    expect(resolvedFor(stated, withEdgeTypes).count).toBeUndefined();
    // What the editor offers, so the stage is not a dead end.
    expect(
      stageSyntheticEditorValues(
        networkComposer({ ...withEdgeTypes, synthetic: stated }),
      ).count,
    ).toEqual(resolvedFor(undefined, withEdgeTypes).count);
  });

  it('reads an absent block as both halves, exactly as the prefault does', () => {
    const resolved = resolvedFor(undefined, withEdgeTypes);

    expect(resolved.count).toBeDefined();
    expect(resolved.topology).toEqual(DEFAULT_EDGE_TOPOLOGY);
  });
});

describe('the topology a metric starts from', () => {
  it('is the schema’s own default when it is that metric', () => {
    expect(defaultTopologyForMetric('meanDegree')).toEqual(
      DEFAULT_EDGE_TOPOLOGY,
    );
  });

  it('is derived from the metric’s own schema otherwise', () => {
    const density = defaultTopologyForMetric('density');

    expect(density.metric).toBe('density');
    // Inside the metric's own domain — which is the point: a mean degree of 3
    // carried across as a density of 3 is not even a legal density.
    const window = topologyMetricWindow('density');
    const value =
      'value' in density.distribution ? density.distribution.value : undefined;
    expect(value).toBeGreaterThanOrEqual(window.min);
    expect(value).toBeLessThanOrEqual(window.max);
  });
});
