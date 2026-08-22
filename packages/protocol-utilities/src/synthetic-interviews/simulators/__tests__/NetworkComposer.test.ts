import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import { simulateNetworkComposer } from '../NetworkComposer';
import { readCanvasPosition } from '../shared/gridPlacement';
import { harnessFor, type Harness, parseProtocol } from './harness';

/**
 * C4 for NetworkComposer: the canvas adds people at grid positions carrying
 * only what the palette collects, fills the inspector's forms, stores hull
 * membership as `string[]`, and connects pairs with bare edges. Its
 * `{ automaticLayout }` metadata is a display preference and is never
 * generated.
 */

const GROUPS = [
  { label: 'Family', value: 'family' },
  { label: 'Work', value: 'work' },
];

const STRENGTHS = [
  { label: 'Weak', value: 1 },
  { label: 'Strong', value: 2 },
];

const codebookWith = (
  extraNodeVariables: Record<string, unknown> = {},
  extraEdgeVariables: Record<string, unknown> = {},
) => ({
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        age: { name: 'age', type: 'number', component: 'Number' },
        layout: { name: 'layout', type: 'layout' },
        group: {
          name: 'group',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: GROUPS,
        },
        ...extraNodeVariables,
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
          options: STRENGTHS,
        },
        ...extraEdgeVariables,
      },
    },
  },
});

const CONSTANT_COUNT = { distribution: 'constant', value: 8 };
const COMPLETE_TOPOLOGY = {
  metric: 'density',
  distribution: { distribution: 'constant', value: 1 },
};

const stageWith = ({
  synthetic = { count: CONSTANT_COUNT, topology: COMPLETE_TOPOLOGY },
  nodeForm,
  edges,
  convexHullVariable,
}: {
  synthetic?: Record<string, unknown>;
  nodeForm?: Record<string, unknown>;
  edges?: Record<string, unknown>[];
  convexHullVariable?: string;
} = {}) => ({
  id: 'composer',
  type: 'NetworkComposer',
  label: 'Compose the network',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layout',
  background: { concentricCircles: 4, skewedTowardCenter: true },
  synthetic,
  ...(nodeForm ? { nodeForm } : {}),
  ...(edges ? { edges } : {}),
  ...(convexHullVariable ? { convexHullVariable } : {}),
});

const FRIEND_EDGES = [
  {
    id: 'edge-entry',
    subject: { entity: 'edge', type: 'friend' },
    form: { fields: [{ variable: 'strength', component: 'LikertScale' }] },
  },
];

const setUp = ({
  stage = stageWith(),
  codebook = codebookWith(),
  seed,
}: {
  stage?: Record<string, unknown>;
  codebook?: unknown;
  seed?: number;
} = {}): Harness => {
  const protocol = parseProtocol(codebook, [stage]);
  return harnessFor(protocol, seed === undefined ? {} : { seed });
};

const runStage = (harness: Harness, promptBound?: number): void => {
  const stage = harness.context.protocol.stages[0];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateNetworkComposer(
    stage as Extract<Stage, { type: 'NetworkComposer' }>,
    harness.context,
    promptBound,
  );
};

const edges = (harness: Harness): NcEdge[] =>
  harness.engine.draft.network.edges;

