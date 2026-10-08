import { describe, expect, it } from 'vitest';

import { getMapLanguage, getSearchLanguage } from '../mapboxLanguage';

describe('getMapLanguage', () => {
  it.each([
    ['en', 'en'],
    ['hu', 'hu'],
    ['ja', 'ja'],
    ['ko', 'ko'],
    ['ar', 'ar'],
  ])('passes the supported language %s through', (locale, expected) => {
    expect(getMapLanguage(locale)).toBe(expected);
  });

  it.each([
    ['zh-Hans', 'zh-Hans'],
    ['zh-Hant', 'zh-Hant'],
    ['zh', 'zh-Hans'],
    ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-MO', 'zh-Hant'],
    ['zh-Hant-TW', 'zh-Hant'],
    ['zh-Hans-CN', 'zh-Hans'],
  ])('maps the Chinese tag %s by script to %s', (locale, expected) => {
    expect(getMapLanguage(locale)).toBe(expected);
  });

  it.each([
    ['pt-BR', 'pt'],
    ['pt-PT', 'pt'],
    ['es-MX', 'es'],
    ['en-GB', 'en'],
    ['fr-CA', 'fr'],
  ])('cuts the regional tag %s to %s', (locale, expected) => {
    expect(getMapLanguage(locale)).toBe(expected);
  });

  it.each([
    // Not on Mapbox's list of map languages.
    'sw',
    'is',
    'fil',
    // Chinese is only supported as a script pair, never as bare Cantonese etc.
    'yue',
    // Not a language at all.
    'und',
    'not a tag',
    '',
  ])('has no map language for %s, so labels show local names', (locale) => {
    expect(getMapLanguage(locale)).toBeUndefined();
  });
});

describe('getSearchLanguage', () => {
  it('uses the protocol language when Search Box lists it', () => {
    expect(getSearchLanguage('hu', 'en')).toBe('hu');
    expect(getSearchLanguage('pt-BR', 'en')).toBe('pt');
    expect(getSearchLanguage('es-MX', 'de')).toBe('es');
  });

  it('does not keep a Chinese script, which Search Box does not list', () => {
    expect(getSearchLanguage('zh-Hans', 'en')).toBe('en');
    expect(getSearchLanguage('zh-TW', 'fr')).toBe('fr');
  });

  it.each(['ko', 'ar', 'he', 'th', 'vi'])(
    'does not use %s, which the map lists but Search Box does not',
    (protocolLocale) => {
      expect(getSearchLanguage(protocolLocale, 'it')).toBe('it');
    },
  );

  it('falls back to the interface language when the protocol language is unsupported', () => {
    expect(getSearchLanguage('sw', 'de')).toBe('de');
    expect(getSearchLanguage('und', 'nl')).toBe('nl');
    expect(getSearchLanguage('ko', 'pt-BR')).toBe('pt');
  });

  it('falls back to English when neither language is supported', () => {
    expect(getSearchLanguage('sw', 'zh-Hans')).toBe('en');
    expect(getSearchLanguage('ko', 'zh-Hant')).toBe('en');
    expect(getSearchLanguage('und', 'not a tag')).toBe('en');
  });

  it('prefers a supported protocol language over a supported interface language', () => {
    expect(getSearchLanguage('hu', 'de')).toBe('hu');
  });
});
