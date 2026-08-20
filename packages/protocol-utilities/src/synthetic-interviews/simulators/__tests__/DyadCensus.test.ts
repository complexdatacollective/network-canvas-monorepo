import { describe, expect, it } from 'vitest';

import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import { unorderedPairs } from '../../utils/edgeTopology';
import { simulateDyadCensus } from '../DyadCensus';
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
  text: 'Are these people friends?',
  createEdge: 'friend',
};

const colleaguePrompt = {
  id: 'p-colleagues',
  text: 'Do these people work together?',
  createEdge: 'colleague',
};

const stageWith = ({
  prompts = [friendPrompt],
  filter,
  synthetic,
}: {
  prompts?: Record<string, unknown>[];
  filter?: unknown;
  synthetic?: Record<string, unknown>;
} = {}): Record<string, unknown> => ({
  id: 'dyad-census',
  type: 'DyadCensus',
  label: 'Dyad Census',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'Pairs', text: 'About each pair of people.' },
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
  if (stage.type !== 'DyadCensus') throw new Error('fixture is not a census');
  simulateDyadCensus(stage, harness.context, promptBound);
};

/** The stage under test always sits at step 1 of the fixture protocol. */
const answers = (harness: Harness): DyadCensusMetadataItem[] => {
  const entry = harness.engine.draft.stageMetadata['1'];
  return Array.isArray(entry) ? entry : [];
};

const edgesOfType = (harness: Harness, type: string): NcEdge[] =>
  harness.network.edges.filter((edge) => edge.type === type);

describe('simulateDyadCensus', () => {
  describe('the hard gate: every pair of every prompt answered', () => {
    it('records one tuple per pair per prompt', () => {
      const harness = setUp({
        alters: 6,
        stage: stageWith({ prompts: [friendPrompt, colleaguePrompt] }),
      });
      runStage(harness);

      expect(answers(harness)).toHaveLength(30);
    });

    it('answers the pairs in node-list order, first person first', () => {
      const harness = setUp({ alters: 4 });
      runStage(harness);

      const asked = answers(harness).map(([, from, to]) => [from, to]);
      expect(asked).toEqual(unorderedPairs(harness.nodes()));
    });

    it('leaves no pair with two answers for one prompt', () => {
      const harness = setUp({ alters: 7 });
      runStage(harness);

      const keys = answers(harness).map(
        ([promptIndex, from, to]) =>
          `${promptIndex}:${[from, to].toSorted().join('|')}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('records nothing at all where there is nobody to pair', () => {
      const harness = setUp({ alters: 1 });
      runStage(harness);

      expect(harness.engine.draft.stageMetadata).toEqual({});
    });
  });

  describe('both signs', () => {
    it('says yes to every pair, and links them, at a density of one', () => {
      const harness = setUp({
        alters: 5,
        stage: stageWith({ synthetic: constantDensity(1) }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(10);
      expect(answers(harness).every(([, , , present]) => present)).toBe(true);
    });

    it('says no to every pair, and links none, at a density of zero', () => {
      const harness = setUp({
        alters: 5,
        stage: stageWith({ synthetic: constantDensity(0) }),
      });
      runStage(harness);

      expect(harness.network.edges).toEqual([]);
      expect(answers(harness)).toHaveLength(10);
      expect(answers(harness).every(([, , , present]) => !present)).toBe(true);
    });

    it('links exactly the pairs it said yes to', () => {
      const harness = setUp({
        alters: 8,
        stage: stageWith({ synthetic: constantDensity(0.5) }),
      });
      runStage(harness);

      const linked = new Set(
        edgesOfType(harness, 'friend').map((edge) =>
          [edge.from, edge.to].toSorted().join('|'),
        ),
      );
      const positive = new Set(
        answers(harness)
          .filter(([, , , present]) => present)
          .map(([, from, to]) => [from, to].toSorted().join('|')),
      );

      expect(positive.size).toBe(14);
      expect(linked).toEqual(positive);
    });

    it('carries nothing on the edges it creates', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({ synthetic: constantDensity(1) }),
      });
      runStage(harness);

      for (const edge of harness.network.edges) {
        expect(edge[entityAttributesProperty]).toEqual({});
      }
    });
  });

  describe('the shared graph', () => {
    it('does not add a second edge of a type a pair already carries', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [friendPrompt, { ...friendPrompt, id: 'p-again' }],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(6);
      expect(answers(harness)).toHaveLength(12);
    });

    it('takes an existing edge away when the participant says no', () => {
      // The interface's own behaviour: the pair reads as pre-selected "Yes",
      // and answering "No" deletes the edge behind it.
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
    });

    it('keeps another edge type out of it', () => {
      const harness = setUp({
        alters: 3,
        stage: stageWith({ synthetic: constantDensity(0) }),
      });
      const [first, second] = harness.nodes();
      if (!first || !second) throw new Error('fixture seeded no alters');
      harness.engine.addEdge({
        edgeType: 'colleague',
        uid: 'pre-existing',
        from: first[entityPrimaryKeyProperty],
        to: second[entityPrimaryKeyProperty],
        currentStep: 0,
      });

      runStage(harness);

      expect(edgesOfType(harness, 'colleague')).toHaveLength(1);
    });
  });

  describe('the stage filter', () => {
    it('asks only about the alters it shows', () => {
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
      expect(answers(harness)).toHaveLength(6);
    });
  });

  describe('a stopped walk', () => {
    it('answers only the prompts below the bound', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [friendPrompt, colleaguePrompt],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness, 1);

      expect(answers(harness).every(([promptIndex]) => promptIndex === 0)).toBe(
        true,
      );
      expect(answers(harness)).toHaveLength(6);
      expect(edgesOfType(harness, 'colleague')).toEqual([]);
    });

    it('records nothing at a bound of zero', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({ synthetic: constantDensity(1) }),
      });
      runStage(harness, 0);

      expect(harness.engine.draft.stageMetadata).toEqual({});
      expect(harness.network.edges).toEqual([]);
    });
  });

  it('produces the same census twice from one seed', () => {
    const stage = stageWith();
    const first = setUp({ alters: 7, stage, seed: 55 });
    const second = setUp({ alters: 7, stage, seed: 55 });
    runStage(first);
    runStage(second);

    expect(second.network).toEqual(first.network);
    expect(answers(second)).toEqual(answers(first));
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
