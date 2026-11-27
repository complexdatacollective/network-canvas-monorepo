import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  getMarkdownLabelText,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import {
  type AttributeDynamicValueRole,
  dynamicValueNameFor,
  type LabelledDynamicValueRole,
  type LocalizedString,
  optionCaseKey,
  type Variable,
} from '@codaco/protocol-validation';

import { testId, testVariableId } from '../../__tests__/testIds';
import { contentFormatFor } from '../../localization/contentFormat';
import { DynamicMarkdown } from '../DynamicText';
import {
  type DynamicValueFormatters,
  type DynamicValueSources,
  markdownSource,
  resolveDynamicText,
  showsDynamicValues,
} from '../resolveDynamicText';

const NAME = testVariableId('name');
const AGE = testVariableId('age');
const BORN = testVariableId('born');
const CLOSENESS = testVariableId('closeness');
const LANGUAGES = testVariableId('languages');
const SMOKES = testVariableId('smokes');
/** The text a page shows for `html`, read from the parsed document. */
const drawnText = (html: string): string =>
  new DOMParser().parseFromString(html, 'text/html').body.textContent;

const OPTION = {
  notClose: testId('option not close'),
  veryClose: testId('option very close'),
  english: testId('option english'),
  french: testId('option french'),
  spanish: testId('option spanish'),
};

const VARIABLES: Record<string, Variable> = {
  [NAME]: { name: 'name', type: 'text' },
  [AGE]: { name: 'age', type: 'number' },
  [BORN]: { name: 'born', type: 'datetime' },
  [CLOSENESS]: {
    name: 'closeness',
    type: 'ordinal',
    options: [
      { id: OPTION.notClose, label: { en: 'Not close' }, value: 0 },
      { id: OPTION.veryClose, label: { en: 'Very close' }, value: 1 },
    ],
  },
  [LANGUAGES]: {
    name: 'languages',
    type: 'categorical',
    options: [
      { id: OPTION.english, label: { en: 'English' }, value: 'en' },
      { id: OPTION.french, label: { en: 'French' }, value: 'fr' },
      { id: OPTION.spanish, label: { en: 'Spanish' }, value: 'es' },
    ],
  },
  [SMOKES]: { name: 'smokes', type: 'boolean' },
} as Record<string, Variable>;

/** The name text gives an attribute of `role`. */
const attribute = (
  variableId: string,
  role: AttributeDynamicValueRole = 'ego',
) => dynamicValueNameFor({ kind: 'attribute', role, variableId });
/** The name text gives the label of the node in `role`. */
const labelName = (role: LabelledDynamicValueRole) =>
  dynamicValueNameFor({ kind: 'label', role });

const N = {
  name: attribute(NAME),
  age: attribute(AGE),
  born: attribute(BORN),
  closeness: attribute(CLOSENESS),
  languages: attribute(LANGUAGES),
  smokes: attribute(SMOKES),
  partner: attribute(NAME, 'dyadTarget'),
  first: labelName('dyadSource'),
  second: labelName('dyadTarget'),
  isYou: dynamicValueNameFor({ kind: 'participant', role: 'node' }),
  today: dynamicValueNameFor({ kind: 'intrinsic', name: 'now' }),
};

const sources = (
  ego: Record<string, unknown>,
  extra: Partial<DynamicValueSources> = {},
): DynamicValueSources => ({
  intrinsics: { now: new Date('2026-10-13T12:00:00Z') },
  attributes: { ego },
  labels: {},
  variablesFor: (role) => (role === 'ego' ? VARIABLES : undefined),
  ...extra,
});

const formatters = (locale = 'en'): DynamicValueFormatters => ({
  format: contentFormatFor(locale),
  resolveLabel: (label: LocalizedString) => Object.values(label)[0] ?? '',
  booleanWords: { yes: 'Yes', no: 'No' },
  versionOf: (wording) => {
    const [found] = Object.entries(wording);
    return { message: found?.[1] ?? '', locale: found?.[0] ?? locale };
  },
});

const resolve = (
  message: string,
  ego: Record<string, unknown>,
  locale = 'en',
  extra?: Partial<DynamicValueSources>,
) =>
  resolveDynamicText(message, locale, sources(ego, extra), formatters(locale));

const GREETING = `{${N.name}, select, missing {Hello!} other {Hello, {${N.name}}!}}`;

