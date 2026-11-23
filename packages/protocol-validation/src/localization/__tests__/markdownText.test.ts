import { describe, expect, it } from 'vitest';

import { assetBlockMessage, assetBlocksInMarkdown } from '../assetBlock.ts';
import { dynamicMessageParts } from '../dynamicValueMessages.ts';
import {
  escapeMarkdownText,
  headingMarkdown,
  linkDestinationMarkdown,
  linkTitleMarkdown,
  messageHeadingMarkdown,
} from '../markdownText.ts';
import { markdownTree } from '../markdownTree.ts';
import { escapeMessageText } from '../messageSyntax.ts';

type Values = Record<string, string | number>;

// A message as the interview reads it for these values: a number is a
// plural's count, any other value a select's case, each shown as its text.
const filled = (message: string, values: Values): string =>
  dynamicMessageParts(message, 'en', (name) => {
    const value = values[name];
    if (value === undefined) return { missing: true };
    return typeof value === 'number'
      ? { missing: false, count: value }
      : { missing: false, case: value };
  })
    .map((part) =>
      typeof part === 'string' ? part : String(values[part.argument]),
    )
    .join('');

type TreeNode = Readonly<{
  type: string;
  value?: string;
  children?: readonly TreeNode[];
}>;

const wordsIn = (node: TreeNode): string =>
  node.type === 'text' || node.type === 'inlineCode'
    ? (node.value ?? '')
    : (node.children ?? []).map(wordsIn).join('');

// What a participant reads: the one heading the markdown is, and its words.
const headingShown = (markdown: string): string | undefined => {
  const { children } = markdownTree(markdown);
  const [only] = children;
  return children.length === 1 && only?.type === 'heading'
    ? wordsIn(only)
    : undefined;
};

// What a participant reads of text written as one paragraph: its words, or
// undefined where the markdown is anything but one paragraph.
const paragraphShown = (markdown: string): string | undefined => {
  const { children } = markdownTree(markdown);
  const [only] = children;
  return children.length === 1 && only?.type === 'paragraph'
    ? wordsIn(only)
    : undefined;
};

describe('escapeMarkdownText', () => {
  // Each opens a block where it opens a line in plain CommonMark, on the
  // first line of a text or on a line of its own after another.
  it.each([
    '~~~example~~~',
    '~~~',
    '~~~~ with words',
    '+ an item',
    '+',
    '1) one',
    '1. one',
    '12)',
    '#',
    '##',
    '# a heading',
    '===',
    '---',
    '- a bullet',
    '***',
    '___',
    '* * *',
    '> a quotation',
    '```js',
    '<div>',
    '[label]: https://example.org',
  ])('shows %j as typed wherever it opens a line', (text) => {
    expect(paragraphShown(escapeMarkdownText(text))).toBe(text);
    expect(paragraphShown(escapeMarkdownText(`Before\n${text}`))).toBe(
      `Before\n${text}`,
    );
    expect(paragraphShown(escapeMarkdownText(`  ${text}`))).toBe(text);
  });

  it('shows text indented as code as typed', () => {
    expect(paragraphShown(escapeMarkdownText('    indented'))).toBe(
      '    indented',
    );
    expect(paragraphShown(escapeMarkdownText('\tindented'))).toBe('\tindented');
  });

  it('leaves what plain CommonMark reads as words as it is', () => {
    for (const text of [
      'About ~5 minutes',
      'This is ~~not~~ required',
      'a | b',
      '1.5 hours',
      'Item #3',
      'A + B = C',
    ]) {
      expect(escapeMarkdownText(text)).toBe(text);
    }
  });
});

describe('messageHeadingMarkdown', () => {
  const heading = (message: string, values: Values = {}) =>
    headingShown(filled(messageHeadingMarkdown(message), values));

  it("shows a plural's count as the number", () => {
    const message = '{count, plural, one {# item} other {# items}}';
    expect(heading(message, { count: 1 })).toBe('1 item');
    expect(heading(message, { count: 3 })).toBe('3 items');
  });

  it('shows the words of every version as written', () => {
    const message =
      'Hi {name}: {relation, select, parent {*your* parent_s} other {[someone] <b>}}';
    expect(heading(message, { name: 'Ana', relation: 'parent' })).toBe(
      'Hi Ana: *your* parent_s',
    );
    expect(heading(message, { name: 'Ana', relation: 'x' })).toBe(
      'Hi Ana: [someone] <b>',
    );
  });

  it('reads quoted text as the words it quotes', () => {
    expect(heading("'<'tag> and ''quote'' '{'live'}'")).toBe(
      "<tag> and 'quote' {live}",
    );
  });

  it('shows words that open a block, and a line break, as written', () => {
    expect(heading('1. one\n- two\n# three')).toBe('1. one - two # three');
  });

  it('shows two tildes on either side of a value as written', () => {
    expect(heading('~{name}~', { name: 'Ana' })).toBe('~Ana~');
  });

  it('shows a run of # that ends the heading', () => {
    expect(heading('{n, select, other {Chapter ##}}', { n: 'x' })).toBe(
      'Chapter ##',
    );
    expect(heading('#')).toBe('#');
  });

  it('writes a message of literal text as headingMarkdown writes the text', () => {
    for (const text of ["Rock 'n' roll {live}", 'Item #3 *x* ##', '##']) {
      expect(messageHeadingMarkdown(escapeMessageText(text))).toBe(
        escapeMessageText(headingMarkdown(text)),
      );
      expect(headingShown(headingMarkdown(text))).toBe(text);
    }
  });
});

describe('assetBlockMessage', () => {
  // Validation refuses a block whose description shows a value, so this is
  // the message kept for that to be reported of it.
  it("keeps the values and count a description's message shows", () => {
    const message = assetBlockMessage({
      assetId: 'a',
      description:
        '{count, plural, one {# photo} other {# photos}} of {place} [draft] \\ *x*',
    });
    expect(
      assetBlocksInMarkdown(filled(message, { count: 3, place: 'Oslo' }))[0]
        ?.block,
    ).toEqual({ assetId: 'a', description: '3 photos of Oslo [draft] \\ *x*' });
  });
});

describe('linkDestinationMarkdown and linkTitleMarkdown', () => {
  const ADDRESSES = [
    'https://example.org',
    'https://example.org/?a=1&amp;b=2',
    'https://example.org/?q=&lt;&#60;&#x3c;',
    'https://example.org/a\\b',
    'https://example.org/wiki/Foo_(bar)',
    'https://example.org/a)b(c',
    'https://example.org/<a>',
    'https://example.org/a b',
    '<https://example.org>',
    'mailto:a@example.org',
    '',
  ];

  it.each(ADDRESSES)('writes %j so that it reads back as itself', (address) => {
    const [paragraph] = markdownTree(
      `[x](${linkDestinationMarkdown(address)} ${linkTitleMarkdown(address)})`,
    ).children;
    expect(paragraph).toMatchObject({
      type: 'paragraph',
      // An empty title is no title.
      children: [
        { type: 'link', url: address, title: address === '' ? null : address },
      ],
    });
  });
});
