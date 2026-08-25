import { describe, expect, it } from 'vitest';

import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import { unorderedPairs } from '../../utils/edgeTopology';
import { simulateTieStrengthCensus } from '../TieStrengthCensus';
import { harnessFor, type Harness, parseProtocol } from './harness';

const STRENGTH = [
  { label: 'Not very close', value: 1 },
  { label: 'Sort of close', value: 2 },
  { label: 'Very close', value: 3 },
];

const codebookWith = (
  strengthSynthetic?: Record<string, unknown>,
): Record<string, unknown> => ({
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
      name: 'friend',
      color: 'edge-color-seq-1',
      variables: {
        strength: {
          name: 'strength',
          type: 'ordinal',
          component: 'LikertScale',
          options: STRENGTH,
          ...(strengthSynthetic ? { synthetic: strengthSynthetic } : {}),
        },
        weight: { name: 'weight', type: 'number' },
      },
    },
    colleague: {
      name: 'colleague',
      color: 'edge-color-seq-2',
      variables: {
        frequency: {
          name: 'frequency',
          type: 'ordinal',
          component: 'LikertScale',
          options: STRENGTH,
        },
      },
    },
  },
});

/** The stage that named the alters this one asks about. */
const priorStage = {
  id: 'earlier',
  type: 'NameGeneratorQuickAdd',
  label: 'Earlier',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  prompts: [{ id: 'earlier-prompt', text: 'Who did you know?' }],
};

const closenessPrompt = {
  id: 'p-closeness',
  text: 'How close are these two?',
  createEdge: 'friend',
  edgeVariable: 'strength',
  negativeLabel: 'They do not know each other',
};

const colleaguePrompt = {
  id: 'p-colleagues',
  text: 'How often do they work together?',
  createEdge: 'colleague',
  edgeVariable: 'frequency',
  negativeLabel: 'They do not work together',
};

const stageWith = ({
  prompts = [closenessPrompt],
  synthetic,
}: {
  prompts?: Record<string, unknown>[];
  synthetic?: Record<string, unknown>;
} = {}): Record<string, unknown> => ({
  id: 'tie-strength-census',
  type: 'TieStrengthCensus',
  label: 'Tie-Strength Census',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'Pairs', text: 'About each pair of people.' },
  prompts,
  ...(synthetic ? { synthetic } : {}),
});

/** A density every prompt realises exactly, so a count is an oracle. */
const constantDensity = (value: number) => ({
  topology: {
    metric: 'density',
    distribution: { distribution: 'constant', value },
  },
});

const setUp = ({
  stage = stageWith(),
  codebook = codebookWith(),
  alters = 0,
  seed,
}: {
  stage?: Record<string, unknown>;
  codebook?: unknown;
  alters?: number;
  seed?: number;
} = {}): Harness => {
  const protocol = parseProtocol(codebook, [priorStage, stage]);
  const harness = harnessFor(protocol, seed === undefined ? {} : { seed });
  harness.seedAlters(alters, {
    attributes: (index) => ({ name: `Alter ${index}` }),
  });
  return harness;
};

const runStage = (harness: Harness, promptBound?: number): void => {
  const stage = harness.context.protocol.stages[1];
  if (!stage) throw new Error('fixture is missing the stage under test');
  if (stage.type !== 'TieStrengthCensus') {
    throw new Error('fixture is not a tie-strength census');
  }
  simulateTieStrengthCensus(stage, harness.context, promptBound);
};

/** The stage under test always sits at step 1 of the fixture protocol. */
const answers = (harness: Harness): DyadCensusMetadataItem[] => {
  const entry = harness.engine.draft.stageMetadata['1'];
  return Array.isArray(entry) ? entry : [];
};

const edgesOfType = (harness: Harness, type: string): NcEdge[] =>
  harness.network.edges.filter((edge) => edge.type === type);

const pairKey = (from: string, to: string): string =>
  [from, to].toSorted().join('|');

