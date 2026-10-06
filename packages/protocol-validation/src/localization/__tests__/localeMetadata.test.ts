import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLocaleMetadata } from '../localeMetadata.ts';

const RealLocale = Intl.Locale;

const stubIntl = (overrides: { DisplayNames?: unknown; Locale?: unknown }) => {
  vi.stubGlobal('Intl', {
    getCanonicalLocales: Intl.getCanonicalLocales,
    DisplayNames: Intl.DisplayNames,
    Locale: Intl.Locale,
    ...overrides,
  });
};

// Models Chromium's trimmed ICU data: it names languages only in the display
// locales it supports, and answers for any other display locale in English.
// `names` is keyed `<display locale>:<tag>`.
const stubDisplayNames = (
  supported: readonly string[],
  names: Readonly<Record<string, string>>,
) => {
  stubIntl({
    DisplayNames: class {
      static supportedLocalesOf(locales: readonly string[]) {
        return locales.filter((locale) => supported.includes(locale));
      }

      readonly #displayLocale: string;

      constructor(locales: readonly string[]) {
        const [requested = 'en'] = locales;
        this.#displayLocale = supported.includes(requested) ? requested : 'en';
      }

      of(tag: string) {
        return names[`${this.#displayLocale}:${tag}`];
      }
    },
  });
};

// A runtime with neither `getTextInfo()` nor the `textInfo` accessor.
class LocaleWithoutTextInfo {
  readonly #locale: Intl.Locale;

  constructor(tag: string) {
    this.#locale = new RealLocale(tag);
  }

  maximize(): Intl.Locale {
    return this.#locale.maximize();
  }
}

// Reports right-to-left for every tag, so a result can only come from it.
class LocaleWithLegacyTextInfo extends LocaleWithoutTextInfo {
  get textInfo() {
    return { direction: 'rtl' };
  }
}

