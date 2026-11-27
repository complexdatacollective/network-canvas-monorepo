import { describe, expect, it } from 'vitest';

import { formOf } from '../../testing/fixtures.ts';
import { collectLocalizedStrings } from '../collectLocalizedStrings.ts';
import { isOwnTextOf, textPlaceOf } from '../textPlace.ts';

const STAGE = ['stages', 2] as const;
const LABEL = ['codebook', 'node', 'person', 'dynamicLabel'] as const;
const FORM = [...STAGE, 'form'] as const;

describe('textPlaceOf', () => {
  it('reads the text of a form', () => {
    expect(textPlaceOf([...FORM, 'content'])).toEqual({
      kind: 'formContent',
      owner: STAGE,
      form: FORM,
    });
  });

  it('reads the question and the hint of a form field', () => {
    expect(textPlaceOf([...FORM, 'fields', 1, 'hint'])).toEqual({
      kind: 'formFieldText',
      owner: STAGE,
      form: FORM,
      index: 1,
      text: 'hint',
    });
    expect(textPlaceOf([...FORM, 'fields', 0, 'prompt'])).toMatchObject({
      kind: 'formFieldText',
      text: 'prompt',
    });
  });

  it('reads every version of a dynamic attribute as its wording', () => {
    for (const version of [
      ['cases', 0, 'wording'],
      ['otherwise'],
      ['missing'],
      ['answers', 3, 'wording'],
      ['other'],
      ['participant'],
      ['wording'],
    ]) {
      expect(
        textPlaceOf([...STAGE, 'dynamicAttributes', 'id-1', ...version]),
      ).toEqual({
        kind: 'dynamicAttributeWording',
        owner: STAGE,
        id: 'id-1',
        version,
      });
    }
    expect(
      textPlaceOf([...LABEL, 'dynamicAttributes', 'id-1', 'otherwise']),
    ).toMatchObject({ kind: 'dynamicAttributeWording', owner: LABEL });
  });

  it('reads any other text as text, with its owner where it has one', () => {
    expect(textPlaceOf([...STAGE, 'label'])).toEqual({
      kind: 'text',
      owner: STAGE,
    });
    expect(textPlaceOf([...LABEL, 'text'])).toEqual({
      kind: 'text',
      owner: LABEL,
    });
    // A field's other settings, text named like a field's outside a form,
    // and a form field's question outside any stage.
    for (const path of [
      [...FORM, 'fields', 1, 'variable'],
      [...STAGE, 'fields', 1, 'prompt'],
      [...STAGE, 'content'],
    ]) {
      expect(textPlaceOf(path).kind).toBe('text');
    }
    expect(
      textPlaceOf(['codebook', 'node', 'person', 'variables', 'v', 'name']),
    ).toEqual({ kind: 'text', owner: undefined });
    expect(textPlaceOf(['form', 'fields', 0, 'prompt'])).toEqual({
      kind: 'text',
      owner: undefined,
    });
  });

  it('reads a path that starts at the owner', () => {
    expect(textPlaceOf(['form', 'fields', 0, 'prompt'], 'owner')).toEqual({
      kind: 'formFieldText',
      owner: [],
      form: ['form'],
      index: 0,
      text: 'prompt',
    });
    expect(
      textPlaceOf(['dynamicAttributes', 'id-1', 'otherwise'], 'owner'),
    ).toEqual({
      kind: 'dynamicAttributeWording',
      owner: [],
      id: 'id-1',
      version: ['otherwise'],
    });
  });
});

describe('isOwnTextOf', () => {
  it('is true of the owner’s texts, and not of its dynamic attributes’ wording', () => {
    expect(isOwnTextOf(textPlaceOf([...FORM, 'content']), STAGE)).toBe(true);
    expect(isOwnTextOf(textPlaceOf([...STAGE, 'label']), STAGE)).toBe(true);
    expect(
      isOwnTextOf(
        textPlaceOf([...STAGE, 'dynamicAttributes', 'id-1', 'otherwise']),
        STAGE,
      ),
    ).toBe(false);
    expect(isOwnTextOf(textPlaceOf(['stages', 3, 'label']), STAGE)).toBe(false);
    expect(isOwnTextOf(textPlaceOf(['name']), STAGE)).toBe(false);
  });
});

describe('the place of a localized string', () => {
  it('is carried on each string that a protocol walk finds', () => {
    const hits = collectLocalizedStrings({
      stages: [
        {
          type: 'EgoForm',
          label: { en: 'About you' },
          form: formOf([{ id: 'f1', variable: 'v1', prompt: { en: 'Name?' } }]),
        },
      ],
    });
    expect(hits.map(({ path, place }) => [path.join('.'), place.kind])).toEqual(
      expect.arrayContaining([
        ['stages.0.label', 'text'],
        ['stages.0.form.content', 'formContent'],
        ['stages.0.form.fields.0.prompt', 'formFieldText'],
      ]),
    );
  });
});
