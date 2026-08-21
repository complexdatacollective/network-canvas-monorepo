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
  count,
  minNodes,
}: {
  count: number;
  minNodes?: number;
}): Record<string, unknown> => ({
  id: 'roster',
  type: 'NameGeneratorRoster',
  label: 'Colleagues',
  subject: { entity: 'node', type: 'person' },
  dataSource: 'colleagues',
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: 'roster-p1', text: 'Who do you work with?' }],
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
        stageLabel: 'Colleagues',
        nodeType: 'person',
        minNodes: 3,
        poolSize: 1,
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