describe('simulateNetworkComposer', () => {
  describe('adding people', () => {
    it('adds as many as the stage’s count asks for', () => {
      const harness = setUp();
      runStage(harness);

      expect(harness.nodes()).toHaveLength(8);
    });

    it('gives each one a name and nothing else the palette does not collect', () => {
      const harness = setUp();
      runStage(harness);

      for (const node of harness.nodes()) {
        const attributes = node[entityAttributesProperty];
        expect(Object.keys(attributes).toSorted()).toEqual(['layout', 'name']);
        expect(typeof attributes.name).toBe('string');
        expect(attributes.name).not.toBe('');
      }
    });

    it('places each one at a distinct grid cell inside the canvas', () => {
      const harness = setUp();
      runStage(harness);

      const seen = new Set<string>();
      for (const node of harness.nodes()) {
        const position = readCanvasPosition(
          node[entityAttributesProperty].layout,
        );
        if (position === undefined) {
          throw new Error('a composed node carries no canvas position');
        }
        expect(position.x).toBeGreaterThanOrEqual(0);
        expect(position.x).toBeLessThanOrEqual(1);
        expect(position.y).toBeGreaterThanOrEqual(0);
        expect(position.y).toBeLessThanOrEqual(1);
        seen.add(`${position.x},${position.y}`);
      }

      expect(seen.size).toBe(8);
    });

    it('adds nobody when the stage declares no count', () => {
      const harness = setUp({
        stage: stageWith({ synthetic: { topology: COMPLETE_TOPOLOGY } }),
      });
      runStage(harness);

      expect(harness.nodes()).toEqual([]);
    });

    it('names everybody even when the quick-add variable courts missingness', () => {
      // The interface refuses to create a node from a blank quick-add field,
      // so the schema imposes `required` on the variable behind the palette —
      // an authored `missingProbability`, even 1, describes nodes the
      // interface cannot make, and the interface-implied rule wins
      // (stricter-never-looser). Every drawn person therefore has a name;
      // the simulator's own blank-name guard stays as defence-in-depth for
      // input that never went through the schema.
      const harness = setUp({
        codebook: {
          ...codebookWith(),
          node: {
            person: {
              ...codebookWith().node.person,
              variables: {
                ...codebookWith().node.person.variables,
                name: {
                  name: 'name',
                  type: 'text',
                  component: 'Text',
                  synthetic: { missingProbability: 1 },
                },
              },
            },
          },
        },
      });
      runStage(harness);

      expect(harness.nodes().length).toBeGreaterThan(0);
      for (const node of harness.nodes()) {
        const name = node[entityAttributesProperty]['name'];
        expect(typeof name).toBe('string');
        expect(String(name).length).toBeGreaterThan(0);
      }
    });
  });

  describe('the inspector’s forms', () => {
    it('fills exactly the fields the node form names', () => {
      const harness = setUp({
        stage: stageWith({
          nodeForm: { fields: [{ variable: 'age', component: 'Number' }] },
        }),
      });
      runStage(harness);

      for (const node of harness.nodes()) {
        const attributes = node[entityAttributesProperty];
        expect(Object.keys(attributes).toSorted()).toEqual([
          'age',
          'layout',
          'name',
        ]);
        expect(typeof attributes.age).toBe('number');
      }
    });

    it('leaves an answer an earlier stage collected alone', () => {
      const harness = setUp({
        stage: stageWith({
          nodeForm: { fields: [{ variable: 'age', component: 'Number' }] },
        }),
      });
      harness.engine.addNode({
        nodeType: 'person',
        uid: 'earlier',
        attributeData: { name: 'Ada', age: 36 },
        currentStep: 0,
      });
      runStage(harness);

      const earlier = harness
        .nodes()
        .find((node) => node[entityPrimaryKeyProperty] === 'earlier');

      expect(earlier?.[entityAttributesProperty].age).toBe(36);
    });

    it('fills an edge form’s fields on the edges it drew', () => {
      const harness = setUp({ stage: stageWith({ edges: FRIEND_EDGES }) });
      runStage(harness);

      expect(edges(harness).length).toBeGreaterThan(0);
      for (const edge of edges(harness)) {
        expect([1, 2]).toContain(edge[entityAttributesProperty].strength);
      }
    });
  });

  describe('hull membership', () => {
    it('stores it as an array of the variable’s own option values', () => {
      const harness = setUp({
        stage: stageWith({ convexHullVariable: 'group' }),
      });
      runStage(harness);

      const memberships = harness
        .nodes()
        .map((node) => node[entityAttributesProperty].group)
        .filter((value) => value !== undefined);

      expect(memberships.length).toBeGreaterThan(0);
      for (const membership of memberships) {
        if (!Array.isArray(membership)) {
          throw new Error('hull membership is stored as an array');
        }
        for (const value of membership) {
          expect(typeof value).toBe('string');
          expect(['family', 'work']).toContain(value);
        }
      }
    });

    it('writes nothing for the hull when the stage declares none', () => {
      const harness = setUp();
      runStage(harness);

      for (const node of harness.nodes()) {
        expect(node[entityAttributesProperty].group).toBeUndefined();
      }
    });
  });

  describe('drawing ties', () => {
    it('connects every pair at a density of one', () => {
      const harness = setUp({ stage: stageWith({ edges: FRIEND_EDGES }) });
      runStage(harness);

      // 8 people is 28 unordered pairs.
      expect(edges(harness)).toHaveLength(28);
      for (const edge of edges(harness)) {
        expect(edge.type).toBe('friend');
      }
    });

    it('connects nobody at a density of zero', () => {
      const harness = setUp({
        stage: stageWith({
          edges: FRIEND_EDGES,
          synthetic: {
            count: CONSTANT_COUNT,
            topology: {
              metric: 'density',
              distribution: { distribution: 'constant', value: 0 },
            },
          },
        }),
      });
      runStage(harness);

      expect(edges(harness)).toEqual([]);
    });

    it('draws no ties when the stage configures no edge types', () => {
      const harness = setUp();
      runStage(harness);

      expect(edges(harness)).toEqual([]);
    });

    it('never connects one pair twice', () => {
      const harness = setUp({ stage: stageWith({ edges: FRIEND_EDGES }) });
      runStage(harness);

      const pairs = edges(harness).map((edge) =>
        [edge.from, edge.to].toSorted().join(' '),
      );

      expect(new Set(pairs).size).toBe(pairs.length);
    });

    it('gives edges no provenance fields', () => {
      // Edges carry no `stageId` and no `promptIDs`: the reducer stamps
      // neither, and an exporter reading one would report a tie to a prompt
      // that never asked about it.
      const harness = setUp({ stage: stageWith({ edges: FRIEND_EDGES }) });
      runStage(harness);

      for (const edge of edges(harness)) {
        expect(Object.keys(edge).toSorted()).toEqual([
          '_uid',
          'attributes',
          'from',
          'to',
          'type',
        ]);
      }
    });

    it('realises a mid-range density somewhere between the extremes', () => {
      const harness = setUp({
        stage: stageWith({
          edges: FRIEND_EDGES,
          synthetic: {
            count: CONSTANT_COUNT,
            topology: {
              metric: 'density',
              distribution: { distribution: 'constant', value: 0.5 },
            },
          },
        }),
      });
      runStage(harness);

      expect(edges(harness)).toHaveLength(14);
    });
  });

  it('writes no stage metadata', () => {
    // `{ automaticLayout }` records a display preference the operator toggled,
    // not anything a participant said.
    const harness = setUp({ stage: stageWith({ edges: FRIEND_EDGES }) });
    runStage(harness);

    expect(harness.engine.draft.stageMetadata).toEqual({});
  });

  it('composes nothing at a stop-at bound of zero', () => {
    const harness = setUp({ stage: stageWith({ edges: FRIEND_EDGES }) });
    runStage(harness, 0);

    expect(harness.nodes()).toEqual([]);
    expect(edges(harness)).toEqual([]);
  });

  describe('determinism', () => {
    it('composes the same network on the same seed', () => {
      const first = setUp({
        stage: stageWith({ edges: FRIEND_EDGES }),
        seed: 7,
      });
      runStage(first);
      const second = setUp({
        stage: stageWith({ edges: FRIEND_EDGES }),
        seed: 7,
      });
      runStage(second);

      expect(first.engine.draft.network).toEqual(second.engine.draft.network);
    });

    it('composes a different one on a different seed', () => {
      const first = setUp({
        stage: stageWith({ edges: FRIEND_EDGES }),
        seed: 7,
      });
      runStage(first);
      const second = setUp({
        stage: stageWith({ edges: FRIEND_EDGES }),
        seed: 8,
      });
      runStage(second);

      expect(
        first.nodes().map((node) => node[entityAttributesProperty].name),
      ).not.toEqual(
        second.nodes().map((node) => node[entityAttributesProperty].name),
      );
    });
  });

  describe('protocols the codebook contradicts', () => {
    it('refuses a subject the codebook does not define', () => {
      const protocol = parseProtocol(codebookWith(), [stageWith()]);
      Object.assign(protocol.stages[0] ?? {}, {
        subject: { entity: 'node', type: 'ghost' },
      });
      const harness = harnessFor(protocol);

      expect(() => runStage(harness)).toThrow(/node type "ghost"/);
    });

    it('refuses a quick-add variable that is not text', () => {
      const protocol = parseProtocol(codebookWith(), [stageWith()]);
      Object.assign(protocol.stages[0] ?? {}, { quickAdd: 'age' });
      const harness = harnessFor(protocol);

      expect(() => runStage(harness)).toThrow(/not a text variable/);
    });

    it('refuses a hull variable that is not categorical', () => {
      const protocol = parseProtocol(codebookWith(), [
        stageWith({ convexHullVariable: 'group' }),
      ]);
      Object.assign(protocol.stages[0] ?? {}, { convexHullVariable: 'age' });
      const harness = harnessFor(protocol);

      expect(() => runStage(harness)).toThrow(/not a categorical variable/);
    });
  });

  describe('the composer rendering overlay', () => {
    it('refuses a protocol whose reachable forms render one date through incompatible controls', () => {
      // The composer renders `met` at year resolution; an alter form elsewhere
      // renders the same stored value through the codebook's day-resolution
      // control. One value cannot describe both, and whichever form the
      // participant opens second would reject what the first collected.
      const protocol = parseProtocol(
        codebookWith({
          met: {
            name: 'met',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type: 'full' },
          },
        }),
        [
          stageWith({
            nodeForm: {
              fields: [
                {
                  variable: 'met',
                  component: 'DatePicker',
                  parameters: { type: 'year', min: '1990', max: '1995' },
                },
              ],
            },
          }),
          {
            id: 'alter-form',
            type: 'AlterForm',
            label: 'About each person',
            subject: { entity: 'node', type: 'person' },
            introductionPanel: { title: 'About', text: 'A few questions.' },
            form: {
              fields: [{ variable: 'met', prompt: 'When did you meet?' }],
            },
          },
        ],
      );
      const harness = harnessFor(protocol);

      expect(() => runStage(harness)).toThrow(/incompatible date controls/);
    });

    it('narrows a date field to the control the composer actually renders', () => {
      const harness = setUp({
        codebook: codebookWith({
          met: {
            name: 'met',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type: 'full' },
          },
        }),
        stage: stageWith({
          nodeForm: {
            fields: [
              {
                variable: 'met',
                component: 'DatePicker',
                parameters: { type: 'year', min: '1990', max: '1995' },
              },
            ],
          },
        }),
      });
      runStage(harness);

      for (const node of harness.nodes()) {
        const met = node[entityAttributesProperty].met;
        expect(typeof met).toBe('string');
        expect(String(met)).toMatch(/^199[0-5]$/);
      }
    });
  });
});
