import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import {
  testId,
  testTypeId,
  testVariableId,
  withTestCodebookIds,
} from '../../../__tests__/testIds.ts';
import {
  analyzeProtocolLocalization,
  expectedLocalesOf,
} from '../../../localization/analyzeProtocolLocalization.ts';
import { CONTENT_DOCUMENT_PROBLEMS } from '../../../localization/contentDocumentProblems.ts';
import { fieldBlockMarkdown } from '../../../localization/fieldBlock.ts';
import { formOf } from '../../../testing/fixtures.ts';
import { collectLocalizedStringsFromSchema } from '../../../utils/collectLocalizedStrings.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import { findDynamicAttributeProblems } from '../dynamic-attribute-validation.ts';
import {
  DynamicAttributeSchema,
  DynamicAttributesSchema,
  dynamicAttributeVersions,
} from '../dynamic-attributes.ts';
import { dynamicValueNameFor, optionCaseKey } from '../dynamic-value-names.ts';
import { ProtocolStructureSchema } from '../protocol-structure.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

const ATTRIBUTE_ID = testId('their-word');
const CONDITION_ID = testId('close');
const FIELD = testId('field-age');
const NAME_FIELD = testId('field-name');

const ATTRIBUTE = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: ATTRIBUTE_ID,
});
const nodeValue = (variable: string) =>
  dynamicValueNameFor({
    kind: 'attribute',
    role: 'node',
    variableId: testVariableId(variable),
  });
const CATEGORY = nodeValue('category');

type Definition = Record<string, unknown>;

/** A Per Alter Form whose question shows the dynamic attribute. */
const alterForm = (
  definitions: Record<string, Definition>,
  extra: Record<string, unknown> = {},
) => ({
  id: testId('alter-form'),
  type: 'AlterForm',
  label: localized('About them'),
  subject: { entity: 'node', type: 'person' },
  dynamicAttributes: definitions,
  form: formOf([
    {
      id: FIELD,
      variable: 'age',
      prompt: localized(`How old is {${ATTRIBUTE}}?`),
    },
  ]),
  ...extra,
});

const protocolWith = (
  stage: Record<string, unknown>,
  locales: readonly string[] = ['en'],
  defaultLocale = 'en',
) =>
  withFinishStage(
    withTestCodebookIds({
      ...createBaseProtocol(),
      localization: { defaultLocale, locales },
      stages: [stage],
    }),
  );

const problemsOf = (protocol: unknown) => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success
    ? []
    : result.error.issues.map(({ path, message }) => ({
        path: path.join('.'),
        message,
      }));
};

// The id of the "friend" option of the person's category, as the fixture
// gives it.
const friendOption = () => {
  const protocol = protocolWith(alterForm({}));
  const options = (
    protocol.codebook.node as Record<
      string,
      { variables: Record<string, { options?: { id?: string }[] }> }
    >
  )[testTypeId('person')]?.variables[testVariableId('category')]?.options;
  const id = options?.[0]?.id;
  if (id === undefined) throw new Error('No option id');
  return id;
};

const answers = (overrides: Definition = {}): Definition => ({
  logic: 'answers',
  value: CATEGORY,
  missing: localized('them'),
  answers: [
    {
      answer: optionCaseKey(friendOption()),
      wording: localized('your friend'),
    },
  ],
  other: localized('your relative'),
  ...overrides,
});

const AT = `stages.0.dynamicAttributes.${ATTRIBUTE_ID}`;

