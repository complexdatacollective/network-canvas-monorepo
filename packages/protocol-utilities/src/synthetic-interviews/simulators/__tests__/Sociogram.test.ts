import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import { simulateSociogram } from '../Sociogram';
import { harnessFor, type Harness, parseProtocol } from './harness';

const codebookWith = (
  highlightSynthetic?: Record<string, unknown>,
): Record<string, unknown> => ({
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        age: { name: 'age', type: 'number' },
        position: { name: 'position', type: 'layout' },
        elsewhere: { name: 'elsewhere', type: 'layout' },
        is_close: {
          name: 'is_close',
          type: 'boolean',
          component: 'Toggle',
          ...(highlightSynthetic ? { synthetic: highlightSynthetic } : {}),
        },
      },
    },
  },
  edge: {
    friend: { name: 'friend', color: 'edge-color-seq-1' },
    colleague: { name: 'colleague', color: 'edge-color-seq-2' },
  },
});

/** The stage that named the alters this one arranges. */
const priorStage = {
  id: 'earlier',
  type: 'NameGeneratorQuickAdd',
  label: 'Earlier',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  prompts: [{ id: 'earlier-prompt', text: 'Who did you know?' }],
};

const arrangeOnly = {
  id: 'p-arrange',
  text: 'Arrange these people',
  layout: { layoutVariable: 'position' },
};

const createsFriends = {
  id: 'p-create',
  text: 'Link the people who know each other',
  layout: { layoutVariable: 'position' },
  edges: { create: 'friend' },
};

const highlightsCloseness = {
  id: 'p-highlight',
  text: 'Tap the people you feel close to',
  layout: { layoutVariable: 'position' },
  highlight: { allowHighlighting: true, variable: 'is_close' },
};

const stageWith = ({
  prompts = [arrangeOnly],
  filter,
  synthetic,
}: {
  prompts?: Record<string, unknown>[];
  filter?: unknown;
  synthetic?: Record<string, unknown>;
} = {}): Record<string, unknown> => ({
  id: 'sociogram',
  type: 'Sociogram',
  label: 'Sociogram',
  subject: { entity: 'node', type: 'person' },
  background: { concentricCircles: 3 },
  behaviours: { automaticLayout: true },
  prompts,
  ...(filter ? { filter } : {}),
  ...(synthetic ? { synthetic } : {}),
});

const setUp = ({
  stage = stageWith(),
  codebook = codebookWith(),
  alters = 0,
  attributes,
  seed,
}: {
  stage?: Record<string, unknown>;
  codebook?: unknown;
  alters?: number;
  attributes?: (index: number) => Record<string, string | number>;
  seed?: number;
} = {}): Harness => {
  const protocol = parseProtocol(codebook, [priorStage, stage]);
  const harness = harnessFor(protocol, seed === undefined ? {} : { seed });
  harness.seedAlters(alters, attributes ? { attributes } : {});
  return harness;
};

const runStage = (harness: Harness, promptBound?: number): void => {
  const stage = harness.context.protocol.stages[1];
  if (!stage) throw new Error('fixture is missing the stage under test');
  if (stage.type !== 'Sociogram') throw new Error('fixture is not a Sociogram');
  simulateSociogram(stage, harness.context, promptBound);
};

const positions = (harness: Harness, variable = 'position'): unknown[] =>
  harness.nodes().map((node) => node[entityAttributesProperty][variable]);

/**
 * The layout values that are actually canvas coordinates.
 *
 * Narrowing rather than reading: a value the interface could not have written
 * — a bare number, a `{ lat, lng }`, a string — drops out here, so a length
 * assertion against the alters on screen is what proves the SHAPE as well as
 * the count.
 */
const pointsOf = (
  harness: Harness,
  variable = 'position',
): { x: number; y: number }[] =>
  positions(harness, variable).flatMap((value) =>
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    typeof value.x === 'number' &&
    typeof value.y === 'number'
      ? [{ x: value.x, y: value.y }]
      : [],
  );

const edgesOfType = (harness: Harness, type: string): NcEdge[] =>
  harness.network.edges.filter((edge) => edge.type === type);

/** A density every prompt realises exactly, so a count is an oracle. */
const constantDensity = (value: number) => ({
  topology: {
    metric: 'density',
    distribution: { distribution: 'constant', value },
  },
});

