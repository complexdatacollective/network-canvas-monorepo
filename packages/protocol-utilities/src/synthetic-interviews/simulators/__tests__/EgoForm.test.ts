import { describe, expect, it } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import { simulateEgoForm } from '../EgoForm';
import { harnessFor, type Harness, parseProtocol, TEST_SEED } from './harness';

const EDUCATION = [
  { label: 'School', value: 'school' },
  { label: 'College', value: 'college' },
  { label: 'University', value: 'university' },
];

const DEFAULT_EGO_VARIABLES: Record<string, unknown> = {
  name: { name: 'name', type: 'text', component: 'Text' },
  age: {
    name: 'age',
    type: 'number',
    component: 'Number',
    validation: { minValue: 18, maxValue: 90 },
  },
  education: {
    name: 'education',
    type: 'ordinal',
    component: 'RadioGroup',
    options: EDUCATION,
  },
  // Defined on the ego but asked for by no field below, so it stands for
  // every variable a protocol collects somewhere else.
  postcode: { name: 'postcode', type: 'text', component: 'Text' },
};

const codebookWith = (
  variables: Record<string, unknown> = DEFAULT_EGO_VARIABLES,
) => ({
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        nickname: { name: 'nickname', type: 'text', component: 'Text' },
      },
    },
  },
  ego: { variables },
});

const DEFAULT_FIELDS = [
  { variable: 'name', prompt: 'What is your name?' },
  { variable: 'age', prompt: 'How old are you?' },
  { variable: 'education', prompt: 'How far did you get in education?' },
];

const stageWith = (
  fields: Record<string, unknown>[] = DEFAULT_FIELDS,
  id = 'ego-form',
) => ({
  id,
  type: 'EgoForm',
  label: 'About you',
  introductionPanel: { title: 'About you', text: 'Tell us about yourself.' },
  form: { fields },
});

const setUp = ({
  stages = [stageWith()],
  codebook = codebookWith(),
  seed = TEST_SEED,
  after,
}: {
  stages?: Record<string, unknown>[];
  codebook?: unknown;
  seed?: number;
  after?: (protocol: CurrentProtocol) => void;
} = {}): Harness => {
  const protocol = parseProtocol(codebook, stages);
  after?.(protocol);
  return harnessFor(protocol, { seed });
};

const runStage = (harness: Harness, index = 0, promptBound?: number): void => {
  const stage = harness.context.protocol.stages[index];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateEgoForm(
    stage as Extract<Stage, { type: 'EgoForm' }>,
    harness.context,
    promptBound,
  );
};

/** The ego attributes after running the form at `index` of a fresh session. */
const answer = (
  options: Parameters<typeof setUp>[0] = {},
): Record<string, VariableValue> => {
  const harness = setUp(options);
  runStage(harness);
  return harness.ego();
};

