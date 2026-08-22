import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import type { AssetData } from '../../simulators/types';
import { holdersOf, worstCaseEntityCounts } from '../entityCounts';
import { scopeKey } from '../generateEntityAttributes';

/**
 * The walk-scoped counting model the pre-seed gate reads.
 *
 * Asserted directly rather than only through the refusals it produces, because
 * most of what it computes never becomes a refusal — a window the gate finds
 * comfortable is a window nothing complains about, and a silent under-count
 * would look exactly like a protocol nothing is wrong with.
 */

const CLOSENESS = [
  { label: 'Distant', value: 1 },
  { label: 'Close', value: 2 },
];

const ASSET_MANIFEST = {
  colleagues: {
    id: 'colleagues',
    name: 'Colleagues',
    type: 'network',
    source: 'colleagues.json',
  },
};

const parse = (stages: Record<string, unknown>[]): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Entity count protocol',
    description: 'Exercises the walk-scoped counting model.',
    schemaVersion: 8,
    assetManifest: ASSET_MANIFEST,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: { name: 'name', type: 'text', component: 'Text' },
            band: {
              name: 'band',
              type: 'ordinal',
              component: 'LikertScale',
              options: CLOSENESS,
            },
            spot: { name: 'spot', type: 'layout' },
            group: {
              name: 'group',
              type: 'categorical',
              component: 'CheckboxGroup',
              options: CLOSENESS,
            },
            groupOther: {
              name: 'groupOther',
              type: 'text',
              component: 'Text',
            },
          },
        },
        venue: {
          name: 'Venue',
          color: 'node-color-seq-2',
          shape: { default: 'circle' },
          variables: {
            venueName: { name: 'venueName', type: 'text', component: 'Text' },
          },
        },
      },
      edge: {
        friend: {
          name: 'Friend',
          color: 'edge-color-seq-1',
          variables: {
            strength: {
              name: 'strength',
              type: 'ordinal',
              component: 'LikertScale',
              options: CLOSENESS,
            },
          },
        },
      },
    },
    stages,
  });

const nameGenerator = ({
  id = 'ng',
  count,
  collects = ['name'],
}: {
  id?: string;
  count: Record<string, unknown>;
  collects?: string[];
}): Record<string, unknown> => ({
  id,
  type: 'NameGenerator',
  label: `Name generator ${id}`,
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'About them',
    fields: collects.map((variable) => ({ variable, prompt: 'Tell us' })),
  },
  synthetic: { generatesData: true, count },
  prompts: [{ id: `${id}-p1`, text: 'Who do you know?' }],
});

const roster = ({
  id = 'roster',
  count,
  minNodes,
}: {
  id?: string;
  count: number;
  minNodes?: number;
}): Record<string, unknown> => ({
  id,
  type: 'NameGeneratorRoster',
  label: `Colleagues ${id}`,
  subject: { entity: 'node', type: 'person' },
  dataSource: 'colleagues',
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: `${id}-p1`, text: 'Who do you work with?' }],
  ...(minNodes === undefined ? {} : { behaviours: { minNodes } }),
});

const dyadCensus: Record<string, unknown> = {
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
};

const alterForm = (variables: string[]): Record<string, unknown> => ({
  id: 'about',
  type: 'AlterForm',
  label: 'About each person',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'About them', text: 'A few questions.' },
  form: {
    fields: variables.map((variable) => ({ variable, prompt: 'And?' })),
  },
});

const rows = (howMany: number): NcNode[] =>
  Array.from({ length: howMany }, (_unused, index) => ({
    [entityPrimaryKeyProperty]: `row-${index}`,
    type: 'person',
    [entityAttributesProperty]: { name: `Row ${index}` },
  }));

const countsFor = (
  protocol: CurrentProtocol,
  assetData: AssetData = {},
): ReturnType<typeof worstCaseEntityCounts> =>
  worstCaseEntityCounts(protocol.stages, assetData);

const personWindow = (counts: ReturnType<typeof worstCaseEntityCounts>) =>
  counts.scopes.get(scopeKey({ entity: 'node', type: 'person' }))?.entities;

