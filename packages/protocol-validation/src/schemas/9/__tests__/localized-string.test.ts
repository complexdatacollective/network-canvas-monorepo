import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { escapeMessageText } from '../../../localization/messageSyntax.ts';
import { localized } from '../../../utils/test-utils.ts';
import { VersionedProtocolSchema } from '../../index.ts';
import {
  asOneLine,
  getLocalizedStringDescriptor,
  LocaleTagSchema,
  localizedMessage,
  localizedString,
  ProtocolLocalizationSchema,
} from '../localized-string.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { informationStage as informationStageSchema } from '../stages/information.ts';

const issuesOf = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map(({ message, path }) => ({ message, path }));
};

describe('LocaleTagSchema', () => {
  it.each(['en', 'en-US', 'zh-Hant-TW', 'es-419'])(
    'accepts the canonical tag %s',
    (tag) => {
      expect(LocaleTagSchema.safeParse(tag).success).toBe(true);
    },
  );

  it('rejects a non-canonical spelling and names the canonical one', () => {
    expect(issuesOf(LocaleTagSchema, 'en-us')).toEqual([
      {
        message: '"en-us" is not a canonical language tag. Use "en-US".',
        path: [],
      },
    ]);
  });

  it('suggests a hyphenated tag for an underscored one without accepting it', () => {
    expect(issuesOf(LocaleTagSchema, 'en_US')).toEqual([
      {
        message: '"en_US" is not a canonical language tag. Use "en-US".',
        path: [],
      },
    ]);
  });

  it.each(['und', 'UND', 'und-Latn'])(
    'rejects the undetermined language %s',
    (tag) => {
      expect(issuesOf(LocaleTagSchema, tag)).toEqual([
        {
          message: `"${tag}" does not name a language. A protocol must be written in a specific language, such as "en".`,
          path: [],
        },
      ]);
    },
  );

  it.each(['', 'english!', 'e'])('rejects the malformed tag %j', (tag) => {
    expect(issuesOf(LocaleTagSchema, tag)).toEqual([
      { message: `"${tag}" is not a valid language tag.`, path: [] },
    ]);
  });
});

describe('ProtocolLocalizationSchema', () => {
  it('accepts a default language that is one of the declared languages', () => {
    expect(
      ProtocolLocalizationSchema.safeParse({
        defaultLocale: 'fr',
        locales: ['en', 'fr'],
      }).success,
    ).toBe(true);
  });

  it('requires at least one language', () => {
    expect(
      issuesOf(ProtocolLocalizationSchema, {
        defaultLocale: 'en',
        locales: [],
      }).map(({ message }) => message),
    ).toContain('A protocol must declare at least one language.');
  });

  it('requires the default language to be declared', () => {
    expect(
      issuesOf(ProtocolLocalizationSchema, {
        defaultLocale: 'de',
        locales: ['en', 'fr'],
      }),
    ).toEqual([
      {
        message: `The default language "de" must be one of the protocol's languages.`,
        path: ['defaultLocale'],
      },
    ]);
  });

  it('records nothing about where a language’s built-in wording comes from', () => {
    expect(
      issuesOf(ProtocolLocalizationSchema, {
        defaultLocale: 'en',
        locales: ['en', 'es-MX'],
        startFrom: { 'es-MX': 'es' },
      }).map(({ path }) => path),
    ).toEqual([[]]);
  });

  it('rejects a language declared twice at the repeat', () => {
    expect(
      issuesOf(ProtocolLocalizationSchema, {
        defaultLocale: 'en',
        locales: ['en', 'fr', 'en'],
      }),
    ).toEqual([
      {
        message: 'Language "en" is declared more than once.',
        path: ['locales', 2],
      },
    ]);
  });

  it('rejects a non-canonical declared language at its index', () => {
    expect(
      issuesOf(ProtocolLocalizationSchema, {
        defaultLocale: 'en',
        locales: ['en', 'fr-ca'],
      }),
    ).toContainEqual({
      message: '"fr-ca" is not a canonical language tag. Use "fr-CA".',
      path: ['locales', 1],
    });
  });

  it('rejects the undetermined language as a declared or default language', () => {
    const paths = issuesOf(ProtocolLocalizationSchema, {
      defaultLocale: 'und',
      locales: ['und', 'en'],
    }).map(({ path }) => path);
    expect(paths).toContainEqual(['defaultLocale']);
    expect(paths).toContainEqual(['locales', 0]);
  });

  it('rejects keys it does not define', () => {
    expect(
      ProtocolLocalizationSchema.safeParse({
        defaultLocale: 'en',
        locales: ['en'],
        fallback: 'en',
      }).success,
    ).toBe(false);
  });
});

