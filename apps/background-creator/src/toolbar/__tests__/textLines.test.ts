import { describe, expect, it } from 'vitest';

import { linesToText, textToLines } from '../textLines';

describe('text line conversion', () => {
  it('joins lines with newlines', () => {
    expect(linesToText(['Upper', 'left'])).toBe('Upper\nleft');
  });

  it('splits text back into lines', () => {
    expect(textToLines('Upper\nleft')).toEqual(['Upper', 'left']);
  });

  it('round-trips a multi-line value', () => {
    const lines = ['High income', 'Low education'];
    expect(textToLines(linesToText(lines))).toEqual(lines);
  });

  it('always yields at least one line, even for empty text', () => {
    expect(textToLines('')).toEqual(['']);
  });

  it('preserves interior blank lines', () => {
    expect(textToLines('a\n\nb')).toEqual(['a', '', 'b']);
  });
});
