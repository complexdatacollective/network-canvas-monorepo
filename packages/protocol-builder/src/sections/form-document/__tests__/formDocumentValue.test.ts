import { describe, expect, it } from 'vitest';

import { fieldBlockMarkdown } from '@codaco/protocol-validation';

import type { FieldText } from '../../../localization/messageDocument.ts';
import { testId, testVariableId } from '../../../testing/testId.ts';
import {
  fieldCollecting,
  fieldsAfterEdit,
  fieldTextFor,
  formFieldDraftsOf,
  type FormFieldDraft,
  formFieldProblems,
  variablesPlacedBy,
} from '../formDocumentValue.ts';

const NAME_FIELD = testId('field/name');
const AGE_FIELD = testId('field/age');
const NAME = testVariableId('name');
const AGE = testVariableId('age');

const text = (
  variable: string,
  prompt?: string,
  hint?: string,
  showValidationHints = false,
): FieldText => ({
  variable,
  showValidationHints,
  ...(prompt !== undefined && { prompt }),
  ...(hint !== undefined && { hint }),
});

const REGISTRY: readonly FormFieldDraft[] = [
  {
    id: NAME_FIELD,
    variable: NAME,
    prompt: { en: 'What is their name?', es: '¿Cómo se llama?' },
    hint: { en: 'A first name is enough.' },
  },
  { id: AGE_FIELD, variable: AGE, prompt: { en: 'How old are they?' } },
];

const CONTENT = {
  en: `Tell us about them.\n\n${fieldBlockMarkdown(NAME_FIELD)}\n\n${fieldBlockMarkdown(AGE_FIELD)}`,
  es: `Cuéntanos.\n\n${fieldBlockMarkdown(NAME_FIELD)}`,
};

describe('reading a form', () => {
  it('opens each block with its question and hint in that language', () => {
    expect(fieldTextFor(REGISTRY, 'es')(NAME_FIELD)).toEqual(
      text(NAME, '¿Cómo se llama?'),
    );
    expect(fieldTextFor(REGISTRY, 'en')(NAME_FIELD)).toEqual(
      text(NAME, 'What is their name?', 'A first name is enough.'),
    );
    expect(fieldTextFor(REGISTRY, 'en')(testId('field/none'))).toBeUndefined();
  });

  it('leaves out entries that are not fields, and drops a false toggle', () => {
    expect(
      formFieldDraftsOf([
        'not a field',
        { variable: NAME },
        { id: AGE_FIELD, variable: AGE, showValidationHints: false },
      ]),
    ).toEqual([{ id: AGE_FIELD, variable: AGE }]);
  });

  it('names the attributes one language places', () => {
    expect(variablesPlacedBy(REGISTRY, CONTENT.es)).toEqual([NAME]);
    expect(fieldCollecting(REGISTRY, AGE)?.id).toBe(AGE_FIELD);
    expect(fieldCollecting(REGISTRY, '')).toBeUndefined();
  });
});

describe('writing one language of a form', () => {
  it('writes each block’s question and hint in that language only', () => {
    const next = fieldsAfterEdit(
      REGISTRY,
      'es',
      new Map([[NAME_FIELD, text(NAME, '¿Su nombre?', 'Basta el nombre.')]]),
    );

    expect(next[0]).toEqual({
      id: NAME_FIELD,
      variable: NAME,
      prompt: { en: 'What is their name?', es: '¿Su nombre?' },
      hint: { en: 'A first name is enough.', es: 'Basta el nombre.' },
    });
    expect(next[1]).toEqual(REGISTRY[1]);
  });

  it('keeps a field that the document no longer places, in every language, until the save', () => {
    // The Spanish document no longer places the name field, and the English
    // one has lost the age field: both come back whole with Undo or a paste.
    expect(fieldsAfterEdit(REGISTRY, 'es', new Map())).toEqual(REGISTRY);
    expect(
      fieldsAfterEdit(
        REGISTRY,
        'en',
        new Map([
          [
            NAME_FIELD,
            text(NAME, 'What is their name?', 'A first name is enough.'),
          ],
        ]),
      ),
    ).toEqual(REGISTRY);
  });

  it('adds a new block at the end, with its attribute and toggle', () => {
    const added = testId('field/new');
    const next = fieldsAfterEdit(
      REGISTRY,
      'en',
      new Map([
        [NAME_FIELD, text(NAME, 'What is their name?')],
        [AGE_FIELD, text(AGE, 'How old are they?')],
        [added, text('', undefined, undefined, true)],
      ]),
    );

    expect(next.at(-1)).toEqual({
      id: added,
      variable: '',
      showValidationHints: true,
    });
    // A hint emptied in English is removed.
    expect(next[0]?.hint).toBeUndefined();
  });

  it('keeps the field id of a block that reuses another language’s field', () => {
    // Spanish adds the age field that only English placed: the same id.
    const next = fieldsAfterEdit(
      REGISTRY,
      'es',
      new Map([
        [NAME_FIELD, text(NAME, '¿Cómo se llama?')],
        [AGE_FIELD, text(AGE, '¿Cuántos años tiene?')],
      ]),
    );

    expect(next).toHaveLength(2);
    expect(next[1]?.prompt).toEqual({
      en: 'How old are they?',
      es: '¿Cuántos años tiene?',
    });
  });
});

