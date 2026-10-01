import { describe, expect, it } from 'vitest';

import { defineAppLocales, ecosystemLocales } from '../locales.ts';
import { canonicalizeAppLocale, resolveAppLocale } from '../negotiate.ts';

const registry = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  { locale: 'ar', label: 'العربية', direction: 'rtl' },
]);

const resolve = (input: {
  stored?: string | null;
  requested?: readonly string[];
}) =>
  resolveAppLocale({
    stored: input.stored,
    requested: input.requested ?? [],
    locales: registry,
    defaultLocale: 'en',
  });

describe('canonicalizeAppLocale', () => {
  it('canonicalizes case and returns undefined for garbage', () => {
    expect(canonicalizeAppLocale('EN-gb')).toBe('en-GB');
    expect(canonicalizeAppLocale('not a tag')).toBeUndefined();
    expect(canonicalizeAppLocale('   ')).toBeUndefined();
  });
});

describe('resolveAppLocale', () => {
  it('lets a stored declared locale win over browser preferences', () => {
    expect(resolve({ stored: 'en-GB', requested: ['ar'] })).toEqual({
      locale: 'en-GB',
      source: 'stored',
    });
  });

  it('matches a stored regional variant to its declared base', () => {
    expect(resolve({ stored: 'ar-EG', requested: ['en'] })).toEqual({
      locale: 'ar',
      source: 'stored',
    });
  });

  it('matches a stored base language to a declared regional variant', () => {
    const result = resolveAppLocale({
      stored: 'en',
      requested: [],
      locales: defineAppLocales([
        { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
        { locale: 'ar', label: 'العربية', direction: 'rtl' },
      ]),
      defaultLocale: 'ar',
    });
    expect(result).toEqual({ locale: 'en-GB', source: 'stored' });
  });

  it('keeps a stored regional variant on the sibling variant the app ships', () => {
    // Nobody who asked for American English wants Arabic because the app now
    // ships British English instead. The two tags share no declared ancestor
    // — plain 'en' is not in this registry — so nothing short of best fit
    // keeps the explicit choice in English.
    const result = resolveAppLocale({
      stored: 'en-US',
      requested: ['ar'],
      locales: defineAppLocales([
        { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
        { locale: 'ar', label: 'العربية', direction: 'rtl' },
      ]),
      defaultLocale: 'ar',
    });
    expect(result).toEqual({ locale: 'en-GB', source: 'stored' });
  });

  it('ignores a stored locale that matches nothing and falls through to negotiation', () => {
    expect(resolve({ stored: 'fr', requested: ['ar'] })).toEqual({
      locale: 'ar',
      source: 'negotiated',
    });
  });

  it('ignores a malformed stored value', () => {
    expect(resolve({ stored: '!!', requested: ['en-GB'] })).toEqual({
      locale: 'en-GB',
      source: 'negotiated',
    });
  });

  it('negotiates browser preferences with best fit', () => {
    expect(resolve({ requested: ['ar-EG', 'en'] }).locale).toBe('ar');
  });

  it('drops malformed requested entries rather than failing', () => {
    expect(resolve({ requested: ['???', 'en-GB'] })).toEqual({
      locale: 'en-GB',
      source: 'negotiated',
    });
  });

  it('reports the default source only when nothing was requested', () => {
    expect(resolve({})).toEqual({ locale: 'en', source: 'default' });
    expect(resolve({ requested: ['zh'] }).source).toBe('negotiated');
  });

  it('always returns a declared locale', () => {
    const samples = [
      ['zh', 'ja'],
      ['pt-BR'],
      ['en-US'],
      ['ar-MA', 'fr'],
    ] as const;
    for (const requested of samples) {
      const { locale } = resolve({ requested });
      expect(registry.map((entry) => entry.locale)).toContain(locale);
    }
  });

  it('rejects a defaultLocale outside the registry', () => {
    expect(() =>
      resolveAppLocale({
        requested: [],
        locales: registry,
        defaultLocale: 'fr',
      }),
    ).toThrow(/not in the registry/);
  });
});

describe('Chinese script negotiation across the ecosystem registry', () => {
  const resolveEcosystem = (input: {
    stored?: string | null;
    requested?: readonly string[];
  }) =>
    resolveAppLocale({
      stored: input.stored,
      requested: input.requested ?? [],
      locales: ecosystemLocales,
      defaultLocale: 'en',
    });

  it.each([
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-MO', 'zh-Hant'],
    ['zh-Hant', 'zh-Hant'],
    ['zh-Hant-TW', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
    ['zh-Hans', 'zh-Hans'],
    ['zh', 'zh-Hans'],
  ])('matches a %s request to %s', (requested, expected) => {
    expect(resolveEcosystem({ requested: [requested] }).locale).toBe(expected);
  });

  // A Hong Kong browser sends "zh-HK, zh". Best fit alone scores zh-HK as a
  // regional miss against zh-Hant and lets the bare "zh" behind it win.
  it.each([
    [['zh-HK', 'zh'], 'zh-Hant'],
    [['zh-MO', 'zh', 'en'], 'zh-Hant'],
    [['zh-Hant-HK', 'zh'], 'zh-Hant'],
    [['zh-TW', 'zh-CN'], 'zh-Hant'],
    [['zh', 'zh-TW'], 'zh-Hans'],
    [['zh-SG', 'zh-HK'], 'zh-Hans'],
  ])('matches the browser list %j to %s', (requested, expected) => {
    expect(resolveEcosystem({ requested }).locale).toBe(expected);
  });

  it('keeps an exactly declared regional Chinese tag', () => {
    const regional = defineAppLocales([
      { locale: 'en', label: 'English', direction: 'ltr' },
      { locale: 'zh-Hans', label: '简体中文', direction: 'ltr' },
      { locale: 'zh-TW', label: '繁體中文（台灣）', direction: 'ltr' },
    ]);
    expect(
      resolveAppLocale({
        stored: 'zh-TW',
        requested: ['zh-CN'],
        locales: regional,
        defaultLocale: 'en',
      }),
    ).toEqual({ locale: 'zh-TW', source: 'stored' });
    expect(
      resolveAppLocale({
        requested: ['zh-TW', 'zh'],
        locales: regional,
        defaultLocale: 'en',
      }).locale,
    ).toBe('zh-TW');
  });

  it('keeps a stored regional choice in its own script', () => {
    expect(resolveEcosystem({ stored: 'zh-TW', requested: ['zh-CN'] })).toEqual(
      { locale: 'zh-Hant', source: 'stored' },
    );
    expect(resolveEcosystem({ stored: 'zh-CN', requested: ['zh-TW'] })).toEqual(
      { locale: 'zh-Hans', source: 'stored' },
    );
  });
});
