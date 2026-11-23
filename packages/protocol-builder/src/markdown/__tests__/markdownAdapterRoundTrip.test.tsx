import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FieldLabel } from '@codaco/fresco-ui/form/FieldLabel';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  type MarkdownBlockImages,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import {
  isAssetBlockUrl,
  markdownTree,
  readAssetBlockUrl,
} from '@codaco/protocol-validation';
import { schema8MarkdownAsStandard } from '@codaco/protocol-validation/testing/information-pages';
import { holdsLineBreak } from '@codaco/shared-consts';

import {
  type RichTextContent,
  markdownToRichTextContent,
  richTextContentToMarkdown,
} from '../markdownAdapter.ts';

afterEach(cleanup);

/**
 * A shape of text the editor edits, as `RichTextField` is configured for it
 * (see `textFieldPropsFor`), and how the interview draws text of that shape.
 */
type Shape = Readonly<{
  name: string;
  lines: 'single' | 'multiple';
  assetBlocks: boolean;
}>;

/** An Information page: several lines, with files among the paragraphs. */
const PAGE: Shape = {
  name: 'several-line text that holds files',
  lines: 'multiple',
  assetBlocks: true,
};
/** Several lines with links, such as a finish screen or introduction panel. */
const BLOCKS: Shape = {
  name: 'several-line text',
  lines: 'multiple',
  assetBlocks: false,
};
/** One line, such as a prompt, a field label or an option label. */
const LINE: Shape = {
  name: 'one-line text',
  lines: 'single',
  assetBlocks: false,
};

const SHAPES: readonly Shape[] = [PAGE, BLOCKS, LINE];

/** Whether text of `shape` may hold `text` at all. */
const accepts = (shape: Shape, text: string): boolean =>
  shape.lines === 'multiple' || !holdsLineBreak(text);

/** The editor's document for `text`, as `RichTextField` opens it. */
const opened = (text: string, { lines, assetBlocks }: Shape) =>
  markdownToRichTextContent(text, { inline: lines === 'single', assetBlocks });

/** Opened in the editor and saved without a change, as `RichTextField` does. */
const roundTrip = (text: string, shape: Shape) =>
  richTextContentToMarkdown(opened(text, shape), shape.lines === 'single');

/*
 * The comparison form: what a participant would notice. A list of blocks
 * (paragraphs, headings, list items with their marker and depth, rules and
 * files), each with its words, where the words are bold, emphasised or
 * linked (and to which address), and where a line breaks.
 *
 * It ignores, because a participant does not see them or sees them only as
 * spacing: how the formats nest (bold inside a link reads as a link inside
 * bold), runs of white space and white space at the edge of a block or a
 * line break, a line break that ends a block, a link's title (the renderer
 * drops it), and whether a list is loose or tight. A paragraph and a block
 * quote of the same words read alike, as the interview draws no quotation.
 */
type Character = Readonly<{ character: string; marks: string }>;
type Block = { kind: string; characters: (Character | 'break')[] };

