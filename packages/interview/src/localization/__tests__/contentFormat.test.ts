import { describe, expect, it } from 'vitest';

import { contentFormatFor, resolveContentLocale } from '../contentFormat';

describe('resolveContentLocale', () => {
  it('uses the protocol language when it names one', () => {
    expect(resolveContentLocale('hu', 'en')).toBe('hu');
  });

  it('uses the interface language when there is no protocol language (outside the protocol provider)', () => {
    expect(resolveContentLocale(undefined, 'de')).toBe('de');
  });
});

describe('contentFormatFor', () => {
  it('groups digits and marks decimals the way the locale does', () => {
    expect(contentFormatFor('en').formatNumber(1234.5)).toBe('1,234.5');
    expect(contentFormatFor('de').formatNumber(1234.5)).toBe('1.234,5');
  });

  it('keeps the precision a number was stored with', () => {
    expect(contentFormatFor('en').formatNumber(3.14159265)).toBe('3.14159265');
  });

  it('never shows a small nonzero number as zero', () => {
    expect(contentFormatFor('en').formatNumber(0.0000005)).toBe('5E-7');
    expect(contentFormatFor('en').formatNumber(1e-21)).toBe('1E-21');
    expect(contentFormatFor('de').formatNumber(-1.5e-21)).toBe('-1,5E-21');
    expect(contentFormatFor('en').formatNumber(0.000001)).toBe('0.000001');
  });

  it('shows the digits that were stored, not the binary expansion', () => {
    expect(contentFormatFor('en').formatNumber(0.1)).toBe('0.1');
    expect(contentFormatFor('en').formatNumber(0.1 + 0.2)).toBe(
      '0.30000000000000004',
    );
  });

  it('switches to scientific notation for very large numbers', () => {
    expect(contentFormatFor('en').formatNumber(1e21)).toBe('1E21');
    expect(contentFormatFor('en').formatNumber(1e20)).toBe(
      '100,000,000,000,000,000,000',
    );
  });

  it('builds one set of formatters per locale and shares it', () => {
    expect(contentFormatFor('fr')).toBe(contentFormatFor('fr'));
    expect(contentFormatFor('fr')).not.toBe(contentFormatFor('de'));
  });

  it('signs a count added to something shown', () => {
    expect(contentFormatFor('en').formatSigned(3)).toBe('+3');
    expect(contentFormatFor('ar-EG').formatSigned(3)).toMatch(/\+٣$/);
  });

  it('shows a fraction as a whole percentage', () => {
    expect(contentFormatFor('en').formatPercent(0.404)).toBe('40%');
    expect(contentFormatFor('ar-EG').formatPercent(0.4)).toContain('٤٠');
  });

  it('shows a coordinate with at most four fraction digits', () => {
    const format = contentFormatFor('de');
    expect(format.formatCoordinate(41.30834567)).toBe('41,3083');
    expect(format.formatCoordinate(41.3)).toBe('41,3');
  });

  it('joins a list with the locale’s pattern', () => {
    const items = ['a', 'b', 'c'];
    expect(contentFormatFor('en').formatList(items)).toBe('a, b, and c');
    expect(contentFormatFor('de').formatList(items)).toBe('a, b und c');
  });

  it('alphabetises with the locale’s rules', () => {
    const sorted = (locale: string) =>
      ['z', 'ö', 'a'].toSorted(contentFormatFor(locale).collator.compare);
    expect(sorted('sv')).toEqual(['a', 'z', 'ö']);
    expect(sorted('de')).toEqual(['a', 'ö', 'z']);
  });
});