describe('simulateEgoForm', () => {
  it('answers every field the form collects', () => {
    const attributes = answer();

    expect(typeof attributes.name).toBe('string');
    expect(typeof attributes.age).toBe('number');
    expect(['school', 'college', 'university']).toContain(
      attributes.education as string,
    );
  });

  it('leaves an ego variable no field asks about unanswered', () => {
    // The codebook defines `postcode`, but this form does not ask for it —
    // inventing it here would report an answer the participant never gave.
    expect(answer().postcode).toBeUndefined();
  });

  it('honours the codebook’s own validation', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { age } = answer({ seed });

      expect(Number(age)).toBeGreaterThanOrEqual(18);
      expect(Number(age)).toBeLessThanOrEqual(90);
    }
  });

  it('creates no nodes or edges', () => {
    // Everything an ego form collects belongs to the participant, who has
    // existed since the interview began.
    const harness = setUp();
    runStage(harness);

    expect(harness.nodes()).toEqual([]);
    expect(harness.network.edges).toEqual([]);
  });

  it('records nothing in stage metadata', () => {
    const harness = setUp();
    runStage(harness);

    expect(harness.engine.draft.stageMetadata).toEqual({});
  });

  it('writes nothing when the participant only arrived', () => {
    // A form has no prompts, so a `stopAt` bound of zero is a screen reached
    // and not submitted.
    const harness = setUp();
    runStage(harness, 0, 0);

    expect(harness.ego()).toEqual({});
  });

  it('leaves a field blank at the declared missing rate', () => {
    const codebook = codebookWith({
      name: { name: 'name', type: 'text', component: 'Text' },
      age: {
        name: 'age',
        type: 'number',
        component: 'Number',
        validation: { minValue: 18, maxValue: 90 },
        synthetic: { missingProbability: 0.4 },
      },
    });

    // A form field the participant leaves blank is a question that went
    // unanswered, which is a state this interface can genuinely produce.
    const blank = Array.from(
      { length: 500 },
      (_, seed) =>
        answer({
          codebook,
          seed,
          stages: [
            stageWith([
              { variable: 'name', prompt: 'What is your name?' },
              { variable: 'age', prompt: 'How old are you?' },
            ]),
          ],
        }).age,
    ).filter((age) => age === undefined).length;

    expect(Math.abs(blank / 500 - 0.4)).toBeLessThan(0.06);
  });

  it('honours a declared option-weight table', () => {
    const codebook = codebookWith({
      education: {
        name: 'education',
        type: 'ordinal',
        component: 'RadioGroup',
        options: EDUCATION,
        synthetic: { optionWeights: [{ value: 'college', weight: 40 }] },
      },
    });

    const college = Array.from(
      { length: 200 },
      (_, seed) =>
        answer({
          codebook,
          seed,
          stages: [stageWith([{ variable: 'education', prompt: 'How far?' }])],
        }).education,
    ).filter((education) => education === 'college').length;

    expect(college / 200).toBeGreaterThan(0.8);
  });

  it('draws a field from the distribution its variable declares', () => {
    // The simulator draws nothing itself — every value comes from the
    // constraint engine — so this is the end-to-end proof that an author's
    // declared shape reaches the answers an ego form records, rather than the
    // validation window alone deciding them.
    const codebook = codebookWith({
      age: {
        name: 'age',
        type: 'number',
        component: 'Number',
        validation: { minValue: 18, maxValue: 90 },
        synthetic: { distribution: 'normal', mean: 65, sd: 2 },
      },
    });

    const ages = Array.from({ length: 200 }, (_, seed) =>
      Number(
        answer({
          codebook,
          seed,
          stages: [
            stageWith([{ variable: 'age', prompt: 'How old are you?' }]),
          ],
        }).age,
      ),
    );

    const mean = ages.reduce((total, age) => total + age, 0) / ages.length;
    expect(Math.abs(mean - 65)).toBeLessThan(1);
    // Uniform across 18-90 would put most draws nowhere near the declared
    // centre; this is what makes the assertion about the descriptor.
    expect(ages.every((age) => age > 55 && age < 75)).toBe(true);
  });

  describe('a second form asking the same question', () => {
    // Both forms run in ONE session, so the value generator has moved on by
    // the time the second one runs: a re-drawn answer would be a different
    // answer, which is what makes the equality below a real claim.
    const twoForms = (secondFields?: Record<string, unknown>[]) => [
      stageWith(secondFields ? [secondFields[0]!] : DEFAULT_FIELDS),
      stageWith(secondFields ?? DEFAULT_FIELDS, 'ego-form-2'),
    ];

    it('keeps the answer the participant already gave', () => {
      // The interface pre-fills every field from the ego's current attributes
      // and submits what it was shown, so asking again records the same
      // answer rather than a participant who changed their age between two
      // screens.
      const harness = setUp({
        stages: [stageWith(), stageWith(undefined, 'ego-form-2')],
      });
      runStage(harness, 0);
      const before = { ...harness.ego() };

      runStage(harness, 1);

      expect(harness.ego()).toStrictEqual(before);
    });

    it('answers the fields it adds', () => {
      const harness = setUp({
        stages: twoForms([
          { variable: 'name', prompt: 'What is your name?' },
          { variable: 'age', prompt: 'How old are you?' },
        ]),
      });
      runStage(harness, 0);
      const named = harness.ego().name;

      runStage(harness, 1);

      expect(harness.ego().name).toBe(named);
      expect(typeof harness.ego().age).toBe('number');
    });

    it('draws against what the participant has already answered', () => {
      // `retired` must exceed the `age` an earlier stage recorded, so the
      // rules relating one answer to another have to see the real session
      // rather than a freshly drawn `age`.
      const codebook = codebookWith({
        // Narrow and high, so a `retired` drawn against nothing — anywhere in
        // its own 18-90 — would fall below it about half the time, and fifty
        // seeds could not all pass by luck.
        age: {
          name: 'age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 50, maxValue: 60 },
        },
        retired: {
          name: 'retired',
          type: 'number',
          component: 'Number',
          validation: {
            minValue: 18,
            maxValue: 90,
            greaterThanVariable: 'age',
          },
        },
      });

      for (let seed = 0; seed < 50; seed += 1) {
        const harness = setUp({
          codebook,
          seed,
          stages: [
            stageWith([{ variable: 'age', prompt: 'How old are you?' }]),
            stageWith(
              [{ variable: 'retired', prompt: 'When did you retire?' }],
              'ego-form-2',
            ),
          ],
        });
        runStage(harness, 0);
        runStage(harness, 1);

        const { age, retired } = harness.ego();
        expect(Number(retired)).toBeGreaterThan(Number(age));
      }
    });
  });

  describe('protocols the codebook contradicts', () => {
    it('refuses a codebook that defines no ego variables', () => {
      // Emptied after parsing: the schema's own cross-reference check refuses
      // a form field naming a variable that does not exist, so this is the
      // shape a host reaches generation with when its protocol was never
      // parsed or was edited afterwards.
      const harness = setUp({
        after: (protocol) => {
          delete protocol.codebook.ego;
        },
      });

      expect(() => runStage(harness)).toThrow(
        /codebook defines no ego variables/,
      );
    });

    it('skips a field naming a variable the codebook does not define', () => {
      const harness = setUp({
        after: (protocol) => {
          delete protocol.codebook.ego?.variables?.postcode;
        },
        stages: [
          stageWith([
            { variable: 'name', prompt: 'What is your name?' },
            { variable: 'postcode', prompt: 'Something undefined' },
          ]),
        ],
      });
      runStage(harness);

      expect(typeof harness.ego().name).toBe('string');
      expect(harness.ego().postcode).toBeUndefined();
    });
  });
});
