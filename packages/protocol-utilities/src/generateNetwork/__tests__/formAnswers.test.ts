import { describe, expect, it } from 'vitest';

import {
  type ContentNodes,
  dynamicValueNameFor,
  type LocalizedString,
  printContentDocument,
  type Stage,
  TRUE_CASE,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import { ENGLISH_FORMS } from '../../__tests__/englishForms.ts';
import { testId } from '../../__tests__/testId.ts';
import { generateNetwork } from '../../generateNetwork.ts';

// A form's fields are answered only where a participant sees them: the
// fields that the form's document places in the participant's language, in
// the versions of its logic blocks that are shown. The interview clears the
// answer to a hidden field when the form is submitted, so the network never
// stores one.

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);

const PERSON = 'person';
const KNOWS = 'knows';

const HAS_PARTNER = testId('has-partner');
const PARTNER_NAME = testId('partner-name');
const AGE = testId('age');
const NEVER_SHOWN = testId('never-shown');
const READS_NEVER_SHOWN = testId('reads-never-shown');
const NAME = testId('name');
const CLOSE = testId('close');
const HOW_OFTEN = testId('how-often');
const SPANISH_ONLY = testId('spanish-only');
const MET_AT_WORK = testId('met-at-work');
const WORKPLACE = testId('workplace');
const CLOSE_CONDITION = testId('close-condition');

const field = (variable: string) =>
  ({ kind: 'field', fieldId: `field-${variable}` }) as const;

const formField = (variable: string) => ({
  id: `field-${variable}`,
  variable,
  prompt: { en: 'Question' },
});

const en = (text: string): LocalizedString => ({ en: text });

/** A logic block that shows `content` only when a Boolean value is true. */
const whenTrue = (
  role: 'ego' | 'node' | 'edge',
  variableId: string,
  content: ContentNodes,
): ContentNodes[number] => ({
  kind: 'logic',
  logic: {
    kind: 'answers',
    value: dynamicValueNameFor({ kind: 'attribute', role, variableId }),
    missing: [],
    versions: [{ caseKey: TRUE_CASE, content }],
    other: [],
  },
});

/** A logic block that shows `content` only to the participant. */
const onlyForTheParticipant = (
  content: ContentNodes,
): ContentNodes[number] => ({
  kind: 'logic',
  logic: { kind: 'participant', participant: content, otherwise: [] },
});

const codebook: Codebook = {
  ego: {
    variables: {
      [HAS_PARTNER]: { name: 'has_partner', type: 'boolean' },
      [PARTNER_NAME]: { name: 'partner_name', type: 'text' },
      [AGE]: { name: 'age', type: 'number' },
      [NEVER_SHOWN]: { name: 'never_shown', type: 'boolean' },
      [READS_NEVER_SHOWN]: { name: 'reads_never_shown', type: 'text' },
    },
  },
  node: {
    [PERSON]: {
      color: 'node-color-seq-1',
      variables: {
        [NAME]: { name: 'name', type: 'text' },
        [CLOSE]: { name: 'close', type: 'boolean' },
        [HOW_OFTEN]: { name: 'how_often', type: 'number' },
        [SPANISH_ONLY]: { name: 'spanish_only', type: 'text' },
      },
    },
  },
  edge: {
    [KNOWS]: {
      color: 'edge-color-seq-1',
      variables: {
        [MET_AT_WORK]: { name: 'met_at_work', type: 'boolean' },
        [WORKPLACE]: { name: 'workplace', type: 'text' },
      },
    },
  },
};

const egoForm = (
  content: ContentNodes,
  variables: string[],
  id = testId('ego-form'),
): Stage =>
  ({
    id,
    label: en('About you'),
    type: 'EgoForm',
    form: {
      content: en(printContentDocument(content)),
      fields: variables.map(formField),
    },
  }) as unknown as Stage;

const nameGenerator = (
  content: ContentNodes = [field(NAME)],
  variables: string[] = [NAME],
): Stage =>
  ({
    id: testId('name-generator'),
    label: en('Name generator'),
    type: 'NameGenerator',
    subject: { entity: 'node', type: PERSON },
    form: {
      title: en('Add a person'),
      content: en(printContentDocument(content)),
      fields: variables.map(formField),
    },
    prompts: [{ id: testId('name-generator-prompt'), text: en('Who?') }],
    behaviours: { minNodes: 6, maxNodes: 6 },
  }) as unknown as Stage;

