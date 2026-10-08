import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { escapeMessageText } from '../../../localization/messageSyntax.ts';
import { localized } from '../../../utils/test-utils.ts';
import { VersionedProtocolSchema } from '../../index.ts';
import {
  getLocalizedStringDescriptor,
  LocaleTagSchema,
  localizedString,
  ProtocolLocalizationSchema,
} from '../localized-string.ts';
import ProtocolSchemaV9 from '../schema.ts';

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
  const required = localizedString(z.string().min(1), 'plain');
  const optionalContent = localizedString(z.string(), 'markdown');

  it('tags the schema with its rendering format', () => {
    expect(getLocalizedStringDescriptor(required)).toEqual({ format: 'plain' });
    expect(getLocalizedStringDescriptor(optionalContent)).toEqual({
      format: 'markdown',
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

  it('rejects an object with no translation', () => {
    expect(issuesOf(required, {})).toEqual([
      { message: 'Text must have at least one translation.', path: [] },
    ]);
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
    stages: [informationStage(label, text)],
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
      ProtocolSchemaV9.safeParse(schema9Protocol('Welcome', 'Hello')).success,
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
