import { describe, expect, it } from 'vitest';

import { resolveLocalizedString } from '../resolveLocalizedString.ts';

const trilingual = { defaultLocale: 'en', locales: ['en', 'es', 'fr'] };

describe('resolveLocalizedString', () => {
  describe('the selected language', () => {
    it('returns its own translation without fallback', () => {
      expect(
        resolveLocalizedString({ en: 'Hello', es: 'Hola' }, trilingual, ['es']),
      ).toEqual({
        text: 'Hola',
        locale: 'es',
        selectedLocale: 'es',
        usedFallback: false,
        matchedBy: 'selected',
      });
    });

    it('is not a fallback when it is the default', () => {
      expect(
        resolveLocalizedString({ en: 'Hello', es: 'Hola' }, trilingual, [
          'en',
          'es',
        ]),
      ).toEqual({
        text: 'Hello',
        locale: 'en',
        selectedLocale: 'en',
        usedFallback: false,
        matchedBy: 'selected',
      });
    });

    it('beats every other requested language', () => {
      expect(
        resolveLocalizedString(
          { en: 'Hello', es: 'Hola', fr: 'Bonjour' },
          trilingual,
          ['fr', 'es', 'en'],
        ),
      ).toMatchObject({ locale: 'fr', matchedBy: 'selected' });
    });

    it.each([
      ['pt-PT', 'pt-BR', { defaultLocale: 'en', locales: ['en', 'pt-BR'] }],
      ['es-MX', 'es', { defaultLocale: 'en', locales: ['en', 'es', 'es-MX'] }],
    ])(
      'falls back from %s to its closest related language, %s',
      (selected, related, localization) => {
        expect(
          resolveLocalizedString(
            { en: 'Hello', [related]: 'Olá / Hola' },
            localization,
            [selected, 'en'],
          ),
        ).toEqual({
          text: 'Olá / Hola',
          locale: related,
          selectedLocale: selected,
          usedFallback: true,
          matchedBy: 'selected',
        });
      },
    );

    it('matches Chinese by script', () => {
      const chinese = {
        defaultLocale: 'en',
        locales: ['en', 'zh-Hans', 'zh-Hant'],
      };
      const value = { 'en': 'Hello', 'zh-Hans': '你好', 'zh-Hant': '妳好' };
      expect(resolveLocalizedString(value, chinese, ['zh-TW'])).toMatchObject({
        text: '妳好',
        locale: 'zh-Hant',
        usedFallback: true,
        matchedBy: 'selected',
      });
      expect(
        resolveLocalizedString(value, chinese, ['zh-Hant-TW']),
      ).toMatchObject({ text: '妳好', locale: 'zh-Hant' });
    });

    it('canonicalizes a well-formed tag before matching', () => {
      expect(
        resolveLocalizedString({ en: 'Hello', es: 'Hola' }, trilingual, ['ES']),
      ).toEqual({
        text: 'Hola',
        locale: 'es',
        selectedLocale: 'es',
        usedFallback: false,
        matchedBy: 'selected',
      });
    });
  });

  describe("the participant's other languages", () => {
    it('are tried, in order, before the default', () => {
      expect(
        resolveLocalizedString(
          { en: 'Hello', es: 'Hola', fr: 'Bonjour' },
          { defaultLocale: 'en', locales: ['en', 'es', 'fr', 'de'] },
          ['de', 'fr', 'es'],
        ),
      ).toEqual({
        text: 'Bonjour',
        locale: 'fr',
        selectedLocale: 'de',
        usedFallback: true,
        matchedBy: 'requested',
      });
    });

    it("reach a later language's closest related language", () => {
      expect(
        resolveLocalizedString(
          { 'en': 'Hello', 'pt-BR': 'Olá' },
          { defaultLocale: 'en', locales: ['en', 'fr', 'pt-BR'] },
          ['fr', 'pt-PT', 'en'],
        ),
      ).toMatchObject({ text: 'Olá', locale: 'pt-BR', matchedBy: 'requested' });
    });

    // Best fit over the whole list would let the later exact 'en' beat the
    // earlier related 'es'.
    it('are matched one at a time, so an earlier relative beats a later exact match', () => {
      expect(
        resolveLocalizedString(
          { en: 'Hello', es: 'Hola' },
          { defaultLocale: 'en', locales: ['en', 'es', 'fr'] },
          ['fr', 'es-MX', 'en'],
        ),
      ).toMatchObject({ locale: 'es', matchedBy: 'requested' });
      expect(
        resolveLocalizedString(
          { 'en': 'Hello', 'pt-BR': 'Olá', 'fr': 'Bonjour' },
          { defaultLocale: 'en', locales: ['en', 'pt-BR', 'fr', 'de'] },
          ['de', 'pt-PT', 'fr'],
        ),
      ).toMatchObject({ locale: 'pt-BR', matchedBy: 'requested' });
    });

    it('skip malformed and unmatched preferences', () => {
      expect(
        resolveLocalizedString(
          { en: 'Hello', es: 'Hola' },
          { defaultLocale: 'en', locales: ['en', 'es', 'fr'] },
          ['fr', 'EN_us', '*', 'ja', 'es'],
        ),
      ).toMatchObject({ locale: 'es', matchedBy: 'requested' });
    });
  });

  describe('the default language', () => {
    it('is the fallback when no requested language has the text', () => {
      expect(
        resolveLocalizedString({ en: 'Hello', es: 'Hola' }, trilingual, [
          'fr',
          'de',
        ]),
      ).toEqual({
        text: 'Hello',
        locale: 'en',
        selectedLocale: 'fr',
        usedFallback: true,
        matchedBy: 'default',
      });
    });

    it('reaches its closest related language', () => {
      expect(
        resolveLocalizedString(
          { 'en-GB': 'Colour', 'fr': 'Couleur' },
          { defaultLocale: 'en', locales: ['en', 'en-GB', 'fr', 'de'] },
          ['de'],
        ),
      ).toMatchObject({
        text: 'Colour',
        locale: 'en-GB',
        matchedBy: 'default',
      });
    });

    it('is the fallback for a malformed selected language', () => {
      expect(
        resolveLocalizedString({ en: 'Hello', es: 'Hola' }, trilingual, [
          'EN_us',
        ]),
      ).toEqual({
        text: 'Hello',
        locale: 'en',
        selectedLocale: 'EN_us',
        usedFallback: true,
        matchedBy: 'default',
      });
    });
  });

  describe('any language', () => {
    it('is the first by tag when neither a requested language nor the default has the text', () => {
      expect(
        resolveLocalizedString(
          { fr: 'Bonjour', es: 'Hola' },
          { defaultLocale: 'en', locales: ['en', 'fr', 'es', 'de'] },
          ['de'],
        ),
      ).toEqual({
        text: 'Hola',
        locale: 'es',
        selectedLocale: 'de',
        usedFallback: true,
        matchedBy: 'any',
      });
    });

    it('ignores keys the protocol does not declare', () => {
      expect(
        resolveLocalizedString({ de: 'Hallo', fr: 'Bonjour' }, trilingual, [
          'de',
        ]),
      ).toMatchObject({ text: 'Bonjour', locale: 'fr', matchedBy: 'any' });
    });
  });

  describe('declaration order', () => {
    const value = { 'en': 'Hello', 'fr-BE': 'Salut', 'fr-CH': 'Grüezi' };
    const declarations = [
      { locales: ['en', 'fr-BE', 'fr-CH', 'de'] },
      { locales: ['de', 'fr-CH', 'fr-BE', 'en'] },
    ];

    it.each(declarations)(
      'plays no part in choosing between equally related languages ($locales)',
      ({ locales }) => {
        expect(
          resolveLocalizedString(value, { defaultLocale: 'en', locales }, [
            'fr-CA',
          ]),
        ).toMatchObject({ locale: 'fr-BE', matchedBy: 'selected' });
      },
    );

    it.each(declarations)(
      'plays no part in the fallback to any language ($locales)',
      ({ locales }) => {
        expect(
          resolveLocalizedString(
            { 'fr-CH': 'Grüezi', 'fr-BE': 'Salut' },
            { defaultLocale: 'en', locales },
            ['de'],
          ),
        ).toMatchObject({ locale: 'fr-BE', matchedBy: 'any' });
      },
    );
  });

  it('resolves the only translation of a one-locale protocol', () => {
    expect(
      resolveLocalizedString(
        { fr: 'Bonjour' },
        { defaultLocale: 'fr', locales: ['fr'] },
        ['fr', 'en'],
      ),
    ).toEqual({
      text: 'Bonjour',
      locale: 'fr',
      selectedLocale: 'fr',
      usedFallback: false,
      matchedBy: 'selected',
    });
  });

  it('resolves text in an und-only protocol', () => {
    expect(
      resolveLocalizedString(
        { und: 'Name' },
        { defaultLocale: 'und', locales: ['und'] },
        ['und', 'en-US'],
      ),
    ).toMatchObject({
      text: 'Name',
      locale: 'und',
      usedFallback: false,
      matchedBy: 'selected',
    });
  });

  it('falls back to und text that has not been translated yet', () => {
    expect(
      resolveLocalizedString(
        { und: 'Name' },
        { defaultLocale: 'und', locales: ['und', 'fr'] },
        ['fr'],
      ),
    ).toEqual({
      text: 'Name',
      locale: 'und',
      selectedLocale: 'fr',
      usedFallback: true,
      matchedBy: 'default',
    });
  });

  it.each([[{}], [{ de: 'Hallo' }]])(
    'throws when %j has no translation for a declared locale',
    (value) => {
      expect(() => resolveLocalizedString(value, trilingual, ['en'])).toThrow(
        /no translation for any declared locale \(en, es, fr\)/,
      );
    },
  );
});
