import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { parseIssues } from '../../../__tests__/schemaIssues.ts';
import { escapeMessageText } from '../../../localization/messageSyntax.ts';
import { localized } from '../../../utils/test-utils.ts';
import { VersionedProtocolSchema } from '../../index.ts';
import {
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
      parseIssues(
        ProtocolLocalizationSchema.safeParse({
          defaultLocale: 'en',
          locales: ['en'],
          fallback: 'en',
        }),
      ),
    ).toEqual([{ path: '', code: 'unrecognized_keys', keys: ['fallback'] }]);
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
    expect(parseIssues(required.safeParse('Hello'))).toEqual([
      { path: '', code: 'invalid_type' },
    ]);
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

describe('Information stage content', () => {
  const stage = (content: unknown) => ({
    id: 'welcome',
    type: 'Information',
    label: { en: 'Welcome' },
    content,
  });

  // A translation of only spaces would be chosen over falling back to
  // another language, and show a page with nothing on it.
  it('rejects a translation that shows nothing', () => {
    expect(
      parseIssues(
        informationStageSchema.safeParse(
          stage({ en: '# Information', fr: '   ' }),
        ),
      ),
    ).toEqual([
      { path: 'content.fr', code: 'custom', message: 'Text cannot be blank.' },
    ]);
  });

  it('accepts content in every language', () => {
    expect(
      informationStageSchema.safeParse(
        stage({ en: '# Information', fr: '# Informations' }),
      ).success,
    ).toBe(true);
  });

  it('accepts a heading and paragraphs on several lines in every language', () => {
    expect(
      issuesOf(
        informationStageSchema,
        stage({
          en: '## Welcome\n\nHello',
          fr: '## Bienvenue\n\nBonjour',
        }),
      ),
    ).toEqual([]);
  });
});

describe('schema version boundary', () => {
  const informationStage = (label: unknown, text: unknown) => ({
    id: 'welcome',
    type: 'Information',
    label,
    content: text,
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
        withFinishStage(
          schema9Protocol(localized('Welcome'), localized('Hello')),
        ),
      ).success,
    ).toBe(true);
  });

  it('rejects plain-string copy in schema 9', () => {
    expect(
      parseIssues(
        ProtocolSchemaV9.safeParse(
          withFinishStage(schema9Protocol('Welcome', 'Hello')),
        ),
      ),
    ).toEqual([
      { path: 'stages.0.content', code: 'invalid_type' },
      { path: 'stages.0.label', code: 'invalid_type' },
      { path: 'stages.1.content', code: 'invalid_type' },
      { path: 'stages.1.finishConfirmation', code: 'invalid_type' },
      { path: 'stages.1.finishFailed', code: 'invalid_type' },
      { path: 'stages.1.finishLabel', code: 'invalid_type' },
      { path: 'stages.1.finishedContent', code: 'invalid_type' },
      { path: 'stages.1.label', code: 'invalid_type' },
    ]);
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

const stageTextOf = (format: 'plain' | 'markdown') =>
  localizedString(
    z.string(),
    { format, lines: 'multiple' },
    { dynamicValues: 'stageText' },
  );

describe('a line break inside a version of formatted text', () => {
  const VERSIONS =
    'Hello\n\n{name, select, missing {there} other {{name},\nwelcome}}';
  const REFUSAL = /A version of this text cannot contain a line break\./;

  it('is refused where the text is markdown', () => {
    expect(issuesOf(stageTextOf('markdown'), { en: VERSIONS })).toEqual([
      { message: expect.stringMatching(REFUSAL), path: ['en'] },
    ]);
  });

  it('is accepted outside the versions, and in plain text', () => {
    expect(
      issuesOf(stageTextOf('markdown'), {
        en: 'Hello\n\n{name, select, missing {there} other {{name}}}',
      }),
    ).toEqual([]);
    expect(issuesOf(stageTextOf('plain'), { en: VERSIONS })).toEqual([]);
  });
});

describe('a value inside a link address of formatted text', () => {
  const REFUSAL = /A link address cannot contain a value\./;

  it.each([
    ['in the address', '[Your page](https://example.com/{today})'],
    [
      'in a version that opens with spaces',
      '{today, select, missing {hello} other {    [you](https://example.com/{today})}}',
    ],
    ['in the title', '[Your page](https://example.com "For {name}")'],
    [
      'in an address written between angle brackets',
      '<https://example.com/{today}>',
    ],
    [
      'in a link inside a version',
      '{name, select, missing {Hello} other {[you](https://example.com/{name})}}',
    ],
    [
      'as a choice of versions',
      '[Your page](https://example.com/{name, select, missing {a} other {b}})',
    ],
  ])('is refused %s', (_where, message) => {
    expect(issuesOf(stageTextOf('markdown'), { en: message })).toEqual([
      { message: expect.stringMatching(REFUSAL), path: ['en'] },
    ]);
  });

  it('is accepted in the words of a link, beside a link, and in plain text', () => {
    expect(
      issuesOf(stageTextOf('markdown'), {
        en: '[Page for {name}](https://example.com) and {today}',
      }),
    ).toEqual([]);
    expect(
      issuesOf(stageTextOf('markdown'), {
        en: 'Written out, not a link: \\[a\\](https://example.com/{today})',
      }),
    ).toEqual([]);
    expect(
      issuesOf(stageTextOf('plain'), {
        en: '[Your page](https://example.com/{today})',
      }),
    ).toEqual([]);
  });

  // Raw HTML is shown as the characters typed, so what looks like a link
  // inside a tag is words.
  it('is accepted inside a tag', () => {
    expect(
      issuesOf(stageTextOf('markdown'), {
        en: '<span title="[you](https://example.com/{today})">',
      }),
    ).toEqual([]);
  });
});
