import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CATEGORICAL_OTHER_BIN_PROBABILITY,
  type Stage,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { simulateCategoricalBin } from '../CategoricalBin';
import { harnessFor, type Harness, parseProtocol } from './harness';

const GROUPS = [
  { label: 'Family', value: 'family' },
  { label: 'Friends', value: 'friends' },
  { label: 'Work', value: 'work' },
];

const codebookWith = (
  synthetic?: Record<string, unknown>,
  otherSynthetic?: Record<string, unknown>,
) => ({
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        group: {
          name: 'group',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: GROUPS,
          ...(synthetic ? { synthetic } : {}),
        },
        groupOther: {
          name: 'groupOther',
          type: 'text',
          component: 'Text',
          ...(otherSynthetic ? { synthetic: otherSynthetic } : {}),
        },
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

const stageWith = (prompt: Record<string, unknown> = {}) => ({
  id: 'categorical-bin',
  type: 'CategoricalBin',
  label: 'Groups',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Which group?', variable: 'group', ...prompt }],
});

const setUp = ({
  stage = stageWith(),
  codebook = codebookWith(),
  alters = 0,
  corrupt,
}: {
  stage?: Record<string, unknown>;
  codebook?: unknown;
  alters?: number;
  corrupt?: Record<string, unknown>;
} = {}): Harness => {
  const protocol = parseProtocol(codebook, [priorStage, stage]);
  if (corrupt) Object.assign(protocol.stages[1] ?? {}, corrupt);
  const harness = harnessFor(protocol);
  harness.seedAlters(alters);
  return harness;
};

const runStage = (harness: Harness): void => {
  const stage = harness.context.protocol.stages[1];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateCategoricalBin(
    stage as Extract<Stage, { type: 'CategoricalBin' }>,
    harness.context,
    undefined,
  );
};

describe('simulateCategoricalBin', () => {
  it('writes a single-element array, as a bin drop does', () => {
    // An alter sits in ONE bin however many options the variable offers, so
    // the value is never a multi-select list here.
    const harness = setUp({ alters: 20 });
    runStage(harness);

    for (const node of harness.nodes()) {
      const value = node[entityAttributesProperty].group;
      expect(Array.isArray(value)).toBe(true);
      expect(value).toHaveLength(1);
      expect(['family', 'friends', 'work']).toContain((value as string[])[0]);
    }
  });

  it('creates nobody and produces nothing on an empty network', () => {
    const empty = setUp();
    runStage(empty);
    expect(empty.nodes()).toHaveLength(0);

    const populated = setUp({ alters: 4 });
    runStage(populated);
    expect(populated.nodes()).toHaveLength(4);
  });

  it('honours declared option weights', () => {
    const harness = setUp({
      alters: 400,
      codebook: codebookWith({
        optionWeights: [{ value: 'work', weight: 20 }],
      }),
    });
    runStage(harness);

    const work = harness
      .nodes()
      .filter(
        (node) =>
          (node[entityAttributesProperty].group as string[])[0] === 'work',
      ).length;

    expect(work / 400).toBeGreaterThan(0.8);
  });

  it('places every alter whatever missingness the author declares', () => {
    // The bin affords no way to SKIP a node while placing the others — total
    // placement is the interaction's design (maintainer ruling, 2026-08-21).
    // The interface therefore implies `required`, and an authored
    // missingProbability resolves to zero exactly as quick-add's does.
    const harness = setUp({
      alters: 200,
      codebook: codebookWith({ missingProbability: 0.25 }),
    });
    runStage(harness);

    for (const node of harness.nodes()) {
      expect(node[entityAttributesProperty].group).toBeDefined();
    }
  });

  it('a selection table that can draw zero is refused at parse', () => {
    // "Sometimes nothing" on a bin-written variable describes a state the
    // interface cannot produce — the same affordance argument as authored
    // missingness — so the schema's bin refinement refuses the table
    // outright rather than generation quietly leaving alters in the bucket.
    expect(() =>
      setUp({
        alters: 20,
        codebook: codebookWith({
          selectionCount: { probabilities: [{ count: 0, probability: 1 }] },
        }),
      }),
    ).toThrow(/exactly one bin/);
  });

  describe('the other bin', () => {
    // A parse resolves the odds onto every prompt that sets `otherVariable`,
    // so the simulator reads them straight off the prompt with no fallback of
    // its own, exactly as it reads the count off a stage.
    const withOther = (
      otherBinProbability = DEFAULT_CATEGORICAL_OTHER_BIN_PROBABILITY,
    ) =>
      stageWith({
        otherVariable: 'groupOther',
        otherVariablePrompt: 'Which other group?',
        otherOptionLabel: 'Other',
        synthetic: { otherBinProbability },
      });

    it('writes free text and unsets the categorical', () => {
      // The pair is how the interface distinguishes "none of these" from "not
      // yet sorted"; a node holding both describes a state it cannot produce.
      const harness = setUp({ stage: withOther(), alters: 300 });
      runStage(harness);

      const other = harness
        .nodes()
        .filter(
          (node) => node[entityAttributesProperty].groupOther !== undefined,
        );

      expect(other.length).toBeGreaterThan(0);
      for (const node of other) {
        expect(node[entityAttributesProperty].group).toBeUndefined();
        expect(typeof node[entityAttributesProperty].groupOther).toBe('string');
      }
    });

    it('clears the free text when a regular bin takes the alter back', () => {
      // Decision 16, the reverse direction: an alter the first prompt dropped
      // in the other bin and the second sorted normally must not keep both
      // halves of the pair. Every alter goes to the other bin on the first
      // prompt and to a regular bin on the second, so the assertion is about
      // every one of them.
      const harness = setUp({
        alters: 40,
        stage: {
          ...withOther(1),
          prompts: [
            {
              id: 'p1',
              text: 'Which group?',
              variable: 'group',
              otherVariable: 'groupOther',
              otherVariablePrompt: 'Which other group?',
              otherOptionLabel: 'Other',
              synthetic: { otherBinProbability: 1 },
            },
            {
              id: 'p2',
              text: 'And now?',
              variable: 'group',
              otherVariable: 'groupOther',
              otherVariablePrompt: 'Which other group?',
              otherOptionLabel: 'Other',
              synthetic: { otherBinProbability: 0 },
            },
          ],
        },
      });
      runStage(harness);

      for (const node of harness.nodes()) {
        expect(node[entityAttributesProperty].groupOther).toBeUndefined();
        expect(node[entityAttributesProperty].group).toHaveLength(1);
      }
    });

    it('keeps the other bin with a blank text when the draw is unanswered', () => {
      // Reaching the other bin and typing nothing is a state the live dialog
      // permits: its field is genuinely optional unless the codebook says
      // otherwise, and a blank submission stores '' with the categorical
      // unset (CategoricalBin.tsx `handleOtherSubmit`, pinned by its
      // otherValidation tests). Every simulated choice here selects the other
      // bin, so every alter must land there — abandoning the choice for a
      // regular bin would make `otherBinProbability: 1` produce no other-bin
      // answers at all.
      const harness = setUp({
        stage: withOther(1),
        alters: 40,
        codebook: codebookWith(undefined, { missingProbability: 1 }),
      });
      runStage(harness);

      for (const node of harness.nodes()) {
        expect(node[entityAttributesProperty].groupOther).toBe('');
        expect(node[entityAttributesProperty].group).toBeUndefined();
      }
    });

    it('is not used when the prompt offers none', () => {
      const harness = setUp({ alters: 200 });
      runStage(harness);

      for (const node of harness.nodes()) {
        expect(node[entityAttributesProperty].groupOther).toBeUndefined();
      }
    });

    it('sends most alters to the other bin at the odds the prompt declares', () => {
      // The point of the field: a researcher whose category list covers their
      // participants badly says so on the prompt that asks the question, and
      // generation follows it rather than a rate of its own.
      const harness = setUp({ stage: withOther(0.9), alters: 300 });
      runStage(harness);

      const other = harness
        .nodes()
        .filter(
          (node) => node[entityAttributesProperty].groupOther !== undefined,
        ).length;

      expect(other / 300).toBeGreaterThan(0.8);
    });

    it('sends nobody there at declared odds of 0', () => {
      // An author saying their categories are exhaustive. The interface still
      // renders the bin — the prompt sets otherVariable — but no alter ever
      // lands in it, and every one of them is sorted normally instead.
      const harness = setUp({ stage: withOther(0), alters: 300 });
      runStage(harness);

      for (const node of harness.nodes()) {
        expect(node[entityAttributesProperty].groupOther).toBeUndefined();
        expect(node[entityAttributesProperty].group).toBeDefined();
      }
    });
  });

  describe('protocols the codebook contradicts', () => {
    it('refuses a prompt variable that is not categorical', () => {
      const harness = setUp({
        alters: 2,
        corrupt: {
          prompts: [{ id: 'p1', text: 'Which group?', variable: 'name' }],
        },
      });

      expect(() => runStage(harness)).toThrow(/not a categorical/);
    });

    it('refuses a subject the codebook does not define', () => {
      const harness = setUp({
        alters: 2,
        corrupt: { subject: { entity: 'node', type: 'ghost' } },
      });

      expect(() => runStage(harness)).toThrow(/node type "ghost"/);
    });
  });

  describe('a filter that reacts to the stage’s own writes', () => {
    it('re-derives the alters before each prompt', () => {
      // The stage shows only people not yet sorted, and the first prompt sorts
      // everyone it shows — so by the second prompt the runtime's selector,
      // which re-runs the filter after every write, shows nobody at all. A
      // snapshot taken before the first prompt would hand the second prompt
      // alters the participant could no longer see.
      const withMood = {
        node: {
          person: {
            ...codebookWith().node.person,
            variables: {
              ...codebookWith().node.person.variables,
              mood: {
                name: 'mood',
                type: 'categorical',
                component: 'CheckboxGroup',
                options: GROUPS,
              },
            },
          },
        },
      };
      const harness = setUp({
        alters: 6,
        codebook: withMood,
        stage: {
          ...stageWith(),
          prompts: [
            { id: 'p1', text: 'Which group?', variable: 'group' },
            { id: 'p2', text: 'And their mood?', variable: 'mood' },
          ],
          filter: {
            join: 'AND',
            rules: [
              {
                id: 'rule-1',
                type: 'node',
                options: {
                  type: 'person',
                  attribute: 'group',
                  operator: 'NOT_EXISTS',
                },
              },
            ],
          },
        },
      });
      runStage(harness);

      for (const node of harness.nodes()) {
        expect(node[entityAttributesProperty].group).toBeDefined();
        expect(node[entityAttributesProperty].mood).toBeUndefined();
      }
    });
  });
});
