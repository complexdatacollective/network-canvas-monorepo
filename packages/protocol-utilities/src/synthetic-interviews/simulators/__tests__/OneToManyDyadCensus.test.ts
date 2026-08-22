import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import { simulateOneToManyDyadCensus } from '../OneToManyDyadCensus';
import { harnessFor, type Harness, parseProtocol } from './harness';

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        age: { name: 'age', type: 'number' },
      },
    },
  },
  edge: {
    friend: { name: 'friend', color: 'edge-color-seq-1' },
    colleague: { name: 'colleague', color: 'edge-color-seq-2' },
  },
};

/** The stage that named the alters this one asks about. */
const priorStage = {
  id: 'earlier',
  type: 'NameGeneratorQuickAdd',
  label: 'Earlier',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  prompts: [{ id: 'earlier-prompt', text: 'Who did you know?' }],
};

const friendPrompt = {
  id: 'p-friends',
  text: 'Tap everybody who would call this person a friend',
  createEdge: 'friend',
};

const colleaguePrompt = {
  id: 'p-colleagues',
  text: 'Tap everybody who works with this person',
  createEdge: 'colleague',
};

const stageWith = ({
  prompts = [friendPrompt],
  removeAfterConsideration = true,
  filter,
  synthetic,
}: {
  prompts?: Record<string, unknown>[];
  removeAfterConsideration?: boolean;
  filter?: unknown;
  synthetic?: Record<string, unknown>;
} = {}): Record<string, unknown> => ({
  id: 'one-to-many',
  type: 'OneToManyDyadCensus',
  label: 'One to Many Dyad Census',
  subject: { entity: 'node', type: 'person' },
  behaviours: { removeAfterConsideration },
  prompts,
  ...(filter ? { filter } : {}),
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
  alters = 0,
  attributes,
  seed,
}: {
  stage?: Record<string, unknown>;
  alters?: number;
  attributes?: (index: number) => Record<string, string | number>;
  seed?: number;
} = {}): Harness => {
  const protocol = parseProtocol(CODEBOOK, [priorStage, stage]);
  const harness = harnessFor(protocol, seed === undefined ? {} : { seed });
  harness.seedAlters(alters, attributes ? { attributes } : {});
  return harness;
};

const runStage = (harness: Harness, promptBound?: number): void => {
  const stage = harness.context.protocol.stages[1];
  if (!stage) throw new Error('fixture is missing the stage under test');
  if (stage.type !== 'OneToManyDyadCensus') {
    throw new Error('fixture is not a one-to-many census');
  }
  simulateOneToManyDyadCensus(stage, harness.context, promptBound);
};

const edgesOfType = (harness: Harness, type: string): NcEdge[] =>
  harness.network.edges.filter((edge) => edge.type === type);

