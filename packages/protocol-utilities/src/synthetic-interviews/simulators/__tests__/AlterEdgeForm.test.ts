import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import { simulateAlterEdgeForm } from '../AlterEdgeForm';
import { harnessFor, type Harness, parseProtocol, TEST_SEED } from './harness';

/**
 * C4 for AlterEdgeForm: the same deck of slides an alter form shows, asking
 * about ties rather than people.
 *
 * Two things separate it from its sibling and are asserted here: the slides
 * come from the network's EDGES, and the primitive that records them carries
 * no step — an edge holds no `stageId` or `promptIDs`, because the runtime
 * stamps provenance onto nodes alone.
 */

const STRENGTHS = [
  { label: 'Weak', value: 'weak' },
  { label: 'Strong', value: 'strong' },
];

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        nickname: { name: 'nickname', type: 'text', component: 'Text' },
        postcode: { name: 'postcode', type: 'text', component: 'Text' },
      },
    },
  },
  edge: {
    friend: {
      name: 'Friend',
      color: 'edge-color-seq-1',
      variables: {
        howLong: {
          name: 'howLong',
          type: 'number',
          component: 'Number',
          validation: { minValue: 1, maxValue: 40 },
        },
        strength: {
          name: 'strength',
          type: 'ordinal',
          component: 'RadioGroup',
          options: STRENGTHS,
        },
        // Defined on the type and asked for by no field below.
        contested: { name: 'contested', type: 'boolean' },
      },
    },
    colleague: {
      name: 'Colleague',
      color: 'edge-color-seq-2',
      variables: {
        sameTeam: { name: 'sameTeam', type: 'boolean' },
      },
    },
  },
};

const DEFAULT_FIELDS = [
  { variable: 'howLong', prompt: 'How long have you known them?' },
  { variable: 'strength', prompt: 'How strong is the tie?' },
];

const priorStage = {
  id: 'earlier',
  type: 'NameGeneratorQuickAdd',
  label: 'Earlier',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'nickname',
  prompts: [{ id: 'earlier-prompt', text: 'Who do you know?' }],
};

const IN_LOCAL_AREA = {
  join: 'AND',
  rules: [
    {
      id: 'rule-1',
      type: 'node',
      options: {
        type: 'person',
        attribute: 'postcode',
        operator: 'EXACTLY',
        value: 'local',
      },
    },
  ],
};

const stageWith = ({
  fields = DEFAULT_FIELDS,
  filter,
}: {
  fields?: Record<string, unknown>[];
  filter?: Record<string, unknown>;
} = {}) => ({
  id: 'alter-edge-form',
  type: 'AlterEdgeForm',
  label: 'About each tie',
  subject: { entity: 'edge', type: 'friend' },
  form: { fields },
  introductionPanel: {
    title: 'About each tie',
    text: 'A few questions about the connections you drew.',
  },
  ...(filter ? { filter } : {}),
});

type EdgeSpec = {
  uid: string;
  from: string;
  to: string;
  edgeType?: string;
  attributeData?: Record<string, VariableValue>;
};

const setUp = ({
  stage = stageWith(),
  alters = 4,
  alterAttributes,
  edges = [
    { uid: 'edge-0', from: 'alter-0', to: 'alter-1' },
    { uid: 'edge-1', from: 'alter-1', to: 'alter-2' },
  ],
  seed = TEST_SEED,
  captureTrace = false,
}: {
  stage?: Record<string, unknown>;
  alters?: number;
  alterAttributes?: (index: number) => Record<string, VariableValue>;
  edges?: EdgeSpec[];
  seed?: number;
  captureTrace?: boolean;
} = {}): Harness => {
  const protocol = parseProtocol(CODEBOOK, [priorStage, stage]);
  const harness = harnessFor(protocol, { seed, captureTrace });

  harness.seedAlters(alters, {
    currentStep: 0,
    attributes: alterAttributes ?? (() => ({})),
  });

  for (const edge of edges) {
    harness.engine.addEdge({
      edgeType: edge.edgeType ?? 'friend',
      uid: edge.uid,
      from: edge.from,
      to: edge.to,
      ...(edge.attributeData ? { attributeData: edge.attributeData } : {}),
      currentStep: 0,
    });
  }

  return harness;
};

const runStage = (harness: Harness, promptBound?: number): void => {
  const stage = harness.context.protocol.stages[1];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateAlterEdgeForm(
    stage as Extract<Stage, { type: 'AlterEdgeForm' }>,
    harness.context,
    promptBound,
  );
};

const answersOf = (harness: Harness, uid: string) =>
  harness.network.edges.find(
    (edge) => edge[entityPrimaryKeyProperty] === uid,
  )?.[entityAttributesProperty];

