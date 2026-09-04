import { describe, expect, it } from 'vitest';

import { defineAppLocales } from '../locales.ts';
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
