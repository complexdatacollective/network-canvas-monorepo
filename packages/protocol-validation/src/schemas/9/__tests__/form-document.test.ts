import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import {
  testId,
  testVariableId,
  withTestCodebookIds,
} from '../../../__tests__/testIds.ts';
import {
  expectedLocalesOf,
  analyzeProtocolLocalization,
} from '../../../localization/analyzeProtocolLocalization.ts';
import { CONTENT_DOCUMENT_PROBLEMS } from '../../../localization/contentDocumentProblems.ts';
import { fieldBlockMarkdown } from '../../../localization/fieldBlock.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import { dynamicValueNameFor } from '../dynamic-value-names.ts';
import { FORM_DOCUMENT_PROBLEMS } from '../form-document-validation.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

const NAME_FIELD = testId('field-name');
const AGE_FIELD = testId('field-age');
const ANSWERED = testId('answered-age');

const field = fieldBlockMarkdown;

// `text` in the languages that `content` is written in.
const inLanguagesOf = (
  content: Record<string, string>,
  text: Record<string, string>,
) =>
  Object.fromEntries(
    Object.keys(content).map((locale) => [locale, text[locale] ?? '']),
  );

const egoForm = (
  content: Record<string, string>,
  extra: Record<string, unknown> = {},
) => ({
  id: testId('ego-form'),
  type: 'EgoForm',
  label: localized('About you'),
  form: {
    content,
    fields: [
      {
        id: NAME_FIELD,
        variable: 'egoName',
        prompt: inLanguagesOf(content, { en: 'Your name?', fr: 'Votre nom ?' }),
      },
      {
        id: AGE_FIELD,
        variable: 'egoAge',
        prompt: inLanguagesOf(content, { en: 'Your age?', fr: 'Votre âge ?' }),
      },
    ],
  },
  ...extra,
});

const protocolWith = (
  stage: Record<string, unknown>,
  locales: readonly string[] = ['en'],
) => {
  const base = createBaseProtocol();
  return withFinishStage(
    withTestCodebookIds({
      ...base,
      localization: { defaultLocale: 'en', locales },
      stages: [stage],
    }),
  );
};

/** The problems of a protocol, by path, with their messages. */
const problemsOf = (protocol: unknown) => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success
    ? []
    : result.error.issues.map(({ path, message }) => ({
        path: path.join('.'),
        message,
      }));
};

const CONTENT = 'stages.0.form.content';

describe('the document of a form', () => {
  it('accepts a heading and text above the fields it places', () => {
    expect(
      problemsOf(
        protocolWith(
          egoForm(
            localized(
              `# About you\n\nPlease answer.\n\n${field(NAME_FIELD)}\n\n${field(AGE_FIELD)}`,
            ),
          ),
        ),
      ),
    ).toEqual([]);
  });

  // The interview reads a document's link reference definitions as the
  // definitions of the whole document, wherever its fields split it
  // (`withSharedDefinitions` in the interview).
  it('accepts a link whose reference definition is written after a field', () => {
    expect(
      problemsOf(
        protocolWith(
          egoForm(
            localized(
              `Read [the study page][study] first.\n\n${field(NAME_FIELD)}\n\n${field(AGE_FIELD)}\n\n[study]: https://example.com`,
            ),
          ),
        ),
      ),
    ).toEqual([]);
  });

  it('requires a document', () => {
    const stage = egoForm(localized(''));
    Reflect.deleteProperty(stage.form, 'content');
    expect(problemsOf(protocolWith(stage))).toContainEqual({
      path: CONTENT,
      message: expect.any(String),
    });
  });

  it('refuses a document that places no field', () => {
    expect(problemsOf(protocolWith(egoForm(localized('Only text.'))))).toEqual(
      expect.arrayContaining([
        { path: `${CONTENT}.en`, message: FORM_DOCUMENT_PROBLEMS.noFields },
      ]),
    );
  });

  it('refuses a field that the form does not have', () => {
    expect(
      problemsOf(
        protocolWith(
          egoForm(
            localized(
              `${field(NAME_FIELD)}\n\n${field(AGE_FIELD)}\n\n${field(testId('gone'))}`,
            ),
          ),
        ),
      ),
    ).toEqual([
      { path: `${CONTENT}.en`, message: FORM_DOCUMENT_PROBLEMS.unknownField },
    ]);
  });

  it('refuses a field placed twice, even in different versions', () => {
    expect(
      problemsOf(
        protocolWith(
          egoForm(
            localized(
              `${field(NAME_FIELD)}\n\n${field(AGE_FIELD)}\n\n${field(NAME_FIELD)}`,
            ),
          ),
        ),
      ),
    ).toEqual([
      { path: `${CONTENT}.en`, message: FORM_DOCUMENT_PROBLEMS.repeatedField },
    ]);
  });

  it('refuses a field that no language places, at the field', () => {
    expect(
      problemsOf(protocolWith(egoForm(localized(field(NAME_FIELD))))),
    ).toEqual([
      {
        path: 'stages.0.form.fields.1',
        message: FORM_DOCUMENT_PROBLEMS.unplacedField,
      },
    ]);
  });

  it('accepts a field that only one language places', () => {
    expect(
      problemsOf(
        protocolWith(
          egoForm({
            en: `${field(NAME_FIELD)}\n\n${field(AGE_FIELD)}`,
            fr: field(NAME_FIELD),
          }),
          ['en', 'fr'],
        ),
      ),
    ).toEqual([]);
  });

  it.each([
    ['beside text', `Name: ${field(NAME_FIELD)}`, 'fieldNotOwnParagraph'],
    ['in a list', `- ${field(NAME_FIELD)}`, 'fieldInList'],
    [
      'with a description',
      `![Name](field:${NAME_FIELD})`,
      'fieldHasDescription',
    ],
    ['with a title', `![](field:${NAME_FIELD} "Name")`, 'fieldNotStandard'],
    [
      'with its address in angle brackets',
      `![](<field:${NAME_FIELD}>)`,
      'fieldNotStandard',
    ],
  ] as const)('refuses a field %s', (_, placement, kind) => {
    expect(
      problemsOf(
        protocolWith(egoForm(localized(`${placement}\n\n${field(AGE_FIELD)}`))),
      ),
    ).toContainEqual({
      path: `${CONTENT}.en`,
      message: CONTENT_DOCUMENT_PROBLEMS[kind],
    });
  });

  it('refuses a field in text that is not the text of a form', () => {
    const base = createBaseProtocol();
    expect(
      problemsOf(
        withFinishStage(
          withTestCodebookIds({
            ...base,
            stages: [
              {
                id: testId('info'),
                type: 'Information',
                label: localized('Welcome'),
                content: localized(`Welcome.\n\n${field(NAME_FIELD)}`),
              },
            ],
          }),
        ),
      ),
    ).toContainEqual({
      path: 'stages.0.content.en',
      message: CONTENT_DOCUMENT_PROBLEMS.fieldNotAllowedHere,
    });
  });
});

