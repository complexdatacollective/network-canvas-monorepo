import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import { simulateAlterForm } from '../AlterForm';
import { harnessFor, type Harness, parseProtocol, TEST_SEED } from './harness';

/**
 * C4 for AlterForm: a deck of slides over people the network already holds,
 * each slide recording exactly the fields its form names.
 *
 * The stage elicits nobody, so everything asserted here is about which alters
 * the deck put on screen — the stage's subject and filter — and what each
 * slide was allowed to write.
 */

const CLOSENESS = [
  { label: 'Distant', value: 'distant' },
  { label: 'Close', value: 'close' },
];

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        nickname: { name: 'nickname', type: 'text', component: 'Text' },
        age: {
          name: 'age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 18, maxValue: 90 },
        },
        closeness: {
          name: 'closeness',
          type: 'ordinal',
          component: 'RadioGroup',
          options: CLOSENESS,
        },
        // Defined on the type but asked for by no field below, so it stands
        // for every variable a protocol collects somewhere else. Doubles as
        // the attribute the filter fixture reads.
        postcode: { name: 'postcode', type: 'text', component: 'Text' },
      },
    },
    place: {
      name: 'Place',
      color: 'node-color-seq-2',
      shape: { default: 'circle' },
      variables: {
        placeName: { name: 'placeName', type: 'text', component: 'Text' },
      },
    },
  },
};

const DEFAULT_FIELDS = [
  { variable: 'nickname', prompt: 'What do you call them?' },
  { variable: 'age', prompt: 'How old are they?' },
  { variable: 'closeness', prompt: 'How close are you?' },
];

/** The stage the harness's seeded alters are attributed to. */
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
  id: 'alter-form',
  type: 'AlterForm',
  label: 'About each person',
  subject: { entity: 'node', type: 'person' },
  form: { fields },
  introductionPanel: {
    title: 'About each person',
    text: 'A few questions about everyone you named.',
  },
  ...(filter ? { filter } : {}),
});

const setUp = ({
  stage = stageWith(),
  alters = 3,
  attributes,
  seed = TEST_SEED,
  captureTrace = false,
}: {
  stage?: Record<string, unknown>;
  alters?: number;
  attributes?: (index: number) => Record<string, VariableValue>;
  seed?: number;
  captureTrace?: boolean;
} = {}): Harness => {
  const protocol = parseProtocol(CODEBOOK, [priorStage, stage]);
  const harness = harnessFor(protocol, { seed, captureTrace });

  harness.seedAlters(alters, {
    currentStep: 0,
    attributes: attributes ?? (() => ({})),
  });

  return harness;
};

const runStage = (harness: Harness, promptBound?: number): void => {
  const stage = harness.context.protocol.stages[1];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateAlterForm(
    stage as Extract<Stage, { type: 'AlterForm' }>,
    harness.context,
    promptBound,
  );
};

const answersOf = (harness: Harness, uid: string) =>
  harness.nodes().find((node) => node[entityPrimaryKeyProperty] === uid)?.[
    entityAttributesProperty
  ];

