import { describe, expect, it } from 'vitest';

import { resolveLocalizedString } from '../resolveLocalizedString.ts';

const trilingual = { defaultLocale: 'en', locales: ['en', 'es', 'fr'] };

describe('resolveLocalizedString', () => {
  it('returns the selected translation without fallback', () => {
    expect(
      resolveLocalizedString({ en: 'Hello', es: 'Hola' }, trilingual, 'es'),
    ).toEqual({
      text: 'Hola',
      locale: 'es',
      selectedLocale: 'es',
      usedFallback: false,
      usedDefaultLocale: false,
    });
  });

  it('does not report fallback when the selected locale is the default', () => {
    expect(
      resolveLocalizedString({ en: 'Hello', es: 'Hola' }, trilingual, 'en'),
    ).toEqual({
      text: 'Hello',
      locale: 'en',
      selectedLocale: 'en',
      usedFallback: false,
      usedDefaultLocale: false,
    });
  });

  it('best-fits a selected regional locale to a related translation', () => {
    const localization = {
      defaultLocale: 'en',
      locales: ['en', 'es', 'es-MX'],
    };
    expect(
      resolveLocalizedString(
        { en: 'Hello', es: 'Hola' },
        localization,
        'es-MX',
      ),
    ).toEqual({
      text: 'Hola',
      locale: 'es',
      selectedLocale: 'es-MX',
      usedFallback: true,
      usedDefaultLocale: false,
    });
  });

  it('falls back to the protocol default when the selected locale is missing', () => {
    expect(
      resolveLocalizedString({ en: 'Hello', es: 'Hola' }, trilingual, 'fr'),
    ).toEqual({
      text: 'Hello',
      locale: 'en',
      selectedLocale: 'fr',
      usedFallback: true,
      usedDefaultLocale: true,
    });
  });

  it('falls back to the first declared translation when the default is missing, ignoring object key order', () => {
    expect(
      resolveLocalizedString({ fr: 'Bonjour', es: 'Hola' }, trilingual, 'en'),
    ).toEqual({
      text: 'Hola',
      locale: 'es',
      selectedLocale: 'en',
      usedFallback: true,
      usedDefaultLocale: false,
    });
  });

  it('follows a reordered declaration when the default is missing', () => {
    const reordered = { defaultLocale: 'en', locales: ['en', 'fr', 'es'] };
    expect(
      resolveLocalizedString({ es: 'Hola', fr: 'Bonjour' }, reordered, 'en'),
    ).toMatchObject({ text: 'Bonjour', locale: 'fr', usedFallback: true });
  });

  it('ignores keys the protocol does not declare', () => {
    expect(
      resolveLocalizedString({ de: 'Hallo', es: 'Hola' }, trilingual, 'de'),
    ).toMatchObject({ text: 'Hola', locale: 'es', usedFallback: true });
  });

  it('treats a malformed selected locale as unmatched instead of throwing', () => {
    expect(
      resolveLocalizedString({ en: 'Hello', es: 'Hola' }, trilingual, 'EN_us'),
    ).toEqual({
      text: 'Hello',
      locale: 'en',
      selectedLocale: 'EN_us',
      usedFallback: true,
      usedDefaultLocale: true,
    });
  });

  it('canonicalizes a well-formed selected locale before matching', () => {
    expect(
      resolveLocalizedString({ en: 'Hello', es: 'Hola' }, trilingual, 'ES'),
    ).toEqual({
      text: 'Hola',
      locale: 'es',
      selectedLocale: 'es',
      usedFallback: false,
      usedDefaultLocale: false,
    });
  });

  it('resolves the only translation of a one-locale protocol', () => {
    expect(
      resolveLocalizedString(
        { fr: 'Bonjour' },
        { defaultLocale: 'fr', locales: ['fr'] },
        'fr',
      ),
    ).toEqual({
      text: 'Bonjour',
      locale: 'fr',
      selectedLocale: 'fr',
      usedFallback: false,
      usedDefaultLocale: false,
    });
  });

  it('resolves text in an und-only protocol', () => {
    expect(
      resolveLocalizedString(
        { und: 'Name' },
        { defaultLocale: 'und', locales: ['und'] },
        'und',
      ),
    ).toMatchObject({ text: 'Name', locale: 'und', usedFallback: false });
  });

  it('falls back to und text that has not been translated yet', () => {
    expect(
      resolveLocalizedString(
        { und: 'Name' },
        { defaultLocale: 'und', locales: ['und', 'en'] },
        'en',
      ),
    ).toEqual({
      text: 'Name',
      locale: 'und',
      selectedLocale: 'en',
      usedFallback: true,
      usedDefaultLocale: true,
    });
  });

  it.each([[{}], [{ de: 'Hallo' }]])(
    'throws when %j has no translation for a declared locale',
    (value) => {
      expect(() => resolveLocalizedString(value, trilingual, 'en')).toThrow(
        /no translation for any declared locale \(en, es, fr\)/,
      );
    },
  );
});