describe('logic blocks in the document of a form', () => {
  const answeredAge = {
    [ANSWERED]: {
      rules: [
        {
          type: 'ego',
          id: testId('rule'),
          options: { attribute: 'egoAge', operator: 'EXISTS' },
        },
      ],
    },
  };
  const ifAnswered = (met: string) =>
    `{${dynamicValueNameFor({ kind: 'condition', conditionId: ANSWERED })}, select, true {${met}} other {}}`;

  it('accepts a field that is shown only when the rules of a logic block are met', () => {
    expect(
      problemsOf(
        protocolWith(
          egoForm(
            localized(
              `${field(AGE_FIELD)}\n\n${ifAnswered(field(NAME_FIELD))}`,
            ),
            { conditions: answeredAge },
          ),
        ),
      ),
    ).toEqual([]);
  });

  it('refuses a logic block that depends on a field inside it', () => {
    expect(
      problemsOf(
        protocolWith(
          egoForm(
            localized(
              `${field(NAME_FIELD)}\n\n${ifAnswered(field(AGE_FIELD))}`,
            ),
            { conditions: answeredAge },
          ),
        ),
      ),
    ).toEqual([
      {
        path: `${CONTENT}.en`,
        message: FORM_DOCUMENT_PROBLEMS.logicReadsOwnField,
      },
    ]);
  });

  it('refuses an answers block on the attribute of a field inside it', () => {
    const age = dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: testVariableId('egoAge'),
    });
    expect(
      problemsOf(
        protocolWith(
          egoForm(
            localized(
              `${field(NAME_FIELD)}\n\n{${age}, select, missing {${field(AGE_FIELD)}} other {}}`,
            ),
          ),
        ),
      ),
    ).toContainEqual({
      path: `${CONTENT}.en`,
      message: FORM_DOCUMENT_PROBLEMS.logicReadsOwnField,
    });
  });

  // A condition on the participant's name, which the form asks outside
  // every logic block.
  const NAMED = testId('named');
  const conditions = {
    ...answeredAge,
    [NAMED]: {
      rules: [
        {
          type: 'ego',
          id: testId('rule-named'),
          options: { attribute: 'egoName', operator: 'EXISTS' },
        },
      ],
    },
  };
  const ifNamed = (met: string, otherwise: string) =>
    `{${dynamicValueNameFor({ kind: 'condition', conditionId: NAMED })}, select, true {${met}} other {${otherwise}}}`;

  it('refuses a logic block that depends on a field in another version of a logic block around it', () => {
    expect(
      problemsOf(
        protocolWith(
          egoForm(
            localized(
              `${field(NAME_FIELD)}

${ifNamed(field(AGE_FIELD), `Then:\n\n${ifAnswered('Thanks.')}`)}`,
            ),
            { conditions },
          ),
        ),
      ),
    ).toEqual([
      {
        path: `${CONTENT}.en`,
        message: FORM_DOCUMENT_PROBLEMS.logicReadsOtherVersionField,
      },
    ]);
  });

  it('accepts a logic block that depends on a field before it in the same version of a logic block around it', () => {
    expect(
      problemsOf(
        protocolWith(
          egoForm(
            localized(
              `${field(NAME_FIELD)}

${ifNamed(
  `${field(AGE_FIELD)}

${ifAnswered('Thanks.')}`,
  '',
)}`,
            ),
            { conditions },
          ),
        ),
      ),
    ).toEqual([]);
  });
});

