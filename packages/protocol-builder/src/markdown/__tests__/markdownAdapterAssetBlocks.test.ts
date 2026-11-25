import { describe, expect, it } from 'vitest';

import { assetBlockAttributes } from '@codaco/fresco-ui/testing/assetBlock';
import {
  ASSET_BLOCK_ALIGNMENTS,
  ASSET_BLOCK_SIZES,
  assetBlocksInMarkdown,
} from '@codaco/protocol-validation';

import {
  type RichTextContent,
  markdownToRichTextContent,
  richTextContentToMarkdown,
} from '../markdownAdapter.ts';

const read = (value: string) =>
  markdownToRichTextContent(value, { assetBlocks: true });

const write = (content: RichTextContent) => richTextContentToMarkdown(content);

const roundTrip = (value: string) => write(read(value));

// Settings as loose as a saved value may hold, so a test can hand the
// writer one the editor could not have set.
const blockNode = (attrs: Record<string, unknown>): RichTextContent => ({
  type: 'assetBlock',
  attrs: { ...assetBlockAttributes(), ...attrs },
});

const paragraph = (text?: string): RichTextContent =>
  text === undefined
    ? { type: 'paragraph' }
    : { type: 'paragraph', content: [{ type: 'text', text }] };

describe('reading an asset image as a block', () => {
  it('reads an image alone in its paragraph as a block with every setting at its default', () => {
    expect(read('![A map](asset:a1)')).toEqual({
      type: 'doc',
      content: [blockNode({ description: 'A map' })],
    });
  });

  it('reads every setting from the address', () => {
    expect(
      read('![](asset:a1?size=large&align=end&autoplay=false&loop=false)'),
    ).toEqual({
      type: 'doc',
      content: [
        blockNode({
          size: 'large',
          align: 'end',
          autoplay: false,
          loop: false,
        }),
      ],
    });
  });

  it('decodes an asset id that was written percent-encoded', () => {
    expect(read('![](asset:a%20b%29)').content?.[0]?.attrs?.assetId).toBe(
      'a b)',
    );
  });

  it('keeps the attributes in the order the editor compares documents in', () => {
    // The editor compares a document with the one it started from by their
    // JSON, so a different key order reads as an edit.
    const attrs = read('![x](asset:a1?size=small)').content?.[0]?.attrs;
    expect(Object.keys(attrs ?? {})).toEqual([
      'assetId',
      'description',
      'size',
      'align',
      'autoplay',
      'loop',
    ]);
  });

  it('reads a block between paragraphs', () => {
    expect(read('Before\n\n![](asset:a1)\n\nAfter')).toEqual({
      type: 'doc',
      content: [paragraph('Before'), blockNode({}), paragraph('After')],
    });
  });

  it('reads a block first, and last, and alone', () => {
    expect(read('![](asset:a1)\n\nAfter').content?.map((n) => n.type)).toEqual([
      'assetBlock',
      'paragraph',
    ]);
    expect(read('Before\n\n![](asset:a1)').content?.map((n) => n.type)).toEqual(
      ['paragraph', 'assetBlock'],
    );
    expect(read('![](asset:a1)').content?.map((n) => n.type)).toEqual([
      'assetBlock',
    ]);
  });

  it('splits a paragraph around an image in the middle of a sentence', () => {
    expect(read('Before ![Map](asset:a1) after')).toEqual({
      type: 'doc',
      content: [
        paragraph('Before'),
        blockNode({ description: 'Map' }),
        paragraph('after'),
      ],
    });
  });

  it('splits around two images in one paragraph, keeping their order', () => {
    const blocks = read('![](asset:one) and ![](asset:two)').content;
    expect(blocks?.map((node) => node.attrs?.assetId ?? node.type)).toEqual([
      'one',
      'paragraph',
      'two',
    ]);
  });

  it('gives a list item that opens with a block an empty paragraph to open with', () => {
    expect(read('- ![](asset:a1)').content).toEqual([
      {
        type: 'bulletList',
        attrs: undefined,
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph' }, blockNode({})],
          },
        ],
      },
    ]);
  });

  it('leaves a list item that opens with text as it was', () => {
    const [list] = read('- Text\n\n  ![](asset:a1)').content ?? [];
    expect(list?.content?.[0]?.content?.map((n) => n.type)).toEqual([
      'paragraph',
      'assetBlock',
    ]);
  });
});