describe('DynamicAttributeSchema', () => {
  it.each([
    [
      'conditions',
      {
        logic: 'conditions',
        cases: [
          { condition: CONDITION_ID, when: 'met', wording: localized('a') },
        ],
        otherwise: localized('b'),
      },
    ],
    [
      'answers',
      {
        logic: 'answers',
        value: CATEGORY,
        missing: localized('a'),
        answers: [{ answer: 'true', wording: localized('b') }],
        other: localized('c'),
      },
    ],
    [
      'number',
      {
        logic: 'number',
        value: nodeValue('age'),
        missing: localized('their children'),
        wording: localized(
          '{count, plural, one {their child} other {their # children}}',
        ),
      },
    ],
    [
      'participant',
      {
        logic: 'participant',
        participant: localized('you'),
        otherwise: localized('they'),
      },
    ],
  ])('accepts %s logic', (_, definition) => {
    expect(DynamicAttributeSchema.safeParse(definition).success).toBe(true);
  });

  it('accepts an empty version, which shows nothing', () => {
    // A star shown only when the node is flagged.
    expect(
      DynamicAttributeSchema.safeParse({
        logic: 'answers',
        value: CATEGORY,
        missing: localized(''),
        answers: [{ answer: 'true', wording: localized('★') }],
        other: localized(''),
      }).success,
    ).toBe(true);
    for (const wording of [
      '',
      '{count, plural, one {} other {# children}}',
      '{count, plural, one {} other {}}',
    ]) {
      expect(
        DynamicAttributeSchema.safeParse({
          logic: 'number',
          value: nodeValue('age'),
          missing: localized(''),
          wording: localized(wording),
        }).success,
      ).toBe(true);
    }
  });

  it('refuses a number version that contains only spaces', () => {
    const result = DynamicAttributeSchema.safeParse({
      logic: 'number',
      value: nodeValue('age'),
      missing: localized(''),
      wording: localized('{count, plural, one { } other {# children}}'),
    });
    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      'The "one" version of this wording is blank.',
    ]);
  });

  it('refuses a version that contains only spaces', () => {
    const result = DynamicAttributeSchema.safeParse({
      logic: 'participant',
      participant: localized('you'),
      otherwise: localized('   '),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual([
      'otherwise.en',
    ]);
  });

  it('refuses logic it does not know, and a conditions definition without cases', () => {
    expect(
      DynamicAttributeSchema.safeParse({
        logic: 'random',
        otherwise: localized('x'),
      }).success,
    ).toBe(false);
    expect(
      DynamicAttributeSchema.safeParse({
        logic: 'conditions',
        cases: [],
        otherwise: localized('x'),
      }).success,
    ).toBe(false);
  });

  it('refuses wording of several lines', () => {
    expect(
      DynamicAttributeSchema.safeParse({
        logic: 'participant',
        participant: localized('you\n\nthere'),
        otherwise: localized('they'),
      }).success,
    ).toBe(false);
  });

  it('refuses an id that is not a UUID', () => {
    const result = DynamicAttributesSchema.safeParse({
      pronoun: {
        logic: 'participant',
        participant: localized('you'),
        otherwise: localized('they'),
      },
    });
    expect(result.error?.issues[0]?.message).toBe(
      'The dynamic attribute id "pronoun" is not a UUID. Every dynamic attribute id must be a UUID.',
    );
  });

  it('lists the versions of a definition in the order they are written', () => {
    expect(
      dynamicAttributeVersions({
        logic: 'answers',
        value: CATEGORY,
        missing: localized('a'),
        answers: [{ answer: 'true', wording: localized('b') }],
        other: localized('c'),
      }).map(({ role, path }) => [role, path]),
    ).toEqual([
      ['missing', ['missing']],
      ['answer', ['answers', 0, 'wording']],
      ['other', ['other']],
    ]);
  });
});