// Reports left-to-right for every tag, contradicting the legacy accessor.
class LocaleWithBothTextInfoShapes extends LocaleWithLegacyTextInfo {
  getTextInfo() {
    return { direction: 'ltr' };
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getLocaleMetadata', () => {
  it('runs without browser globals', () => {
    expect('window' in globalThis).toBe(false);
    expect('document' in globalThis).toBe(false);
    expect(getLocaleMetadata('en')).toEqual({
      locale: 'en',
      label: 'English',
      direction: 'ltr',
    });
  });

  it('returns the canonical tag', () => {
    expect(getLocaleMetadata('iw').locale).toBe('he');
    expect(getLocaleMetadata('zh-hant-tw').locale).toBe('zh-Hant-TW');
  });

  it('throws for a malformed locale', () => {
    expect(() => getLocaleMetadata('EN_us')).toThrow(RangeError);
  });

  describe('label', () => {
    it.each([
      ['es', 'español'],
      ['ar', 'العربية'],
      ['he', 'עברית'],
    ])('names %s in its own language', (locale, autonym) => {
      expect(getLocaleMetadata(locale).label).toBe(autonym);
    });

    it('names the locale in a requested display locale', () => {
      expect(getLocaleMetadata('de', 'en').label).toBe('German');
    });

    it('falls back to the canonical tag when DisplayNames is unavailable', () => {
      stubIntl({ DisplayNames: undefined });
      expect(getLocaleMetadata('es-mx').label).toBe('es-MX');
    });

    it('falls back to the canonical tag when DisplayNames throws', () => {
      stubIntl({
        DisplayNames: class {
          of() {
            throw new RangeError('Invalid code');
          }
        },
      });
      expect(getLocaleMetadata('gsw').label).toBe('gsw');
    });

    it('falls back to the canonical tag when DisplayNames has no name', () => {
      stubIntl({
        DisplayNames: class {
          of() {
            return undefined;
          }
        },
      });
      expect(getLocaleMetadata('gsw').label).toBe('gsw');
    });

    it('falls back to the canonical tag for a malformed display locale', () => {
      expect(getLocaleMetadata('gsw', 'EN_us').label).toBe('gsw');
    });

    describe('when the runtime has no name for a language', () => {
      it('names the language in English for a malformed display locale', () => {
        expect(getLocaleMetadata('es', 'EN_us').label).toBe('Spanish');
      });

      it('uses the English name when the runtime lacks it in the display locale', () => {
        stubDisplayNames(['en', 'de'], { 'de:cy': 'Walisisch' });
        expect(getLocaleMetadata('bo', 'de').label).toBe('Tibetan');
      });

      it('uses the autonym when the runtime has no data for the language', () => {
        // The runtime answers for an unsupported display locale in English.
        stubDisplayNames(['en'], { 'en:cy': 'Welsh' });
        expect(getLocaleMetadata('cy').label).toBe('Cymraeg');
      });

      it('uses the English name for a language that has no autonym', () => {
        stubDisplayNames(['en'], {});
        expect(getLocaleMetadata('aa').label).toBe('Afar');
        expect(getLocaleMetadata('aa', 'en').label).toBe('Afar');
      });

      it('uses the English name, not the autonym, for another display locale', () => {
        stubDisplayNames(['en', 'de'], {});
        expect(getLocaleMetadata('cy', 'de').label).toBe('Welsh');
      });

      it('uses the table when DisplayNames is unavailable', () => {
        stubIntl({ DisplayNames: undefined });
        expect(getLocaleMetadata('cy').label).toBe('Cymraeg');
        expect(getLocaleMetadata('cy', 'de').label).toBe('Welsh');
      });

      it('names a language the table lacks as it did before', () => {
        stubDisplayNames(['en'], {
          'en:gsw': 'Swiss German',
          'en:es-MX': 'Mexican Spanish',
        });
        expect(getLocaleMetadata('gsw').label).toBe('Swiss German');
        expect(getLocaleMetadata('es-mx').label).toBe('Mexican Spanish');
        expect(getLocaleMetadata('wae').label).toBe('wae');
      });

      it('prefers a name the runtime has over the table', () => {
        stubDisplayNames(['de', 'cy'], {
          'de:bo': 'Tibetisch',
          'cy:cy': 'Cymraeg (runtime)',
        });
        expect(getLocaleMetadata('bo', 'de').label).toBe('Tibetisch');
        expect(getLocaleMetadata('cy').label).toBe('Cymraeg (runtime)');
      });
    });
  });

  describe('direction', () => {
    it.each(['en', 'es', 'zh-Hant-TW', 'und'])(
      'is left-to-right for %s',
      (locale) => {
        expect(getLocaleMetadata(locale).direction).toBe('ltr');
      },
    );

    it.each(['ar', 'he', 'fa', 'ur'])('is right-to-left for %s', (locale) => {
      expect(getLocaleMetadata(locale).direction).toBe('rtl');
    });

    it('follows the script subtag of a mixed-script language', () => {
      expect(getLocaleMetadata('az-Arab').direction).toBe('rtl');
      expect(getLocaleMetadata('az-Latn').direction).toBe('ltr');
    });

    it('prefers getTextInfo() over the legacy textInfo accessor', () => {
      stubIntl({ Locale: LocaleWithBothTextInfoShapes });
      expect(getLocaleMetadata('ar').direction).toBe('ltr');
    });

    it('reads the legacy textInfo accessor when getTextInfo() is absent', () => {
      stubIntl({ Locale: LocaleWithLegacyTextInfo });
      expect(getLocaleMetadata('en').direction).toBe('rtl');
    });

    describe('without text info support', () => {
      it.each([
        ['ar', 'rtl'],
        ['he', 'rtl'],
        ['fa', 'rtl'],
        ['ur', 'rtl'],
        ['az-Arab', 'rtl'],
        ['az-Latn', 'ltr'],
        ['az', 'ltr'],
        ['en', 'ltr'],
        ['zh-Hant-TW', 'ltr'],
        ['und', 'ltr'],
      ])('derives %s as %s from the likely script', (locale, direction) => {
        stubIntl({ Locale: LocaleWithoutTextInfo });
        expect(getLocaleMetadata(locale).direction).toBe(direction);
      });

      it.each([
        'Adlm',
        'Arab',
        'Hebr',
        'Mand',
        'Mend',
        'Nkoo',
        'Rohg',
        'Samr',
        'Syrc',
        'Thaa',
        'Yezi',
      ])('treats the %s script as right-to-left', (script) => {
        stubIntl({ Locale: LocaleWithoutTextInfo });
        expect(getLocaleMetadata(`und-${script}`).direction).toBe('rtl');
      });

      it.each(['Latn', 'Cyrl', 'Hant', 'Deva', 'Ethi'])(
        'treats the %s script as left-to-right',
        (script) => {
          stubIntl({ Locale: LocaleWithoutTextInfo });
          expect(getLocaleMetadata(`und-${script}`).direction).toBe('ltr');
        },
      );
    });
  });
});