describe('how many entities a walk can build', () => {
  it('reads a constant count as both ends of the window', () => {
    const counts = countsFor(
      parse([nameGenerator({ count: { distribution: 'constant', value: 4 } })]),
    );

    expect(personWindow(counts)).toEqual({ floor: 4, ceiling: 4 });
  });

  it('reads an open-tailed count through the schema’s own support', () => {
    // `normal(mean 8, sd 3)` resolves its bounds from the schema, and the
    // support helper says the draw can reach anywhere inside them.
    const counts = countsFor(
      parse([
        nameGenerator({
          count: { distribution: 'normal', mean: 8, sd: 3, min: 2, max: 20 },
        }),
      ]),
    );

    expect(personWindow(counts)).toEqual({ floor: 2, ceiling: 20 });
  });

  it('collapses a zero-deviation normal onto its single outcome', () => {
    // The clamp says twenty, the support says one: reading the clamp would
    // count nineteen people the run never builds.
    const counts = countsFor(
      parse([
        nameGenerator({
          count: { distribution: 'normal', mean: 6, sd: 0, min: 0, max: 20 },
        }),
      ]),
    );

    expect(personWindow(counts)).toEqual({ floor: 6, ceiling: 6 });
  });

  it('adds the stages that elicit the same type', () => {
    const counts = countsFor(
      parse([
        nameGenerator({
          id: 'a',
          count: { distribution: 'constant', value: 3 },
        }),
        nameGenerator({
          id: 'b',
          count: { distribution: 'uniform', min: 1, max: 5 },
        }),
      ]),
    );

    expect(personWindow(counts)).toEqual({ floor: 4, ceiling: 8 });
  });

  it('keeps a type no stage creates out of the model entirely', () => {
    const counts = countsFor(
      parse([nameGenerator({ count: { distribution: 'constant', value: 2 } })]),
    );

    expect(counts.scopes.has(scopeKey({ entity: 'node', type: 'venue' }))).toBe(
      false,
    );
  });

  it('holds a roster stage to the rows the run resolved', () => {
    const protocol = parse([roster({ count: 4 })]);

    expect(
      personWindow(countsFor(protocol, { rosterNodes: { roster: rows(2) } })),
    ).toEqual({ floor: 2, ceiling: 2 });
  });

  it('guarantees nobody from a roster the caller never resolved', () => {
    // With no `rosterNodes` map the pool is unknown, so the stage may build up
    // to its count and may build nobody.
    expect(personWindow(countsFor(parse([roster({ count: 4 })])))).toEqual({
      floor: 0,
      ceiling: 4,
    });
  });

  it('reports a roster whose pool cannot meet its own gate', () => {
    const counts = countsFor(parse([roster({ count: 3, minNodes: 3 })]), {
      rosterNodes: { roster: rows(1) },
    });

    expect(counts.rosterDemands).toEqual([
      {
        stageId: 'roster',
        stageLabel: 'Colleagues roster',
        nodeType: 'person',
        minNodes: 3,
        poolSize: 1,
        guaranteedAvailable: 1,
        unresolved: false,
      },
    ]);
  });
});

describe('the pair work a census demands', () => {
  it('counts only the people who reach it', () => {
    const counts = countsFor(
      parse([
        nameGenerator({
          id: 'a',
          count: { distribution: 'constant', value: 4 },
        }),
        dyadCensus,
        nameGenerator({
          id: 'b',
          count: { distribution: 'constant', value: 9 },
        }),
      ]),
    );

    expect(counts.pairDemands).toEqual([
      {
        stageId: 'census',
        stageLabel: 'Dyad census',
        subjectType: 'person',
        edgeTypes: ['friend'],
        guaranteedNodes: 4,
        guaranteedPairs: 6,
      },
    ]);
  });

  it('guarantees no pairs where the population is only possible', () => {
    const counts = countsFor(
      parse([
        nameGenerator({
          count: { distribution: 'normal', mean: 8, sd: 3, min: 0, max: 20 },
        }),
        dyadCensus,
      ]),
    );

    expect(counts.pairDemands[0]?.guaranteedPairs).toBe(0);
  });

  it('bounds an edge type by the pairs of the type feeding it', () => {
    const counts = countsFor(
      parse([
        nameGenerator({ count: { distribution: 'constant', value: 5 } }),
        dyadCensus,
      ]),
    );

    expect(
      counts.scopes.get(scopeKey({ entity: 'edge', type: 'friend' }))?.entities,
    ).toEqual({ floor: 0, ceiling: 10 });
  });

  it('does not double an edge type two stages over the same people share', () => {
    // Edges carry no stage provenance, so the second census reaches the edges
    // the first one made rather than making ten more.
    const counts = countsFor(
      parse([
        nameGenerator({ count: { distribution: 'constant', value: 5 } }),
        dyadCensus,
        { ...dyadCensus, id: 'census-2' },
      ]),
    );

    expect(
      counts.scopes.get(scopeKey({ entity: 'edge', type: 'friend' }))?.entities
        .ceiling,
    ).toBe(10);
  });
});