const alterForm = (
  content: LocalizedString,
  variables: string[],
  extra: Record<string, unknown> = {},
): Stage =>
  ({
    id: testId('alter-form'),
    label: en('About each person'),
    type: 'AlterForm',
    subject: { entity: 'node', type: PERSON },
    form: { content, fields: variables.map(formField) },
    ...extra,
  }) as unknown as Stage;

const dyadCensus: Stage = {
  id: testId('dyad-census'),
  label: en('Who knows whom'),
  type: 'DyadCensus',
  subject: { entity: 'node', type: PERSON },
  prompts: [
    {
      id: testId('dyad-census-prompt'),
      text: en('Do they know each other?'),
      createEdge: KNOWS,
    },
  ],
} as unknown as Stage;

const alterEdgeForm = (content: ContentNodes, variables: string[]): Stage =>
  ({
    id: testId('alter-edge-form'),
    label: en('About each relationship'),
    type: 'AlterEdgeForm',
    subject: { entity: 'edge', type: KNOWS },
    form: {
      content: en(printContentDocument(content)),
      fields: variables.map(formField),
    },
  }) as unknown as Stage;

const run = (stages: Stage[], seed: number, formLanguage?: string): NcNetwork =>
  generateNetwork({
    ...ENGLISH_FORMS,
    codebook,
    stages,
    seed,
    ...(formLanguage === undefined ? {} : { formLanguage }),
  }).network;

const egoAttributesOf = (network: NcNetwork) =>
  network.ego[entityAttributesProperty];

