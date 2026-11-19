import { describe, expect, it } from 'vitest';

import {
  declaredTranslationText,
  type ProtocolLocalization,
  resolveDeclaredTranslation,
  resolveTranslation,
  translationText,
  withTranslation,
} from '../localizedText.ts';

const ENGLISH_AND_FRENCH: ProtocolLocalization = {
  defaultLocale: 'en',
  locales: ['en', 'fr'],
};

describe('translationText', () => {
  it('reads the text of exactly the language asked for, without fallback', () => {
    expect(translationText({ en: 'Yes', fr: 'Oui' }, 'fr')).toBe('Oui');
    expect(translationText({ en: 'Yes' }, 'fr')).toBe('');
    expect(translationText(undefined, 'en')).toBe('');
  });
});

describe('withTranslation', () => {
  it('stores the text for the language, keeping the others', () => {
    expect(withTranslation({ en: 'Yes' }, 'fr', 'Oui')).toEqual({
      en: 'Yes',
      fr: 'Oui',
    });
  });

  it('removes the translation when the text is cleared', () => {
    expect(withTranslation({ en: 'Yes', fr: 'Oui' }, 'fr', '')).toEqual({
      en: 'Yes',
    });
  });

  it('removes the translation when only whitespace is left', () => {
    // Kept, the language would read as translated and a participant reading
    // it would see blank text instead of the fallback.
    expect(withTranslation({ en: 'Yes', fr: 'Oui' }, 'fr', '  \t ')).toEqual({
      en: 'Yes',
    });
  });

  // The schema refuses a translation of characters that show nothing, so
  // keeping one would leave the protocol invalid.
  it('removes the translation when only invisible characters are left', () => {
    expect(withTranslation({ en: 'Yes', fr: 'Oui' }, 'fr', '​ ')).toEqual({
      en: 'Yes',
    });
  });

  it('leaves a string with no translation at all absent', () => {
    expect(withTranslation({ en: 'Yes' }, 'en', ' ')).toBeUndefined();
  });
});

describe('resolveDeclaredTranslation', () => {
  it('resolves to the default language, with the language it found', () => {
    expect(
      resolveDeclaredTranslation({ en: 'Yes', fr: 'Oui' }, ENGLISH_AND_FRENCH),
    ).toMatchObject({ text: 'Yes', lang: 'en' });
  });

  it('falls back as the interview does from a language with no translation', () => {
    expect(
      resolveDeclaredTranslation({ en: 'Yes' }, ENGLISH_AND_FRENCH, 'fr'),
    ).toMatchObject({ text: 'Yes', lang: 'en' });
  });

  // A draft may hold a translation only in a language the protocol does not
  // declare, which validation has not yet refused.
  it('reads a string with no declared translation as absent', () => {
    expect(
      resolveDeclaredTranslation({ de: 'Ja' }, ENGLISH_AND_FRENCH),
    ).toBeUndefined();
    expect(declaredTranslationText({ de: 'Ja' }, ENGLISH_AND_FRENCH)).toBe('');
  });

  it('reads every string as absent while the languages are unknown', () => {
    expect(
      resolveDeclaredTranslation({ en: 'Yes' }, undefined),
    ).toBeUndefined();
  });
});

describe('resolveTranslation', () => {
  it('resolves a declared translation with its language and direction', () => {
    expect(
      resolveTranslation({ en: 'Yes', fr: 'Oui' }, ENGLISH_AND_FRENCH, 'fr'),
    ).toEqual({ text: 'Oui', lang: 'fr', dir: 'ltr', matchedBy: 'selected' });
  });

  // Where `resolveDeclaredTranslation` reads absent, a preview shows the first
  // translation rather than nothing.
  it('lets the first translation stand in where none is declared', () => {
    expect(resolveTranslation({ de: 'Ja' }, ENGLISH_AND_FRENCH, 'en')).toEqual({
      text: 'Ja',
    });
    expect(resolveTranslation({ de: 'Ja' }, undefined, undefined)).toEqual({
      text: 'Ja',
    });
  });

  it('is empty for a string with no translation', () => {
    expect(resolveTranslation({}, ENGLISH_AND_FRENCH, 'en')).toEqual({
      text: '',
    });
  });
});
