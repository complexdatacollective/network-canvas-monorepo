import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  getMarkdownLabelText,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import type {
  DynamicValues,
  LocalizedString,
  Variable,
} from '@codaco/protocol-validation';

import { contentFormatFor } from '../../localization/contentFormat';
import { DynamicMarkdown } from '../DynamicText';
import {
  type DynamicValueFormatters,
  type DynamicValueSources,
  markdownSource,
  resolveDynamicText,
} from '../resolveDynamicText';

const VARIABLES: Record<string, Variable> = {
  name: { name: 'name', label: 'Name', type: 'text' },
  age: { name: 'age', label: 'Age', type: 'number' },
  born: { name: 'born', label: 'Born', type: 'datetime' },
  closeness: {
    name: 'closeness',
    label: 'Closeness',
    type: 'ordinal',
    options: [
      { label: { en: 'Not close' }, value: 0 },
      { label: { en: 'Very close' }, value: 1 },
    ],
  },
  languages: {
    name: 'languages',
    label: 'Languages',
    type: 'categorical',
    options: [
      { label: { en: 'English' }, value: 'en' },
      { label: { en: 'French' }, value: 'fr' },
      { label: { en: 'Spanish' }, value: 'es' },
    ],
  },
  smokes: { name: 'smokes', label: 'Smokes', type: 'boolean' },
} as Record<string, Variable>;

const BINDINGS: DynamicValues = {
  name: { path: 'ego.name' },
  age: { path: 'ego.age' },
  born: { path: 'ego.born' },
  closeness: { path: 'ego.closeness', cases: { veryClose: 1 } },
  languages: { path: 'ego.languages', cases: { french: 'fr' } },
  smokes: { path: 'ego.smokes', cases: { yes: true } },
  partner: { path: 'dyad.target.name' },
  first: { path: 'dyad.source.$label' },
  second: { path: 'dyad.target.$label' },
  today: { path: 'now' },
};

const sources = (
  ego: Record<string, unknown>,
  extra: Partial<DynamicValueSources> = {},
): DynamicValueSources => ({
  bindings: BINDINGS,
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
});

const resolve = (
  message: string,
  ego: Record<string, unknown>,
  locale = 'en',
  extra?: Partial<DynamicValueSources>,
) =>
  resolveDynamicText(message, locale, sources(ego, extra), formatters(locale));

const GREETING = '{name, select, missing {Hello!} other {Hello, {name}!}}';