describe('where an asset image is not a block', () => {
  it('is its description when the field does not hold blocks', () => {
    const content = markdownToRichTextContent('![A map](asset:a1)');
    expect(JSON.stringify(content)).not.toContain('assetBlock');
    expect(content).toEqual(
      markdownToRichTextContent('![A map](asset:a1)', { assetBlocks: false }),
    );
    expect(content.content?.[0]).toEqual(paragraph('A map'));
  });

  it.each([
    ['inline', true, false],
    ['inline with links', true, true],
  ])('is never one in a line (%s)', (_kind, inline, links) => {
    const content = markdownToRichTextContent('See ![A map](asset:a1) here', {
      inline,
      links,
      assetBlocks: true,
    });
    expect(JSON.stringify(content)).not.toContain('assetBlock');
  });

  it('is unchanged for an image that does not name a file of the protocol', () => {
    const withBlocks = markdownToRichTextContent(
      'Text ![Logo](https://example.org/logo.png) more',
      { assetBlocks: true },
    );
    const without = markdownToRichTextContent(
      'Text ![Logo](https://example.org/logo.png) more',
    );
    expect(withBlocks).toEqual(without);
    expect(JSON.stringify(withBlocks)).not.toContain('assetBlock');
  });
});

describe('writing a block as markdown', () => {
  it('writes the defaults as a bare address', () => {
    expect(write({ type: 'doc', content: [blockNode({})] })).toBe(
      '![](asset:a1)',
    );
  });

  it('writes a default alignment, autoplay and loop as nothing', () => {
    expect(
      write({
        type: 'doc',
        content: [blockNode({ align: 'center', autoplay: true, loop: true })],
      }),
    ).toBe('![](asset:a1)');
  });

  it('writes a block with no asset as nothing', () => {
    expect(
      write({
        type: 'doc',
        content: [
          paragraph('Before'),
          blockNode({ assetId: '' }),
          paragraph('After'),
        ],
      }),
    ).toBe('Before\n\nAfter');
    expect(write({ type: 'doc', content: [blockNode({ assetId: '' })] })).toBe(
      '',
    );
  });

  it('counts a document holding only a block as content', () => {
    expect(write({ type: 'doc', content: [blockNode({})] })).not.toBe('');
  });

  it('ignores a size or alignment the editor could not have set', () => {
    expect(
      write({
        type: 'doc',
        content: [blockNode({ size: 'huge', align: 'diagonal' })],
      }),
    ).toBe('![](asset:a1)');
  });

  it.each([
    ['a size', { size: 'medium' }, '![](asset:a1?size=medium)'],
    ['an alignment', { align: 'end' }, '![](asset:a1?align=end)'],
    ['autoplay off', { autoplay: false }, '![](asset:a1?autoplay=false)'],
    ['loop off', { loop: false }, '![](asset:a1?loop=false)'],
    [
      'everything',
      { size: 'small', align: 'start', autoplay: false, loop: false },
      '![](asset:a1?size=small&align=start&autoplay=false&loop=false)',
    ],
  ])('writes %s', (_kind, attrs, expected) => {
    expect(write({ type: 'doc', content: [blockNode(attrs)] })).toBe(expected);
  });
});

