import { describe, expect, it } from 'vitest';

import type { RichTextContent } from './markdownAdapter';
import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
} from './markdownAdapter';

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

  it('does not parse existing angle brackets as block quotes', () => {
    expect(roundTrip('A > B')).toBe('A > B');
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
      '1\\. \\# Heading \\*bold\\* \\_em\\_ \\- dash \\`code\\` \\[link\\] \\\\ slash',
    );
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
          '[Relative](/docs/a%20path)',
        ].join(' '),
      ),
    ).toBe(
      'Unsafe Data [HTTP](https://example.com/a%20path) [Mail](mailto:team@example.com) [Relative](/docs/a%20path)',
    );
  });
});
