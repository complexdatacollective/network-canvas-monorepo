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

import { SyntheticDataConstraintError } from '../constraints/error';
import { generateInterviews, type GenerateInterviewsOptions } from '../index';
import type { AssetData } from '../simulators/types';

/**
 * The pre-seed gate held against the walk it speaks for.
 *
 * The gate exists to refuse, before a seed is drawn, exactly the batches the
 * walk could fail to complete — no more and no fewer. Both halves of that are
 * bugs when they come apart, and they come apart in ways only a paired test
 * can show: a demand the gate under-models lets a batch through that every
 * seed strands, and one it over-models refuses a batch every seed completes.
 *
 * So each case here asks both questions of one protocol: what the gate says,
 * and what the walk actually does. A protocol the gate refuses is shown to be
 * one the walk cannot finish (by running the same shape with the gate's own
 * trigger removed), and a protocol the gate accepts is shown to generate.
 *
 * `startWindow` is pinned throughout so a run is byte-reproducible, and every
 * protocol goes through the real schema, because the gate reads the
 * `synthetic` descriptors parsing supplies.
 */

const START_WINDOW = '2026-08-14T12:00:00.000Z';
const SEEDS = 16;

const ASSET_MANIFEST = {
  colleagues: {
    id: 'colleagues',
    name: 'Colleagues',
    type: 'network',
    source: 'colleagues.json',
  },
};

const gradedEdge = (options: number) => ({
  friend: {
    name: 'Friend',
    color: 'edge-color-seq-1',
    variables: {
      strength: {
        name: 'strength',
        type: 'ordinal',
        component: 'LikertScale',
        options: Array.from({ length: options }, (_unused, index) => ({
          label: `Level ${index + 1}`,
          value: index + 1,
        })),
        validation: { unique: true },
      },
    },
  },
});

const parse = (
  stages: Record<string, unknown>[],
  strengthOptions: number,
): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Gate and walk protocol',
    description: 'The gate asked alongside the walk it speaks for.',
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
            // Three distinct values, and any form filling it in has to find
            // one per person it reaches.
            band: {
              name: 'band',
              type: 'ordinal',
              component: 'LikertScale',
              options: [
                { label: 'Distant', value: 1 },
                { label: 'Neutral', value: 2 },
                { label: 'Close', value: 3 },
              ],
              validation: { unique: true },
            },
          },
        },
      },
      edge: gradedEdge(strengthOptions),
    },
    stages,
  });

const quickAdd = (count: number, id = 'ng'): Record<string, unknown> => ({
  id,
  type: 'NameGeneratorQuickAdd',
  label: `Who do you know? (${id})`,
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: `${id}-p1`, text: 'Who else?' }],
});

const rows = (howMany: number): NcNode[] =>
  Array.from({ length: howMany }, (_unused, index) => ({
    [entityPrimaryKeyProperty]: `row-${index}`,
    type: 'person',
    [entityAttributesProperty]: { name: `Row ${index}` },
  }));

/** Every seed's session, or the refusal the whole batch raised. */
const sweep = (
  protocol: CurrentProtocol,
  options: Omit<GenerateInterviewsOptions, 'count'> = {},
  assetData?: AssetData,
):
  | { refused: true; reasons: string[] }
  | {
      refused: false;
      sessions: NonNullable<ReturnType<typeof generateInterviews>>;
    } => {
  try {
    const sessions = Array.from({ length: SEEDS }, (_unused, seed) => {
      const [result] = generateInterviews(
        protocol,
        {
          count: 1,
          seed,
          simulateDropOut: false,
          startWindow: START_WINDOW,
          ...options,
        },
        assetData,
      );
      if (result === undefined) throw new Error('no session was generated');
      return result;
    });
    return { refused: false, sessions };
  } catch (error) {
    if (!(error instanceof SyntheticDataConstraintError)) throw error;
    return {
      refused: true,
      reasons: error.conflicts.map((conflict) => conflict.reason),
    };
  }
};

describe('a roster the stages before it jointly empty', () => {
  const roster = (
    id: string,
    count: number,
    minNodes?: number,
  ): Record<string, unknown> => ({
    id,
    type: 'NameGeneratorRoster',
    label: `Roster ${id}`,
    subject: { entity: 'node', type: 'person' },
    dataSource: 'colleagues',
    synthetic: {
      generatesData: true,
      count: { distribution: 'constant', value: count },
    },
    prompts: [{ id: `${id}-p1`, text: 'Who do you work with?' }],
    ...(minNodes === undefined ? {} : { behaviours: { minNodes } }),
  });

  // Four rows offered to the two stages that take two apiece, and two of
  // those same four offered to the stage after them.
  const shared = rows(4);
  const assetData: AssetData = {
    rosterNodes: {
      first: shared,
      second: shared,
      third: shared.slice(2),
    },
  };

  it('is a stage every seed strands, gate or no gate', () => {
    // The same three stages with the min-nodes gate removed, so the walk runs
    // and can be asked what it actually does. Nobody is left for the third
    // stage on any seed: the two before it take four distinct rows out of
    // four, and a row already in the network is one the roster stops
    // offering.
    const outcome = sweep(
      parse([roster('first', 2), roster('second', 2), roster('third', 1)], 2),
      {},
      assetData,
    );

    expect(outcome.refused).toBe(false);
    if (outcome.refused) return;

    const nominations = outcome.sessions.map(
      (result) =>
        result.session.network.nodes.filter((node) =>
          (node.promptIDs ?? []).includes('third-p1'),
        ).length,
    );
    expect(nominations).toEqual(Array.from({ length: SEEDS }, () => 0));
    // Not vacuous: the stages before it did nominate.
    expect(outcome.sessions[0]?.session.network.nodes).toHaveLength(4);
  });

  it('is refused before a seed is drawn once it carries one', () => {
    const outcome = sweep(
      parse(
        [roster('first', 2), roster('second', 2), roster('third', 1, 1)],
        2,
      ),
      {},
      assetData,
    );

    expect(outcome.refused).toBe(true);
    if (!outcome.refused) return;
    expect(outcome.reasons).toEqual([
      'stage "Roster third" must nominate at least 1 from its roster, and of the 2 rows ' +
        'resolved for it, earlier stages drawing on the same roster leave it at most 0',
    ]);
  });
});

