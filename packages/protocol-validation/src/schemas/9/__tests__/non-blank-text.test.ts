import { describe, expect, it } from 'vitest';

import { localized } from '../../../utils/test-utils.ts';
import { FormFieldSchema } from '../common/forms.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import { networkComposerStage } from '../stages/network-composer.ts';
import { ComponentTypes } from '../variables/types.ts';

const issuesOf = (
  schema: { safeParse: (value: unknown) => unknown },
  value: unknown,
) => {
  const result = schema.safeParse(value) as {
    success: boolean;
    error?: { issues: { message: string; path: PropertyKey[] }[] };
  };
  return result.success
    ? []
    : (result.error?.issues.map(({ message, path }) => ({ message, path })) ??
        []);
};

const BLANK_TRANSLATIONS = [
  ['spaces', '   '],
  ['a tab', '\t'],
  ['non-breaking spaces', '  '],
  ['zero-width spaces', '​'],
] as const;

describe('nonBlankText', () => {
  const required = localizedString(nonBlankText(), 'markdown');

  it('accepts a translation with text in it', () => {
    expect(required.safeParse({ en: 'How old are you?' }).success).toBe(true);
    expect(required.safeParse({ en: ' Age ' }).success).toBe(true);
  });

  it('reports an empty translation once', () => {
    expect(issuesOf(required, { en: '' })).toHaveLength(1);
  });

  it.each(BLANK_TRANSLATIONS)(
    'rejects %s, anchored at the language',
    (_n, text) => {
      expect(issuesOf(required, { en: text })).toEqual([
        { message: 'Text cannot be blank.', path: ['en'] },
      ]);
    },
  );

  it('rejects one blank translation even when another has text', () => {
    expect(issuesOf(required, { en: 'Age', fr: '  ' })).toEqual([
      { message: 'Text cannot be blank.', path: ['fr'] },
    ]);
  });
});

describe('a form field prompt', () => {
  const field = (prompt: Record<string, string>) => ({
    variable: 'age',
    prompt,
  });

  it('accepts a prompt with text in every translation', () => {
    expect(
      FormFieldSchema.safeParse(field({ en: 'Age?', fr: 'Âge ?' })).success,
    ).toBe(true);
  });

  it.each(BLANK_TRANSLATIONS)('rejects a prompt of %s', (_n, text) => {
    expect(
      issuesOf(FormFieldSchema, field({ en: text })).map(({ path }) => path),
    ).toContainEqual(['prompt', 'en']);
  });

  it('rejects a blank translation beside a translation with text', () => {
    expect(
      issuesOf(FormFieldSchema, field({ en: 'Age?', fr: ' ' })).map(
        ({ path }) => path,
      ),
    ).toEqual([['prompt', 'fr']]);
  });

  it('still lets the hint be empty', () => {
    expect(
      FormFieldSchema.safeParse({
        ...field({ en: 'Age?' }),
        hint: { en: '' },
      }).success,
    ).toBe(true);
  });
});

describe('a Network Composer field caption', () => {
  it('rejects a caption of spaces, anchored at its label', () => {
    const result = networkComposerStage.safeParse({
      id: 'composer',
      type: 'NetworkComposer',
      label: localized('Compose'),
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      layoutVariable: 'layout',
      background: { concentricCircles: 4 },
      edges: [],
      nodeForm: {
        fields: [
          {
            variable: 'age',
            label: { en: '   ' },
            component: ComponentTypes.Number,
          },
        ],
      },
    });
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'nodeForm',
      'fields',
      0,
      'label',
      'en',
    ]);
  });
});