describe('the fields with a problem', () => {
  const name: FormFieldDraft = {
    id: NAME_FIELD,
    variable: NAME,
    prompt: { en: 'Name?', es: '¿Nombre?' },
  };
  const age: FormFieldDraft = {
    id: AGE_FIELD,
    variable: AGE,
    prompt: { en: 'Age?' },
  };
  const both = `${fieldBlockMarkdown(NAME_FIELD)}\n\n${fieldBlockMarkdown(AGE_FIELD)}`;
  const rules = (locale: string, reserved: string[] = []) => ({
    locale,
    reserved: new Set(reserved),
  });

  it('are none when every field can be saved', () => {
    expect(formFieldProblems([name, age], { en: both }, rules('en'))).toEqual(
      [],
    );
  });

  it('include a field without a question in a language whose form places it', () => {
    expect(
      formFieldProblems([name, age], { en: both, es: both }, rules('en')),
    ).toEqual([{ fieldId: AGE_FIELD, locale: 'es', problem: 'question' }]);
  });

  it('include a field without an attribute, with one that another field collects or that the stage keeps, or with one that the codebook no longer has', () => {
    const content = { en: both };
    expect(
      formFieldProblems([name, { ...age, variable: '' }], content, rules('en')),
    ).toEqual([{ fieldId: AGE_FIELD, locale: 'en', problem: 'attribute' }]);
    expect(
      formFieldProblems(
        [name, { ...age, variable: NAME }],
        content,
        rules('en'),
      ).map(({ fieldId, problem }) => [fieldId, problem]),
    ).toEqual([
      [NAME_FIELD, 'taken'],
      [AGE_FIELD, 'taken'],
    ]);
    expect(
      formFieldProblems([name, age], content, rules('en', [AGE]))[0],
    ).toEqual({ fieldId: AGE_FIELD, locale: 'en', problem: 'reserved' });
    expect(
      formFieldProblems([name, age], content, {
        ...rules('en'),
        hasAttribute: (variableId) => variableId !== AGE,
      })[0],
    ).toEqual({ fieldId: AGE_FIELD, locale: 'en', problem: 'attribute' });
  });

  it('leave out the fields that no document places, and those being put in', () => {
    const stale: FormFieldDraft = { id: testId('field/stale'), variable: '' };
    expect(
      formFieldProblems([name, age, stale], { en: both }, rules('en')),
    ).toEqual([]);
    expect(
      formFieldProblems(
        [name, { ...age, variable: '' }],
        { en: both },
        {
          ...rules('en'),
          skipped: new Set([AGE_FIELD]),
        },
      ),
    ).toEqual([]);
  });

  it('start with the document of the language being edited', () => {
    const fields: FormFieldDraft[] = [
      { ...name, prompt: { en: 'Name?' } },
      { ...age, prompt: { es: '¿Edad?' } },
    ];
    const content = {
      en: fieldBlockMarkdown(AGE_FIELD),
      es: fieldBlockMarkdown(NAME_FIELD),
    };
    expect(formFieldProblems(fields, content, rules('es'))[0]).toEqual({
      fieldId: NAME_FIELD,
      locale: 'es',
      problem: 'question',
    });
    expect(formFieldProblems(fields, content, rules('en'))[0]).toEqual({
      fieldId: AGE_FIELD,
      locale: 'en',
      problem: 'question',
    });
  });
});
