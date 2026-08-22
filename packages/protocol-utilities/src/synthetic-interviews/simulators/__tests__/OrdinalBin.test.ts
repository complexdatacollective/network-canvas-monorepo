import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import { simulateOrdinalBin } from '../OrdinalBin';
import { harnessFor, type Harness, parseProtocol } from './harness';

const CLOSENESS = [
  { label: 'Distant', value: 1 },
  { label: 'Neutral', value: 2 },
  { label: 'Close', value: 3 },
];

const codebookWith = (
  synthetic?: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        closeness: {
          name: 'closeness',
          type: 'ordinal',
          component: 'LikertScale',
          options: CLOSENESS,
          ...(synthetic ? { synthetic } : {}),
        },
        age: { name: 'age', type: 'number' },
        ...extra,
      },
    },
  },
});

/** The stage that named the alters this one sorts. */
const priorStage = {
  id: 'earlier',
  type: 'NameGeneratorQuickAdd',
  label: 'Earlier',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  prompts: [{ id: 'earlier-prompt', text: 'Who did you know?' }],
};

const DEFAULT_PROMPTS = [
  {
    id: 'p1',
    text: 'How close?',
    variable: 'closeness',
    color: 'ord-color-seq-1',
  },
];

const stageWith = ({
  prompts = DEFAULT_PROMPTS,
  filter,
}: { prompts?: Record<string, unknown>[]; filter?: unknown } = {}) => ({
  id: 'ordinal-bin',
  type: 'OrdinalBin',
  label: 'Closeness',
  subject: { entity: 'node', type: 'person' },
  prompts,
  ...(filter ? { filter } : {}),
});

const setUp = ({
  stage = stageWith(),
  codebook = codebookWith(),
  alters = 0,
  attributes,
  corrupt,
}: {
  stage?: Record<string, unknown>;
  codebook?: unknown;
  alters?: number;
  attributes?: (index: number) => Record<string, VariableValue>;
  corrupt?: Record<string, unknown>;
} = {}): Harness => {
  const protocol = parseProtocol(codebook, [priorStage, stage]);
  if (corrupt) Object.assign(protocol.stages[1] ?? {}, corrupt);
  const harness = harnessFor(protocol);
  harness.seedAlters(alters, attributes ? { attributes } : {});
  return harness;
};

const runStage = (harness: Harness, promptBound?: number): void => {
  const stage = harness.context.protocol.stages[1];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateOrdinalBin(
    stage as Extract<Stage, { type: 'OrdinalBin' }>,
    harness.context,
    promptBound,
  );
};

const binnedValues = (harness: Harness): unknown[] =>
  harness.nodes().map((node) => node[entityAttributesProperty].closeness);

