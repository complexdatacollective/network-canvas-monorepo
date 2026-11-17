import { describe, expect, it } from 'vitest';

import {
  asOneLine,
  holdsLineBreak,
  lineBreaksAsSpaces,
  linesOf,
} from '../line-breaks.ts';

const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x2029);

describe('holdsLineBreak', () => {
  it.each([
    ['a line feed', '\n'],
    ['a carriage return', '\r'],
    ['a line separator', LINE_SEPARATOR],
    ['a paragraph separator', PARAGRAPH_SEPARATOR],
  ])('finds %s', (_name, lineBreak) => {
    expect(holdsLineBreak(`First${lineBreak}second`)).toBe(true);
  });

  it('finds none in one line, however it is spaced', () => {
    expect(holdsLineBreak('First\t second\u00A0third')).toBe(false);
  });
});

describe('linesOf', () => {
  it('splits at each run of line breaks, whichever characters spell it', () => {
    expect(
      linesOf(`One\r\nTwo\n\nThree${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}Four`),
    ).toEqual(['One', 'Two', 'Three', 'Four']);
  });
});

describe('asOneLine', () => {
  it('replaces each run of line breaks and the whitespace around it with one space', () => {
    expect(
      asOneLine(`First \n\n  second\r\nthird${LINE_SEPARATOR}fourth`),
    ).toBe('First second third fourth');
  });

  it('trims the ends of text it joins', () => {
    expect(asOneLine('\n Welcome \n')).toBe('Welcome');
  });

  it('leaves text with no line break as it is', () => {
    expect(asOneLine('  Two  spaces ')).toBe('  Two  spaces ');
  });

  it('joins a break inside long runs of tabs and spaces', () => {
    const run = ' \t'.repeat(50_000);
    expect(asOneLine(`First${run}\n${run}second${run}`)).toBe('First second');
  });
});

describe('lineBreaksAsSpaces', () => {
  it('turns each line break into a space and leaves the rest as it was', () => {
    const typed = `Merci\r\n  beaucoup${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR} `;
    expect(lineBreaksAsSpaces(typed)).toBe('Merci    beaucoup   ');
    expect(lineBreaksAsSpaces(typed)).toHaveLength(typed.length);
  });

  it('keeps the space a trailing break leaves, so the next word stays a word', () => {
    expect(`${lineBreaksAsSpaces('Merci\n')}beaucoup`).toBe('Merci beaucoup');
  });
});