describe('generateNetwork answers only the fields a participant sees', () => {
  it('answers a field in a logic block only when its logic shows it', () => {
    const stage = egoForm(
      [field(HAS_PARTNER), whenTrue('ego', HAS_PARTNER, [field(PARTNER_NAME)])],
      [HAS_PARTNER, PARTNER_NAME],
    );

    const outcomes = SEEDS.map((seed) => egoAttributesOf(run([stage], seed)));

    for (const attributes of outcomes) {
      expect(attributes[HAS_PARTNER]).toBeTypeOf('boolean');
      if (attributes[HAS_PARTNER] === true) {
        expect(attributes[PARTNER_NAME]).toBeTypeOf('string');
      } else {
        expect(attributes).not.toHaveProperty(PARTNER_NAME);
      }
    }
    // Both versions of the block are reached, so neither branch above is
    // vacuous.
    expect(outcomes.some((a) => a[HAS_PARTNER] === true)).toBe(true);
    expect(outcomes.some((a) => a[HAS_PARTNER] === false)).toBe(true);
  });

  it('never stores an answer to a field that logic always hides', () => {
    // An Ego Form describes no node, so a version for the participant (a
    // Family Pedigree's logic) is never shown on it.
    const stage = egoForm(
      [field(AGE), onlyForTheParticipant([field(NEVER_SHOWN)])],
      [AGE, NEVER_SHOWN],
    );

    for (const seed of SEEDS) {
      const attributes = egoAttributesOf(run([stage], seed));
      expect(attributes[AGE]).toBeTypeOf('number');
      expect(attributes).not.toHaveProperty(NEVER_SHOWN);
    }
  });

  it('hides a field whose logic reads the answer to a hidden field', () => {
    // READS_NEVER_SHOWN is shown when NEVER_SHOWN is true. NEVER_SHOWN is
    // never shown, so the participant cannot answer it, and its drawn value
    // must not reveal the field that reads it.
    const stage = egoForm(
      [
        field(AGE),
        onlyForTheParticipant([field(NEVER_SHOWN)]),
        whenTrue('ego', NEVER_SHOWN, [field(READS_NEVER_SHOWN)]),
      ],
      [AGE, NEVER_SHOWN, READS_NEVER_SHOWN],
    );

    for (const seed of SEEDS) {
      const attributes = egoAttributesOf(run([stage], seed));
      expect(attributes).not.toHaveProperty(NEVER_SHOWN);
      expect(attributes).not.toHaveProperty(READS_NEVER_SHOWN);
    }
  });

  it('answers a name generator form as each person is added', () => {
    const stage = nameGenerator(
      [field(NAME), field(CLOSE), whenTrue('node', CLOSE, [field(HOW_OFTEN)])],
      [NAME, CLOSE, HOW_OFTEN],
    );

    const nodes = SEEDS.flatMap((seed) => run([stage], seed).nodes);
    for (const node of nodes) {
      const attributes = node[entityAttributesProperty];
      if (attributes[CLOSE] === true) {
        expect(attributes[HOW_OFTEN]).toBeTypeOf('number');
      } else {
        expect(attributes).not.toHaveProperty(HOW_OFTEN);
      }
    }
    expect(
      nodes.some((node) => node[entityAttributesProperty][CLOSE] === true),
    ).toBe(true);
    expect(
      nodes.some((node) => node[entityAttributesProperty][CLOSE] === false),
    ).toBe(true);
  });

  it('reads the conditions of the stage for each node of an alter form', () => {
    const content: ContentNodes = [
      field(CLOSE),
      {
        kind: 'logic',
        logic: {
          kind: 'conditions',
          versions: [
            {
              conditionId: CLOSE_CONDITION,
              when: 'met',
              content: [field(HOW_OFTEN)],
            },
          ],
          otherwise: [],
        },
      },
    ];
    const stage = alterForm(
      en(printContentDocument(content)),
      [CLOSE, HOW_OFTEN],
      {
        conditions: {
          [CLOSE_CONDITION]: {
            about: 'node',
            rules: [
              {
                id: testId('close-rule'),
                type: 'node',
                options: {
                  type: PERSON,
                  attribute: CLOSE,
                  operator: 'EXACTLY',
                  value: true,
                },
              },
            ],
          },
        },
      },
    );

    const nodes = SEEDS.flatMap(
      (seed) => run([nameGenerator(), stage], seed).nodes,
    );
    for (const node of nodes) {
      const attributes = node[entityAttributesProperty];
      expect(attributes[CLOSE]).toBeTypeOf('boolean');
      if (attributes[CLOSE] === true) {
        expect(attributes[HOW_OFTEN]).toBeTypeOf('number');
      } else {
        expect(attributes).not.toHaveProperty(HOW_OFTEN);
      }
    }
    expect(
      nodes.some((node) => node[entityAttributesProperty][CLOSE] === true),
    ).toBe(true);
    expect(
      nodes.some((node) => node[entityAttributesProperty][CLOSE] === false),
    ).toBe(true);
  });

  it('answers an alter edge form for each edge as its logic shows it', () => {
    const stage = alterEdgeForm(
      [field(MET_AT_WORK), whenTrue('edge', MET_AT_WORK, [field(WORKPLACE)])],
      [MET_AT_WORK, WORKPLACE],
    );

    const edges = SEEDS.flatMap(
      (seed) => run([nameGenerator(), dyadCensus, stage], seed).edges,
    );
    for (const edge of edges) {
      const attributes = edge[entityAttributesProperty];
      if (attributes[MET_AT_WORK] === true) {
        expect(attributes[WORKPLACE]).toBeTypeOf('string');
      } else {
        expect(attributes).not.toHaveProperty(WORKPLACE);
      }
    }
    expect(
      edges.some((edge) => edge[entityAttributesProperty][MET_AT_WORK]),
    ).toBe(true);
    expect(
      edges.some(
        (edge) => edge[entityAttributesProperty][MET_AT_WORK] === false,
      ),
    ).toBe(true);
  });

  it('answers the fields that the form places in the participant’s language', () => {
    // The Spanish form asks a field that the English form does not.
    const stage = alterForm(
      {
        en: printContentDocument([field(CLOSE)]),
        es: printContentDocument([field(CLOSE), field(SPANISH_ONLY)]),
      },
      [CLOSE, SPANISH_ONLY],
    );

    const attributesIn = (formLanguage?: string) =>
      run([nameGenerator(), stage], 1, formLanguage).nodes.map(
        (node) => node[entityAttributesProperty],
      );

    const english = attributesIn();
    const spanish = attributesIn('es');
    expect(english.length).toBeGreaterThan(0);
    for (const attributes of english) {
      expect(attributes[CLOSE]).toBeTypeOf('boolean');
      expect(attributes).not.toHaveProperty(SPANISH_ONLY);
    }
    for (const attributes of spanish) {
      expect(attributes[CLOSE]).toBeTypeOf('boolean');
      expect(attributes[SPANISH_ONLY]).toBeTypeOf('string');
    }
    // A language that the form is not written in reads the closest related
    // one: Mexican Spanish reads the Spanish form.
    for (const attributes of attributesIn('es-MX')) {
      expect(attributes[SPANISH_ONLY]).toBeTypeOf('string');
    }
  });

  it('reads a form without a document in the participant’s language in the protocol’s default language', () => {
    // Spanish was written first, but English is the protocol's default, and
    // there is no French document: the interview shows French participants
    // the English form, so the Spanish-only field is never answered.
    const stage = alterForm(
      {
        es: printContentDocument([field(CLOSE), field(SPANISH_ONLY)]),
        en: printContentDocument([field(CLOSE)]),
      },
      [CLOSE, SPANISH_ONLY],
    );

    const nodes = generateNetwork({
      codebook,
      stages: [nameGenerator(), stage],
      seed: 1,
      formLanguage: 'fr',
      localization: { defaultLocale: 'en', locales: ['en', 'es', 'fr'] },
    }).network.nodes;

    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node[entityAttributesProperty][CLOSE]).toBeTypeOf('boolean');
      expect(node[entityAttributesProperty]).not.toHaveProperty(SPANISH_ONLY);
    }
  });
});

