import { describe, expect, it } from 'vitest';

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
});
