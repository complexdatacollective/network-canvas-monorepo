/**
 * Schema 8 Information pages, for tests: what the 8 to 9 migration joins
 * into one text, and what any other writer of an Information page (a
 * synthetic interview) must join the same way once the text is in schema 9
 * form. The migration first rewrites each schema 8 text item as standard
 * markdown with `legacyMarkdownAsStandard`, as `schema8MarkdownAsStandard`
 * does here; from there the two join a page alike. One table, so the two are
 * checked against the same pages.
 */

import { legacyMarkdownAsStandard } from '../schemas/9/legacy-markdown.ts';

type Fields = Readonly<Record<string, unknown>>;

/**
 * Schema 8 markdown as the migration rewrites it for a field of one line or
 * several (see `legacyMarkdownAsStandard`): an Information page's text item
 * is text of several lines.
 */
export const schema8MarkdownAsStandard = (
  text: string,
  lines: 'single' | 'multiple',
): string => legacyMarkdownAsStandard(text, { lines });

/** The files the pages name: an image, a video and an audio recording. */
export const INFORMATION_PAGE_ASSETS = {
  photo: { id: 'photo', type: 'image', name: 'photo.png', source: 'photo.png' },
  clip: { id: 'clip', type: 'video', name: 'clip.mp4', source: 'clip.mp4' },
  tune: { id: 'tune', type: 'audio', name: 'tune.mp3', source: 'tune.mp3' },
} as const;

/** A schema 8 text item. */
export const textItem = (id: string, content: unknown): Fields => ({
  id,
  type: 'text',
  content,
});

/** A schema 8 asset item, naming the file `content`. */
export const assetItem = (
  id: string,
  content: unknown,
  extra: Fields = {},
): Fields => ({
  id,
  type: 'asset',
  content,
  ...extra,
});

/**
 * Texts that each read something across the whole of a text, or whose
 * reading the text before them can change.
 */
export const TEXT_PIECES: readonly string[] = [
  'A paragraph.',
  '- a\n- b',
  '* a\n\n* b',
  '+ a',
  '1. a\n2. b',
  '1) a',
  '3. third',
  '- a\n  - nested\n\n  second paragraph',
  'Uses [label] and [other][label].\n\n[label]: https://example.com/one',
  'Says [label] and means it.',
  '[label]: https://example.com/two "Two"\n\nAnother [label].',
  '![picture][label]\n\n[label]: https://example.com/three.png',
  '    indented code',
  '```\nfenced and left open',
  '<!-- a comment left open',
  '> a quotation',
  'Heading\n===',
  '---',
  '| a | b |\n| - | - |\n| 1 | 2 |',
  '- [ ] a task',
  '~~struck~~ and www.example.com',
  'Line one  \nline two\\\nline three',
  'A note[^1].\n\n[^1]: The note, with a [label].',
];

/**
 * Texts that leave a block open, which markdown reads to its own end, each
 * with what closes it: what, the text, its closing.
 */
export const TEXTS_LEFT_OPEN: readonly (readonly [string, string, string])[] = [
  ['an HTML comment', '<!-- note: check wording', '-->'],
  ['a code block fenced with backticks', '```\ncode', '```'],
  ['a code block with a longer fence', '````\ncode', '````'],
  ['a code block fenced with tildes', '~~~\ncode', '~~~'],
  ['a pre element', '<pre>\nkept as typed', '</pre>'],
  ['a processing instruction', '<?php echo 1', '?>'],
];

/** A schema 8 Information page: its title, its items and its stage's name. */
export type InformationPageFixture = Readonly<{
  name: string;
  title?: unknown;
  items: readonly Fields[];
  label?: string;
  /** The languages a page written per language is in. */
  locales?: readonly string[];
}>;

const MAP = assetItem('f', 'photo', { description: 'Map' });

/**
 * Pages of a title, at most one text item and then files, in every way the
 * migration treats one: what each text leaves open or reads across the
 * files after it, the title's escaping, each kind and size of file and its
 * description, parts that show nothing, and pages already written per
 * language.
 */