const read = (root: Node): string[] => {
  const blocks: Block[] = [{ kind: '', characters: [] }];
  const current = () => blocks.at(-1) as Block;
  const open = (kind: string) => blocks.push({ kind, characters: [] });

  const walk = (
    node: Node,
    marks: readonly string[],
    lists: readonly string[],
    inItem: { opened: boolean } | undefined,
  ): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const key = marks.toSorted().join(',');
      for (const character of node.textContent ?? '') {
        current().characters.push({ character, marks: key });
      }
      return;
    }
    if (!(node instanceof Element)) return;
    const children = (
      nextMarks = marks,
      nextLists = lists,
      nextItem = inItem,
    ) => {
      for (const child of Array.from(node.childNodes)) {
        walk(child, nextMarks, nextLists, nextItem);
      }
    };
    const tag = node.tagName;
    switch (tag) {
      case 'STRONG':
        return children([...marks, 'bold']);
      case 'EM':
        return children([...marks, 'italic']);
      case 'A':
        return children([...marks, `link ${(node as HTMLAnchorElement).href}`]);
      case 'BR':
        current().characters.push('break');
        return;
      case 'HR':
        open('rule');
        open('');
        return;
      case 'FIGURE':
        open(
          `file ${node.getAttribute('data-file')} "${node.getAttribute('data-description')}"`,
        );
        open('');
        return;
      case 'UL':
      case 'OL': {
        const start = Number(node.getAttribute('start') ?? '1');
        open('');
        Array.from(node.children).forEach((item, index) => {
          const marker = tag === 'OL' ? `${start + index}.` : '•';
          open(`${'  '.repeat(lists.length)}${marker}`);
          for (const child of Array.from(item.childNodes)) {
            walk(child, marks, [...lists, marker], { opened: false });
          }
          open('');
        });
        return;
      }
      case 'P':
        // An item's first paragraph is the item's own line; a later one is
        // a paragraph set in under it.
        if (inItem !== undefined && !inItem.opened) {
          inItem.opened = true;
          children();
          return;
        }
        open(inItem === undefined ? '' : '  '.repeat(lists.length));
        children();
        open('');
        return;
      default:
        if (/^H[1-6]$/.test(tag)) {
          open(tag.toLowerCase());
          children();
          open('');
          return;
        }
        if (inItem !== undefined) inItem.opened = true;
        children();
    }
  };
  walk(root, [], [], undefined);

  return blocks.flatMap(({ kind, characters }) => {
    // White space, collapsed, with breaks and the block's edges trimmed.
    const tidy: (Character | 'break')[] = [];
    for (const piece of characters) {
      const space = piece !== 'break' && /\s/.test(piece.character);
      const last = tidy.at(-1);
      if (space) {
        if (last === undefined || last === 'break' || last.character === ' ') {
          continue;
        }
        tidy.push({ character: ' ', marks: '' });
        continue;
      }
      if (piece === 'break' && last !== undefined && last !== 'break') {
        if (last.character === ' ') tidy.pop();
      }
      tidy.push(piece);
    }
    while (
      tidy.at(-1) === 'break' ||
      (tidy.at(-1) as Character)?.character === ' '
    ) {
      tidy.pop();
    }
    while (tidy[0] === 'break') tidy.shift();
    // A space takes the formats of the words on both sides of it.
    const settled = tidy.map((piece, index) => {
      if (piece === 'break' || piece.character !== ' ') return piece;
      const before = tidy[index - 1];
      const after = tidy[index + 1];
      const marks =
        before !== undefined &&
        after !== undefined &&
        before !== 'break' &&
        after !== 'break' &&
        before.marks === after.marks
          ? before.marks
          : '';
      return { character: ' ', marks };
    });
    let words = '';
    let marks = '';
    for (const piece of settled) {
      if (piece === 'break') {
        words += '⏎';
        continue;
      }
      if (piece.marks !== marks) {
        words += piece.marks === '' ? '⟩' : `⟨${piece.marks}⟩`;
        marks = piece.marks;
      }
      words += piece.character;
    }
    if (marks !== '') words += '⟩';
    if (words === '' && !/^(rule|file)/.test(kind)) return [];
    return [kind === '' ? words : `${kind} ${words}`.trimEnd()];
  });
};

/** A string or number attribute of an editor node or mark, as text. */
const attribute = (
  attributes: Record<string, unknown> | undefined,
  key: string,
): string => {
  const value = attributes?.[key];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
};

const fileBlock: MarkdownBlockImages['Block'] = ({ url, alt }) => (
  <figure
    data-file={readAssetBlockUrl(url)?.block.assetId ?? ''}
    data-description={alt.trim()}
  />
);

/** (a) What the interview draws for `text` in a field of `shape`. */
const drawn = (text: string, shape: Shape): string[] => {
  const { container, unmount } = render(
    shape.lines === 'single' ? (
      <FieldLabel>{text}</FieldLabel>
    ) : (
      <RenderMarkdown
        allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
        blockImages={
          shape.assetBlocks
            ? { matches: isAssetBlockUrl, Block: fileBlock }
            : undefined
        }
      >
        {text}
      </RenderMarkdown>
    ),
  );
  const reading = read(container);
  unmount();
  return reading;
};

