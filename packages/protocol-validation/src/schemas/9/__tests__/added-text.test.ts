import { describe, expect, it } from 'vitest';

import type { LocalizationDeclaration } from '../../../localization/localeTag.ts';
import { resolveAddedText } from '../added-text.ts';

// Network Canvas's wording for one text a correction added, in three of the
// languages it writes. No protocol holds this text.
const wording = {
  en: 'Saved',
  es: 'Guardado',
  fr: 'Enregistré',
};

const shown = (
  localization: LocalizationDeclaration,
  requestedLocales: readonly [string, ...string[]],
) => resolveAddedText(wording, localization, requestedLocales);

describe('the language text a correction adds is shown in', () => {
  it('is the interview’s language where Network Canvas has wording in it', () => {
    expect(
      shown({ defaultLocale: 'en', locales: ['en', 'es'] }, ['es']),
    ).toEqual({ text: 'Guardado', locale: 'es', matchedBy: 'selected' });
  });

  // American English is the English Network Canvas writes.
  it('counts a protocol language that is one Network Canvas writes under another tag', () => {
    expect(
      shown({ defaultLocale: 'en-US', locales: ['en-US'] }, ['en-US']),
    ).toEqual({ text: 'Saved', locale: 'en-US', matchedBy: 'selected' });
  });

  // Mexican Spanish is not a language Network Canvas writes, so the protocol
  // names a fallback language. With Spanish declared beside it, the closest
  // related language the protocol declares is tried first, as for the
  // protocol's own text, and the fallback language is not reached.
  it('is the closest related language the protocol declares, for a regional variant', () => {
    expect(
      shown(
        {
          defaultLocale: 'es-MX',
          locales: ['es', 'es-MX'],
          fallbackLocale: 'en',
        },
        ['es-MX'],
      ),
    ).toEqual({ text: 'Guardado', locale: 'es', matchedBy: 'selected' });
  });

  it('is the fallback language for a regional variant declared alone', () => {
    expect(
      shown(
        { defaultLocale: 'es-MX', locales: ['es-MX'], fallbackLocale: 'es' },
        ['es-MX'],
      ),
    ).toEqual({ text: 'Guardado', locale: 'es', matchedBy: 'fallback' });
  });

  // Japanese, because the participant's language must be one with no close
  // relative among the protocol's: Swahili's closest is English.
  it('is another language the participant reads, before the protocol’s default', () => {
    expect(
      shown({ defaultLocale: 'en', locales: ['en', 'fr', 'ja'] }, ['ja', 'fr']),
    ).toEqual({ text: 'Enregistré', locale: 'fr', matchedBy: 'requested' });
  });

  it('is the protocol’s default language when the participant reads no other', () => {
    expect(
      shown({ defaultLocale: 'en', locales: ['en', 'ja'] }, ['ja']),
    ).toEqual({ text: 'Saved', locale: 'en', matchedBy: 'default' });
  });

  it('is the fallback language where Network Canvas has wording in none of the protocol’s languages', () => {
    expect(
      shown(
        { defaultLocale: 'sw', locales: ['ja', 'sw'], fallbackLocale: 'fr' },
        ['sw'],
      ),
    ).toEqual({ text: 'Enregistré', locale: 'fr', matchedBy: 'fallback' });
  });

  // Protocol text falls back at last to any declared language that has it.
  // Here that would be Spanish, which nothing says this participant reads:
  // the fallback language takes that step's place.
  it('is the fallback language, not another language the protocol happens to declare', () => {
    expect(
      shown(
        { defaultLocale: 'sw', locales: ['es', 'sw'], fallbackLocale: 'fr' },
        ['sw'],
      ),
    ).toEqual({ text: 'Enregistré', locale: 'fr', matchedBy: 'fallback' });
  });

  it('is that other language for a participant who reads it', () => {
    expect(
      shown(
        { defaultLocale: 'sw', locales: ['es', 'sw'], fallbackLocale: 'fr' },
        ['es'],
      ),
    ).toEqual({ text: 'Guardado', locale: 'es', matchedBy: 'selected' });
  });

  // Only a protocol still being written: one handed over names the fallback
  // language it needs (`FALLBACK_LANGUAGE_MISSING`).
  it('is none for a protocol that needs a fallback language and names none', () => {
    expect(
      shown({ defaultLocale: 'sw', locales: ['es', 'sw'] }, ['sw']),
    ).toBeUndefined();
  });
});