describe('which entities can be forced to hold a value', () => {
  const holders = (
    protocol: CurrentProtocol,
    group: string[],
    assetData?: AssetData,
  ): number =>
    holdersOf(
      countsFor(protocol, assetData).scopes.get(
        scopeKey({ entity: 'node', type: 'person' }),
      ),
      group,
    );

  it('counts the people whose creating stage collects it', () => {
    const protocol = parse([
      nameGenerator({
        id: 'a',
        count: { distribution: 'constant', value: 3 },
        collects: ['name'],
      }),
      nameGenerator({
        id: 'b',
        count: { distribution: 'constant', value: 4 },
        collects: ['band'],
      }),
    ]);

    expect(holders(protocol, ['name'])).toBe(3);
    expect(holders(protocol, ['band'])).toBe(4);
  });

  it('counts nobody for a variable no stage collects', () => {
    expect(
      holders(
        parse([
          nameGenerator({
            count: { distribution: 'constant', value: 9 },
            collects: ['name'],
          }),
        ]),
        ['band'],
      ),
    ).toBe(0);
  });

  it('counts roster rows as people but not as holders', () => {
    // A row arrives carrying its own columns and is passed over where a value
    // it holds is taken, so it never forces a draw — but a form that runs
    // afterwards fills it like anybody else.
    const protocol = parse([
      nameGenerator({
        count: { distribution: 'constant', value: 2 },
        collects: ['name'],
      }),
      roster({ count: 3 }),
      alterForm(['band']),
    ]);
    const assetData: AssetData = { rosterNodes: { roster: rows(3) } };

    expect(holders(protocol, ['name'], assetData)).toBe(2);
    expect(holders(protocol, ['band'], assetData)).toBe(5);
  });

  it('does not add a whole-population form to the people it reached', () => {
    const protocol = parse([
      nameGenerator({
        count: { distribution: 'constant', value: 4 },
        collects: ['band'],
      }),
      alterForm(['band']),
    ]);

    expect(holders(protocol, ['band'])).toBe(4);
  });

  it('counts a group held equal once per stage that writes any member', () => {
    // One stage collecting both members spends one value per person, not two.
    const protocol = parse([
      nameGenerator({
        count: { distribution: 'constant', value: 3 },
        collects: ['name', 'band'],
      }),
    ]);

    expect(holders(protocol, ['name', 'band'])).toBe(3);
  });
});

const composer = ({
  id = 'composer',
  count,
  topology,
  nodeForm,
  edges,
}: {
  id?: string;
  count?: number;
  topology?: Record<string, unknown>;
  nodeForm?: Record<string, unknown>;
  edges?: Record<string, unknown>[];
}): Record<string, unknown> => ({
  id,
  type: 'NetworkComposer',
  label: 'Compose the network',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'spot',
  background: { concentricCircles: 4, skewedTowardCenter: true },
  synthetic: {
    generatesData: true,
    ...(count === undefined
      ? {}
      : { count: { distribution: 'constant', value: count } }),
    ...(topology === undefined ? {} : { topology }),
  },
  ...(nodeForm ? { nodeForm } : {}),
  ...(edges ? { edges } : {}),
});

const holdersFor = (
  counts: ReturnType<typeof worstCaseEntityCounts>,
  scope: { entity: 'node' | 'edge'; type: string },
  group: string[],
): number => holdersOf(counts.scopes.get(scopeKey(scope)), group);

describe('what a NetworkComposer guarantees', () => {
  it('carries the count floor through: a required quick-add cannot go missing', () => {
    // The palette will not create a node from a blank name, so the quick-add
    // variable is interface-implied `required` and resolution zeroes any
    // authored missingness — a declared count of four always builds four.
    const counts = countsFor(parse([composer({ count: 4 })]));
    expect(personWindow(counts)).toEqual({ floor: 4, ceiling: 4 });
  });

  it('counts its inspector form over the nodes it just composed', () => {
    // `simulateNetworkComposer` adds people BEFORE `fillInspectorForms`, so
    // the form's draw reaches this stage's own additions, not only whoever
    // stood on the canvas beforehand.
    const counts = countsFor(
      parse([
        composer({
          count: 8,
          nodeForm: {
            fields: [{ variable: 'band', component: 'LikertScale' }],
          },
        }),
      ]),
    );
    expect(
      holdersFor(counts, { entity: 'node', type: 'person' }, ['band']),
    ).toBe(8);
  });
});