/** The editor's document as the elements the editor draws it with. */
const editorElements = (node: RichTextContent): Node => {
  if (node.type === 'text') {
    let element: Node = document.createTextNode(node.text ?? '');
    for (const mark of node.marks ?? []) {
      const tag =
        mark.type === 'bold'
          ? 'strong'
          : mark.type === 'italic'
            ? 'em'
            : mark.type === 'link'
              ? 'a'
              : 'span';
      const wrapper = document.createElement(tag);
      if (tag === 'a')
        wrapper.setAttribute('href', attribute(mark.attrs, 'href'));
      wrapper.append(element);
      element = wrapper;
    }
    return element;
  }
  const tag = {
    doc: 'div',
    paragraph: 'p',
    heading: `h${attribute(node.attrs, 'level') || '1'}`,
    bulletList: 'ul',
    orderedList: 'ol',
    listItem: 'li',
    hardBreak: 'br',
    horizontalRule: 'hr',
    assetBlock: 'figure',
  }[node.type ?? 'doc'];
  const element = document.createElement(tag ?? 'div');
  if (node.type === 'orderedList') {
    element.setAttribute('start', attribute(node.attrs, 'start') || '1');
  }
  if (node.type === 'assetBlock') {
    element.setAttribute('data-file', attribute(node.attrs, 'assetId'));
    element.setAttribute(
      'data-description',
      attribute(node.attrs, 'description').trim(),
    );
  }
  for (const child of node.content ?? []) element.append(editorElements(child));
  return element;
};

/** (b) What the editor shows when it opens `text` in a field of `shape`. */
const shownByEditor = (text: string, shape: Shape): string[] =>
  read(editorElements(opened(text, shape)));

/** The words of the editor's document, as the researcher reads them. */
const editorWords = (text: string, shape: Shape): string => {
  const words = (node: RichTextContent): string =>
    node.type === 'text'
      ? (node.text ?? '')
      : (node.content ?? []).map(words).join(' ');
  return words(opened(text, shape)).replace(/\s+/g, ' ').trim();
};

/**
 * Stored schema 9 text means one thing wherever it is read. For each text,
 * in each shape that may hold it, these three must agree:
 * (a) what the interview draws;
 * (b) what the editor shows when it opens the text;
 * (c) what the interview draws after the editor opens the text and saves it
 *     unchanged.
 * The saved spelling may differ from the stored one (a block quote or HTML,
 * which the editor cannot write, is saved another way); what is drawn may
 * not, and saving a second time changes nothing.
 */
const SCHEMA_8_TEXTS = [
  '> 5 years',
  '<IRB OR ETHICS BOARD HERE>',
  'a < b > c',
  'Line one<br>Line two',
  'Visit www.example.org today',
  'See https://example.org.',
  'Email help@example.org',
  '<https://example.org>',
  'Enter `a > b`',
  '[label](https://example.org)',
  ':smile: Welcome',
  ':notanemoji: text',
  'This is ~~not~~ required',
  '- [ ] first',
  'About ~5 minutes',
  'Some <em>words</em> and <a href="https://example.com">a link</a>',
];

const SCHEMA_9_TEXTS = [
  'Some _emphasis_ here',
  'Some **strong** words',
  'A [link](https://example.org/a) in a sentence',
  '- first\n- second\n\n1. one\n2. two',
  '# A heading\n\nWords under it',
  'Line one  \nLine two',
  '> quoted',
  'Words with <span>inline HTML</span> in them',
  '<div>\nA block of HTML\n</div>',
  'A shortcode typed by hand :smile:',
  'An emoji 😄 in a sentence',
];

type Readings = Readonly<{
  drawn: string[];
  editor: string[];
  saved: string[];
}>;

/**
 * Where (a), (b) and (c) do not agree: the text as stored, its shape, and
 * the three readings, so that a change to any of them is seen here. These
 * are not accepted differences; each is a place where saving a text without
 * a change takes away something a participant saw.
 */