describe('simulateAlterForm', () => {
  it('answers the form for every alter on screen', () => {
    const harness = setUp({ alters: 4 });
    runStage(harness);

    for (const node of harness.nodes()) {
      const answers = node[entityAttributesProperty];
      expect(typeof answers.nickname).toBe('string');
      expect(typeof answers.age).toBe('number');
      expect(['distant', 'close']).toContain(answers.closeness as string);
    }
  });

  it('records exactly the fields the form names', () => {
    // `postcode` is on the codebook and on no slide, so answering it here
    // would report something no participant was asked.
    const harness = setUp();
    runStage(harness);

    for (const node of harness.nodes()) {
      expect(Object.keys(node[entityAttributesProperty]).toSorted()).toEqual([
        'age',
        'closeness',
        'nickname',
      ]);
    }
  });

  it('patches only the form’s fields, slide by slide', () => {
    // The claim is about the WRITES, not just the end state: a patch reaching
    // past its form would still leave a plausible-looking network.
    const harness = setUp({ alters: 3, captureTrace: true });
    const from = harness.trace().length;
    runStage(harness);

    const patches = harness.trace().slice(from);
    expect(patches).toHaveLength(3);
    for (const action of patches) {
      expect(action.type).toBe('updateNode');
      if (action.type !== 'updateNode') continue;
      expect(action.payload.attributePatch.unset).toEqual([]);
      expect(Object.keys(action.payload.attributePatch.set).toSorted()).toEqual(
        ['age', 'closeness', 'nickname'],
      );
    }
  });

  it('walks the alters in the network’s own order', () => {
    const harness = setUp({ alters: 4, captureTrace: true });
    const from = harness.trace().length;
    runStage(harness);

    const visited = harness
      .trace()
      .slice(from)
      .flatMap((action) =>
        action.type === 'updateNode' ? [action.payload.nodeId] : [],
      );
    expect(visited).toEqual(
      harness.nodes().map((node) => node[entityPrimaryKeyProperty]),
    );
  });

  it('leaves alters of another type alone', () => {
    const harness = setUp({ alters: 2 });
    harness.engine.addNode({
      nodeType: 'place',
      uid: 'place-1',
      attributeData: { placeName: 'Somewhere' },
      currentStep: 0,
    });
    runStage(harness);

    expect(answersOf(harness, 'place-1')).toStrictEqual({
      placeName: 'Somewhere',
    });
  });

  it('asks only about the alters its filter admits', () => {
    const harness = setUp({
      stage: stageWith({ filter: IN_LOCAL_AREA }),
      alters: 4,
      attributes: (index) => ({
        postcode: index % 2 === 0 ? 'local' : 'elsewhere',
      }),
    });
    runStage(harness);

    expect(answersOf(harness, 'alter-0')?.nickname).toEqual(expect.any(String));
    expect(answersOf(harness, 'alter-1')).toStrictEqual({
      postcode: 'elsewhere',
    });
  });

  it('writes nothing at all when nobody is on screen', () => {
    // The interface's own empty-items short-circuit: with no alters of this
    // type it leaves the stage rather than showing an empty deck. The stage
    // still completed, and the walk still charged its burden.
    const harness = setUp({ alters: 0, captureTrace: true });
    const from = harness.trace().length;
    runStage(harness);

    expect(harness.trace().slice(from)).toEqual([]);
  });

  it('writes nothing when its filter admits nobody', () => {
    const harness = setUp({
      stage: stageWith({ filter: IN_LOCAL_AREA }),
      alters: 3,
      attributes: () => ({ postcode: 'elsewhere' }),
      captureTrace: true,
    });
    const from = harness.trace().length;
    runStage(harness);

    expect(harness.trace().slice(from)).toEqual([]);
  });

  it('writes nothing when the participant only arrived', () => {
    const harness = setUp({ alters: 3, captureTrace: true });
    const from = harness.trace().length;
    runStage(harness, 0);

    expect(harness.trace().slice(from)).toEqual([]);
  });

  it('keeps an answer the alter already carries', () => {
    // The slide pre-fills from the alter's current attributes and submits what
    // it was shown, so asking again confirms rather than re-answers.
    const harness = setUp({
      alters: 3,
      attributes: (index) => ({ nickname: `Known ${index}` }),
    });
    runStage(harness);

    expect(
      harness.nodes().map((node) => node[entityAttributesProperty].nickname),
    ).toEqual(['Known 0', 'Known 1', 'Known 2']);
  });

  it('creates nothing and records no metadata', () => {
    const harness = setUp({ alters: 3 });
    runStage(harness);

    expect(harness.nodes()).toHaveLength(3);
    expect(harness.network.edges).toEqual([]);
    expect(harness.ego()).toEqual({});
    expect(harness.engine.draft.stageMetadata).toEqual({});
  });

  it('honours the codebook’s own validation', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const harness = setUp({ alters: 3, seed });
      runStage(harness);

      for (const node of harness.nodes()) {
        const age = Number(node[entityAttributesProperty].age);
        expect(age).toBeGreaterThanOrEqual(18);
        expect(age).toBeLessThanOrEqual(90);
      }
    }
  });

  it('draws a field from the distribution its variable declares', () => {
    // The simulator draws nothing itself, so this is the end-to-end proof that
    // an author's declared shape reaches the answers a slide records.
    const protocol = parseProtocol(
      {
        node: {
          person: {
            ...CODEBOOK.node.person,
            variables: {
              ...CODEBOOK.node.person.variables,
              age: {
                name: 'age',
                type: 'number',
                component: 'Number',
                validation: { minValue: 18, maxValue: 90 },
                synthetic: { distribution: 'normal', mean: 65, sd: 2 },
              },
            },
          },
        },
      },
      [priorStage, stageWith({ fields: [DEFAULT_FIELDS[1]!] })],
    );

    const ages: number[] = [];
    for (let seed = 0; seed < 40; seed += 1) {
      const harness = harnessFor(protocol, { seed });
      harness.seedAlters(5, { currentStep: 0, attributes: () => ({}) });
      const stage = harness.context.protocol.stages[1];
      simulateAlterForm(
        stage as Extract<Stage, { type: 'AlterForm' }>,
        harness.context,
        undefined,
      );
      for (const node of harness.nodes()) {
        ages.push(Number(node[entityAttributesProperty].age));
      }
    }

    const mean = ages.reduce((total, age) => total + age, 0) / ages.length;
    expect(Math.abs(mean - 65)).toBeLessThan(1);
    // Uniform across 18-90 would put most draws nowhere near the declared
    // centre; this is what makes the assertion about the descriptor.
    expect(ages.every((age) => age > 55 && age < 75)).toBe(true);
  });

  it('refuses a subject the codebook does not define', () => {
    const harness = setUp();
    delete (harness.context.protocol.codebook.node as Record<string, unknown>)
      .person;

    expect(() => runStage(harness)).toThrow(
      /which the codebook does not define/,
    );
  });
});

