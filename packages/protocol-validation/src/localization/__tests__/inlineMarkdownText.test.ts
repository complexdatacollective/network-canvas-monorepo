import { describe, expect, it } from 'vitest';

import { inlineMarkdownText } from '../inlineMarkdownText.ts';

describe('inlineMarkdownText', () => {
  it('shows the words of the markdown without its markup', () => {
    expect(inlineMarkdownText(['**her** *own* `code` \\*star\\*'])).toEqual([
      'her own code *star*',
    ]);
  });

  it('keeps each value in its place, read with the markdown around it', () => {
    const name = { name: 'ego_name' };
    const count = { name: 'count' };
    expect(
      inlineMarkdownText(['**', name, '** has ', count, ' *children*']),
    ).toEqual([name, ' has ', count, ' children']);
  });

  it('shows raw HTML as typed, as the interview does', () => {
    expect(inlineMarkdownText(['a <b>bold</b> word'])).toEqual([
      'a <b>bold</b> word',
    ]);
  });
});