describe('the languages a form field is expected in', () => {
  const protocol = () =>
    ProtocolSchemaV9.parse(
      protocolWith(
        egoForm({
          en: `${field(NAME_FIELD)}\n\n${field(AGE_FIELD)}`,
          fr: field(NAME_FIELD),
        }),
        ['en', 'fr'],
      ),
    );

  it('are the languages whose document places the field', () => {
    const parsed = protocol();
    const prompt = (index: number) => [
      'stages',
      0,
      'form',
      'fields',
      index,
      'prompt',
    ];
    expect(expectedLocalesOf(prompt(0), parsed)).toEqual(['en', 'fr']);
    expect(expectedLocalesOf(prompt(1), parsed)).toEqual(['en']);
    expect(expectedLocalesOf(['stages', 0, 'label'], parsed)).toEqual([
      'en',
      'fr',
    ]);
  });

  it('are the languages shown a document that places the field, the fallback one included', () => {
    const prompt = (index: number) => [
      'stages',
      0,
      'form',
      'fields',
      index,
      'prompt',
    ];
    // French has no document of its own: it is shown the default one.
    const fallsBackToDefault = ProtocolSchemaV9.parse(
      protocolWith(
        egoForm({ en: `${field(NAME_FIELD)}\n\n${field(AGE_FIELD)}` }),
        ['en', 'fr'],
      ),
    );
    expect(expectedLocalesOf(prompt(0), fallsBackToDefault)).toEqual([
      'en',
      'fr',
    ]);
    expect(expectedLocalesOf(prompt(1), fallsBackToDefault)).toEqual([
      'en',
      'fr',
    ]);

    // European Portuguese has none either: it is shown Brazilian
    // Portuguese's, which does not place the age field.
    const portuguese = egoForm({
      'en': `${field(NAME_FIELD)}\n\n${field(AGE_FIELD)}`,
      'pt-BR': field(NAME_FIELD),
    });
    const [name, age] = portuguese.form.fields;
    const fallsBackToRelated = ProtocolSchemaV9.parse(
      protocolWith(
        {
          ...portuguese,
          form: {
            ...portuguese.form,
            fields: [
              { ...name, prompt: { 'en': 'Your name?', 'pt-BR': 'Seu nome?' } },
              { ...age, prompt: { en: 'Your age?' } },
            ],
          },
        },
        ['en', 'pt-BR', 'pt-PT'],
      ),
    );
    expect(expectedLocalesOf(prompt(0), fallsBackToRelated)).toEqual([
      'en',
      'pt-BR',
      'pt-PT',
    ]);
    expect(expectedLocalesOf(prompt(1), fallsBackToRelated)).toEqual(['en']);
  });

  it('reports the missing translations of the fields a fallback document places', () => {
    const parsed = ProtocolSchemaV9.parse(
      protocolWith(
        egoForm({ en: `${field(NAME_FIELD)}\n\n${field(AGE_FIELD)}` }),
        ['en', 'fr'],
      ),
    );
    expect(
      analyzeProtocolLocalization(parsed)
        .filter(({ path }) => path.includes('fields'))
        .map(({ path, locale }) => [path.join('.'), locale]),
    ).toEqual([
      ['stages.0.form.fields.0.prompt', 'fr'],
      ['stages.0.form.fields.1.prompt', 'fr'],
    ]);
  });

  it('reports no missing translation for a field that a language does not place', () => {
    const parsed = protocol();
    const stage = parsed.stages[0];
    if (stage?.type !== 'EgoForm') throw new Error('No Ego Form');
    const [, age] = stage.form.fields;
    if (age === undefined) throw new Error('No age field');
    age.prompt = { en: 'Your age?' };
    expect(
      analyzeProtocolLocalization(parsed).filter(({ path }) =>
        path.includes('fields'),
      ),
    ).toEqual([]);
  });
});