describe('resolveDynamicText', () => {
  it('leaves text that shows no value to the ordinary formatter', () => {
    expect(resolve('Hello!', {})).toBeUndefined();
    expect(resolve("'{'quoted'}'", {})).toBeUndefined();
    // A message that does not parse is formatted as any other.
    expect(resolve(`{${N.name}, select, other {}`, {})).toBeUndefined();
  });

  it('reads a name that stands for nothing as missing', () => {
    expect(
      resolve('{unknown, select, missing {Nobody} other {Somebody}}', {}),
    ).toEqual({ parts: ['Nobody'], text: 'Nobody' });
    // A role that is not one, and an attribute of no variable.
    expect(
      resolve('{stranger_label, select, missing {Nobody} other {Somebody}}', {})
        ?.text,
    ).toBe('Nobody');
    expect(
      resolve(
        `{${attribute(testVariableId('gone'))}, select, missing {Nobody} other {Somebody}}`,
        {},
      )?.text,
    ).toBe('Nobody');
    // Shown, it shows nothing.
    expect(resolve('Hello {unknown}!', {})).toEqual({
      parts: ['Hello ', '!'],
      text: 'Hello !',
    });
  });

  it('warns once in development about a name that stands for nothing, naming it but no value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      // A message no other test reads, so that its first reading is here.
      const message = `{ghost_value, select, missing {Nobody} other {Somebody}} {${N.name}, select, missing {} other {{${N.name}}}}`;
      expect(resolve(message, { [NAME]: 'Ada Lovelace' })?.text).toBe(
        'Nobody Ada Lovelace',
      );
      expect(resolve(message, { [NAME]: 'Ada Lovelace' })?.text).toBe(
        'Nobody Ada Lovelace',
      );
      expect(warn).toHaveBeenCalledTimes(1);
      const [warning] = warn.mock.calls[0] ?? [];
      expect(warning).toContain('"ghost_value"');
      expect(warning).not.toContain('Ada');
      expect(warning).not.toContain(N.name);
      // A message whose every name stands for something gives no warning.
      warn.mockClear();
      resolve(`{${N.age}, select, missing {?} other {{${N.age}}}} `, {
        [AGE]: 3,
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('gives no warning for interface wording that is only scanned for values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      // Interface wording has arguments of its own, such as `count`; scanning
      // a stage for values reads it, and must neither warn nor need Vite's
      // environment, which hosts such as Fresco do not have.
      expect(
        showsDynamicValues({
          minNodesNotice: '{count, plural, one {# more} other {# more}}',
        }),
      ).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('gives no warning outside development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('DEV', false);
    try {
      expect(
        resolve('{ghost_in_production, select, missing {Nobody} other {}}', {})
          ?.text,
      ).toBe('Nobody');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      warn.mockRestore();
    }
  });

  it('takes the missing version for every kind of missing value', () => {
    for (const missing of [undefined, null, '', '   ', []]) {
      expect(resolve(GREETING, { [NAME]: missing })).toEqual({
        parts: ['Hello!'],
        text: 'Hello!',
      });
    }
  });

  it('shows a present value as text, marking where it is', () => {
    expect(resolve(GREETING, { [NAME]: 'Ada' })).toEqual({
      parts: ['Hello, ', { name: N.name, text: 'Ada' }, '!'],
      text: 'Hello, Ada!',
    });
  });

  it('shows 0 and false as values, not as missing', () => {
    expect(
      resolve(`{${N.age}, select, missing {?} other {Age {${N.age}}}}`, {
        [AGE]: 0,
      })?.text,
    ).toBe('Age 0');
    expect(
      resolve(`{${N.smokes}, select, missing {?} other {{${N.smokes}}}}`, {
        [SMOKES]: false,
      })?.text,
    ).toBe('No');
  });

  it('chooses a version by a yes/no answer', () => {
    const message = `{${N.smokes}, select, missing {?} true {A smoker} false {Not a smoker} other {Other}}`;
    expect(resolve(message, { [SMOKES]: true })?.text).toBe('A smoker');
    expect(resolve(message, { [SMOKES]: false })?.text).toBe('Not a smoker');
    expect(
      resolve(`{${N.smokes}, select, true {A smoker} other {Other}}`, {
        [SMOKES]: false,
      })?.text,
    ).toBe('Other');
  });

  it('chooses a case by the stored option’s id, and other for the rest', () => {
    const message = `{${N.closeness}, select, missing {?} ${optionCaseKey(OPTION.veryClose)} {Close: {${N.closeness}}} other {Not: {${N.closeness}}}}`;
    expect(resolve(message, { [CLOSENESS]: 1 })?.text).toBe(
      'Close: Very close',
    );
    expect(resolve(message, { [CLOSENESS]: 0 })?.text).toBe('Not: Not close');
  });

  it('reads an answer stored as text of a number as that option, as the schema does', () => {
    const message = `{${N.closeness}, select, missing {?} ${optionCaseKey(OPTION.veryClose)} {Close: {${N.closeness}}} other {Not: {${N.closeness}}}}`;
    expect(resolve(message, { [CLOSENESS]: '1' })?.text).toBe(
      'Close: Very close',
    );
    expect(resolve(message, { [CLOSENESS]: '0' })?.text).toBe('Not: Not close');
    expect(resolve(message, { [CLOSENESS]: ['1'] })?.text).toBe(
      'Close: Very close',
    );
  });

  it('matches a case among a list of answers, and lists them', () => {
    const message = `{${N.languages}, select, missing {?} ${optionCaseKey(OPTION.french)} {Bonjour ({${N.languages}})} other {{${N.languages}}}}`;
    expect(resolve(message, { [LANGUAGES]: ['en', 'fr'] })?.text).toBe(
      'Bonjour (English and French)',
    );
    expect(resolve(message, { [LANGUAGES]: ['en', 'es'] })?.text).toBe(
      'English and Spanish',
    );
  });

  it('chooses, for several answers, the first option in the codebook’s order that the text has a version for', () => {
    const versions = `${optionCaseKey(OPTION.spanish)} {Hola} ${optionCaseKey(OPTION.french)} {Bonjour} other {Hello}`;
    const message = `{${N.languages}, select, ${versions}}`;
    // French comes before Spanish in the codebook, whatever order the
    // answers or the versions are in.
    expect(resolve(message, { [LANGUAGES]: ['es', 'fr'] })?.text).toBe(
      'Bonjour',
    );
    expect(resolve(message, { [LANGUAGES]: ['fr', 'es'] })?.text).toBe(
      'Bonjour',
    );
    // English comes first, but the text has no version for it.
    expect(resolve(message, { [LANGUAGES]: ['en', 'es'] })?.text).toBe('Hola');
    expect(resolve(message, { [LANGUAGES]: ['en'] })?.text).toBe('Hello');
    // Each select chooses among its own versions.
    const two = `{${N.languages}, select, ${optionCaseKey(OPTION.spanish)} {Hola} other {Hello}} / {${N.languages}, select, ${optionCaseKey(OPTION.english)} {Hi} other {Hello}}`;
    expect(resolve(two, { [LANGUAGES]: ['en', 'es'] })?.text).toBe('Hola / Hi');
  });

  describe('in a language other than English', () => {
    const LOCALIZED: Record<string, Variable> = {
      [LANGUAGES]: {
        name: 'languages',
        type: 'categorical',
        options: [
          {
            id: OPTION.english,
            label: { en: 'English', es: 'Inglés', de: 'Englisch' },
            value: 'en',
          },
          {
            id: OPTION.french,
            label: { en: 'French', es: '**Francés**', de: 'Französisch' },
            value: 'fr',
          },
          {
            id: OPTION.spanish,
            label: { en: 'Spanish', es: 'Español', de: 'Spanisch' },
            value: 'es',
          },
        ],
      },
    } as Record<string, Variable>;

    // Chooses the label in the interview's language and reads it as the text
    // its markdown shows, as the protocol localization provider does.
    const resolveIn = (locale: string, languages: string[]) =>
      resolveDynamicText(
        `{${N.languages}, select, missing {?} other {{${N.languages}}}}`,
        locale,
        sources({ [LANGUAGES]: languages }, { variablesFor: () => LOCALIZED }),
        {
          ...formatters(locale),
          resolveLabel: (label: LocalizedString) =>
            getMarkdownLabelText(label[locale] ?? label.en ?? ''),
        },
      );

    it('lists the answers with the language’s conjunction and option labels', () => {
      expect(resolveIn('es', ['en', 'fr', 'es'])?.text).toBe(
        'Inglés, Francés y Español',
      );
      expect(resolveIn('de', ['en', 'fr'])?.text).toBe(
        'Englisch und Französisch',
      );
      expect(resolveIn('en', ['en', 'fr'])?.text).toBe('English and French');
    });

    it('shows a single answer as its translated label alone', () => {
      expect(resolveIn('de', ['es'])?.text).toBe('Spanisch');
    });
  });

  it('chooses a plural by the language, and writes # as the number', () => {
    const message = `{${N.age}, select, missing {?} other {{${N.age}, plural, one {# year} other {# years}}}}`;
    expect(resolve(message, { [AGE]: 1 })?.text).toBe('1 year');
    expect(resolve(message, { [AGE]: 1200 })?.text).toBe('1,200 years');
    expect(resolve(message, { [AGE]: 1200 }, 'de')?.text).toBe('1.200 years');
    // The version agrees with the number as it is shown, every digit of it.
    expect(resolve(message, { [AGE]: 1.0001 })?.text).toBe('1.0001 years');
  });

  it('writes a stored date in the language, without a time zone shift', () => {
    const message = `{${N.born}, select, missing {?} other {{${N.born}}}}`;
    expect(resolve(message, { [BORN]: '2024-03-05' })?.text).toBe(
      'March 5, 2024',
    );
    expect(resolve(message, { [BORN]: '2024-03' })?.text).toBe('March 2024');
    expect(resolve(message, { [BORN]: '2024' })?.text).toBe('2024');
    expect(resolve(message, { [BORN]: '2024-03-05' }, 'fr')?.text).toBe(
      '5 mars 2024',
    );
  });

  it('shows a stored date that is not on the calendar as it was stored', () => {
    const message = `{${N.born}, select, missing {?} other {{${N.born}}}}`;
    expect(resolve(message, { [BORN]: '2024-02-31' })?.text).toBe('2024-02-31');
    expect(resolve(message, { [BORN]: '2024-13' })?.text).toBe('2024-13');
    expect(resolve(message, { [BORN]: '2024-00-10' })?.text).toBe('2024-00-10');
    expect(resolve(message, { [BORN]: '0000-01-01' })?.text).toBe('0000-01-01');
    expect(resolve(message, { [BORN]: '2024-1' })?.text).toBe('2024-1');
    expect(resolve(message, { [BORN]: '2024-01-01junk' })?.text).toBe(
      '2024-01-01junk',
    );
    expect(resolve(message, { [BORN]: '2024-02-31T00:00Z' })?.text).toBe(
      '2024-02-31T00:00Z',
    );
    expect(resolve(message, { [BORN]: '0000-01-01T00:00Z' })?.text).toBe(
      '0000-01-01T00:00Z',
    );
    expect(resolve(message, { [BORN]: '2024-03-05T12:00:00Z' })?.text).toBe(
      'March 5, 2024',
    );
    expect(resolve(message, { [BORN]: '2024-02-29' })?.text).toBe(
      'February 29, 2024',
    );
  });

  it('keeps a year before 100 as written', () => {
    const message = `{${N.born}, select, missing {?} other {{${N.born}}}}`;
    expect(resolve(message, { [BORN]: '0050-03-05' })?.text).toBe(
      'March 5, 50',
    );
    expect(resolve(message, { [BORN]: '0050' })?.text).toBe('50');
  });

  it('reads a role that is not on screen as missing', () => {
    expect(
      resolve(
        `{${N.partner}, select, missing {them} other {{${N.partner}}}}`,
        {},
      )?.text,
    ).toBe('them');
  });

  it('shows the label of each node on screen as written', () => {
    expect(
      resolve(`Do {${N.first}} and {${N.second}} know each other?`, {}, 'en', {
        labels: { dyadSource: 'Jim', dyadTarget: '{Alice} #1' },
      }),
    ).toEqual({
      parts: [
        'Do ',
        { name: N.first, text: 'Jim' },
        ' and ',
        { name: N.second, text: '{Alice} #1' },
        ' know each other?',
      ],
      text: 'Do Jim and {Alice} #1 know each other?',
    });
  });

  it('shows a label of only spaces as the node shows it', () => {
    expect(
      resolve(`Is {${N.first}} here?`, {}, 'en', {
        labels: { dyadSource: '  ' },
      })?.parts,
    ).toEqual(['Is ', { name: N.first, text: '  ' }, ' here?']);
  });

  it('reads the label of a node that is not on screen as missing', () => {
    expect(
      resolve(
        `{${N.first}, select, missing {Them} other {{${N.first}}}}`,
        {},
        'en',
        { labels: { dyadTarget: 'Alice' } },
      )?.text,
    ).toBe('Them');
  });

  it('chooses the version for whether the node is the participant', () => {
    const living = `{${N.isYou}, select, true {Are you still living?} false {Is this person still living?} other {Is this person living?}}`;
    expect(
      resolve(living, {}, 'en', { participants: { node: true } })?.text,
    ).toBe('Are you still living?');
    expect(
      resolve(living, {}, 'en', { participants: { node: false } })?.text,
    ).toBe('Is this person still living?');
    expect(
      resolve(`{${N.isYou}, select, missing {?} other {!}}`, {})?.text,
    ).toBe('?');
  });

  it('chooses a version by a condition already judged', () => {
    const id = testId('condition judged');
    const met = dynamicValueNameFor({ kind: 'condition', conditionId: id });
    const message = `{${met}, select, true {Met} false {Not met} other {?}}`;
    expect(
      resolve(message, {}, 'en', { conditionFacts: { [id]: true } })?.text,
    ).toBe('Met');
    expect(
      resolve(message, {}, 'en', { conditionFacts: { [id]: false } })?.text,
    ).toBe('Not met');
  });

  it("shows today's date", () => {
    expect(resolve(`Since {${N.today}}`, {})?.text).toBe(
      'Since October 13, 2026',
    );
  });

  it('never parses a value as message syntax', () => {
    expect(resolve(GREETING, { [NAME]: "{name} '{x}' #" })?.text).toBe(
      "Hello, {name} '{x}' #!",
    );
  });

  it('never reads an inherited member as an attribute: only a UUID names one', () => {
    const message = (name: string) =>
      `{${name}, select, missing {Missing} other {Got {${name}}}}`;
    const ego: Record<string, unknown> = {};
    Object.defineProperty(ego, '__proto__', {
      enumerable: true,
      value: 'Ada',
    });
    for (const name of ['ego_constructor', 'ego___proto__', 'ego_toString']) {
      expect(resolve(message(name), ego)?.text).toBe('Missing');
    }
  });
});

describe('showsDynamicValues', () => {
  it('finds a value named anywhere in a stage’s text', () => {
    expect(
      showsDynamicValues({
        prompts: [{ text: { en: 'Hello', fr: `Bonjour {${N.name}}` } }],
      }),
    ).toBe(true);
    expect(showsDynamicValues({ title: { en: `Since {${N.today}}` } })).toBe(
      true,
    );
  });

  it('finds none in text without values, or with only other arguments', () => {
    expect(
      showsDynamicValues({
        prompts: [{ text: { en: "Hello '{'there'}'" } }],
        wording: { you: { en: '{isYou, select, true {You} other {{name}}}' } },
        count: 3,
      }),
    ).toBe(false);
  });
});

/**
 * Authored text and a value that, joined, could read as a link: an autolink
 * written in angle brackets, or a bare address, which standard markdown leaves
 * as words.
 */
const AUTOLINK_SPLITS: readonly (readonly [string, string, string])[] = [
  ['See <https:', '//evil.example', '>'],
  ['See <', 'https://evil.example', '>'],
  ['See <https://a.example/', 'evil', '>'],
  ['Write to <ada', '@evil.example', '>'],
  ['See https:', '//evil.example', ''],
  ['See https://', 'evil.example', ''],
  ['See www.', 'evil.example', ''],
  ['Write to ada@', 'evil.example', ''],
  ['See ', 'www', '.evil.example'],
  ['See ', 'https', '://evil.example'],
  ['Write to ', 'ada', '@evil.example'],
  ['See https://a.example/', 'evil', ' now'],
];

const hrefs = (html: string): string[] =>
  Array.from(
    new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelectorAll('[href]'),
    (link) => link.getAttribute('href') ?? '',
  );

/**
 * Markdown as text of several lines draws it, links included, so that a
 * test of where links lead can fail.
 */
const drawnWithLinks = (markdown: string): string =>
  renderToStaticMarkup(
    createElement(
      RenderMarkdown,
      { allowedElements: ALLOWED_MARKDOWN_SECTION_TAGS },
      markdown,
    ),
  );

/** The links the researcher's words make on their own. */
const authoredHrefs = (before: string, after: string): string[] =>
  [before, after].flatMap((text) => hrefs(drawnWithLinks(text)));

describe('markdownSource', () => {
  const HOSTILE =
    '**bold** [link](https://example.com) <img src=x> www.example.com ada@example.com\n\n# Heading\n    code';

  it('keeps the researcher’s markdown and shows a value as typed', () => {
    const source = markdownSource({
      text: '',
      parts: ['**Decline** for ', { name: 'name', text: HOSTILE }, '.'],
    });
    const html = renderToStaticMarkup(
      createElement(RenderMarkdown, null, source),
    );
    expect(html).toContain('<strong>Decline</strong>');
    expect(html.match(/<strong>/g)).toHaveLength(1);
    for (const element of ['<a', '<img', '<h1', '<pre', '<code']) {
      expect(html).not.toContain(element);
    }
    expect(getMarkdownLabelText(source)).toBe(
      `Decline for ${HOSTILE.replace(/\s+/g, ' ')}.`,
    );
  });

  it.each([
    ['[details](', '//evil.example'],
    ['[details](https:', '//evil.example'],
    ['[details](', 'https://evil.example'],
    ['[details](https://', 'evil.example'],
    ['[details](mailto:', 'evil@x.example'],
  ])('never puts a value in a link destination: %j %j', (before, value) => {
    const source = markdownSource({
      text: '',
      parts: [before, { name: 'name', text: value }, ')'],
    });
    const html = drawnWithLinks(source);
    expect(html).not.toContain('evil');
    expect(html).not.toMatch(/href="[^"]*(?:evil|%3C)/);
  });

  it('keeps a value in a link’s text, and the researcher’s destination', () => {
    const source = markdownSource({
      text: '',
      parts: ['[About ', { name: 'name', text: 'Ada' }, '](https://a.example)'],
    });
    // Text of several lines, which is drawn with its links.
    const html = renderToStaticMarkup(
      createElement(
        RenderMarkdown,
        { allowedElements: ALLOWED_MARKDOWN_SECTION_TAGS },
        source,
      ),
    );
    expect(html).toContain('href="https://a.example"');
    expect(html).toContain('>About Ada<');
  });

  it('never lets a value join the words around it into an entity or tag', () => {
    const splits: readonly (readonly [string, string, string])[] = [
      ['', 'copy', ';'],
      ['&', 'copy', ';'],
      ['&#', '169', ';'],
      ['<', 'em', '>word</em>'],
    ];
    for (const [before, value, after] of splits) {
      const source = markdownSource({
        text: '',
        parts: [before, { name: 'name', text: value }, after],
      });
      const html = renderToStaticMarkup(
        createElement(RenderMarkdown, null, source),
      );
      const label = JSON.stringify([before, value, after]);
      expect(html, label).not.toContain('©');
      expect(html, label).not.toContain('<em>');
      expect(getMarkdownLabelText(source), label).toBe(
        `${before}${value}${after}`,
      );
    }
  });

  it('never lets a value match a reference link’s label', () => {
    const definition =
      '\n\n[friend]: https://friend.example\n[my friend]: https://friend.example';
    const splits: readonly (readonly [string, string])[] = [
      ['[details][', ']'],
      ['[', ']'],
      ['[', '][]'],
      ['[details][ ', ' ]'],
      ['[details][my ', ']'],
      ['[details][', '\n]'],
    ];
    for (const [before, after] of splits) {
      const value = 'friend';
      const source = markdownSource({
        text: '',
        parts: [before, { name: 'name', text: value }, `${after}${definition}`],
      });
      const html = drawnWithLinks(source);
      const label = JSON.stringify([before, after]);
      expect(html, label).not.toContain('friend.example');
      expect(html, label).toContain('friend');
    }
  });

  it('never lets a value create, complete or change an autolink', () => {
    for (const [before, value, after] of AUTOLINK_SPLITS) {
      const source = markdownSource({
        text: '',
        parts: [before, { name: 'name', text: value }, after],
      });
      const html = drawnWithLinks(source);
      expect(hrefs(html), JSON.stringify([before, value, after])).toEqual(
        authoredHrefs(before, after),
      );
      expect(getMarkdownLabelText(source)).toBe(`${before}${value}${after}`);
    }
  });

  // What markdown shows as typed (code, an address in angle brackets) is
  // never changed by a value beside it, and a value in it shows as itself.
  it.each([
    [
      'an address in angle brackets just before a value',
      'See <https://a.example/?a=1&b=2>',
      'Ada',
      '',
      // The address as a link, its `&` as typed, then the value.
      'See https://a.example/?a=1&b=2Ada',
      ['https://a.example/?a=1&b=2'],
    ],
    ['an `&` in code', 'Type `AT&T`', 'Ada', '', 'Type AT&TAda', []],
    ['a `<` in code around a value', '`<', 'Ada', '>`', '<Ada>', []],
    ['a `[` in code around a value', 'Type `[', 'Ada', ']`', 'Type [Ada]', []],
  ])('leaves %s as typed', (_case, before, value, after, shown, links) => {
    const source = markdownSource({
      text: '',
      parts: [before, { name: 'name', text: value }, after],
    });
    const html = drawnWithLinks(source);
    expect(drawnText(html)).toBe(shown);
    expect(hrefs(html)).toEqual(links);
  });

  it('keeps the researcher’s emphasis around a value after an escaped `<`', () => {
    const source = markdownSource({
      text: '',
      parts: ['Ask **<', { name: 'name', text: 'Ada' }, '**'],
    });
    const html = renderToStaticMarkup(
      createElement(RenderMarkdown, null, source),
    );
    expect(source).toBe('Ask **\\<Ada**');
    expect(html).toContain('<strong>&lt;Ada</strong>');
  });

  it('never lets a value finish a block marker the researcher wrote', () => {
    for (const [marker, element] of [
      ['#', '<h1'],
      ['1.', '<ol'],
      ['-', '<ul'],
    ] as const) {
      const source = markdownSource({
        text: '',
        parts: [marker, { name: 'name', text: ' heading' }],
      });
      const html = renderToStaticMarkup(
        createElement(RenderMarkdown, null, source),
      );
      expect(html).not.toContain(element);
      expect(getMarkdownLabelText(source)).toBe(`${marker} heading`);
    }
  });

  it('shows a value that opens a line as typed, never as a block', () => {
    for (const value of [
      '~~~example~~~',
      '```',
      '+ item',
      '1) one',
      '#',
      '===',
      '***',
      '    indented',
    ]) {
      const source = markdownSource({
        text: '',
        parts: ['Before\n', { name: 'name', text: value }, '\nAfter'],
      });
      const page = new DOMParser().parseFromString(
        drawnWithLinks(source),
        'text/html',
      ).body;
      expect(
        Array.from(page.children, (child) => child.tagName),
        value,
      ).toEqual(['P']);
      expect(page.textContent, value).toBe(`Before\n${value.trim()}\nAfter`);
    }
  });

  it('leaves text without values as it is', () => {
    expect(markdownSource({ text: '**Decline**' })).toBe('**Decline**');
  });
});

describe('DynamicMarkdown', () => {
  it('never lets the researcher’s words place a value, even written as a character reference', () => {
    for (const forged of [
      '&#xE000;0&#xE000;',
      '&#Xe000;0&#x0E000;',
      '&#57344;0&#057344;',
    ]) {
      const html = renderToStaticMarkup(
        createElement(DynamicMarkdown, {
          parts: [`Before ${forged} and `, { name: 'name', text: 'Ada' }],
        }),
      );
      expect(html.match(/data-dynamic-value/g), forged).toHaveLength(1);
      expect(html.match(/<bdi\b[^>]*>Ada<\/bdi>/g), forged).toHaveLength(1);
      expect(html, forged).not.toContain('\u{E000}');
    }
  });

  it('never lets a value create, complete or change an autolink', () => {
    for (const [before, value, after] of AUTOLINK_SPLITS) {
      const html = renderToStaticMarkup(
        createElement(DynamicMarkdown, {
          parts: [before, { name: 'name', text: value }, after],
        }),
      );
      const label = JSON.stringify([before, value, after]);
      expect(hrefs(html), label).toEqual(authoredHrefs(before, after));
      // The value is shown, and never inside a link.
      expect(html, label).toContain('data-dynamic-value');
      expect(html, label).not.toMatch(
        /<a\b(?:(?!<\/a>)[\s\S])*data-dynamic-value/,
      );
    }
  });
});