describe('resolveDynamicText', () => {
  it('leaves text that shows no value to the ordinary formatter', () => {
    expect(resolve('Hello!', {})).toBeUndefined();
    expect(resolve("'{'quoted'}'", {})).toBeUndefined();
    // A name the stage does not bind is not a dynamic value.
    expect(resolve('{unbound}', {})).toBeUndefined();
  });

  it('takes the missing version for every kind of missing value', () => {
    for (const missing of [undefined, null, '', '   ', []]) {
      expect(resolve(GREETING, { name: missing })).toEqual({
        parts: ['Hello!'],
        text: 'Hello!',
      });
    }
  });

  it('shows a present value as text, marking where it is', () => {
    expect(resolve(GREETING, { name: 'Ada' })).toEqual({
      parts: ['Hello, ', { name: 'name', text: 'Ada' }, '!'],
      text: 'Hello, Ada!',
    });
  });

  it('shows 0 and false as values, not as missing', () => {
    expect(
      resolve('{age, select, missing {?} other {Age {age}}}', { age: 0 })?.text,
    ).toBe('Age 0');
    expect(
      resolve('{smokes, select, missing {?} other {{smokes}}}', {
        smokes: false,
      })?.text,
    ).toBe('No');
  });

  it('chooses a case by the stored option, and other for the rest', () => {
    const message =
      '{closeness, select, missing {?} veryClose {Close: {closeness}} other {Not: {closeness}}}';
    expect(resolve(message, { closeness: 1 })?.text).toBe('Close: Very close');
    expect(resolve(message, { closeness: 0 })?.text).toBe('Not: Not close');
  });

  it('matches a case among a list of answers, and lists them', () => {
    const message =
      '{languages, select, missing {?} french {Bonjour ({languages})} other {{languages}}}';
    expect(resolve(message, { languages: ['en', 'fr'] })?.text).toBe(
      'Bonjour (English and French)',
    );
    expect(resolve(message, { languages: ['en', 'es'] })?.text).toBe(
      'English and Spanish',
    );
  });

  it('chooses a plural by the language, and writes # as the number', () => {
    const message =
      '{age, select, missing {?} other {{age, plural, one {# year} other {# years}}}}';
    expect(resolve(message, { age: 1 })?.text).toBe('1 year');
    expect(resolve(message, { age: 1200 })?.text).toBe('1,200 years');
    expect(resolve(message, { age: 1200 }, 'de')?.text).toBe('1.200 years');
    // The version agrees with the number as it is shown, every digit of it.
    expect(resolve(message, { age: 1.0001 })?.text).toBe('1.0001 years');
  });

  it('writes a stored date in the language, without a time zone shift', () => {
    const message = '{born, select, missing {?} other {{born}}}';
    expect(resolve(message, { born: '2024-03-05' })?.text).toBe(
      'March 5, 2024',
    );
    expect(resolve(message, { born: '2024-03' })?.text).toBe('March 2024');
    expect(resolve(message, { born: '2024' })?.text).toBe('2024');
    expect(resolve(message, { born: '2024-03-05' }, 'fr')?.text).toBe(
      '5 mars 2024',
    );
  });

  it('shows a stored date that is not on the calendar as it was stored', () => {
    const message = '{born, select, missing {?} other {{born}}}';
    expect(resolve(message, { born: '2024-02-31' })?.text).toBe('2024-02-31');
    expect(resolve(message, { born: '2024-13' })?.text).toBe('2024-13');
    expect(resolve(message, { born: '2024-00-10' })?.text).toBe('2024-00-10');
    expect(resolve(message, { born: '0000-01-01' })?.text).toBe('0000-01-01');
    expect(resolve(message, { born: '2024-02-29' })?.text).toBe(
      'February 29, 2024',
    );
  });

  it('keeps a year before 100 as written', () => {
    const message = '{born, select, missing {?} other {{born}}}';
    expect(resolve(message, { born: '0050-03-05' })?.text).toBe('March 5, 50');
    expect(resolve(message, { born: '0050' })?.text).toBe('50');
  });

  it('reads a role that is not on screen as missing', () => {
    expect(
      resolve('{partner, select, missing {them} other {{partner}}}', {})?.text,
    ).toBe('them');
  });

  it('shows the label of each node on screen as written', () => {
    expect(
      resolve('Do {first} and {second} know each other?', {}, 'en', {
        labels: { dyadSource: 'Jim', dyadTarget: '{Alice} #1' },
      }),
    ).toEqual({
      parts: [
        'Do ',
        { name: 'first', text: 'Jim' },
        ' and ',
        { name: 'second', text: '{Alice} #1' },
        ' know each other?',
      ],
      text: 'Do Jim and {Alice} #1 know each other?',
    });
  });

  it('shows a label of only spaces as the node shows it', () => {
    expect(
      resolve('Is {first} here?', {}, 'en', {
        labels: { dyadSource: '  ' },
      })?.parts,
    ).toEqual(['Is ', { name: 'first', text: '  ' }, ' here?']);
  });

  it('reads the label of a node that is not on screen as missing', () => {
    expect(
      resolve('{first, select, missing {Them} other {{first}}}', {}, 'en', {
        labels: { dyadTarget: 'Alice' },
      })?.text,
    ).toBe('Them');
  });

  it("shows today's date", () => {
    expect(resolve('Since {today}', {})?.text).toBe('Since October 13, 2026');
  });

  it('never parses a value as message syntax', () => {
    expect(resolve(GREETING, { name: "{name} '{x}' #" })?.text).toBe(
      "Hello, {name} '{x}' #!",
    );
  });

  it('reads only an attribute’s own value, never an inherited member', () => {
    const bindings: DynamicValues = {
      ...BINDINGS,
      inherited: { path: 'ego.constructor' },
      proto: { path: 'ego.__proto__' },
    };
    const message = (name: string) =>
      `{${name}, select, missing {Missing} other {Got {${name}}}}`;
    expect(resolve(message('inherited'), {}, 'en', { bindings })?.text).toBe(
      'Missing',
    );
    expect(resolve(message('proto'), {}, 'en', { bindings })?.text).toBe(
      'Missing',
    );

    const ego: Record<string, unknown> = {};
    Object.defineProperty(ego, '__proto__', {
      enumerable: true,
      value: 'Ada',
    });
    expect(resolve(message('proto'), ego, 'en', { bindings })?.text).toBe(
      'Got Ada',
    );
  });
});

/** Authored text and a value that, joined, would read as a bare link. */
const AUTOLINK_SPLITS: readonly (readonly [string, string, string])[] = [
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
  [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? '');

/** The links the researcher's words make on their own. */
const authoredHrefs = (before: string, after: string): string[] =>
  [before, after].flatMap((text) =>
    hrefs(renderToStaticMarkup(createElement(RenderMarkdown, null, text))),
  );

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
    // Word joiners keep autolinks from forming; they are not seen.
    expect(getMarkdownLabelText(source).replaceAll('\u2060', '')).toBe(
      `Decline for ${HOSTILE.replace(/\s+/g, ' ')}.`,
    );
  });

  it('never puts a value in a link destination', () => {
    for (const destination of ['', 'https:']) {
      const source = markdownSource({
        text: '',
        parts: [
          `[details](${destination}`,
          { name: 'name', text: '//evil.example' },
          ')',
        ],
      });
      const html = renderToStaticMarkup(
        createElement(RenderMarkdown, null, source),
      );
      expect(html).not.toContain('evil');
      expect(html).not.toMatch(/href="[^"]*(?:evil|%3C)/);
    }
  });

  it('keeps a value in a link’s text, and the researcher’s destination', () => {
    const source = markdownSource({
      text: '',
      parts: ['[About ', { name: 'name', text: 'Ada' }, '](https://a.example)'],
    });
    const html = renderToStaticMarkup(
      createElement(RenderMarkdown, null, source),
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
      expect(html, label).toContain(value);
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
      const html = renderToStaticMarkup(
        createElement(RenderMarkdown, null, source),
      );
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
      const html = renderToStaticMarkup(
        createElement(RenderMarkdown, null, source),
      );
      expect(hrefs(html), JSON.stringify([before, value, after])).toEqual(
        authoredHrefs(before, after),
      );
      expect(getMarkdownLabelText(source).replaceAll('\u2060', '')).toBe(
        `${before}${value}${after}`,
      );
    }
  });

  it('keeps the researcher’s emphasis around a value kept apart from a link', () => {
    const source = markdownSource({
      text: '',
      parts: ['Ask **', { name: 'name', text: 'Ada' }, '**: see a.example'],
    });
    const html = renderToStaticMarkup(
      createElement(RenderMarkdown, null, source),
    );
    expect(source).toContain('<!---->');
    expect(html).toContain('<strong>Ada</strong>');
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