describe('topology-bounded edge counts', () => {
  it('holds a sparse census to what its topology can select', () => {
    // Ten people make 45 pairs, but a constant density of 0.1 selects five of
    // them on its very luckiest realisation — counting all 45 would refuse a
    // `unique` edge variable for values the walk never draws.
    const counts = countsFor(
      parse([
        nameGenerator({ count: { distribution: 'constant', value: 10 } }),
        {
          ...dyadCensus,
          synthetic: {
            generatesData: true,
            topology: {
              metric: 'density',
              distribution: { distribution: 'constant', value: 0.1 },
            },
          },
        },
      ]),
    );
    expect(
      counts.scopes.get(scopeKey({ entity: 'edge', type: 'friend' }))?.entities,
    ).toEqual({ floor: 0, ceiling: 5 });
  });

  it('bounds a composer edge form’s draws the same way', () => {
    const counts = countsFor(
      parse([
        composer({
          count: 10,
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: 0.1 },
          },
          edges: [
            {
              id: 'edge-entry',
              subject: { entity: 'edge', type: 'friend' },
              form: {
                fields: [{ variable: 'strength', component: 'LikertScale' }],
              },
            },
          ],
        }),
      ]),
    );
    expect(
      holdersFor(counts, { entity: 'edge', type: 'friend' }, ['strength']),
    ).toBe(5);
  });

  it('creates nothing for a composer that declares edges but no topology', () => {
    const counts = countsFor(
      parse([
        composer({
          count: 10,
          edges: [
            { id: 'edge-entry', subject: { entity: 'edge', type: 'friend' } },
          ],
        }),
      ]),
    );
    expect(
      counts.scopes.get(scopeKey({ entity: 'edge', type: 'friend' }))?.entities,
    ).toEqual({ floor: 0, ceiling: 0 });
  });
});

describe('filtered re-censuses are additive', () => {
  const denseCensus = (
    id: string,
    filter?: Record<string, unknown>,
  ): Record<string, unknown> => ({
    ...dyadCensus,
    id,
    prompts: [{ id: `${id}-p1`, text: 'Linked?', createEdge: 'friend' }],
    synthetic: {
      generatesData: true,
      topology: {
        metric: 'density',
        distribution: { distribution: 'constant', value: 1 },
      },
    },
    ...(filter ? { filter } : {}),
  });

  const bandFilter = {
    join: 'AND',
    rules: [
      {
        id: 'rule-1',
        type: 'edge',
        options: { type: 'friend', operator: 'NOT_EXISTS' },
      },
    ],
  };

  it('reuses the pair set only where the later stage can see the edges', () => {
    const people = nameGenerator({
      count: { distribution: 'constant', value: 4 },
    });
    const pairs = 6;

    // Unfiltered second census: the same six edges, re-asked.
    expect(
      countsFor(
        parse([people, denseCensus('c1'), denseCensus('c2')]),
      ).scopes.get(scopeKey({ entity: 'edge', type: 'friend' }))?.entities,
    ).toEqual({ floor: 0, ceiling: pairs });

    // Filtered second census: an edge its filter hides is one the participant
    // cannot see, so a yes there creates a SECOND edge for the pair.
    expect(
      countsFor(
        parse([people, denseCensus('c1'), denseCensus('c2', bandFilter)]),
      ).scopes.get(scopeKey({ entity: 'edge', type: 'friend' }))?.entities,
    ).toEqual({ floor: 0, ceiling: pairs * 2 });
  });
});

describe('a disabled other bin never draws', () => {
  const binStage = (otherBinProbability: number): Record<string, unknown> => ({
    id: 'bin',
    type: 'CategoricalBin',
    label: 'Sort them',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: 'bin-p1',
        text: 'Which group?',
        variable: 'group',
        otherVariable: 'groupOther',
        otherVariablePrompt: 'Which other group?',
        otherOptionLabel: 'Other',
        synthetic: { otherBinProbability },
      },
    ],
  });

  it('drops the other-variable demand when the authored odds are zero', () => {
    const people = nameGenerator({
      count: { distribution: 'constant', value: 5 },
    });
    const scope = { entity: 'node', type: 'person' } as const;

    expect(
      holdersFor(countsFor(parse([people, binStage(0)])), scope, [
        'groupOther',
      ]),
    ).toBe(0);
    expect(
      holdersFor(countsFor(parse([people, binStage(0.5)])), scope, [
        'groupOther',
      ]),
    ).toBe(5);
  });
});