describe('the dynamic attributes of a stage', () => {
  it('accepts a dynamic attribute that its text shows', () => {
    expect(
      problemsOf(protocolWith(alterForm({ [ATTRIBUTE_ID]: answers() }))),
    ).toEqual([]);
  });

  it('refuses text that shows a dynamic attribute the stage does not have', () => {
    expect(problemsOf(protocolWith(alterForm({})))).toEqual([
      {
        path: 'stages.0.form.fields.0.prompt.en',
        message: expect.stringContaining(
          'a dynamic attribute that no longer exists',
        ),
      },
    ]);
  });

  it('refuses a dynamic attribute that no text of the stage shows', () => {
    const stage = alterForm({ [ATTRIBUTE_ID]: answers() });
    stage.form.fields[0]!.prompt = localized('How old are they?');
    expect(problemsOf(protocolWith(stage))).toEqual([
      {
        path: AT,
        message: 'This dynamic attribute is not used anywhere on this stage.',
      },
    ]);
  });

  it('refuses a case whose condition the stage does not have', () => {
    expect(
      problemsOf(
        protocolWith(
          alterForm({
            [ATTRIBUTE_ID]: {
              logic: 'conditions',
              cases: [
                {
                  condition: CONDITION_ID,
                  when: 'met',
                  wording: localized('your close friend'),
                },
              ],
              otherwise: localized('them'),
            },
          }),
        ),
      ),
    ).toEqual([
      {
        path: `${AT}.cases.0.condition`,
        message: 'The rules that choose this version no longer exist.',
      },
    ]);
  });

  it('refuses answers of an attribute that has none, and a number of an attribute that is not one', () => {
    expect(
      problemsOf(
        protocolWith(
          alterForm({
            [ATTRIBUTE_ID]: answers({ value: nodeValue('name'), answers: [] }),
          }),
        ),
      ),
    ).toEqual([
      {
        path: `${AT}.value`,
        message:
          'Only a categorical, ordinal or Boolean attribute can have a different wording for each answer.',
      },
    ]);
    expect(
      problemsOf(
        protocolWith(
          alterForm({
            [ATTRIBUTE_ID]: {
              logic: 'number',
              value: CATEGORY,
              missing: localized('them'),
              wording: localized('{count, plural, other {# of them}}'),
            },
          }),
        ),
      ),
    ).toEqual([
      {
        path: `${AT}.value`,
        message:
          'Only a number or scalar attribute can have wording for singular or plural numbers.',
      },
    ]);
  });

  it('refuses an answer given twice, and an answer the attribute does not have', () => {
    const friend = optionCaseKey(friendOption());
    expect(
      problemsOf(
        protocolWith(
          alterForm({
            [ATTRIBUTE_ID]: answers({
              answers: [
                { answer: friend, wording: localized('your friend') },
                { answer: friend, wording: localized('your pal') },
                {
                  answer: optionCaseKey(testId('deleted')),
                  wording: localized('gone'),
                },
              ],
            }),
          }),
        ),
      ),
    ).toEqual([
      {
        path: `${AT}.answers.1.answer`,
        message: 'This answer already has a version.',
      },
      {
        path: `${AT}.answers.2.answer`,
        message:
          'This version is for an answer that the attribute does not have.',
      },
    ]);
  });

  it('refuses a dynamic attribute whose value its stage cannot read', () => {
    expect(
      problemsOf(
        protocolWith(
          alterForm({
            [ATTRIBUTE_ID]: answers({
              value: nodeValue('notInCodebook'),
              answers: [],
            }),
          }),
        ),
      ),
    ).toContainEqual({
      path: `${AT}.value`,
      message: expect.stringContaining('This dynamic attribute'),
    });
  });

  it('requires the wording of each version in each language whose text shows it, or in the language it falls back to', () => {
    // The French question falls back to the English one, which shows it.
    const definition = answers({
      other: { fr: 'votre proche' },
      missing: { en: 'them', fr: 'eux' },
    });
    const problems = problemsOf(
      protocolWith(alterForm({ [ATTRIBUTE_ID]: definition }), ['en', 'fr']),
    );
    expect(problems).toContainEqual({
      path: `${AT}.other.en`,
      message: 'Write this version in English.',
    });
    expect(problems.filter(({ path }) => path.startsWith(AT))).toHaveLength(1);
  });

  it('needs no wording in a language whose text does not show it', () => {
    const stage = alterForm({
      [ATTRIBUTE_ID]: answers({
        missing: localized('eux', 'fr'),
        answers: [
          {
            answer: optionCaseKey(friendOption()),
            wording: localized('votre ami', 'fr'),
          },
        ],
        other: localized('votre proche', 'fr'),
      }),
    });
    stage.form.fields[0]!.prompt = {
      en: 'How old are they?',
      fr: `Quel âge a {${ATTRIBUTE}} ?`,
    } as never;
    expect(problemsOf(protocolWith(stage, ['en', 'fr']))).toEqual([]);
  });

  it('counts an empty version as wording in its language', () => {
    // English shows nothing for "no answer"; French has no wording for it yet.
    const stage = alterForm({
      [ATTRIBUTE_ID]: answers({
        missing: { en: '', de: 'sie' },
        other: {
          en: 'your relative',
          fr: 'votre proche',
          de: 'Ihr Verwandter',
        },
      }),
    });
    stage.form.fields[0]!.prompt = {
      en: `How old is {${ATTRIBUTE}}?`,
      fr: `Quel âge a {${ATTRIBUTE}} ?`,
    } as never;
    const protocol = protocolWith(stage, ['en', 'fr', 'de']);
    const problems = problemsOf(protocol).filter(({ path }) =>
      path.startsWith(AT),
    );
    // French falls back to the English empty version, which is written.
    expect(problems).toEqual([]);
    // German has a version of its own, so it shows the participant "sie".
    const parsed = ProtocolSchemaV9.parse(protocol);
    expect(
      analyzeProtocolLocalization(parsed)
        .filter(({ path }) => path.join('.').startsWith(`${AT}.missing`))
        .map(({ locale }) => locale),
    ).toEqual(['fr']);
  });

  it('still reports a language without a version where the attribute is shown, when the default language has none', () => {
    const stage = alterForm({
      [ATTRIBUTE_ID]: answers({ missing: { de: '' } }),
    });
    expect(
      problemsOf(protocolWith(stage, ['en', 'de'])).filter(({ path }) =>
        path.startsWith(AT),
      ),
    ).toEqual([
      { path: `${AT}.missing.en`, message: 'Write this version in English.' },
    ]);
  });

  it("takes a version's wording in the default language for a language that has none", () => {
    const stage = alterForm({ [ATTRIBUTE_ID]: answers() });
    stage.form.fields[0]!.prompt = {
      en: `How old is {${ATTRIBUTE}}?`,
      fr: `Quel âge a {${ATTRIBUTE}} ?`,
    } as never;
    expect(problemsOf(protocolWith(stage, ['en', 'fr']))).toEqual([]);
  });

  it('requires wording in a language whose text alone shows it, when the default language has none either', () => {
    const stage = alterForm({ [ATTRIBUTE_ID]: answers() });
    stage.form.fields[0]!.prompt = {
      en: 'How old are they?',
      fr: `Quel âge a {${ATTRIBUTE}} ?`,
    } as never;
    // Wording in German only, which neither French nor English falls back to.
    const german = answers({
      missing: localized('sie', 'de'),
      answers: [],
      other: localized('Ihr Verwandter', 'de'),
    });
    stage.dynamicAttributes = { [ATTRIBUTE_ID]: german };
    expect(
      problemsOf(protocolWith(stage, ['en', 'fr', 'de'])).filter(({ path }) =>
        path.startsWith(AT),
      ),
    ).toEqual([
      { path: `${AT}.missing.fr`, message: 'Write this version in French.' },
      { path: `${AT}.other.fr`, message: 'Write this version in French.' },
    ]);
  });
});

