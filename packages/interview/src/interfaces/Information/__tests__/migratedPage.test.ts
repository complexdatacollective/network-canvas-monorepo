import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { migrateProtocol } from '@codaco/protocol-validation';

// Markdown as the interview draws an Information page's text, and as it drew
// each schema 8 text item: through the same renderer, with the same
// elements, raw HTML parsed and then sanitized.
const html = (markdown: string): string =>
  renderToStaticMarkup(
    createElement(
      RenderMarkdown,
      { allowedElements: ALLOWED_MARKDOWN_SECTION_TAGS },
      markdown,
    ),
  );

// A link holding nothing but space (a link's words are drawn in a span):
// nothing to read, but a stop for the keyboard.
const EMPTY_LINK = /<a\b[^>]*>\s*(?:<span\b[^>]*>\s*<\/span>)?\s*<\/a>/g;
const EMPTY_EMPHASIS = /<(em|strong)>\s*<\/\1>/g;

const emptyLinksIn = (markup: string): number =>
  markup.match(EMPTY_LINK)?.length ?? 0;

// What a participant is shown. Space between elements, and a line break
// beside one, is not drawn, and differs between one text and several; nor is emphasis or a link holding
// only space, which the HTML parser leaves after a list item that left one
// open (a link of that kind is counted apart, below).
const drawn = (markdown: string): string => {
  let shown = html(markdown)
    .replace(/>\s+</g, '><')
    .replace(/\s*\n\s*(?=<)|(?<=>)\s*\n\s*/g, '');
  for (;;) {
    const less = shown.replace(EMPTY_EMPHASIS, '').replace(EMPTY_LINK, '');
    if (less === shown) return shown;
    shown = less;
  }
};

// The page a schema 8 Information stage of these text items becomes.
const migratedPage = (items: readonly string[]): string => {
  const protocol = migrateProtocol(
    {
      name: 'Protocol',
      schemaVersion: 8,
      codebook: { node: {}, edge: {}, ego: {} },
      assetManifest: {},
      stages: [
        {
          id: 'info',
          type: 'Information',
          label: 'Intro',
          items: items.map((content, index) => ({
            id: `item-${index}`,
            type: 'text',
            content,
          })),
        },
      ],
    },
    9,
  );
  const [stage] = protocol.stages;
  if (stage?.type !== 'Information') throw new Error('No Information stage');
  const { content } = stage;
  const message = typeof content === 'string' ? content : content.en;
  if (message === undefined) throw new Error('No English content');
  // The items hold no message syntax, so the message is the markdown.
  return message;
};

// Text items whose raw HTML leaves an element open, each drawn alone as
// schema 8 drew it. An element left open holds, or for formatting is opened
// again in, whatever follows it in the same document.
const LEFT_OPEN = [
  '<a href="https://example.com">First',
  '<strong>First',
  '<em>First',
  'Read <a href="https://example.com">this <strong>now',
  '<em>First\n\nand second',
  '- <em>a listed item',
  '- one\n- <a href="https://example.com">two',
  '> <strong>quoted',
  '# A <em>heading',
  'Heading <a href="https://example.com">here\n===',
  '<h2>A heading',
  '<ul><li>A raw list',
  '<div>A raw block',
  '<div>\n\nmarkdown inside a raw block',
  '<p>A raw paragraph',
  'Pick <select><option>one',
  '<table><tr><td>A raw cell',
  '<span>Inline',
  'Ends in a backslash <em>here\\',
  '<a href="https://example.com">A link\n\n```\nthen code\n```',
  '<strong>Bold\n\n---',
  '<em>Then a table\n\n| a | b |\n| - | - |\n| 1 | 2 |',
  '| a |\n| - |\n| <em>in a cell |',
  '<em>\n\nA paragraph inside raw emphasis',
  '<div><em>Raw emphasis in a raw block',
  'A <div>block in a paragraph',
  '<!-- A comment left open',
  'Closed <em>here</em> but <strong>not here',
  '<a href="https://example.com">One [label]\n\n[label]: https://example.com/2',
];

const FOLLOWERS = ['Second', '- a list', '<span>raw</span>', '# Heading'];

describe('a migrated Information page', () => {
  it('draws each text item as it was drawn alone, whatever HTML it left open', () => {
    expect(LEFT_OPEN.length).toBeGreaterThan(0);
    for (const item of LEFT_OPEN) {
      for (const follower of FOLLOWERS) {
        const page = migratedPage([item, follower]);
        expect(
          drawn(page),
          `${JSON.stringify(item)} then ${JSON.stringify(follower)} became ${JSON.stringify(page)}`,
        ).toBe(drawn(item) + drawn(follower));
        // Joining adds no stop for the keyboard that the items lacked.
        expect(
          emptyLinksIn(html(page)),
          JSON.stringify(page),
        ).toBeLessThanOrEqual(
          emptyLinksIn(html(item)) + emptyLinksIn(html(follower)),
        );
      }
    }
  });

  it('draws an item that closes what it opens as it was written', () => {
    const items = [
      'Some <em>words</em> and <a href="https://example.com">a link</a>',
      'Second',
    ];
    expect(migratedPage(items)).toBe(items.join('\n\n'));
  });
});