describe('roster rows consumed by earlier stages', () => {
  it('reports a later gated roster the earlier stages are guaranteed to starve', () => {
    // Two roster stages over one five-row pool: the first always takes five,
    // so the second — gated at three — meets an empty list on every seed.
    const counts = countsFor(
      parse([
        roster({ id: 'first', count: 5 }),
        roster({ id: 'second', count: 3, minNodes: 3 }),
      ]),
      { rosterNodes: { first: rows(5), second: rows(5) } },
    );

    expect(counts.rosterDemands).toEqual([
      expect.objectContaining({
        stageId: 'second',
        guaranteedAvailable: 0,
        poolSize: 5,
        unresolved: false,
      }),
    ]);
  });

  it('leaves the later stage alone where enough rows are guaranteed to remain', () => {
    const counts = countsFor(
      parse([
        roster({ id: 'first', count: 2 }),
        roster({ id: 'second', count: 3, minNodes: 3 }),
      ]),
      { rosterNodes: { first: rows(5), second: rows(5) } },
    );
    expect(counts.rosterDemands).toEqual([]);
  });

  it('ignores disjoint pools entirely', () => {
    const otherRows = (howMany: number): NcNode[] =>
      Array.from({ length: howMany }, (_unused, index) => ({
        [entityPrimaryKeyProperty]: `other-${index}`,
        type: 'person',
        [entityAttributesProperty]: { name: `Other ${index}` },
      }));

    const counts = countsFor(
      parse([
        roster({ id: 'first', count: 5 }),
        roster({ id: 'second', count: 3, minNodes: 3 }),
      ]),
      { rosterNodes: { first: rows(5), second: otherRows(3) } },
    );
    expect(counts.rosterDemands).toEqual([]);
  });
});

describe('bounding the count to what a stopped walk performs', () => {
  it('excludes the stop stage and everything past it', () => {
    const protocol = parse([
      nameGenerator({ count: { distribution: 'constant', value: 5 } }),
      alterForm(['band']),
    ]);
    const scope = { entity: 'node', type: 'person' } as const;

    // The preview default: arrive at the form, apply nothing there.
    expect(
      holdersFor(
        worstCaseEntityCounts(
          protocol.stages,
          {},
          {
            stopAt: { stageIndex: 1 },
          },
        ),
        scope,
        ['band'],
      ),
    ).toBe(0);

    // A positive prompt bound works the stage, so its demands stand.
    expect(
      holdersFor(
        worstCaseEntityCounts(
          protocol.stages,
          {},
          {
            stopAt: { stageIndex: 1, promptIndex: 1 },
          },
        ),
        scope,
        ['band'],
      ),
    ).toBe(5);
  });
});

describe('fixture overrides replace a stage’s output', () => {
  it('counts the entries the walk will materialise, not the authored count', () => {
    const protocol = parse([
      nameGenerator({ count: { distribution: 'constant', value: 5 } }),
    ]);
    const entry = { type: 'person' } as const;

    const counts = worstCaseEntityCounts(
      protocol.stages,
      {},
      {
        codebook: protocol.codebook,
        overrides: { nodes: { ng: [entry, entry, entry] } },
      },
    );

    expect(personWindow(counts)).toEqual({ floor: 3, ceiling: 3 });
    // Three drawn entries, each drawing the declared variables the caller
    // left unfixed — not the five form draws the authored count promised.
    expect(
      holdersFor(counts, { entity: 'node', type: 'person' }, ['name']),
    ).toBe(3);
  });

  it('counts a manual entry as an entity that draws nothing', () => {
    const protocol = parse([
      nameGenerator({ count: { distribution: 'constant', value: 5 } }),
    ]);

    const counts = worstCaseEntityCounts(
      protocol.stages,
      {},
      {
        codebook: protocol.codebook,
        overrides: { nodes: { ng: [{ type: 'person', manual: true }] } },
      },
    );

    expect(personWindow(counts)).toEqual({ floor: 1, ceiling: 1 });
    expect(
      holdersFor(counts, { entity: 'node', type: 'person' }, ['name']),
    ).toBe(0);
  });
});
