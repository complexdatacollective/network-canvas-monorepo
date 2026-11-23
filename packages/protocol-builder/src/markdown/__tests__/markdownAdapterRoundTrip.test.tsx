import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import {
  isAssetBlockUrl,
  readAssetBlockUrl,
} from '@codaco/protocol-validation';

import {
  type RichTextContent,
  markdownToRichTextContent,
  richTextContentToMarkdown,
} from '../markdownAdapter.ts';

afterEach(cleanup);

type Field = Readonly<{ assetBlocks: boolean }>;

const PAGE: Field = { assetBlocks: true };
const PROMPT: Field = { assetBlocks: false };

/** Opened in the editor and saved without a change. */
const roundTrip = (text: string, { assetBlocks }: Field) =>
  richTextContentToMarkdown(markdownToRichTextContent(text, { assetBlocks }));

const BLOCK_TAGS = new Set(['P', 'LI', 'UL', 'OL', 'DIV', 'SPAN']);

/**
 * What the interview's renderer shows for `text`: its words, with where they
 * are bold, emphasised, linked (and where to), broken, ruled, headed, and
 * each file drawn as a block. Paragraph and list wrappers only part words.
 */
const shown = (text: string, { assetBlocks }: Field) => {
  const { container, unmount } = render(
    <RenderMarkdown
      allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
      blockImages={
        assetBlocks
          ? {
              matches: isAssetBlockUrl,
              Block: ({ url, alt }) => (
                <figure
                  data-file={readAssetBlockUrl(url)?.block.assetId ?? ''}
                  data-description={alt.trim()}
                />
              ),
            }
          : undefined
      }
    >
      {text}
    </RenderMarkdown>,
  );
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof Element)) return '';
    const inner = Array.from(node.childNodes, walk).join('');
    switch (node.tagName) {
      case 'STRONG':
        return `<b>${inner}</b>`;
      case 'EM':
        return `<i>${inner}</i>`;
      case 'A':
        return `<a ${node.getAttribute('href')} ${node.getAttribute('title') ?? ''}>${inner}</a>`;
      case 'BR':
        return '<br>';
      case 'HR':
        return ' <hr> ';
      case 'FIGURE':
        return ` <file ${node.getAttribute('data-file')} "${node.getAttribute('data-description')}"> `;
      default:
        if (/^H[1-6]$/.test(node.tagName)) {
          return ` <${node.tagName.toLowerCase()}>${inner} `;
        }
        return BLOCK_TAGS.has(node.tagName) ? ` ${inner} ` : inner;
    }
  };
  const reading = walk(container)
    .replace(/\s+/g, ' ')
    // Space at a format's edge reads the same inside it as outside it.
    .replace(/\s+(<\/[bia]>)/g, '$1 ')
    .replace(/(<[bi]>|<a [^>]*>)\s+/g, ' $1')
    .replace(/<\/b><b>|<\/i><i>/g, '')
    // A break is a break, whatever space the line it ends kept.
    .replace(/\s*<br>\s*/g, '<br>')
    .replace(/\s+/g, ' ')
    .trim();
  unmount();
  return reading;
};

/** The words of the editor's document, as the researcher reads them. */
const editorWords = (text: string, { assetBlocks }: Field): string => {
  const words = (node: RichTextContent): string =>
    node.type === 'text'
      ? (node.text ?? '')
      : (node.content ?? []).map(words).join(' ');
  return words(markdownToRichTextContent(text, { assetBlocks }))
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Opening a text in the editor and saving it without typing anything must
 * leave the interview showing what it showed: the saved spelling may differ,
 * the reading may not.
 */
describe('a text saved unchanged reads as it did to the interview', () => {
  it.each([
    ['a ">" in a code span', 'Over `a > b` here', PROMPT],
    [
      'a ">" in a fenced code block',
      'Before\n\n```\na > b\n```\n\nAfter',
      PROMPT,
    ],
    ['a ">" in an indented code block', 'Before\n\n    a > b\n\nAfter', PROMPT],
    ['a code span on a page', 'Over `a > b` here\n\n![Map](asset:map)', PAGE],
    ['an autolink', 'See <https://example.org> now', PROMPT],
    ['an email autolink', 'Write to <someone@example.org>', PROMPT],
    [
      'a bracketed link address',
      'See [the site](<https://example.org/a b>)',
      PROMPT,
    ],
    [
      'a link title holding ">"',
      'See [the site](https://example.org "a > b")',
      PROMPT,
    ],
    [
      'a link named by a bracketed reference',
      'See [the site][ref]\n\n[ref]: <https://example.org/a b>',
      PROMPT,
    ],
    [
      'a link named by a reference',
      'See [the site][ref] and [ref]\n\n[ref]: https://example.org/a "A title"',
      PROMPT,
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
    ['a ">" already written as a reference', 'Ages &gt; 65', PROMPT],
    ['an ampersand reference written as text', 'Write &amp;gt; for it', PROMPT],
    ['a break written as HTML', 'Line one<br>line two', PROMPT],
    ['a self-closing break', 'Line one<br/>line two<BR />line three', PROMPT],
    [
      'a comparison beside a file',
      'a < b\n\n![Map](<asset:map>)\n\nc > d',
      PAGE,
    ],
  ])('with %s', (_case, text, field) => {
    const saved = roundTrip(text, field);
    expect(shown(saved, field)).toBe(shown(text, field));
    // And saved again, it stays as it was saved.
    expect(roundTrip(saved, field)).toBe(saved);
  });

  it('shows a ">" in code as itself in the editor, not as its reference', () => {
    expect(editorWords('Over `a > b` here', PROMPT)).toBe('Over a > b here');
    expect(editorWords('```\na > b\n```', PROMPT)).toBe('a > b');
    expect(editorWords('    a > b', PROMPT)).toBe('a > b');
  });
});

/**
 * Text the editor has always read as typed characters, whatever the
 * interview makes of it: a line opening with ">", which the legacy editor
 * wrote for a comparison, and raw HTML, such as a bracketed placeholder.
 * Saved, it is stored escaped, so the participant is shown it as written.
 */
describe('text the editor reads as typed characters', () => {
  it.each([
    ['> 5 years', PROMPT],
    ['> 5 years\n\n![Map](<asset:map>)', PAGE],
    ['Through <IRB OR ETHICS BOARD HERE> today.', PROMPT],
    ['<strong>x</strong> and <!-- c -->', PROMPT],
  ])('reads %j as written, and saves it to show as written', (text, field) => {
    const words = text.replace(/\s*!\[Map\]\(<asset:map>\)/, '');
    expect(editorWords(text, field)).toBe(words.replace(/\s+/g, ' '));
    const saved = roundTrip(text, field);
    expect(shown(saved, PROMPT).replace(/ <file map "Map">/, '')).toBe(
      words.replace(/\s+/g, ' '),
    );
  });
});