describe('simulateSociogram', () => {
  describe('the layout', () => {
    it('gives every alter the stage shows a position', () => {
      const harness = setUp({ alters: 8 });
      runStage(harness);

      expect(positions(harness).filter((value) => value === undefined)).toEqual(
        [],
      );
    });

    it('writes a canvas coordinate, inside the canvas', () => {
      const harness = setUp({ alters: 40 });
      runStage(harness);

      const points = pointsOf(harness);
      expect(points).toHaveLength(40);

      for (const { x, y } of points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    });

    it('gives different people different places', () => {
      const harness = setUp({ alters: 20 });
      runStage(harness);

      const distinct = new Set(
        positions(harness).map((p) => JSON.stringify(p)),
      );
      expect(distinct.size).toBe(20);
    });

    it('writes each prompt’s own layout variable', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [
            arrangeOnly,
            {
              id: 'p-second',
              text: 'Arrange them again',
              layout: { layoutVariable: 'elsewhere' },
            },
          ],
        }),
      });
      runStage(harness);

      expect(
        positions(harness, 'elsewhere').filter((v) => v === undefined),
      ).toEqual([]);
    });

    it('positions only the alters the stage filter shows', () => {
      const harness = setUp({
        alters: 6,
        attributes: (index) => ({ name: `Alter ${index}`, age: index * 20 }),
        stage: stageWith({
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

      for (const node of harness.nodes()) {
        const age = Number(node[entityAttributesProperty].age);
        const placed = node[entityAttributesProperty].position;
        if (age > 30) expect(placed).toBeDefined();
        else expect(placed).toBeUndefined();
      }
    });

    it('produces nothing on an empty network', () => {
      const harness = setUp();
      runStage(harness);

      expect(harness.nodes()).toEqual([]);
      expect(harness.network.edges).toEqual([]);
    });

    it('creates nobody', () => {
      const harness = setUp({ alters: 5 });
      runStage(harness);

      expect(harness.nodes()).toHaveLength(5);
    });
  });

  describe('creating edges', () => {
    it('links every pair when the topology asks for all of them', () => {
      const harness = setUp({
        alters: 6,
        stage: stageWith({
          prompts: [createsFriends],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(15);
    });

    it('links none when the topology asks for none', () => {
      const harness = setUp({
        alters: 6,
        stage: stageWith({
          prompts: [createsFriends],
          synthetic: constantDensity(0),
        }),
      });
      runStage(harness);

      expect(harness.network.edges).toEqual([]);
    });

    it('links the declared share of the pairs', () => {
      const harness = setUp({
        alters: 10,
        stage: stageWith({
          prompts: [createsFriends],
          synthetic: constantDensity(0.4),
        }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(18);
    });

    it('creates only the prompt’s own edge type', () => {
      const harness = setUp({
        alters: 5,
        stage: stageWith({
          prompts: [
            createsFriends,
            {
              id: 'p-colleagues',
              text: 'Link the people who work together',
              layout: { layoutVariable: 'position' },
              edges: { create: 'colleague' },
            },
          ],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(10);
      expect(edgesOfType(harness, 'colleague')).toHaveLength(10);
    });

    it('leaves an edge an earlier prompt already made alone', () => {
      // Tapping a linked pair would UNLINK it, which is not what a participant
      // who agrees with what they see does.
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [createsFriends, { ...createsFriends, id: 'p-again' }],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(6);
    });

    it('carries no provenance on the edges it makes', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [createsFriends],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness);

      for (const edge of harness.network.edges) {
        expect(Object.keys(edge).toSorted()).toEqual(
          [
            entityAttributesProperty,
            entityPrimaryKeyProperty,
            'from',
            'to',
            'type',
          ].toSorted(),
        );
        expect(edge[entityAttributesProperty]).toEqual({});
      }
    });

    it('writes no highlight attribute', () => {
      // Edge creation and highlighting are exclusive; the interface's tap
      // handler reaches highlighting only where no edge type is being created.
      const harness = setUp({
        alters: 5,
        stage: stageWith({
          prompts: [createsFriends],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness);

      for (const node of harness.nodes()) {
        expect(node[entityAttributesProperty].is_close).toBeUndefined();
      }
    });

    it('lets creation win where a prompt somehow asks for both', () => {
      // The stage schema refuses this pairing, so no authored protocol carries
      // it — which is why the fixture is assembled past the parser. The
      // interface decides it anyway, silently, and the simulator agrees with
      // the interface rather than holding a third opinion about it.
      const protocol = parseProtocol(codebookWith(), [
        priorStage,
        stageWith({
          prompts: [createsFriends],
          synthetic: constantDensity(1),
        }),
      ]);
      Object.assign(protocol.stages[1] ?? {}, {
        prompts: [
          {
            ...createsFriends,
            highlight: { allowHighlighting: true, variable: 'is_close' },
          },
        ],
      });
      const harness = harnessFor(protocol);
      harness.seedAlters(4);

      runStage(harness);

      expect(edgesOfType(harness, 'friend')).toHaveLength(6);
      for (const node of harness.nodes()) {
        expect(node[entityAttributesProperty].is_close).toBeUndefined();
      }
    });
  });

  describe('highlighting', () => {
    it('marks alters with a boolean and creates no edges', () => {
      const harness = setUp({
        alters: 20,
        stage: stageWith({ prompts: [highlightsCloseness] }),
      });
      runStage(harness);

      const marks = harness
        .nodes()
        .map((node) => node[entityAttributesProperty].is_close);

      expect(harness.network.edges).toEqual([]);
      expect(marks.every((mark) => typeof mark === 'boolean')).toBe(true);
    });

    it('honours the variable’s declared odds of being true', () => {
      const harness = setUp({
        alters: 600,
        codebook: codebookWith({ probabilityTrue: 0.9 }),
        stage: stageWith({ prompts: [highlightsCloseness] }),
      });
      runStage(harness);

      const marks = harness
        .nodes()
        .map((node) => node[entityAttributesProperty].is_close);
      const trues = marks.filter((mark) => mark === true).length;

      expect(Math.abs(trues / marks.length - 0.9)).toBeLessThan(0.06);
    });

    it('leaves untapped alters without the attribute at the declared missing rate', () => {
      const harness = setUp({
        alters: 1500,
        codebook: codebookWith({
          probabilityTrue: 0.5,
          missingProbability: 0.3,
        }),
        stage: stageWith({ prompts: [highlightsCloseness] }),
      });
      runStage(harness);

      const untouched = harness
        .nodes()
        .filter(
          (node) => node[entityAttributesProperty].is_close === undefined,
        ).length;

      expect(Math.abs(untouched / 1500 - 0.3)).toBeLessThan(0.05);
    });

    it('does not highlight where the prompt only displays the variable', () => {
      const harness = setUp({
        alters: 5,
        stage: stageWith({
          prompts: [
            {
              ...arrangeOnly,
              highlight: { allowHighlighting: false, variable: 'is_close' },
            },
          ],
        }),
      });
      runStage(harness);

      for (const node of harness.nodes()) {
        expect(node[entityAttributesProperty].is_close).toBeUndefined();
      }
    });
  });

  describe('a stopped walk', () => {
    it('applies only the prompts below the bound', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [createsFriends, highlightsCloseness],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness, 1);

      expect(edgesOfType(harness, 'friend')).toHaveLength(6);
      for (const node of harness.nodes()) {
        expect(node[entityAttributesProperty].is_close).toBeUndefined();
      }
    });

    it('does nothing at all at a bound of zero', () => {
      const harness = setUp({
        alters: 4,
        stage: stageWith({
          prompts: [createsFriends],
          synthetic: constantDensity(1),
        }),
      });
      runStage(harness, 0);

      expect(harness.network.edges).toEqual([]);
      expect(positions(harness)).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    });
  });

  it('refuses a subject the codebook does not define', () => {
    const protocol = parseProtocol(codebookWith(), [
      priorStage,
      stageWith({ prompts: [arrangeOnly] }),
    ]);
    Object.assign(protocol.stages[1] ?? {}, {
      subject: { entity: 'node', type: 'ghost' },
    });
    const harness = harnessFor(protocol);

    expect(() => runStage(harness)).toThrow(/node type "ghost"/);
  });

  it('draws the same sociogram twice from one seed', () => {
    const stage = stageWith({
      prompts: [createsFriends],
      synthetic: {
        topology: {
          metric: 'density',
          distribution: { distribution: 'beta', mean: 0.3, sd: 0.15 },
        },
      },
    });
    const first = setUp({ alters: 8, stage, seed: 99 });
    const second = setUp({ alters: 8, stage, seed: 99 });
    runStage(first);
    runStage(second);

    expect(second.network).toEqual(first.network);
  });
});
