import { describe, expect, it } from 'vitest';

import { parseAcceptLanguage } from './parseAcceptLanguage.ts';

describe('parseAcceptLanguage', () => {
  it('orders quality values, including the implicit quality of one', () => {
    expect(parseAcceptLanguage('en;q=0.3, es-MX, en-GB;q=0.8')).toEqual([
      'es-MX',
      'en-GB',
      'en',
    ]);
  });

  it('keeps header order for equal qualities', () => {
    expect(parseAcceptLanguage('es;q=0.9, en-GB;q=0.9, en;q=0.9')).toEqual([
      'es',
      'en-GB',
      'en',
    ]);
  });

  it('canonicalizes aliases and de-duplicates after quality ordering', () => {
    expect(
      parseAcceptLanguage('EN-gb;q=0.4, es;q=0.8, en-GB, iw;q=0.5, he;q=0.3'),
    ).toEqual(['en-GB', 'es', 'he']);
  });

  it.each([null, '', ' \t ', '*', '*;q=0.5', 'en;q=0, es;q=0.000'])(
    'returns no specific preference for %s',
    (header) => {
      expect(parseAcceptLanguage(header)).toEqual([]);
    },
  );

  it.each([
    'en_US',
    'es--MX',
    'constructor',
    'en;q=2',
    'en;q=-1',
    'en;q=NaN',
    'en;q=.5',
    'en;q=0.1234',
    'en;q=1.001',
    'en;q=',
    'en;q=0.5;q=0.9',
    'en;unknown=1',
    'en;q=0.5;unknown=1',
    'en\n',
  ])(
    'ignores a malformed entry without dropping valid neighbors: %s',
    (invalid) => {
      expect(parseAcceptLanguage(`${invalid},es-MX;q=0.8,en-GB;q=0.7`)).toEqual(
        ['es-MX', 'en-GB'],
      );
    },
  );

  it('accepts HTTP whitespace, case-insensitive quality, and valid decimal boundaries', () => {
    expect(
      parseAcceptLanguage(
        ' ES-mx \t; Q = 1.000 , en-GB;q=0.001, fr;q=1., de;q=0.',
      ),
    ).toEqual(['es-MX', 'fr', 'en-GB']);
  });

  it('does not carry preferences from one request into another', () => {
    expect(parseAcceptLanguage('es')).toEqual(['es']);
    expect(parseAcceptLanguage('en-GB')).toEqual(['en-GB']);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});
