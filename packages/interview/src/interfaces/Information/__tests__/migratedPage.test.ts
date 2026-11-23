import { describe, expect, it } from 'vitest';

import { markdownTree, migrateProtocol } from '@codaco/protocol-validation';
import { textItemAsStandard } from '@codaco/protocol-validation/testing/information-pages';

// Schema 9 text holds no HTML that is read as HTML. The migration from
// schema 8 reads every `<` and `>` in a text item as a typed character
// (except `<br>`, a line break), and writes it escaped, so the page it
// writes shows those characters. The interview's renderer draws any HTML
// left in schema 9 text as the characters typed (see fresco-ui's
// `RenderMarkdown` tests); these tests check what the migration writes.

type TreeNode = Readonly<{
  type: string;
  value?: string;
  children?: readonly TreeNode[];
}>;

const nodesOf = (node: TreeNode): TreeNode[] => [
  node,
  ...(node.children ?? []).flatMap(nodesOf),
];

// The characters a reading shows, in order: its words and its code.
const wordsOf = (markdown: string): string =>
  nodesOf(markdownTree(markdown))
    .map((node) =>
      node.type === 'text' || node.type === 'inlineCode' || node.type === 'code'
        ? (node.value ?? '')
        : '',
    )
    .join('')
    .replace(/\s+/g, '');

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

// Text items holding HTML tags, many left open, which schema 8 drew as HTML.
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
  it('writes the HTML of each text item as the characters typed, and keeps the items apart', () => {
    expect(LEFT_OPEN.length).toBeGreaterThan(0);
    for (const item of LEFT_OPEN) {
      for (const follower of FOLLOWERS) {
        const page = migratedPage([item, follower]);
        const nodes = nodesOf(markdownTree(page));
        // Nothing on the page is read as HTML.
        expect(
          nodes.filter(({ type }) => type === 'html'),
          JSON.stringify(page),
        ).toEqual([]);
        // The page shows what each item shows alone, one after the other,
        // and nothing more.
        expect(
          wordsOf(page),
          `${JSON.stringify(item)} then ${JSON.stringify(follower)} became ${JSON.stringify(page)}`,
        ).toBe(
          wordsOf(textItemAsStandard(item)) +
            wordsOf(textItemAsStandard(follower)),
        );
      }
    }
  });

  it('shows the tags of an item that closes what it opens as typed', () => {
    const page = migratedPage([
      'Some <em>words</em> and <a href="https://example.com">a link</a>',
      'Second',
    ]);
    // The web address is read as GitHub's reading of schema 8 text read it,
    // up to the space after it, and becomes a link.
    expect(page).toBe(
      'Some &lt;em&gt;words&lt;/em&gt; and &lt;a href="[https://example.com">a](https://example.com"\\>a) link&lt;/a&gt;\n\nSecond',
    );
    expect(wordsOf(page)).toBe(
      'Some<em>words</em>and<ahref="https://example.com">alink</a>Second',
    );
  });
});