const DISAGREEMENTS: readonly (readonly [string, Shape, Readings])[] = [
  // The editor offers no links in one-line text, so it drops a link the
  // interview draws there, and a save removes it.
  [
    '<https://example.org>',
    LINE,
    {
      drawn: ['⟨link https://example.org/⟩https://example.org⟩'],
      editor: ['https://example.org'],
      saved: ['https://example.org'],
    },
  ],
  [
    '[label](https://example.org)',
    LINE,
    {
      drawn: ['⟨link https://example.org/⟩label⟩'],
      editor: ['label'],
      saved: ['label'],
    },
  ],
  [
    'A [link](https://example.org/a) in a sentence',
    LINE,
    {
      drawn: ['A ⟨link https://example.org/a⟩link⟩ in a sentence'],
      editor: ['A link in a sentence'],
      saved: ['A link in a sentence'],
    },
  ],
  // A one-line label draws a list; the editor reads one line as words.
  [
    '- [ ] first',
    LINE,
    {
      drawn: ['• [ ] first'],
      editor: ['[ ] first'],
      saved: ['[ ] first'],
    },
  ],
  // A bare address the old reading found inside typed HTML, which the
  // migration wrote as a link: the interview draws it, but the editor drops
  // a link whose address is not a valid URL.
  ...[PAGE, BLOCKS].map(
    (shape) =>
      [
        schema8MarkdownAsStandard(
          'Some <em>words</em> and <a href="https://example.com">a link</a>',
          'multiple',
        ),
        shape,
        {
          drawn: [
            'Some <em>words</em> and <a href="⟨link https://example.com%22%3Ea⟩https://example.com">a⟩ link</a>',
          ],
          editor: [
            'Some <em>words</em> and <a href="https://example.com">a link</a>',
          ],
          saved: [
            'Some <em>words</em> and <a href="https://example.com">a link</a>',
          ],
        },
      ] satisfies readonly [string, Shape, Readings],
  ),
];

const isDisagreement = (stored: string, shape: Shape) =>
  DISAGREEMENTS.some(
    ([each, eachShape]) => each === stored && eachShape === shape,
  );

const cases = (
  texts: readonly string[],
  prepare: (text: string, shape: Shape) => string,
) =>
  SHAPES.flatMap((shape) =>
    texts
      .map((text) => [text, prepare(text, shape)] as const)
      .filter(([, stored]) => accepts(shape, stored))
      .filter(([, stored]) => !isDisagreement(stored, shape))
      .map(([text, stored]) => [shape.name, text, shape, stored] as const),
  );

const expectOneReading = (stored: string, shape: Shape) => {
  const interview = drawn(stored, shape);
  expect(interview.length).toBeGreaterThan(0);
  expect(shownByEditor(stored, shape)).toEqual(interview);
  const saved = roundTrip(stored, shape);
  expect(drawn(saved, shape)).toEqual(interview);
  expect(roundTrip(saved, shape)).toBe(saved);
};

describe('the interview, the editor and a save without changes show stored text alike', () => {
  it.each(
    cases(SCHEMA_8_TEXTS, (text, shape) =>
      schema8MarkdownAsStandard(text, shape.lines),
    ),
  )('in %s, schema 8 text %j as migrated', (_name, _text, shape, stored) => {
    expectOneReading(stored, shape);
  });

  it.each(cases(SCHEMA_9_TEXTS, (text) => text))(
    'in %s, schema 9 text %j',
    (_name, _text, shape, stored) => {
      expectOneReading(stored, shape);
    },
  );

  it.each(
    DISAGREEMENTS.map(
      ([stored, shape, readings]) =>
        [stored, shape.name, shape, readings] as const,
    ),
  )('records how %j disagrees in %s', (stored, _name, shape, readings) => {
    expect({
      drawn: drawn(stored, shape),
      editor: shownByEditor(stored, shape),
      saved: drawn(roundTrip(stored, shape), shape),
    }).toEqual(readings);
  });

  it('keeps an emoji shortcode typed in schema 9 as it was typed', () => {
    for (const shape of SHAPES) {
      expect(drawn(':smile: hello', shape)).toEqual([':smile: hello']);
    }
  });
});