describe('a filter that reacts to the form’s own answers', () => {
  it('walks the deck the way the live index does over a shrinking list', () => {
    // The stage shows only people without a nickname, and the form collects
    // one: each submission removes its subject from the deck while the slide
    // index — a bare local integer in the runtime — keeps counting. The
    // second entity slides into the submitted position and is genuinely
    // skipped, so of three people the form reaches exactly the first and the
    // third, never a snapshot of all three.
    const harness = setUp({
      alters: 3,
      stage: stageWith({
        fields: [{ variable: 'nickname', prompt: 'What do you call them?' }],
        filter: {
          join: 'AND',
          rules: [
            {
              id: 'rule-1',
              type: 'node',
              options: {
                type: 'person',
                attribute: 'nickname',
                operator: 'NOT_EXISTS',
              },
            },
          ],
        },
      }),
    });
    runStage(harness);

    const nicknames = harness
      .nodes()
      .map((node) => node[entityAttributesProperty].nickname);
    expect(nicknames[0]).toBeDefined();
    expect(nicknames[1]).toBeUndefined();
    expect(nicknames[2]).toBeDefined();
  });
});

describe('prefilled values the form’s validators reject', () => {
  it('regenerates an invalid value and keeps a valid one', () => {
    // The form pre-fills each field from the entity and blocks advancing
    // until every field validates, so a roster-supplied age below `minValue`
    // is one the participant was made to correct — while a valid age is
    // confirmed as it stands, never redrawn.
    const harness = setUp({
      alters: 2,
      attributes: (index) => ({ age: index === 0 ? 5 : 25 }),
    });
    runStage(harness);

    const ages = harness
      .nodes()
      .map((node) => node[entityAttributesProperty].age);
    expect(typeof ages[0]).toBe('number');
    expect(ages[0] as number).toBeGreaterThanOrEqual(18);
    expect(ages[1]).toBe(25);
  });
});