describe('simulateTieStrengthCensus', () => {
  describe('the gate: every pair either graded or declined', () => {
    it('grades or declines each pair exactly once per prompt', () => {
      const harness = setUp({
        alters: 6,
        stage: stageWith({ synthetic: constantDensity(0.5) }),
      });
      runStage(harness);

      const declined = new Set(
        answers(harness).map(([, from, to]) => pairKey(from, to)),
      );
      const graded = new Set(
        edgesOfType(harness, 'friend').map((edge) =>
          pairKey(edge.from, edge.to),
        ),
      );
      const asked = new Set(
        unorderedPairs(harness.nodes()).map(([from, to]) => pairKey(from, to)),
      );

      expect(asked.size).toBe(15);
      expect(new Set([...declined, ...graded])).toEqual(asked);
      expect(declined.size + graded.size).toBe(asked.size);
    });

    it('sets the edge variable on every pair it graded', () => {
      const harness = setUp({
        alters: 7,
        stage: stageWith({ synthetic: constantDensity(0.6) }),
      });
      runStage(harness);

      const values = edgesOfType(harness, 'friend').map(
        (edge) => edge[entityAttributesProperty].strength,
      );

      expect(values).not.toEqual([]);
      for (const value of values) expect([1, 2, 3]).toContain(value);
    });
  });

  describe('negatives only in the metadata', () => {
    it('records nothing at all when every pair is graded', () => {
      const harness = setUp({
        alters: 5,
        stage: stageWith({ synthetic: constantDensity(1) }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(10);
      expect(harness.engine.draft.stageMetadata).toEqual({});
    });

    it('records every pair when every pair is declined', () => {
      const harness = setUp({
        alters: 5,
        stage: stageWith({ synthetic: constantDensity(0) }),
      });
      runStage(harness);

      expect(harness.network.edges).toEqual([]);
      expect(answers(harness)).toHaveLength(10);
      expect(answers(harness).every(([, , , present]) => !present)).toBe(true);
    });

    it('never records a positive tuple', () => {
      const harness = setUp({
        alters: 8,
        stage: stageWith({ synthetic: constantDensity(0.5) }),
      });
      runStage(harness);

      expect(answers(harness).some(([, , , present]) => present)).toBe(false);
    });

    it('declines in node-list order, first person first', () => {
      const harness = setUp({
        alters: 5,
        stage: stageWith({ synthetic: constantDensity(0) }),
      });
      runStage(harness);

      expect(answers(harness).map(([, from, to]) => [from, to])).toEqual(
        unorderedPairs(harness.nodes()),
      );
    });
  });

  describe('the shared graph', () => {
    it('grades an edge a sibling prompt already made rather than adding one', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [
            closenessPrompt,
            {
              ...closenessPrompt,
              id: 'p-second',
              text: 'And how close now?',
            },
          ],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(6);
    });

    it('takes an existing edge away when the pair is declined', () => {
      const harness = setUp({
        alters: 3,
        stage: stageWith({ synthetic: constantDensity(0) }),
      });
      const [first, second] = harness.nodes();
      if (!first || !second) throw new Error('fixture seeded no alters');
      harness.engine.addEdge({
        edgeType: 'friend',
        uid: 'pre-existing',
        from: first[entityPrimaryKeyProperty],
        to: second[entityPrimaryKeyProperty],
        currentStep: 0,
      });

      runStage(harness);

      expect(harness.network.edges).toEqual([]);
      expect(answers(harness)).toHaveLength(3);
    });

    it('writes each prompt’s own edge type and variable', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [closenessPrompt, colleaguePrompt],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness);

      for (const edge of edgesOfType(harness, 'friend')) {
        expect(Object.keys(edge[entityAttributesProperty])).toEqual([
          'strength',
        ]);
      }
      for (const edge of edgesOfType(harness, 'colleague')) {
        expect(Object.keys(edge[entityAttributesProperty])).toEqual([
          'frequency',
        ]);
      }
    });
  });

  describe('the edge variable’s synthetic descriptor', () => {
    it('honours declared option weights', () => {
      const harness = setUp({
        alters: 30,
        codebook: codebookWith({ optionWeights: [{ value: 3, weight: 30 }] }),
        stage: stageWith({ synthetic: constantDensity(1) }),
      });
      runStage(harness);

      const values = edgesOfType(harness, 'friend').map(
        (edge) => edge[entityAttributesProperty].strength,
      );
      const strongest = values.filter((value) => value === 3).length;

      expect(strongest / values.length).toBeGreaterThan(0.85);
    });

    it('declines the pairs whose grade the descriptor leaves unanswered', () => {
      // The decline card is the only way this interface leaves the edge
      // variable unset, so an unanswered grade is a declined pair rather than
      // an edge carrying nothing.
      const harness = setUp({
        alters: 30,
        codebook: codebookWith({ missingProbability: 0.4 }),
        stage: stageWith({ synthetic: constantDensity(1) }),
      });
      runStage(harness);

      const declined = answers(harness).length;
      const graded = edgesOfType(harness, 'friend').length;

      expect(declined + graded).toBe(435);
      expect(Math.abs(declined / 435 - 0.4)).toBeLessThan(0.06);
      for (const edge of edgesOfType(harness, 'friend')) {
        expect([1, 2, 3]).toContain(edge[entityAttributesProperty].strength);
      }
    });
  });

  describe('a stopped walk', () => {
    it('answers only the prompts below the bound', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [closenessPrompt, colleaguePrompt],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness, 1);

      expect(edgesOfType(harness, 'friend')).toHaveLength(6);
      expect(edgesOfType(harness, 'colleague')).toEqual([]);
    });

    it('records nothing at a bound of zero', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({ synthetic: constantDensity(0) }),
      });
      runStage(harness, 0);

      expect(harness.engine.draft.stageMetadata).toEqual({});
      expect(harness.network.edges).toEqual([]);
    });
  });

  it('produces the same census twice from one seed', () => {
    const stage = stageWith();
    const first = setUp({ alters: 7, stage, seed: 77 });
    const second = setUp({ alters: 7, stage, seed: 77 });
    runStage(first);
    runStage(second);

    expect(second.network).toEqual(first.network);
    expect(answers(second)).toEqual(answers(first));
  });

  describe('the unique values a declined pair gives back', () => {
    /** Two grades to go round, so a third leaked claim exhausts the space. */
    const scarceCodebook = {
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
          name: 'friend',
          color: 'edge-color-seq-1',
          variables: {
            strength: {
              name: 'strength',
              type: 'ordinal',
              component: 'LikertScale',
              options: [
                { label: 'Sort of close', value: 1 },
                { label: 'Very close', value: 2 },
              ],
              validation: { unique: true },
            },
          },
        },
      },
    };

    /** One pair walked through the given densities, stage by stage. */
    const censusRun = (densities: number[]): Harness => {
      const protocol = parseProtocol(scarceCodebook, [
        priorStage,
        ...densities.map((density, position) => ({
          ...stageWith({ synthetic: constantDensity(density) }),
          id: `census-${position}`,
        })),
      ]);
      const harness = harnessFor(protocol);
      harness.seedAlters(2, {
        attributes: (index) => ({ name: `Alter ${index}` }),
      });

      densities.forEach((_, position) => {
        const stage = harness.context.protocol.stages[position + 1];
        if (stage?.type !== 'TieStrengthCensus') {
          throw new Error('fixture is not a tie-strength census');
        }
        simulateTieStrengthCensus(stage, harness.context);
      });

      return harness;
    };

    it('re-grades a pair whose edge earlier declines deleted', () => {
      const harness = censusRun([1, 0, 1, 0, 1]);
      const edges = edgesOfType(harness, 'friend');

      expect(edges).toHaveLength(1);
      expect(edges[0]?.[entityAttributesProperty].strength).toBeDefined();
    });
  });

  describe('protocols the codebook contradicts', () => {
    it('refuses a subject the codebook does not define', () => {
      const protocol = parseProtocol(codebookWith(), [priorStage, stageWith()]);
      Object.assign(protocol.stages[1] ?? {}, {
        subject: { entity: 'node', type: 'ghost' },
      });
      const harness = harnessFor(protocol);

      expect(() => runStage(harness)).toThrow(/node type "ghost"/);
    });

    it('refuses an edge variable that is not ordinal', () => {
      const protocol = parseProtocol(codebookWith(), [priorStage, stageWith()]);
      Object.assign(protocol.stages[1] ?? {}, {
        prompts: [{ ...closenessPrompt, edgeVariable: 'weight' }],
      });
      const harness = harnessFor(protocol);
      harness.seedAlters(3);

      expect(() => runStage(harness)).toThrow(/not an ordinal/);
    });
  });
});
