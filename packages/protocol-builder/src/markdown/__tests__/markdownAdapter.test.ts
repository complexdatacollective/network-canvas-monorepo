import { describe, expect, it } from 'vitest';

import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';

import type { RichTextContent } from '../markdownAdapter.ts';
import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
} from '../markdownAdapter.ts';

const roundTrip = (value: string, inline = false) =>
  richTextContentToMarkdown(markdownToRichTextContent(value, inline), inline);

describe('RichText markdown adapter', () => {
  it('round-trips the full Architect toolbar markdown subset', () => {
    const markdown = [
      '# Heading 1',
      '',
      '_Italic_ and **bold** with [a link](https://example.com).',
      '',
      '1. Ordered item',
      '2. Second ordered item',
      '',
      '- Bullet item',
      '- Second bullet item',
      '',
      '---',
      '',
      'Final paragraph.',
    ].join('\n');

    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('serializes empty content to an empty string', () => {
    expect(roundTrip('')).toBe('');
    expect(roundTrip('   \n\t')).toBe('');
  });

  it('keeps inline labels as inline markdown', () => {
    expect(roundTrip('A **bold** label', true)).toBe('A **bold** label');
  });

  /**
   * An empty block is not a block the next one has to be separated from.
   *
   * An editor leaves one behind whenever a selection is cleared and the caret
   * lands in a sibling paragraph rather than the emptied one — and the leading
   * space it used to serialise as was saved into the researcher's own question.
   */
  it('does not open with a space when the first block is empty', () => {
    const content: RichTextContent = {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Who else?' }] },
      ],
    };

    expect(richTextContentToMarkdown(content, true)).toBe('Who else?');
  });

  /** And an empty block BETWEEN two others separates them once, not twice. */
  it('separates the blocks that said something, not the gaps between them', () => {
    const content: RichTextContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    };

    expect(richTextContentToMarkdown(content, true)).toBe('First Second');
  });

  it('keeps all top-level blocks when serializing inline content', () => {
    const content: RichTextContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Second',
              marks: [{ type: 'bold' }],
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Third' }],
        },
      ],
    };

    expect(richTextContentToMarkdown(content, true)).toBe(
      'First **Second** Third',
    );
  });

  it('does not emit link marks for inline content', () => {
    const content = markdownToRichTextContent(
      '[Help](https://example.com) label',
      true,
    );

    expect(content.content?.[0]?.content?.[0]?.marks).toBeUndefined();
    expect(richTextContentToMarkdown(content, true)).toBe('Help label');
  });

  it('does not parse existing angle brackets as block quotes', () => {
    expect(roundTrip('A > B')).toBe('A > B');
  });

  /**
   * Text the researcher typed is text, whatever characters it contains.
   *
   * The renderer every interview runs passes raw HTML through and then
   * sanitises it, so an unescaped `<IRB OR ETHICS BOARD HERE>` reached the
   * participant as an unknown element and was dropped outright: the consent
   * form read "received ethics clearance through, today." Each case is read
   * back by that renderer, so the assertion is about what the participant is
   * shown rather than about one spelling of the escape.
   */
  describe('characters the renderer would read as markup', () => {
    const paragraph = (text: string): RichTextContent => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });

    const shownToParticipant = (text: string) =>
      getMarkdownLabelText(richTextContentToMarkdown(paragraph(text)));

    it.each([
      'Ethics clearance through, <IRB OR ETHICS BOARD HERE> today.',
      '<b>not bold</b>',
      '<https://example.com>',
      '<!-- a comment -->',
      'Line one <br> line two',
      '> 5 years',
      'Fish &amp; chips, &lt;tags&gt;, &#60; and &copy;',
      'Fish & chips',
    ])('shows the participant %s exactly as typed', (text) => {
      expect(shownToParticipant(text)).toBe(text);
    });

    it('stores a bracketed placeholder in the same form as the sample protocol', () => {
      expect(
        richTextContentToMarkdown(
          paragraph('ethics clearance through, <IRB OR ETHICS BOARD HERE>'),
        ),
      ).toBe('ethics clearance through, &lt;IRB OR ETHICS BOARD HERE&gt;');
    });

    /**
     * Escaped only where markdown would read them, as the dash is: the stored
     * source is what the read-only lists show the researcher.
     */
    it('leaves comparisons and ampersands that markdown reads as text alone', () => {
      expect(richTextContentToMarkdown(paragraph('A > B'))).toBe('A > B');
      expect(richTextContentToMarkdown(paragraph('Over 18 & under 65'))).toBe(
        'Over 18 & under 65',
      );
      expect(richTextContentToMarkdown(paragraph('> 5 years'))).toBe(
        '&gt; 5 years',
      );
    });

    it.each([
      // The Consent Form stage of packages/protocols/sample/protocol.json.
      'received ethics clearance through, &lt;IRB OR ETHICS BOARD HERE&gt;',
      'Fish &amp;amp; chips',
      '&gt; 5 years',
    ])('re-saves stored escaped text %s unchanged', (stored) => {
      expect(roundTrip(stored)).toBe(stored);
      expect(roundTrip(stored, true)).toBe(stored);
    });

    /**
     * A protocol saved before this was fixed holds the bracket raw. The editor
     * already showed it as text, so saving it again writes what was shown.
     */
    it('repairs a placeholder an earlier save stored raw', () => {
      expect(roundTrip('through, <IRB OR ETHICS BOARD HERE> today.')).toBe(
        'through, &lt;IRB OR ETHICS BOARD HERE&gt; today.',
      );
    });
  });

  it('escapes markdown metacharacters and leading ordered markers', () => {
    const content: RichTextContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '1. # Heading *bold* _em_ - dash `code` [link] \\ slash',
            },
          ],
        },
      ],
    };

    expect(richTextContentToMarkdown(content)).toBe(
      '1\\. \\# Heading \\*bold\\* \\_em\\_ - dash \\`code\\` \\[link\\] \\\\ slash',
    );
  });

  /**
   * A hyphen is a hyphen, except where a line begins with one.
   *
   * CommonMark reads a run of dashes at the start of a line as a bullet, a
   * thematic break or a heading underline, and nowhere else — so escaping
   * every one of them stored `18\\-24` for an age band and `Part\\-time` for a
   * category, which the read-only lists that show the stored source then
   * showed to the researcher exactly like that.
   */
  it('escapes a dash only where a line starts with one', () => {
    const paragraph = (text: string): RichTextContent => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });

    expect(richTextContentToMarkdown(paragraph('18-24'))).toBe('18-24');
    expect(richTextContentToMarkdown(paragraph('Part-time'))).toBe('Part-time');
    // And still escaped where markdown would read it: a bullet, and the run
    // that is a thematic break or a heading underline on its own.
    expect(richTextContentToMarkdown(paragraph('- dash'))).toBe('\\- dash');
    expect(richTextContentToMarkdown(paragraph('---'))).toBe('\\-\\-\\-');
  });

  it('keeps a link spanning mixed formatting as a single link', () => {
    const markdown =
      '[Ryan L, Mulholland J (2014). Talking Ties. _Sociological Research Online_ 19(2).](https://doi.org/10.5153/sro.3404)';

    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('keeps adjacent links to different destinations separate', () => {
    const markdown =
      '[One](https://example.com/one)[Two](https://example.com/two)';

    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('escapes link destinations and titles', () => {
    const content: RichTextContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Example',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://example.com/a path/(x)>',
                    title: 'A "quoted" title',
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(richTextContentToMarkdown(content)).toBe(
      '[Example](https://example.com/a%20path/%28x%29%3E "A \\"quoted\\" title")',
    );
  });

  it('drops unsafe markdown link schemes while keeping safe and relative URLs', () => {
    expect(
      roundTrip(
        [
          '[Unsafe](javascript:alert%281%29)',
          '[Data](data:text/html,Hello)',
          '[HTTP](https://example.com/a%20path)',
          '[Mail](mailto:team@example.com)',
          '[Protocol](//example.com/x)',
          '[Relative](/docs/a%20path)',
        ].join(' '),
      ),
    ).toBe(
      'Unsafe Data [HTTP](https://example.com/a%20path) [Mail](mailto:team@example.com) [Protocol](//example.com/x) [Relative](/docs/a%20path)',
    );
  });

  it('drops markdown links with embedded control characters', () => {
    const content: RichTextContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Unsafe',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'java\tscript:alert(1)',
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(richTextContentToMarkdown(content)).toBe('Unsafe');
  });

  it('drops markdown links with unsafe scheme whitespace', () => {
    const content: RichTextContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Unsafe',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'java script:alert(1)',
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(richTextContentToMarkdown(content)).toBe('Unsafe');
  });

  it('does not serialize link marks in inline mode', () => {
    const content: RichTextContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Help',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://example.com',
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(richTextContentToMarkdown(content, true)).toBe('Help');
  });
});