describe('simulateOneToManyDyadCensus', () => {
  describe('no stage metadata, ever', () => {
    it('records nothing when every pair is tapped', () => {
      const harness = setUp({
        alters: 5,
        stage: stageWith({ synthetic: constantDensity(1) }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(10);
      expect(harness.engine.draft.stageMetadata).toEqual({});
    });

    it('records nothing when no pair is tapped', () => {
      const harness = setUp({
        alters: 5,
        stage: stageWith({ synthetic: constantDensity(0) }),
      });
      runStage(harness);

      expect(harness.network.edges).toEqual([]);
      expect(harness.engine.draft.stageMetadata).toEqual({});
    });

    it('records nothing at a realised topology in between', () => {
      const harness = setUp({
        alters: 9,
        stage: stageWith({ synthetic: constantDensity(0.5) }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(18);
      expect(harness.engine.draft.stageMetadata).toEqual({});
    });
  });

  describe('removeAfterConsideration', () => {
    it('leaves the same network either way, under the same seed', () => {
      // The option decides how often a pair is SHOWN, not what is decided
      // about it: shown twice, the second showing already reads as selected,
      // and a participant who agrees does not tap it off again.
      const considered = setUp({
        alters: 7,
        stage: stageWith({
          removeAfterConsideration: true,
          synthetic: constantDensity(0.5),
        }),
        seed: 31,
      });
      const revisited = setUp({
        alters: 7,
        stage: stageWith({
          removeAfterConsideration: false,
          synthetic: constantDensity(0.5),
        }),
        seed: 31,
      });
      runStage(considered);
      runStage(revisited);

      expect(revisited.network).toEqual(considered.network);
    });

    it('links each pair at most once, whichever way it is set', () => {
      for (const removeAfterConsideration of [true, false]) {
        const harness = setUp({
          alters: 6,
          stage: stageWith({
            removeAfterConsideration,
            synthetic: constantDensity(1),
          }),
        });
        runStage(harness);

        const keys = harness.network.edges.map((edge) =>
          [edge.from, edge.to].toSorted().join('|'),
        );

        expect(keys).toHaveLength(15);
        expect(new Set(keys).size).toBe(15);
      }
    });
  });

  describe('the shared graph', () => {
    it('leaves a pair a sibling prompt already linked alone', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [friendPrompt, { ...friendPrompt, id: 'p-again' }],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(6);
    });

    it('never takes an existing edge away', () => {
      // Select-all-that-apply has no "no": an untapped target is untapped, and
      // nothing about it is recorded or undone.
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

      expect(edgesOfType(harness, 'friend')).toHaveLength(1);
    });

    it('creates only the prompt’s own edge type, carrying nothing', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [friendPrompt, colleaguePrompt],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(6);
      expect(edgesOfType(harness, 'colleague')).toHaveLength(6);
      for (const edge of harness.network.edges) {
        expect(edge[entityAttributesProperty]).toEqual({});
      }
    });
  });

  it('asks only about the alters the stage filter shows', () => {
    const harness = setUp({
      alters: 6,
      attributes: (index) => ({ name: `Alter ${index}`, age: index * 20 }),
      stage: stageWith({
        synthetic: constantDensity(1),
        filter: {
          join: 'AND',
          rules: [
            {
              id: 'rule-1',
              type: 'node',
              options: {
                type: 'person',
                attribute: 'age',
                operator: 'GREATER_THAN',
                value: 30,
              },
            },
          ],
        },
      }),
    });
    runStage(harness);

    // Ages 0, 20, 40, 60, 80, 100: four alters pass, so six pairs.
    expect(edgesOfType(harness, 'friend')).toHaveLength(6);
  });

  it('creates nobody, and does nothing without pairs', () => {
    const harness = setUp({
      alters: 1,
      stage: stageWith({ synthetic: constantDensity(1) }),
    });
    runStage(harness);

    expect(harness.nodes()).toHaveLength(1);
    expect(harness.network.edges).toEqual([]);
  });

  describe('a stopped walk', () => {
    it('taps only the prompts below the bound', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [friendPrompt, colleaguePrompt],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness, 1);

      expect(edgesOfType(harness, 'friend')).toHaveLength(6);
      expect(edgesOfType(harness, 'colleague')).toEqual([]);
    });

    it('taps nothing at a bound of zero', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({ synthetic: constantDensity(1) }),
      });
      runStage(harness, 0);

      expect(harness.network.edges).toEqual([]);
    });
  });

  it('produces the same network twice from one seed', () => {
    const stage = stageWith();
    const first = setUp({ alters: 7, stage, seed: 12 });
    const second = setUp({ alters: 7, stage, seed: 12 });
    runStage(first);
    runStage(second);

    expect(second.network).toEqual(first.network);
  });

  it('refuses a subject the codebook does not define', () => {
    const protocol = parseProtocol(CODEBOOK, [priorStage, stageWith()]);
    Object.assign(protocol.stages[1] ?? {}, {
      subject: { entity: 'node', type: 'ghost' },
    });
    const harness = harnessFor(protocol);

    expect(() => runStage(harness)).toThrow(/node type "ghost"/);
  });
});