describe('localizedString', () => {
  const required = localizedString(z.string().min(1), {
    format: 'plain',
    lines: 'single',
  });
  const optionalContent = localizedString(z.string(), {
    format: 'markdown',
    lines: 'multiple',
  });

  it('tags the schema with its declared shape', () => {
    expect(getLocalizedStringDescriptor(required)).toEqual({
      format: 'plain',
      lines: 'single',
    });
    expect(getLocalizedStringDescriptor(optionalContent)).toEqual({
      format: 'markdown',
      lines: 'multiple',
    });
    expect(getLocalizedStringDescriptor(z.string())).toBeUndefined();
  });

  it('accepts one translation per language', () => {
    expect(required.safeParse({ en: 'Hello', fr: 'Bonjour' }).success).toBe(
      true,
    );
  });

  it('rejects a plain string', () => {
    expect(required.safeParse('Hello').success).toBe(false);
  });

  // Whether text may have no translation depends on where it sits, which
  // only the protocol can see: wording Network Canvas supplies may, until the
  // researcher writes it (see `findEmptyTextPaths`).
  it('leaves an object with no translation to the protocol', () => {
    expect(issuesOf(required, {})).toEqual([]);
  });

  it("applies the owning field's rule to every translation", () => {
    expect(
      issuesOf(required, { en: 'Hello', fr: '' }).map(({ path }) => path),
    ).toEqual([['fr']]);
  });

  it('keeps an empty translation valid where the field allowed empty text', () => {
    expect(optionalContent.safeParse({ en: '' }).success).toBe(true);
  });

  it('rejects a non-canonical language key at that key', () => {
    expect(issuesOf(required, { 'en-us': 'Hello' })).toEqual([
      {
        message: '"en-us" is not a canonical language tag. Use "en-US".',
        path: ['en-us'],
      },
    ]);
  });

  it('rejects the undetermined language as a key', () => {
    expect(issuesOf(required, { und: 'Hello' })).toEqual([
      {
        message:
          '"und" does not name a language. A protocol must be written in a specific language, such as "en".',
        path: ['und'],
      },
    ]);
  });

  it('rejects a malformed language key at that key', () => {
    expect(issuesOf(required, { 'not a tag': 'Hello' })).toEqual([
      {
        message: '"not a tag" is not a valid language tag.',
        path: ['not a tag'],
      },
    ]);
  });

  it('rejects text that is not valid message syntax', () => {
    const [issue] = issuesOf(required, { en: 'Hello {' });
    expect(issue?.path).toEqual(['en']);
    expect(issue?.message).toMatch(/^Text is not valid message syntax/);
  });

  it.each([
    'Hello {name}',
    '{count, plural, one {# friend} other {# friends}}',
    '{gender, select, other {them}}',
  ])('rejects the non-literal message %j', (message) => {
    expect(issuesOf(required, { en: message })).toEqual([
      {
        message:
          'Text cannot contain placeholders or formatting such as "{name}", plural or select.',
        path: ['en'],
      },
    ]);
  });

  it('accepts braces escaped as literal text', () => {
    expect(
      required.safeParse({ en: escapeMessageText('Type {name} here') }).success,
    ).toBe(true);
  });

  it('accepts markup as literal text', () => {
    expect(
      required.safeParse({ en: '<b>Bold</b> & <i>more</i>' }).success,
    ).toBe(true);
  });
});