/**
 * Opening a text in the editor and saving it without typing anything must
 * leave the interview showing what it showed: the saved spelling may differ,
 * the reading may not.
 */
describe('a text saved unchanged reads as it did to the interview', () => {
  it.each([
    ['a ">" in a code span', 'Over `a > b` here', BLOCKS],
    [
      'a ">" in a fenced code block',
      'Before\n\n```\na > b\n```\n\nAfter',
      BLOCKS,
    ],
    ['a ">" in an indented code block', 'Before\n\n    a > b\n\nAfter', BLOCKS],
    ['a code span on a page', 'Over `a > b` here\n\n![Map](asset:map)', PAGE],
    ['an autolink', 'See <https://example.org> now', BLOCKS],
    ['an email autolink', 'Write to <someone@example.org>', BLOCKS],
    [
      'a bracketed link address',
      'See [the site](<https://example.org/a b>)',
      BLOCKS,
    ],
    [
      'a link title holding ">"',
      'See [the site](https://example.org "a > b")',
      BLOCKS,
    ],
    [
      'a link named by a bracketed reference',
      'See [the site][ref]\n\n[ref]: <https://example.org/a b>',
      BLOCKS,
    ],
    [
      'a link named by a reference',
      'See [the site][ref] and [ref]\n\n[ref]: https://example.org/a "A title"',
      BLOCKS,
    ],
    [
      'a file named by a bracketed reference',
      'Text\n\n![Map][ref]\n\n[ref]: <asset:map>',
      PAGE,
    ],
    [
      'a file named by a reference',
      'Text\n\n![Map][ref]\n\n[ref]: asset:map',
      PAGE,
    ],
    [
      'a bracketed file with a title holding ">"',
      '![Map](<asset:map> "a > b")',
      PAGE,
    ],
    ['a ">" already written as a reference', 'Ages &gt; 65', BLOCKS],
    ['an ampersand reference written as text', 'Write &amp;gt; for it', BLOCKS],
    ['a line break', 'Line one\\\nline two  \nline three', BLOCKS],
    [
      'a comparison beside a file',
      'a < b\n\n![Map](<asset:map>)\n\nc > d',
      PAGE,
    ],
  ])('with %s', (_case, text, shape) => {
    expectOneReading(text, shape);
  });

  it('shows a ">" in code as itself in the editor, not as its reference', () => {
    expect(editorWords('Over `a > b` here', BLOCKS)).toBe('Over a > b here');
    expect(editorWords('```\na > b\n```', BLOCKS)).toBe('a > b');
    expect(editorWords('    a > b', BLOCKS)).toBe('a > b');
  });
});

/**
 * Schema 9 text means what standard CommonMark says it means; what an older
 * protocol typed as characters was escaped by the migration from schema 8.
 * A quotation, which the editor cannot write, is shown as its words, as the
 * interview shows it; raw HTML is shown as the characters typed, and saved
 * so that it reads as those characters.
 */
describe('text the editor cannot write', () => {
  it.each([
    ['> 5 years', '5 years', BLOCKS],
    ['> 5 years\n\n![Map](<asset:map>)', '5 years', PAGE],
    ['> A quotation\n> of two lines', 'A quotation of two lines', BLOCKS],
  ])('shows the quotation %j as its words', (text, words, shape) => {
    expect(editorWords(text, shape)).toBe(words);
    expectOneReading(text, shape);
  });

  it.each([
    'Through <IRB OR ETHICS BOARD HERE> today.',
    '<strong>x</strong> and <!-- c -->',
    'Line one<br>line two',
  ])('shows the raw HTML in %j as the characters typed', (text) => {
    // The editor holds the tags and the words between them as pieces of
    // text, which `editorWords` parts with spaces.
    expect(editorWords(text, BLOCKS).replace(/\s+/g, '')).toBe(
      text.replace(/\s+/g, ''),
    );
    const saved = roundTrip(text, BLOCKS);
    const [paragraph] = markdownTree(saved).children;
    expect(paragraph).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', value: text }],
    });
    expect(roundTrip(saved, BLOCKS)).toBe(saved);
  });
});
