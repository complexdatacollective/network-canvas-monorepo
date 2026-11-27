import { describe, expect, it } from 'vitest';

import { fieldBlockMarkdown } from '../../localization/fieldBlock.ts';
import { findDynamicAttributeProblems } from '../../schemas/9/dynamic-attribute-validation.ts';
import { dynamicValueNameFor } from '../../schemas/9/dynamic-value-names.ts';
import { collectLocalizedStrings } from '../collectLocalizedStrings.ts';
import { ownerOfTextPath, textOwnersOf } from '../textOwners.ts';
import { withoutUnusedTextDefinitions } from '../withoutUnusedDefinitions.ts';

const ENGLISH = { defaultLocale: 'en', locales: ['en'] };
const BILINGUAL = { defaultLocale: 'en', locales: ['en', 'es'] };

const USED = 'dynamic-used';
const UNUSED = 'dynamic-unused';
const TESTED = 'condition-tested';
const OTHER = 'condition-other';
const NAME_FIELD = 'field-name';
const AGE_FIELD = 'field-age';

const attribute = (id: string) =>
  `{${dynamicValueNameFor({ kind: 'dynamicAttribute', id })}}`;
const testing = (conditionId: string) =>
  `{${dynamicValueNameFor({ kind: 'condition', conditionId })}, select, true {Hi} other {Hello}}`;

const testsCondition = (conditionId: string) => ({
  logic: 'conditions',
  cases: [{ condition: conditionId, when: 'met', wording: { en: 'they' } }],
  otherwise: { en: 'you' },
});

const RULES = { rules: [] };

/** An Ego Form named `label`, with one field whose question is `question`. */
const egoForm = <Extra extends Readonly<Record<string, unknown>>>(
  label: Readonly<Record<string, string>>,
  extra: Extra,
  question: Readonly<Record<string, string>> = { en: 'Name?' },
) => ({
  id: 'stage',
  type: 'EgoForm',
  label,
  form: {
    content: { en: fieldBlockMarkdown(NAME_FIELD) },
    fields: [{ id: NAME_FIELD, variable: 'name', prompt: question }],
  },
  ...extra,
});

describe('withoutUnusedTextDefinitions: dynamic attributes', () => {
  it('keeps a dynamic attribute that the text names, and drops one that it does not', () => {
    const stage = egoForm(
      { en: `Hello ${attribute(USED)}` },
      {
        dynamicAttributes: {
          [USED]: testsCondition(TESTED),
          [UNUSED]: testsCondition(TESTED),
        },
        conditions: { [TESTED]: RULES },
      },
    );
    expect(withoutUnusedTextDefinitions(stage, ENGLISH)).toEqual({
      ...stage,
      dynamicAttributes: { [USED]: testsCondition(TESTED) },
    });
  });

  it('counts only the names in the text that the protocol’s check reads', () => {
    // `note` is not one of the stage's localized strings, so the check
    // reports the dynamic attribute as unused: the save drops it.
    const stage = egoForm(
      { en: 'Hello' },
      {
        note: attribute(USED),
        dynamicAttributes: { [USED]: testsCondition(TESTED) },
        conditions: { [TESTED]: RULES },
      },
    );
    const { dynamicAttributes: _d, conditions: _c, ...text } = stage;
    expect(withoutUnusedTextDefinitions(stage, ENGLISH)).toEqual(text);
  });

  it('leaves no dynamic attribute that the protocol’s check refuses as unused', () => {
    const stage = egoForm(
      { en: `Hello ${attribute(USED)}` },
      {
        note: attribute(UNUSED),
        dynamicAttributes: {
          [USED]: testsCondition(TESTED),
          [UNUSED]: testsCondition(TESTED),
        },
        conditions: { [TESTED]: RULES },
      },
    );
    const protocol = {
      codebook: {},
      stages: [withoutUnusedTextDefinitions(stage, ENGLISH)],
      localization: ENGLISH,
    };
    const problems = findDynamicAttributeProblems(
      protocol,
      collectLocalizedStrings(protocol),
    );
    expect(
      problems.filter(({ message }) => message.includes('not used anywhere')),
    ).toEqual([]);
  });

  it('drops the dynamic attributes of a node type’s label that its text does not name', () => {
    const label = {
      text: { en: `Friend ${attribute(USED)}` },
      dynamicAttributes: {
        [USED]: testsCondition(TESTED),
        [UNUSED]: testsCondition(OTHER),
      },
      conditions: { [TESTED]: RULES, [OTHER]: RULES },
    };
    expect(withoutUnusedTextDefinitions(label, ENGLISH)).toEqual({
      text: label.text,
      dynamicAttributes: { [USED]: testsCondition(TESTED) },
      conditions: { [TESTED]: RULES },
    });
  });

  it('leaves alone a stage in which no text can be found', () => {
    const stage = {
      type: 'NotAStage',
      dynamicAttributes: { [UNUSED]: testsCondition(TESTED) },
      conditions: { [TESTED]: RULES },
    };
    expect(withoutUnusedTextDefinitions(stage, ENGLISH)).toBe(stage);
  });
});