describe('generateNetwork answers several Ego Forms as the interview submits each', () => {
  // The interview writes only the fields that the submitted form asks: it
  // stores those that are shown and clears those that logic hides. Every
  // other ego attribute keeps the value that an earlier form stored.
  const first = egoForm(
    [field(HAS_PARTNER), whenTrue('ego', HAS_PARTNER, [field(PARTNER_NAME)])],
    [HAS_PARTNER, PARTNER_NAME],
    testId('first-ego-form'),
  );

  it('never answers a field that an earlier form hid and a later form does not ask', () => {
    const later = egoForm([field(AGE)], [AGE], testId('later-ego-form'));

    const outcomes = SEEDS.map((seed) =>
      egoAttributesOf(run([first, later], seed)),
    );
    for (const attributes of outcomes) {
      expect(attributes[AGE]).toBeTypeOf('number');
      expect(attributes[HAS_PARTNER]).toBeTypeOf('boolean');
      if (attributes[HAS_PARTNER] === true) {
        expect(attributes[PARTNER_NAME]).toBeTypeOf('string');
      } else {
        expect(attributes).not.toHaveProperty(PARTNER_NAME);
      }
      // No form asks these, so no participant answers them.
      expect(attributes).not.toHaveProperty(NEVER_SHOWN);
      expect(attributes).not.toHaveProperty(READS_NEVER_SHOWN);
    }
    expect(outcomes.some((a) => a[HAS_PARTNER] === false)).toBe(true);
    expect(outcomes.some((a) => a[HAS_PARTNER] === true)).toBe(true);
  });

  it('keeps the answers to the fields that only an earlier form asks', () => {
    const later = egoForm([field(AGE)], [AGE], testId('later-ego-form'));

    for (const seed of SEEDS) {
      const earlier = egoAttributesOf(run([first], seed));
      const after = egoAttributesOf(run([first, later], seed));
      expect(after[HAS_PARTNER]).toBe(earlier[HAS_PARTNER]);
      expect(after[PARTNER_NAME]).toBe(earlier[PARTNER_NAME]);
    }
  });

  it('shows a later form’s fields by the answers that an earlier form stored', () => {
    // The later form asks the partner's name only of a participant who said
    // on the first form that they have a partner, and clears nothing else.
    const answersFirst = egoForm(
      [field(HAS_PARTNER)],
      [HAS_PARTNER],
      testId('first-ego-form'),
    );
    const later = egoForm(
      [whenTrue('ego', HAS_PARTNER, [field(PARTNER_NAME)])],
      [PARTNER_NAME],
      testId('later-ego-form'),
    );

    const outcomes = SEEDS.map((seed) =>
      egoAttributesOf(run([answersFirst, later], seed)),
    );
    for (const attributes of outcomes) {
      expect(attributes[HAS_PARTNER]).toBeTypeOf('boolean');
      if (attributes[HAS_PARTNER] === true) {
        expect(attributes[PARTNER_NAME]).toBeTypeOf('string');
      } else {
        expect(attributes).not.toHaveProperty(PARTNER_NAME);
      }
    }
    expect(outcomes.some((a) => a[HAS_PARTNER] === false)).toBe(true);
    expect(outcomes.some((a) => a[HAS_PARTNER] === true)).toBe(true);
  });

  it('answers a field that an earlier form hid when a later form shows it', () => {
    const later = egoForm(
      [field(PARTNER_NAME)],
      [PARTNER_NAME],
      testId('later-ego-form'),
    );

    for (const seed of SEEDS) {
      expect(
        egoAttributesOf(run([first, later], seed))[PARTNER_NAME],
      ).toBeTypeOf('string');
    }
  });
});