describe('line breaks', () => {
  const oneLine = {
    'plain text': localizedString(z.string(), {
      format: 'plain',
      lines: 'single',
    }),
    'markdown text': localizedString(z.string(), {
      format: 'markdown',
      lines: 'single',
    }),
    'a message': localizedMessage(z.string(), { arguments: {} }),
  };
  const severalLines = localizedString(z.string(), {
    format: 'markdown',
    lines: 'multiple',
  });
  const breaks = {
    'a line feed': 'First\nsecond',
    'a carriage return': 'First\rsecond',
    'a line separator': 'First\u2028second',
    'a paragraph separator': 'First\u2029second',
    'a trailing line feed': 'First second\n',
  };

  for (const [field, schema] of Object.entries(oneLine)) {
    it.each(Object.entries(breaks))(
      `refuses %s in ${field} declared one line, in any language`,
      (_name, text) => {
        expect(issuesOf(schema, { en: 'First second', fr: text })).toEqual([
          { message: 'Text cannot contain a line break.', path: ['fr'] },
        ]);
      },
    );
  }

  it.each(Object.entries(breaks))(
    'accepts %s in text declared several lines',
    (_name, text) => {
      expect(issuesOf(severalLines, { en: text, fr: text })).toEqual([]);
    },
  );
});

describe('asOneLine', () => {
  it('replaces each run of line breaks and the spaces around it with one space', () => {
    expect(asOneLine('First \n\n  second\r\nthird\u2028fourth')).toBe(
      'First second third fourth',
    );
  });

  it('trims the ends of text it joins', () => {
    expect(asOneLine('\n Welcome \n')).toBe('Welcome');
  });

  it('leaves text with no line break as it is', () => {
    expect(asOneLine('  Two  spaces ')).toBe('  Two  spaces ');
  });
});

describe('Information stage title', () => {
  const stage = (title: unknown) => ({
    id: 'welcome',
    type: 'Information',
    label: { en: 'Welcome' },
    title,
    items: [],
  });

  // A translation of only spaces would be chosen over falling back to
  // another language, and show a stage with no heading.
  it('rejects a translation that shows nothing', () => {
    expect(
      informationStageSchema.safeParse(stage({ en: 'Information', fr: '   ' }))
        .success,
    ).toBe(false);
  });

  it('accepts a title in every language', () => {
    expect(
      informationStageSchema.safeParse(
        stage({ en: 'Information', fr: 'Informations' }),
      ).success,
    ).toBe(true);
  });

  it('refuses a title holding a line break, while its content may hold several lines', () => {
    expect(
      issuesOf(informationStageSchema, {
        ...stage({ en: 'Information', fr: 'Informa-\ntions' }),
        items: [
          {
            id: 'item',
            type: 'text',
            content: {
              en: '## Welcome\n\nHello',
              fr: '## Bienvenue\n\nBonjour',
            },
          },
        ],
      }),
    ).toEqual([
      { message: 'Text cannot contain a line break.', path: ['title', 'fr'] },
    ]);
  });
});

describe('schema version boundary', () => {
  const informationStage = (label: unknown, text: unknown) => ({
    id: 'welcome',
    type: 'Information',
    label,
    title: text,
    items: [{ id: 'item', type: 'text', content: text }],
  });

  const schema9Protocol = (label: unknown, text: unknown) => ({
    name: 'Boundary',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {},
    stages: [
      informationStage(label, text),
      {
        id: 'finish',
        type: 'FinishSession',
        mode: 'confirmation',
        label,
        content: text,
        finishedContent: text,
        finishLabel: label,
        finishConfirmation: label,
        finishFailed: label,
        outcome: 'completed',
      },
    ],
  });

  it('accepts localized copy through the versioned schema', () => {
    expect(
      VersionedProtocolSchema.safeParse(
        schema9Protocol(localized('Welcome'), localized('Hello')),
      ).success,
    ).toBe(true);
  });

  it('rejects plain-string copy in schema 9', () => {
    expect(
      ProtocolSchemaV9.safeParse(
        withFinishStage(schema9Protocol('Welcome', 'Hello')),
      ).success,
    ).toBe(false);
  });

  it('requires schema 9 to declare its languages', () => {
    const { localization: _localization, ...protocol } = schema9Protocol(
      localized('Welcome'),
      localized('Hello'),
    );
    expect(
      issuesOf(ProtocolSchemaV9, protocol).map(({ path }) => path),
    ).toContainEqual(['localization']);
  });
});