describe('a version that has never been written', () => {
  // The question shows the dynamic attribute in both languages.
  const shownInBoth = (definition: Definition) => {
    const stage = alterForm({ [ATTRIBUTE_ID]: definition });
    stage.form.fields[0]!.prompt = {
      en: `How old is {${ATTRIBUTE}}?`,
      fr: `Quel âge a {${ATTRIBUTE}} ?`,
    } as never;
    return protocolWith(stage, ['en', 'fr']);
  };

  // What a host checks a stage with: the definition's own schema, and the
  // protocol's checks of the stage's dynamic attributes.
  const stageProblemsOf = (protocol: ReturnType<typeof shownInBoth>) => {
    const [stage] = protocol.stages;
    const definition = (
      stage as unknown as { dynamicAttributes: Record<string, unknown> }
    ).dynamicAttributes[ATTRIBUTE_ID];
    expect(DynamicAttributeSchema.safeParse(definition).success).toBe(true);
    return findDynamicAttributeProblems(
      protocol,
      collectLocalizedStringsFromSchema(ProtocolStructureSchema, protocol),
    ).map(({ path, message }) => ({ path: path.join('.'), message }));
  };

  it('is reported in each language that shows the dynamic attribute', () => {
    const protocol = shownInBoth(answers({ other: {} }));
    const expected = [
      { path: `${AT}.other.en`, message: 'Write this version in English.' },
      { path: `${AT}.other.fr`, message: 'Write this version in French.' },
    ];
    expect(stageProblemsOf(protocol)).toEqual(expected);
    // Once each, and not also as text without a translation.
    expect(
      problemsOf(protocol).filter(({ path }) => path.startsWith(AT)),
    ).toEqual(expected);
  });

  it('is reported for the wording of a number', () => {
    const protocol = shownInBoth({
      logic: 'number',
      value: nodeValue('age'),
      missing: localized(''),
      wording: {},
    });
    expect(stageProblemsOf(protocol)).toEqual([
      { path: `${AT}.wording.en`, message: 'Write this version in English.' },
      { path: `${AT}.wording.fr`, message: 'Write this version in French.' },
    ]);
  });

  it('is not reported in a language whose text does not show the dynamic attribute', () => {
    const stage = alterForm({ [ATTRIBUTE_ID]: answers({ other: {} }) });
    stage.form.fields[0]!.prompt = {
      en: 'How old are they?',
      fr: `Quel âge a {${ATTRIBUTE}} ?`,
    } as never;
    expect(
      problemsOf(protocolWith(stage, ['en', 'fr'])).filter(({ path }) =>
        path.startsWith(AT),
      ),
    ).toEqual([
      { path: `${AT}.other.fr`, message: 'Write this version in French.' },
    ]);
  });
});