describe('generateNetwork gives a form’s logic what the interview always knows', () => {
  // While a form is on screen the interview always knows today's date, the
  // label of the node that the form describes and the labels of the two
  // nodes that an edge form's edge joins. Logic that shows a field only when
  // one of them is known always shows it, and its version for when the value
  // is missing never shows.
  const whenKnown = (
    value: Parameters<typeof dynamicValueNameFor>[0],
    known: ContentNodes,
    missing: ContentNodes,
  ): ContentNodes[number] => ({
    kind: 'logic',
    logic: {
      kind: 'answers',
      value: dynamicValueNameFor(value),
      missing,
      versions: [],
      other: known,
    },
  });

  it('reads today’s date as known on an Ego Form', () => {
    const stage = egoForm(
      [
        whenKnown(
          { kind: 'intrinsic', name: 'now' },
          [field(AGE)],
          [field(NEVER_SHOWN)],
        ),
      ],
      [AGE, NEVER_SHOWN],
    );

    for (const seed of SEEDS) {
      const attributes = egoAttributesOf(run([stage], seed));
      expect(attributes[AGE]).toBeTypeOf('number');
      expect(attributes).not.toHaveProperty(NEVER_SHOWN);
    }
  });

  it('reads the label of the person being added as known on a name generator form', () => {
    const stage = nameGenerator(
      [
        field(NAME),
        whenKnown(
          { kind: 'label', role: 'node' },
          [field(CLOSE)],
          [field(HOW_OFTEN)],
        ),
      ],
      [NAME, CLOSE, HOW_OFTEN],
    );

    const nodes = SEEDS.flatMap((seed) => run([stage], seed).nodes);
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node[entityAttributesProperty][CLOSE]).toBeTypeOf('boolean');
      expect(node[entityAttributesProperty]).not.toHaveProperty(HOW_OFTEN);
    }
  });

  it('reads the label of each person as known on an alter form', () => {
    const stage = alterForm(
      en(
        printContentDocument([
          whenKnown(
            { kind: 'label', role: 'node' },
            [field(CLOSE)],
            [field(HOW_OFTEN)],
          ),
        ]),
      ),
      [CLOSE, HOW_OFTEN],
    );

    const nodes = SEEDS.flatMap(
      (seed) => run([nameGenerator(), stage], seed).nodes,
    );
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node[entityAttributesProperty][CLOSE]).toBeTypeOf('boolean');
      expect(node[entityAttributesProperty]).not.toHaveProperty(HOW_OFTEN);
    }
  });

  it('reads the labels of the two people an edge joins as known on an alter edge form', () => {
    const stage = alterEdgeForm(
      [
        whenKnown(
          { kind: 'label', role: 'edgeFrom' },
          [field(MET_AT_WORK)],
          [],
        ),
        whenKnown({ kind: 'label', role: 'edgeTo' }, [field(WORKPLACE)], []),
      ],
      [MET_AT_WORK, WORKPLACE],
    );

    const edges = SEEDS.flatMap(
      (seed) => run([nameGenerator(), dyadCensus, stage], seed).edges,
    );
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(edge[entityAttributesProperty][MET_AT_WORK]).toBeTypeOf('boolean');
      expect(edge[entityAttributesProperty][WORKPLACE]).toBeTypeOf('string');
    }
  });
});