describe('simulateAlterEdgeForm', () => {
  it('answers the form for every tie on screen', () => {
    const harness = setUp();
    runStage(harness);

    for (const edge of harness.network.edges) {
      const answers = edge[entityAttributesProperty];
      expect(typeof answers.howLong).toBe('number');
      expect(['weak', 'strong']).toContain(answers.strength as string);
    }
  });

  it('records exactly the fields the form names', () => {
    const harness = setUp();
    runStage(harness);

    for (const edge of harness.network.edges) {
      expect(Object.keys(edge[entityAttributesProperty]).toSorted()).toEqual([
        'howLong',
        'strength',
      ]);
    }
  });

  it('patches only the form’s fields, slide by slide', () => {
    const harness = setUp({ captureTrace: true });
    const from = harness.trace().length;
    runStage(harness);

    const patches = harness.trace().slice(from);
    expect(patches).toHaveLength(2);
    for (const action of patches) {
      expect(action.type).toBe('updateEdge');
      if (action.type !== 'updateEdge') continue;
      expect(action.payload.attributePatch.unset).toEqual([]);
      expect(Object.keys(action.payload.attributePatch.set).toSorted()).toEqual(
        ['howLong', 'strength'],
      );
    }
  });

  it('walks the ties in the network’s own order', () => {
    const harness = setUp({
      edges: [
        { uid: 'edge-2', from: 'alter-2', to: 'alter-3' },
        { uid: 'edge-0', from: 'alter-0', to: 'alter-1' },
        { uid: 'edge-1', from: 'alter-1', to: 'alter-2' },
      ],
      captureTrace: true,
    });
    const from = harness.trace().length;
    runStage(harness);

    const visited = harness
      .trace()
      .slice(from)
      .flatMap((action) =>
        action.type === 'updateEdge' ? [action.payload.edgeId] : [],
      );
    expect(visited).toEqual(['edge-2', 'edge-0', 'edge-1']);
  });

  it('leaves ties of another type alone', () => {
    const harness = setUp({
      edges: [
        { uid: 'edge-0', from: 'alter-0', to: 'alter-1' },
        {
          uid: 'work-0',
          from: 'alter-2',
          to: 'alter-3',
          edgeType: 'colleague',
          attributeData: { sameTeam: true },
        },
      ],
    });
    runStage(harness);

    expect(answersOf(harness, 'work-0')).toStrictEqual({ sameTeam: true });
  });

  it('asks only about the ties its filter admits', () => {
    // A filter that removes a person removes every tie to them: a connection
    // to somebody the stage does not show is one the participant cannot be
    // asked about.
    const harness = setUp({
      stage: stageWith({ filter: IN_LOCAL_AREA }),
      alterAttributes: (index) => ({
        postcode: index === 1 ? 'elsewhere' : 'local',
      }),
      edges: [
        { uid: 'mixed', from: 'alter-0', to: 'alter-1' },
        { uid: 'local', from: 'alter-0', to: 'alter-2' },
      ],
    });
    runStage(harness);

    expect(answersOf(harness, 'mixed')).toStrictEqual({});
    expect(answersOf(harness, 'local')?.howLong).toEqual(expect.any(Number));
  });

  it('leaves the tie carrying no provenance', () => {
    // Edges are the one entity the runtime stamps nothing onto, and
    // `updateEdge` is the one primitive that takes no step.
    const harness = setUp({ captureTrace: true });
    const from = harness.trace().length;
    runStage(harness);

    for (const action of harness.trace().slice(from)) {
      expect(Object.keys(action.payload).toSorted()).toEqual([
        'attributePatch',
        'edgeId',
      ]);
    }
    for (const edge of harness.network.edges) {
      expect(Object.keys(edge).toSorted()).toEqual([
        '_uid',
        'attributes',
        'from',
        'to',
        'type',
      ]);
    }
  });

  it('writes nothing at all when there are no ties on screen', () => {
    const harness = setUp({ edges: [], captureTrace: true });
    const from = harness.trace().length;
    runStage(harness);

    expect(harness.trace().slice(from)).toEqual([]);
  });

  it('writes nothing when the participant only arrived', () => {
    const harness = setUp({ captureTrace: true });
    const from = harness.trace().length;
    runStage(harness, 0);

    expect(harness.trace().slice(from)).toEqual([]);
  });

  it('keeps an answer the tie already carries', () => {
    // A tie-strength census sets its edge variable as it creates the edge; the
    // slide pre-fills from that and submits it back.
    //
    // Asserted on `howLong` rather than the two-option `strength`: a re-drawn
    // ordinal lands back on its old value half the time, so it could not tell
    // a kept answer from a lucky one. A number with forty places to land can.
    const harness = setUp({
      edges: [
        {
          uid: 'edge-0',
          from: 'alter-0',
          to: 'alter-1',
          attributeData: { howLong: 37 },
        },
      ],
    });
    runStage(harness);

    expect(answersOf(harness, 'edge-0')?.howLong).toBe(37);
    expect(['weak', 'strong']).toContain(
      answersOf(harness, 'edge-0')?.strength as string,
    );
  });

  it('creates nothing and records no metadata', () => {
    const harness = setUp();
    runStage(harness);

    expect(harness.nodes()).toHaveLength(4);
    expect(harness.network.edges).toHaveLength(2);
    expect(harness.ego()).toEqual({});
    expect(harness.engine.draft.stageMetadata).toEqual({});
  });

  it('honours the codebook’s own validation', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const harness = setUp({ seed });
      runStage(harness);

      for (const edge of harness.network.edges) {
        const howLong = Number(edge[entityAttributesProperty].howLong);
        expect(howLong).toBeGreaterThanOrEqual(1);
        expect(howLong).toBeLessThanOrEqual(40);
      }
    }
  });

  it('refuses a subject the codebook does not define', () => {
    const harness = setUp();
    delete (harness.context.protocol.codebook.edge as Record<string, unknown>)
      .friend;

    expect(() => runStage(harness)).toThrow(
      /which the codebook does not define/,
    );
  });
});
