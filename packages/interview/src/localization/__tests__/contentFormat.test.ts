import { describe, expect, it } from 'vitest';

import { createContentFormat, resolveContentLocale } from '../contentFormat';

describe('resolveContentLocale', () => {
  it('uses the protocol language when it names one', () => {
    expect(resolveContentLocale('hu', 'en')).toBe('hu');
  });

  it('uses the interface language when the protocol language is unspecified', () => {
    expect(resolveContentLocale('und', 'de')).toBe('de');
  });

  it('uses the interface language when there is no protocol language', () => {
    expect(resolveContentLocale(undefined, 'de')).toBe('de');
  });
});

describe('createContentFormat', () => {
  it('groups digits and marks decimals the way the locale does', () => {
    expect(createContentFormat('en').formatNumber(1234.5)).toBe('1,234.5');
    expect(createContentFormat('de').formatNumber(1234.5)).toBe('1.234,5');
  });

  it('keeps the precision a number was stored with', () => {
    expect(createContentFormat('en').formatNumber(3.14159265)).toBe(
      '3.14159265',
    );
  });

  it('shows a coordinate with at most four fraction digits', () => {
    const format = createContentFormat('de');
    expect(format.formatCoordinate(41.30834567)).toBe('41,3083');
    expect(format.formatCoordinate(41.3)).toBe('41,3');
  });

  it('joins a list with the locale’s pattern', () => {
    const items = ['a', 'b', 'c'];
    expect(createContentFormat('en').formatList(items)).toBe('a, b, and c');
    expect(createContentFormat('de').formatList(items)).toBe('a, b und c');
  });

  it('alphabetises with the locale’s rules', () => {
    const sorted = (locale: string) =>
      ['z', 'ö', 'a'].toSorted(createContentFormat(locale).collator.compare);
    expect(sorted('sv')).toEqual(['a', 'z', 'ö']);
    expect(sorted('de')).toEqual(['a', 'ö', 'z']);
  });
});
