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

import {
  type ConstraintConflict,
  SyntheticDataConstraintError,
} from '../constraints/error';
import { generateCorpusProtocol } from '../corpus';
import { generateInterviews } from '../index';
import type { AssetData } from '../simulators/types';

/**
 * Criterion C12 — refusal invariance.
 *
 * A protocol either always generates or never generates (spec rule 5), and the
 * decision is taken before the seed is consulted. This is that claim as an
 * executable property: over 500 consecutive seeds, a refused protocol refuses
 * every time with a byte-identical message and a structurally identical
 * conflict list, and an accepted one generates every time.
 *
 * Why 500 rather than a handful: the failure this guards is a refusal that
 * depends on a draw, and such a refusal is USUALLY rare — the reverted
 * plan-first generation hid exactly this class behind seeds that happened to
 * land inside a bound. A sweep long enough to meet the tail is the containment.
 */

const SEEDS = 500;
const START_WINDOW = '2026-08-14T12:00:00.000Z';

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
    name: 'Refusal invariance protocol',
    description: 'Held to the same verdict on every seed.',
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
              validation: { unique: true },
            },
          },
        },
      },
      edge: {
        link: {
          name: 'Link',
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

const collects = (
  variable: string,
  count: number,
  id = 'ng',
): Record<string, unknown> => ({
  id,
  type: 'NameGenerator',
  label: `Name generator ${id}`,
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'About them',
    fields: [{ variable, prompt: 'Tell us' }],
  },
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: `${id}-p1`, text: 'Who do you know?' }],
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
      createEdge: 'link',
    },
  ],
};

const roster = (minNodes: number): Record<string, unknown> => ({
  id: 'roster',
  type: 'NameGeneratorRoster',
  label: 'Colleagues',
  subject: { entity: 'node', type: 'person' },
  dataSource: 'colleagues',
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: minNodes },
  },
  prompts: [{ id: 'roster-p1', text: 'Who do you work with?' }],
  behaviours: { minNodes },
});

const rows = (howMany: number): NcNode[] =>
  Array.from({ length: howMany }, (_unused, index) => ({
    [entityPrimaryKeyProperty]: `row-${index}`,
    type: 'person',
    [entityAttributesProperty]: { name: `Row ${index}` },
  }));

/** One seed's outcome, as either the refusal it raised or the session it made. */
type Outcome =
  | { refused: true; message: string; conflicts: ConstraintConflict[] }
  | { refused: false; nodes: number };

const outcomeAt = (
  protocol: CurrentProtocol,
  seed: number,
  assetData?: AssetData,
): Outcome => {
  try {
    const [result] = generateInterviews(
      protocol,
      { count: 1, seed, simulateDropOut: false, startWindow: START_WINDOW },
      assetData,
    );
    return {
      refused: false,
      nodes: result?.session.network?.nodes.length ?? 0,
    };
  } catch (error) {
    if (!(error instanceof SyntheticDataConstraintError)) throw error;
    return {
      refused: true,
      message: error.message,
      conflicts: error.conflicts,
    };
  }
};

const sweep = (protocol: CurrentProtocol, assetData?: AssetData): Outcome[] =>
  Array.from({ length: SEEDS }, (_unused, seed) =>
    outcomeAt(protocol, seed, assetData),
  );

const REFUSING = [
  [
    'a roster pool below its own min-nodes gate',
    parse([roster(3)]),
    { rosterNodes: { roster: rows(1) } } satisfies AssetData,
  ],
  [
    'a unique slot with less room than the run needs',
    parse([collects('band', 5)]),
    undefined,
  ],
  [
    'a census asked for more pairs than a stage may enumerate',
    parse([collects('name', 60, 'a'), collects('name', 60, 'b'), dyadCensus]),
    undefined,
  ],
] as const;

describe('a refused protocol refuses on every seed (C12)', () => {
  it.each(REFUSING)('%s', (_name, protocol, assetData) => {
    const outcomes = sweep(protocol, assetData);

    expect(outcomes).toHaveLength(SEEDS);
    expect(outcomes.every((outcome) => outcome.refused)).toBe(true);

    // Identical, not merely present: a message that moved with the seed would
    // mean the analysis had read something the seed decides.
    const messages = new Set(
      outcomes.map((outcome) => (outcome.refused ? outcome.message : '')),
    );
    expect(messages.size).toBe(1);

    const first = outcomes[0];
    expect(first?.refused).toBe(true);
    for (const outcome of outcomes) {
      expect(outcome.refused ? outcome.conflicts : []).toStrictEqual(
        first?.refused ? first.conflicts : [],
      );
    }
  });
});

describe('an accepted protocol generates on every seed (C12)', () => {
  const ACCEPTED = [
    ['a protocol whose unique slot fits exactly', parse([collects('band', 2)])],
    [
      'a protocol with a census over its own people',
      parse([collects('name', 4), dyadCensus]),
    ],
  ] as const;

  it.each(ACCEPTED)('%s', (_name, protocol) => {
    const outcomes = sweep(protocol);

    expect(outcomes).toHaveLength(SEEDS);
    const refusals = outcomes.filter((outcome) => outcome.refused);
    expect(refusals).toEqual([]);
    // Not vacuous: a batch of empty networks would satisfy "never refused".
    expect(
      outcomes.every((outcome) => !outcome.refused && outcome.nodes > 0),
    ).toBe(true);
  });
});

describe('the corpus keeps one verdict per shape across seeds', () => {
  /**
   * The same invariance over shapes nobody wrote. Shallower per shape than the
   * 500-seed sweeps above and much wider, so the two together cover both the
   * tail of one protocol and the breadth of many.
   */
  it('never changes its mind about a corpus shape', () => {
    const disagreements: { index: number; seeds: number[] }[] = [];

    for (let index = 0; index < 120; index += 1) {
      const { protocol, assetData } = generateCorpusProtocol(index);
      const verdicts = Array.from(
        { length: 20 },
        (_unused, seed) => outcomeAt(protocol, seed, assetData).refused,
      );

      const seeds = verdicts
        .map((refused, seed) => (refused === verdicts[0] ? -1 : seed))
        .filter((seed) => seed >= 0);
      if (seeds.length > 0) disagreements.push({ index, seeds });
    }

    expect(disagreements).toEqual([]);
  });
});