describe('the languages a dynamic attribute is expected in', () => {
  const expectedWith = (prompt: Record<string, string>) => {
    const stage = alterForm({ [ATTRIBUTE_ID]: answers() });
    stage.form.fields[0]!.prompt = prompt as never;
    const protocol = ProtocolSchemaV9.parse(
      protocolWith(
        {
          ...stage,
          form: {
            ...stage.form,
            content: { ...stage.form.content, fr: fieldBlockMarkdown(FIELD) },
          },
        },
        ['en', 'fr'],
      ),
    );
    return expectedLocalesOf(
      ['stages', 0, 'dynamicAttributes', ATTRIBUTE_ID, 'other'],
      protocol,
    );
  };

  it("are the languages in which its owner's text shows it", () => {
    expect(
      expectedWith({
        en: `How old is {${ATTRIBUTE}}?`,
        fr: 'Quel âge a cette personne ?',
      }),
    ).toEqual(['en']);
  });

  it('leave out the default language when its text does not show it', () => {
    expect(
      expectedWith({
        en: 'How old are they?',
        fr: `Quel âge a {${ATTRIBUTE}} ?`,
      }),
    ).toEqual(['fr']);
  });

  it('take in a language whose text falls back to text that shows it', () => {
    expect(expectedWith({ en: `How old is {${ATTRIBUTE}}?` })).toEqual([
      'en',
      'fr',
    ]);
  });
});

describe('a dynamic attribute in the question of a field that only one language places', () => {
  // The age question, which shows the dynamic attribute, is placed only in
  // `placedIn`'s document; both documents place the name question.
  const stageWith = (
    placedIn: string,
    otherLocale: string,
    prompt: Record<string, string>,
    wording: string,
  ) => ({
    ...alterForm({
      [ATTRIBUTE_ID]: answers({
        missing: localized('?', wording),
        answers: [],
        other: localized('?', wording),
      }),
    }),
    form: {
      content: {
        [placedIn]: [NAME_FIELD, FIELD].map(fieldBlockMarkdown).join('\n\n'),
        [otherLocale]: fieldBlockMarkdown(NAME_FIELD),
      },
      fields: [
        {
          id: NAME_FIELD,
          variable: 'name',
          prompt: { en: 'What is their name?', fr: 'Quel est son nom ?' },
        },
        { id: FIELD, variable: 'age', prompt },
      ],
    },
  });

  it('needs no wording in a language whose form does not place the field', () => {
    // English is the default language, and its form has no age question.
    const stage = stageWith(
      'fr',
      'en',
      { fr: `Âge (maintenant {${ATTRIBUTE}}) ?` },
      'fr',
    );
    expect(
      problemsOf(protocolWith(stage, ['en', 'fr'])).filter(({ path }) =>
        path.startsWith(AT),
      ),
    ).toEqual([]);
  });

  it('needs no wording in the default language when its form does not place the field', () => {
    const stage = stageWith(
      'en',
      'fr',
      { en: `How old is {${ATTRIBUTE}}?` },
      'en',
    );
    expect(
      problemsOf(protocolWith(stage, ['en', 'fr'], 'fr')).filter(({ path }) =>
        path.startsWith(AT),
      ),
    ).toEqual([]);
  });

  it('reports no missing wording in a language whose form does not place the field', () => {
    const stage = stageWith(
      'en',
      'fr',
      { en: `How old is {${ATTRIBUTE}}?` },
      'en',
    );
    const protocol = ProtocolSchemaV9.parse(protocolWith(stage, ['en', 'fr']));
    expect(
      expectedLocalesOf(
        ['stages', 0, 'dynamicAttributes', ATTRIBUTE_ID, 'other'],
        protocol,
      ),
    ).toEqual(['en']);
    expect(
      analyzeProtocolLocalization(protocol).filter(({ path }) =>
        path.includes('dynamicAttributes'),
      ),
    ).toEqual([]);
  });

  it('still needs wording in a language whose form places the field', () => {
    // German wording only, which French does not fall back to. German has
    // no form of its own and is shown the English one, without the field.
    const stage = stageWith(
      'fr',
      'en',
      { fr: `Âge (maintenant {${ATTRIBUTE}}) ?` },
      'de',
    );
    expect(
      problemsOf(protocolWith(stage, ['en', 'fr', 'de'])).filter(({ path }) =>
        path.startsWith(AT),
      ),
    ).toEqual([
      { path: `${AT}.missing.fr`, message: 'Write this version in French.' },
      { path: `${AT}.other.fr`, message: 'Write this version in French.' },
    ]);
  });
});