describe('withoutUnusedTextDefinitions: conditions', () => {
  it('keeps a condition while some text tests it, also in one translation only', () => {
    const stage = egoForm(
      { en: 'Hello', es: testing(TESTED) },
      { conditions: { [TESTED]: RULES } },
    );
    expect(withoutUnusedTextDefinitions(stage, BILINGUAL)).toBe(stage);
  });

  it('keeps a condition that only a dynamic attribute tests, and drops it with the last one', () => {
    const used = egoForm(
      { en: `Hello ${attribute(USED)}` },
      {
        dynamicAttributes: { [USED]: testsCondition(TESTED) },
        conditions: { [TESTED]: RULES },
      },
    );
    expect(withoutUnusedTextDefinitions(used, ENGLISH)).toBe(used);

    const { dynamicAttributes: _d, conditions: _c, ...plain } = used;
    expect(
      withoutUnusedTextDefinitions(
        { ...used, label: { en: 'Hello' } },
        ENGLISH,
      ),
    ).toEqual({ ...plain, label: { en: 'Hello' } });
  });

  it('keeps a condition that a dynamic attribute tests while its wording is still being written', () => {
    const stage = egoForm(
      { en: `Hello ${attribute(USED)}` },
      {
        dynamicAttributes: {
          [USED]: {
            logic: 'conditions',
            // The version has no wording yet, and "otherwise" is not text.
            cases: [{ condition: TESTED, when: 'met' }],
            otherwise: 7,
          },
        },
        conditions: { [TESTED]: RULES, [OTHER]: RULES },
      },
    );
    expect(withoutUnusedTextDefinitions(stage, ENGLISH)).toEqual({
      ...stage,
      conditions: { [TESTED]: RULES },
    });
  });

  // Conditions exist only in schema 9, which is unreleased: there is no
  // stored condition to keep for its own sake.
  it('drops a condition that no text tests, however long it has been unused', () => {
    const stage = egoForm(
      { en: testing(TESTED) },
      { conditions: { [TESTED]: RULES, [OTHER]: RULES } },
    );
    expect(withoutUnusedTextDefinitions(stage, ENGLISH)).toEqual({
      ...stage,
      conditions: { [TESTED]: RULES },
    });
  });
});