describe('a roster two stages draw from at once', () => {
  const roster = (id: string, count: number): Record<string, unknown> => ({
    id,
    type: 'NameGeneratorRoster',
    label: `Roster ${id}`,
    subject: { entity: 'node', type: 'person' },
    dataSource: 'colleagues',
    synthetic: {
      generatesData: true,
      count: { distribution: 'constant', value: count },
    },
    prompts: [{ id: `${id}-p1`, text: 'Who do you work with?' }],
  });

  const aboutEveryone = {
    id: 'about',
    type: 'AlterForm',
    label: 'About each person',
    subject: { entity: 'node', type: 'person' },
    introductionPanel: { title: 'About them', text: 'A few questions.' },
    form: { fields: [{ variable: 'band', prompt: 'How close?' }] },
  };

  // Two stages of three, one three-row roster between them, and a form
  // afterwards asking a three-valued `unique` question of everybody.
  const protocol = parse(
    [roster('first', 3), roster('second', 3), aboutEveryone],
    2,
  );
  const shared = rows(3);
  const assetData: AssetData = {
    rosterNodes: { first: shared, second: shared },
  };

  it('generates: the walk builds three people, not six', () => {
    const outcome = sweep(protocol, {}, assetData);

    expect(outcome.refused).toBe(false);
    if (outcome.refused) return;
    expect(
      outcome.sessions.map((result) => result.session.network.nodes.length),
    ).toEqual(Array.from({ length: SEEDS }, () => 3));
  });
});

describe('a filtered re-census in a run that ignores filtering', () => {
  const denseCensus = (
    id: string,
    filter?: Record<string, unknown>,
  ): Record<string, unknown> => ({
    id,
    type: 'TieStrengthCensus',
    label: `Census ${id}`,
    subject: { entity: 'node', type: 'person' },
    introductionPanel: { title: 'Pairs', text: 'About each pair.' },
    synthetic: {
      generatesData: true,
      topology: {
        metric: 'density',
        distribution: { distribution: 'constant', value: 1 },
      },
    },
    prompts: [
      {
        id: `${id}-p1`,
        text: 'How close are these two?',
        createEdge: 'friend',
        edgeVariable: 'strength',
        negativeLabel: 'They do not know each other',
      },
    ],
    ...(filter ? { filter } : {}),
  });

  const anyPerson = {
    join: 'AND',
    rules: [
      {
        id: 'rule-1',
        type: 'node',
        options: { type: 'person', operator: 'EXISTS' },
      },
    ],
  };

  // Four people are six pairs; eight distinct strengths is room for one graded
  // edge per pair and no more.
  const protocol = parse(
    [quickAdd(4), denseCensus('c1'), denseCensus('c2', anyPerson)],
    8,
  );

  it('generates: the walk grades six ties, never twelve', () => {
    const outcome = sweep(protocol, { respectFiltering: false });

    expect(outcome.refused).toBe(false);
    if (outcome.refused) return;
    expect(
      outcome.sessions.map((result) => result.session.network.edges.length),
    ).toEqual(Array.from({ length: SEEDS }, () => 6));
  });

  it('is still refused where the run honours its filters', () => {
    // The filter is resolved against a network that does not exist before the
    // seed, so a run that honours filters is read as one whose census may see
    // no edge at all and grade every pair a second time.
    const outcome = sweep(protocol);

    expect(outcome.refused).toBe(true);
    if (!outcome.refused) return;
    expect(outcome.reasons).toEqual([
      'only 8 distinct values are possible, but up to 12 edges of this type can be generated',
    ]);
  });
});

describe('fixture ties a stopped preview never makes', () => {
  const protocol = parse([quickAdd(2), quickAdd(2, 'late')], 2);
  const overrides = {
    nodes: {
      late: [
        { type: 'person', uid: 'a' },
        { type: 'person', uid: 'b' },
      ],
    },
    edges: [
      { type: 'friend', from: 'a', to: 'b' },
      { type: 'friend', from: 'b', to: 'a' },
      { type: 'friend', from: 'a', to: 'b' },
    ],
  };

  it('previews: the walk relates nobody it never named', () => {
    const outcome = sweep(protocol, { overrides, stopAt: { stageIndex: 0 } });

    expect(outcome.refused).toBe(false);
    if (outcome.refused) return;
    for (const result of outcome.sessions) {
      expect(result.session.network.edges).toEqual([]);
      expect(result.session.network.nodes).toEqual([]);
    }
  });

  it('is refused where the walk runs far enough to make them', () => {
    const outcome = sweep(protocol, { overrides });

    expect(outcome.refused).toBe(true);
    if (!outcome.refused) return;
    expect(outcome.reasons).toEqual([
      'only 2 distinct values are possible, but up to 3 edges of this type can be generated',
    ]);
  });
});