describe('a logic block that chooses by a dynamic attribute', () => {
  it('is refused, because a dynamic attribute is never missing', () => {
    // At run time a dynamic attribute has no answer to choose by, so the
    // block would always show its version for no answer.
    const stage = alterForm({ [ATTRIBUTE_ID]: answers() });
    stage.form.content = localized(
      `{${ATTRIBUTE}, select, missing {Not known.} other {Known.}}\n\n${fieldBlockMarkdown(FIELD)}`,
    );
    expect(problemsOf(protocolWith(stage))).toEqual([
      {
        path: 'stages.0.form.content.en',
        message: CONTENT_DOCUMENT_PROBLEMS.unrecognisedLogic,
      },
    ]);
  });
});

describe('a dynamic attribute whose value its text cannot read', () => {
  it('is refused once, where the text shows it', () => {
    const egoForm = {
      id: testId('ego-form'),
      type: 'EgoForm',
      label: localized('About you'),
      dynamicAttributes: { [ATTRIBUTE_ID]: answers() },
      form: formOf([
        {
          id: FIELD,
          variable: 'egoAge',
          prompt: localized(`How old is {${ATTRIBUTE}}?`),
        },
      ]),
    };
    expect(problemsOf(protocolWith(egoForm))).toEqual([
      {
        path: 'stages.0.form.fields.0.prompt.en',
        message: expect.stringContaining('has a dynamic attribute that'),
      },
    ]);
  });

  it('names the rules of the dynamic attribute, not a logic block, when they are about a node that the wording does not refer to', () => {
    const egoForm = {
      id: testId('ego-form'),
      type: 'EgoForm',
      label: localized('About you'),
      conditions: {
        [CONDITION_ID]: {
          about: 'node',
          rules: [
            { type: 'edge', id: testId('rule'), options: { count: 'MOST' } },
          ],
        },
      },
      dynamicAttributes: {
        [ATTRIBUTE_ID]: {
          logic: 'conditions',
          cases: [
            { condition: CONDITION_ID, when: 'met', wording: localized('a') },
          ],
          otherwise: localized('b'),
        },
      },
      form: formOf([
        {
          id: FIELD,
          variable: 'egoAge',
          prompt: localized(`How old is {${ATTRIBUTE}}?`),
        },
      ]),
    };
    expect(
      problemsOf(protocolWith(egoForm)).filter(
        ({ path }) => path === 'stages.0.form.fields.0.prompt.en',
      ),
    ).toEqual([
      {
        path: 'stages.0.form.fields.0.prompt.en',
        message:
          'This wording has a dynamic attribute whose rules are about the node this stage is about, which this wording does not refer to.',
      },
    ]);
  });
});