describe('simulateOrdinalBin', () => {
  it('sorts every alter the stage shows into a bin', () => {
    const harness = setUp({ alters: 12 });
    runStage(harness);

    for (const value of binnedValues(harness)) {
      expect([1, 2, 3]).toContain(value);
    }
  });

  it('only ever writes one of the variable’s own option values', () => {
    const harness = setUp({ alters: 60 });
    runStage(harness);

    const values = new Set(binnedValues(harness));
    expect(
      [...values].every((value) => [1, 2, 3].includes(Number(value))),
    ).toBe(true);
  });

  it('creates nobody', () => {
    // Nothing is elicited here: a bin sorts the alters it is given.
    const harness = setUp({ alters: 5 });
    runStage(harness);

    expect(harness.nodes()).toHaveLength(5);
  });

  it('produces nothing on an empty network', () => {
    const harness = setUp();
    runStage(harness);

    expect(harness.nodes()).toHaveLength(0);
  });

  it('leaves alters of another node type alone', () => {
    const harness = setUp({ alters: 3 });
    harness.engine.addNode({
      nodeType: 'place',
      uid: 'place-1',
      attributeData: { name: 'Somewhere' },
      allowUnknownAttributes: true,
      currentStep: 0,
    });
    runStage(harness);

    const place = harness
      .nodes()
      .find((node) => node[entityPrimaryKeyProperty] === 'place-1');

    expect(place?.[entityAttributesProperty].closeness).toBeUndefined();
  });

  it('writes one value per prompt', () => {
    const harness = setUp({
      alters: 6,
      codebook: codebookWith(undefined, {
        frequency: {
          name: 'frequency',
          type: 'ordinal',
          component: 'LikertScale',
          options: CLOSENESS,
        },
      }),
      stage: stageWith({
        prompts: [
          ...DEFAULT_PROMPTS,
          {
            id: 'p2',
            text: 'How often?',
            variable: 'frequency',
            color: 'ord-color-seq-2',
          },
        ],
      }),
    });
    runStage(harness);

    for (const node of harness.nodes()) {
      expect([1, 2, 3]).toContain(node[entityAttributesProperty].closeness);
      expect([1, 2, 3]).toContain(node[entityAttributesProperty].frequency);
    }
  });

  it('applies only the prompts below a stop-at bound', () => {
    const harness = setUp({
      alters: 6,
      codebook: codebookWith(undefined, {
        frequency: {
          name: 'frequency',
          type: 'ordinal',
          component: 'LikertScale',
          options: CLOSENESS,
        },
      }),
      stage: stageWith({
        prompts: [
          ...DEFAULT_PROMPTS,
          {
            id: 'p2',
            text: 'How often?',
            variable: 'frequency',
            color: 'ord-color-seq-2',
          },
        ],
      }),
    });
    runStage(harness, 1);

    for (const node of harness.nodes()) {
      expect([1, 2, 3]).toContain(node[entityAttributesProperty].closeness);
      expect(node[entityAttributesProperty].frequency).toBeUndefined();
    }
  });

  describe('the stage filter', () => {
    const filter = {
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
    };

    it('sorts only the alters that pass it', () => {
      const harness = setUp({
        stage: stageWith({ filter }),
        alters: 6,
        attributes: (index) => ({ name: `Alter ${index}`, age: index * 20 }),
      });
      runStage(harness);

      for (const node of harness.nodes()) {
        const age = Number(node[entityAttributesProperty].age);
        const binned = node[entityAttributesProperty].closeness;
        if (age > 30) {
          expect([1, 2, 3]).toContain(binned);
        } else {
          expect(binned).toBeUndefined();
        }
      }
    });
  });

  describe('the variable’s synthetic descriptor', () => {
    it('honours declared option weights', () => {
      // `Close` is weighted twenty times the others, which are left to the
      // default weight of one.
      const harness = setUp({
        alters: 400,
        codebook: codebookWith({ optionWeights: [{ value: 3, weight: 20 }] }),
      });
      runStage(harness);

      const values = binnedValues(harness);
      const close = values.filter((value) => value === 3).length;

      expect(close / values.length).toBeGreaterThan(0.8);
    });

    it('never draws an option weighted to zero', () => {
      const harness = setUp({
        alters: 200,
        codebook: codebookWith({
          optionWeights: [
            { value: 1, weight: 0 },
            { value: 2, weight: 0 },
          ],
        }),
      });
      runStage(harness);

      expect(new Set(binnedValues(harness))).toEqual(new Set([3]));
    });

    it('places every alter whatever missingness the author declares', () => {
      // The bin affords no way to SKIP a node while placing the others —
      // total placement is the interaction's design (maintainer ruling,
      // 2026-08-21), so the implied `required` resolves missingness to zero.
      const harness = setUp({
        alters: 200,
        codebook: codebookWith({ missingProbability: 0.25 }),
      });
      runStage(harness);

      expect(binnedValues(harness).filter((v) => v === undefined)).toEqual([]);
    });

    it('places everyone when the variable declares no missingness', () => {
      const harness = setUp({ alters: 50 });
      runStage(harness);

      expect(binnedValues(harness).filter((v) => v === undefined)).toEqual([]);
    });
  });

  describe('protocols the codebook contradicts', () => {
    it('refuses a subject the codebook does not define', () => {
      const harness = setUp({
        alters: 2,
        corrupt: { subject: { entity: 'node', type: 'ghost' } },
      });

      expect(() => runStage(harness)).toThrow(/node type "ghost"/);
    });

    it('refuses a prompt variable that is not ordinal', () => {
      const harness = setUp({
        alters: 2,
        corrupt: {
          prompts: [
            {
              id: 'p1',
              text: 'How old?',
              variable: 'age',
              color: 'ord-color-seq-1',
            },
          ],
        },
      });

      expect(() => runStage(harness)).toThrow(/not an ordinal/);
    });
  });
});

describe('a filter that reacts to the stage’s own writes', () => {
  it('re-derives the alters before each prompt', () => {
    // The stage shows only people not yet sorted, and the first prompt sorts
    // everyone it shows — so by the second prompt the runtime's selector,
    // which re-runs the filter after every write, shows nobody at all. A
    // snapshot taken before the first prompt would hand the second prompt
    // alters the participant could no longer see.
    const harness = setUp({
      alters: 6,
      codebook: codebookWith(undefined, {
        mood: {
          name: 'mood',
          type: 'ordinal',
          component: 'LikertScale',
          options: CLOSENESS,
        },
      }),
      stage: stageWith({
        prompts: [
          ...DEFAULT_PROMPTS,
          {
            id: 'p2',
            text: 'And their mood?',
            variable: 'mood',
            color: 'ord-color-seq-2',
          },
        ],
        filter: {
          join: 'AND',
          rules: [
            {
              id: 'rule-1',
              type: 'node',
              options: {
                type: 'person',
                attribute: 'closeness',
                operator: 'NOT_EXISTS',
              },
            },
          ],
        },
      }),
    });
    runStage(harness);

    for (const node of harness.nodes()) {
      expect(node[entityAttributesProperty].closeness).toBeDefined();
      expect(node[entityAttributesProperty].mood).toBeUndefined();
    }
  });
});