describe('a block through markdown and back', () => {
  // Every setting a block can be given, so a new size or position is
  // covered as soon as it exists.
  const sizes = [null, ...ASSET_BLOCK_SIZES];
  const flags = [true, false] as const;
  const combinations = sizes.flatMap((size) =>
    ASSET_BLOCK_ALIGNMENTS.flatMap((align) =>
      flags.flatMap((autoplay) =>
        flags.map((loop) => ({ size, align, autoplay, loop })),
      ),
    ),
  );

  it.each(combinations)('returns the same block for %j', (settings) => {
    const node = blockNode({ ...settings, description: 'A map' });
    const markdown = write({ type: 'doc', content: [node] });
    expect(read(markdown)).toEqual({ type: 'doc', content: [node] });
    // And the markdown is stable: one spelling for one block.
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it.each([
    ['quotes', 'She said "hi" and \'bye\''],
    ['brackets', 'a [b] c'],
    ['emphasis marks', '*not* _emphasis_ and `code`'],
    ['angle brackets', 'a <b> and > c'],
    ['an ampersand', 'Fish & chips &amp; more'],
    ['a backslash', 'C:\\maps\\a'],
    ['unicode', 'Carte du quartier 地図 😀'],
    ['a heading marker', '# not a heading'],
  ])('keeps a description with %s as written', (_kind, description) => {
    const node = blockNode({ description });
    const markdown = write({ type: 'doc', content: [node] });
    const back = read(markdown);
    expect(back).toEqual({ type: 'doc', content: [node] });
  });

  it('writes a description on one line, with its breaks and edges tidied', () => {
    const markdown = write({
      type: 'doc',
      content: [blockNode({ description: '  Line one\n  line   two  ' })],
    });
    expect(markdown).toBe('![Line one line two](asset:a1)');
  });

  it('keeps an asset id that needs escaping', () => {
    const node = blockNode({ assetId: "a b(c)'!*?&=" });
    const markdown = write({ type: 'doc', content: [node] });
    expect(markdown).toBe('![](asset:a%20b%28c%29%27%21%2A%3F%26%3D)');
    expect(read(markdown)).toEqual({ type: 'doc', content: [node] });
  });

  it('keeps a block between paragraphs', () => {
    const markdown = 'Before\n\n![Map](asset:a1?size=small)\n\nAfter';
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('keeps a block first, last and alone', () => {
    for (const markdown of [
      '![Map](asset:a1)\n\nAfter',
      'Before\n\n![Map](asset:a1)',
      '![Map](asset:a1)',
    ]) {
      expect(roundTrip(markdown)).toBe(markdown);
    }
  });

  it('keeps a block that opens a list item, as it was written', () => {
    for (const markdown of [
      '- ![Map](asset:a1)\n- Second',
      // A numbered item's marker is wider than a bulleted one's, and what
      // follows it has to be set in by that width to stay in the item.
      '1. ![Map](asset:a1)\n2. Second',
      '10. ![Map](asset:a1)\n11. Second',
    ]) {
      expect(roundTrip(markdown)).toBe(markdown);
    }
  });

  it('keeps a block after text in a list item', () => {
    for (const markdown of [
      '1. Text\n   ![Map](asset:a1)\n2. Second',
      '- Text\n  ![Map](asset:a1)\n- Second',
      '10. Text\n    ![Map](asset:a1)\n11. Second',
      '1. Text\n\n   ![Map](asset:a1)\n\n   More\n2. Second',
    ]) {
      const once = roundTrip(markdown);
      expect(read(once)).toEqual(read(markdown));
      // And the text it wrote is a fixed point.
      expect(roundTrip(once)).toBe(once);
    }
  });

  it('writes a sentence split around a block as three paragraphs, then keeps them', () => {
    const once = roundTrip('Before ![Map](asset:a1) after');
    expect(once).toBe('Before\n\n![Map](asset:a1)\n\nafter');
    expect(roundTrip(once)).toBe(once);
  });
});

// Text written once must come back the same when it is written again: the
// second writing is what a researcher's next edit saves.
describe('a line break beside a block', () => {
  const settles = (value: string) => {
    const once = roundTrip(value);
    expect(roundTrip(once)).toBe(once);
    return once;
  };

  it.each([
    ['before it', 'Text  \n![A](asset:a1)', 'Text\n\n![A](asset:a1)'],
    ['after it', '![A](asset:a1)  \nText', '![A](asset:a1)\n\nText'],
    [
      'on both sides',
      'One  \n![A](asset:a1)  \nTwo',
      'One\n\n![A](asset:a1)\n\nTwo',
    ],
  ])(
    'written %s belongs to neither, and is left out',
    (_where, value, written) => {
      expect(settles(value)).toBe(written);
    },
  );

  it('typed at the end of the paragraph a block follows is left out', () => {
    // What the editor holds after Shift+Enter and then inserting a file.
    const document: RichTextContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Text' }, { type: 'hardBreak' }],
        },
        blockNode({ description: 'A' }),
      ],
    };
    const written = write(document);
    expect(written).toBe('Text\n\n![A](asset:a1)');
    expect(roundTrip(written)).toBe(written);
  });

  it('inside a paragraph is kept', () => {
    expect(settles('One  \nTwo\n\n![A](asset:a1)')).toBe(
      'One  \nTwo\n\n![A](asset:a1)',
    );
  });
});

// The editor and the interview must agree on what is a block: text the
// interview draws a file for, and the editor opens as words, loses the file
// when it is saved. Markdown allows an address to be written between angle
// brackets, which nothing here writes and a protocol made by hand may hold.
describe('a block whose address is written between angle brackets', () => {
  const written = [
    '![A map](<asset:a1>)',
    '![A map](<asset:a1?size=small&align=end>)',
    '![A map](<asset:a1> "A title")',
    'Before\n\n![A map](<asset:a1>)\n\nAfter > before',
    '1. Item\n\n   ![A map](<asset:a1>)',
    '![A map](<asset:a b>)',
    '![A > B](<asset:a1>)',
  ];

  it.each(written)('reads %j as the block the interview shows', (markdown) => {
    const shown = assetBlocksInMarkdown(markdown);
    // The interview shows one file here, with nothing wrong with it.
    expect(shown).toHaveLength(1);
    expect(shown[0]?.problems).toEqual([]);

    // The editor reads that file as a block, and saves text the interview
    // still shows it for, with the same settings.
    const saved = roundTrip(markdown);
    expect(assetBlocksInMarkdown(saved)).toEqual(shown);
    // In the one spelling a block has, so saving again changes nothing.
    expect(saved).not.toContain('<');
    expect(roundTrip(saved)).toBe(saved);
  });

  // A line opening with ">" is a quotation in schema 9 text; a ">" typed in
  // an older protocol was escaped by the migration from schema 8.
  it('shows a quotation beside a block as its words, as the interview does', () => {
    expect(roundTrip('> A quotation\n\n![A map](<asset:a1>)')).toBe(
      'A quotation\n\n![A map](asset:a1)',
    );
    expect(roundTrip('&gt; Not a quote\n\n![A map](<asset:a1>)')).toBe(
      '&gt; Not a quote\n\n![A map](asset:a1)',
    );
  });
});