describe('withoutUnusedTextDefinitions: form fields', () => {
  const twoFields = (
    content: Readonly<Record<string, string>>,
    agePrompt: Readonly<Record<string, string>>,
  ) => ({
    id: 'stage',
    type: 'EgoForm',
    label: { en: 'About you', es: 'Sobre usted' },
    form: {
      content,
      fields: [
        { id: NAME_FIELD, variable: 'name', prompt: { en: 'Name?' } },
        { id: AGE_FIELD, variable: 'age', prompt: agePrompt },
      ],
    },
  });

  it('drops a field that the form places in no language', () => {
    const stage = twoFields(
      {
        en: fieldBlockMarkdown(NAME_FIELD),
        es: fieldBlockMarkdown(NAME_FIELD),
      },
      { en: 'Age?' },
    );
    expect(
      withoutUnusedTextDefinitions(stage, BILINGUAL).form.fields.map(
        ({ id }) => id,
      ),
    ).toEqual([NAME_FIELD]);
  });

  it('drops a question in a language whose form does not place the field', () => {
    const stage = twoFields(
      {
        en: [NAME_FIELD, AGE_FIELD].map(fieldBlockMarkdown).join('\n\n'),
        es: fieldBlockMarkdown(NAME_FIELD),
      },
      { en: 'Age?', es: '¿Edad?' },
    );
    expect(
      withoutUnusedTextDefinitions(stage, BILINGUAL).form.fields[1],
    ).toEqual({ id: AGE_FIELD, variable: 'age', prompt: { en: 'Age?' } });
  });

  // The English form asks the age in the only words that it has, the
  // Spanish ones.
  it('keeps the translation that a language whose form places the field falls back to', () => {
    const stage = twoFields(
      {
        en: [NAME_FIELD, AGE_FIELD].map(fieldBlockMarkdown).join('\n\n'),
        es: fieldBlockMarkdown(NAME_FIELD),
      },
      { es: '¿Edad?' },
    );
    expect(withoutUnusedTextDefinitions(stage, BILINGUAL)).toBe(stage);
  });

  it('keeps the question of a language that is shown another language’s form', () => {
    const stage = twoFields(
      { en: [NAME_FIELD, AGE_FIELD].map(fieldBlockMarkdown).join('\n\n') },
      { en: 'Age?', es: '¿Edad?' },
    );
    expect(withoutUnusedTextDefinitions(stage, BILINGUAL)).toBe(stage);
  });

  it('keeps the other settings of a field, and lets nothing fall back without the languages', () => {
    const stage = twoFields(
      { en: [NAME_FIELD, AGE_FIELD].map(fieldBlockMarkdown).join('\n\n') },
      { en: 'Age?', es: '¿Edad?' },
    );
    const withSetting = {
      ...stage,
      form: {
        ...stage.form,
        fields: stage.form.fields.map((field) => ({
          ...field,
          showValidationHints: true,
        })),
      },
    };
    expect(
      withoutUnusedTextDefinitions(withSetting, undefined).form.fields[1],
    ).toEqual({
      id: AGE_FIELD,
      variable: 'age',
      prompt: { en: 'Age?' },
      showValidationHints: true,
    });
  });

  it('leaves a form that is not written as documents as it is', () => {
    const composer = {
      id: 'stage',
      type: 'NetworkComposer',
      label: { en: 'Compose' },
      form: { fields: [{ variable: 'name', prompt: { en: 'Name?' } }] },
    };
    expect(withoutUnusedTextDefinitions(composer, ENGLISH)).toBe(composer);
  });
});

describe('withoutUnusedTextDefinitions: the order of a save', () => {
  // A question that a language's form no longer places is the last text to
  // name a dynamic attribute, which is the last thing to test a condition:
  // all three go in one save.
  it('drops a field’s question, then the dynamic attribute only it named, then the condition only that tested', () => {
    const stage = {
      id: 'stage',
      type: 'EgoForm',
      label: { en: 'About you', es: 'Sobre usted' },
      form: {
        content: {
          en: fieldBlockMarkdown(NAME_FIELD),
          es: 'Solo texto.',
        },
        fields: [
          {
            id: NAME_FIELD,
            variable: 'name',
            prompt: { en: 'Name?', es: `¿Nombre de ${attribute(USED)}?` },
          },
        ],
      },
      dynamicAttributes: { [USED]: testsCondition(TESTED) },
      conditions: { [TESTED]: RULES },
    };
    expect(withoutUnusedTextDefinitions(stage, BILINGUAL)).toEqual({
      id: 'stage',
      type: 'EgoForm',
      label: stage.label,
      form: {
        content: stage.form.content,
        fields: [{ id: NAME_FIELD, variable: 'name', prompt: { en: 'Name?' } }],
      },
    });
  });
});

describe('the owners of text', () => {
  it('lists each stage and each node type with a label of its own', () => {
    expect(
      textOwnersOf({
        stages: [{}, {}],
        codebook: {
          node: {
            person: { dynamicLabel: { text: { en: 'P' } } },
            place: {},
          },
        },
      }),
    ).toEqual([
      ['stages', 0],
      ['stages', 1],
      ['codebook', 'node', 'person', 'dynamicLabel'],
    ]);
  });

  it('finds the owner of a text by its path', () => {
    expect(ownerOfTextPath(['stages', 2, 'form', 'content', 'en'])).toEqual([
      'stages',
      2,
    ]);
    expect(
      ownerOfTextPath(['codebook', 'node', 'person', 'dynamicLabel', 'text']),
    ).toEqual(['codebook', 'node', 'person', 'dynamicLabel']);
    expect(
      ownerOfTextPath(['codebook', 'node', 'person', 'variables', 'v']),
    ).toBeUndefined();
  });
});
