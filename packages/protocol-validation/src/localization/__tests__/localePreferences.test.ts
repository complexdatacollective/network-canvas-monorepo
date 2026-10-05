import { describe, expect, it } from 'vitest';

import {
  normalizeLocalePreferences,
  parseAcceptLanguage,
  selectProtocolLocale,
} from '../localePreferences.ts';

describe('normalizeLocalePreferences', () => {
  it('canonicalizes each preference and preserves priority', () => {
    expect(normalizeLocalePreferences(['zh-hant-tw', 'en-us', 'es'])).toEqual([
      'zh-Hant-TW',
      'en-US',
      'es',
    ]);
  });

  it('drops malformed entries and the wildcard', () => {
    expect(
      normalizeLocalePreferences(['EN_us', '*', 'es', '', 'x-private', 'fr']),
    ).toEqual(['es', 'fr']);
  });

  it('keeps the first occurrence of tags that are equal once canonical', () => {
    expect(
      normalizeLocalePreferences(['es', 'en-US', 'en-us', 'iw', 'he', 'es']),
    ).toEqual(['es', 'en-US', 'he']);
  });

  it('returns no preference for an empty list', () => {
    expect(normalizeLocalePreferences([])).toEqual([]);
  });
});

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

describe('selectProtocolLocale', () => {
  const bilingual = { defaultLocale: 'en', locales: ['en', 'es'] };
  const spanishDefault = { defaultLocale: 'es', locales: ['es', 'en'] };

  it('selects an exactly declared locale', () => {
    expect(selectProtocolLocale(['es'], bilingual)).toBe('es');
  });

  it('selects the first preference that has a declared match', () => {
    expect(selectProtocolLocale(['fr', 'es', 'en'], bilingual)).toBe('es');
  });

  it('best-fits a browser or header regional preference to a declared language', () => {
    expect(selectProtocolLocale(parseAcceptLanguage('es-MX'), bilingual)).toBe(
      'es',
    );
    expect(selectProtocolLocale(['es-MX', 'es', 'en'], bilingual)).toBe('es');
  });

  it('best-fits an explicit regional value passed alone to a declared language', () => {
    expect(selectProtocolLocale(['es-MX'], bilingual)).toBe('es');
  });

  it('canonicalizes requested locales before matching', () => {
    expect(selectProtocolLocale(['ES-mx'], bilingual)).toBe('es');
  });

  it.each([
    ['malformed', 'EN_us'],
    ['unmatched', 'fr'],
  ])(
    'selects the protocol default for a %s explicit value, not a browser preference',
    (_kind, explicit) => {
      const browserLanguages = ['en-GB', 'en'];
      expect(selectProtocolLocale(browserLanguages, spanishDefault)).toBe('en');
      expect(selectProtocolLocale([explicit], spanishDefault)).toBe('es');
    },
  );

  it('selects the protocol default when no requested locale matches', () => {
    expect(selectProtocolLocale(['fr', 'de'], spanishDefault)).toBe('es');
  });

  it.each([[[]], [['*', 'EN_us', '']]])(
    'selects the protocol default when the request list %j is empty after normalization',
    (requested) => {
      expect(selectProtocolLocale(requested, spanishDefault)).toBe('es');
    },
  );

  it('always selects the only locale of a one-locale protocol', () => {
    const french = { defaultLocale: 'fr', locales: ['fr'] };
    expect(selectProtocolLocale(['fr-CA'], french)).toBe('fr');
    expect(selectProtocolLocale(['en-US', 'es'], french)).toBe('fr');
    expect(selectProtocolLocale([], french)).toBe('fr');
  });

  it('selects und for a protocol whose only locale is und', () => {
    const unidentified = { defaultLocale: 'und', locales: ['und'] };
    expect(selectProtocolLocale(['en-US', 'es'], unidentified)).toBe('und');
    expect(selectProtocolLocale([], unidentified)).toBe('und');
  });

  it('fails closed to the default when the matcher answers with an undeclared tag', () => {
    expect(
      selectProtocolLocale(['he'], {
        defaultLocale: 'en',
        locales: ['en', 'iw'],
      }),
    ).toBe('en');
  });
});