export const INFORMATION_PAGES: readonly InformationPageFixture[] = [
  ...TEXT_PIECES.map((piece) => ({
    name: `text ${JSON.stringify(piece)} above a file`,
    title: 'T',
    items: [textItem('t', piece), MAP],
  })),
  ...TEXTS_LEFT_OPEN.map(([what, open]) => ({
    name: `text leaving ${what} open above a file`,
    title: 'T',
    items: [textItem('t', open), MAP],
  })),
  ...[
    '*Hi* _there_ <y> `z`',
    'Chapter ##',
    '##',
    '  One\n\nTwo   three ',
    "It's {here}",
    '~a~ and ~b~',
    '1. Not a list',
  ].map((title) => ({
    name: `the title ${JSON.stringify(title)}`,
    title,
    items: [textItem('t', "Don't {panic}")],
  })),
  ...['', ' ', '\t\n', ' ', '​'].map((title) => ({
    name: `the blank title ${JSON.stringify(title)}`,
    title,
    items: [textItem('t', 'Body')],
  })),
  {
    name: 'a text of only spaces',
    title: 'T',
    items: [textItem('t', '\n  \n'), MAP],
  },
  {
    name: 'a text opening with spaces',
    title: 'T',
    items: [textItem('t', '\n  After the heading.')],
  },
  {
    name: 'every kind and size of file',
    title: 'T',
    items: [
      assetItem('a', 'photo', { description: 'A map', size: 'SMALL' }),
      assetItem('b', 'photo', { size: 'MEDIUM' }),
      assetItem('c', 'clip', { size: 'LARGE' }),
      assetItem('d', 'clip', { size: 'HUGE' }),
      assetItem('e', 'tune', { description: 'A song', size: 'LARGE' }),
    ],
  },
  {
    name: 'descriptions to escape or leave out',
    title: 'T',
    items: [
      assetItem('a', 'photo', { description: 'A [b]\n*c* {d}' }),
      assetItem('b', 'photo', { description: '  ' }),
    ],
  },
  {
    name: 'a page with nothing left',
    title: ' ',
    items: [textItem('t', ' ')],
    label: 'Intro screen',
  },
  {
    name: 'a page with no items, taking an escaped label',
    title: '',
    items: [],
    label: '*Big* news',
  },
  {
    name: 'a page written per language',
    title: { en: 'Welcome', fr: 'Bienvenue' },
    items: [
      textItem('t', { en: 'Hello', fr: 'Bonjour' }),
      assetItem('f', 'photo', {
        description: { en: 'A map', fr: 'Une carte' },
      }),
    ],
    locales: ['en', 'fr'],
  },
  {
    name: 'a part missing a language',
    title: { en: 'Welcome', fr: 'Bienvenue' },
    items: [textItem('t', { en: 'Hello' })],
    locales: ['en', 'fr'],
  },
  {
    name: 'a part written only in a language other than the default',
    title: 'Welcome',
    items: [textItem('t', { fr: 'Bonjour' })],
    locales: ['en', 'fr'],
  },
  {
    name: 'a blank translation',
    title: { en: 'Welcome', fr: '  ' },
    items: [textItem('t', 'Hello')],
    locales: ['en', 'fr'],
  },
  {
    name: 'a part written once among parts written per language',
    title: 'Plain {braces}',
    items: [textItem('t', { en: 'Hello', fr: 'Bonjour' })],
    locales: ['en', 'fr'],
  },
  {
    name: 'a translated text left open',
    title: { en: 'T', fr: 'T' },
    items: [
      textItem('t', { en: '<!-- note', fr: 'Bonjour' }),
      assetItem('f', 'photo'),
    ],
    locales: ['en', 'fr'],
  },
  {
    name: 'messages quoting their words',
    title: { en: "'<'tag> and ''quote'' ~a~ ~b~ ##" },
    items: [
      textItem('t', { en: "It''s '{'here'}'" }),
      assetItem('f', 'photo', { description: { en: "'<'b> [c] *d*" } }),
    ],
    locales: ['en'],
  },
];
