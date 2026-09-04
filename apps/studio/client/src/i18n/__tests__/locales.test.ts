import { describe, expect, it } from 'vitest';

import { ecosystemLocales, PSEUDO_LOCALE } from '@codaco/app-i18n/locales';
import { supportedSiteLocales } from '@codaco/shared-consts';
import { SUPPORTED_STUDIO_LOCALES } from '@codaco/studio-rpc';

import {
  studioDefaultLocale,
  studioLocales,
  studioProductionLocales,
} from '../locales.ts';
import { SITE_LOCALE_BY_APP_LOCALE, siteLocaleFor } from '../siteLocale.ts';

/**
 * Three lists have to agree about which locales Studio has, and they live in
 * three packages: the client registry the switcher offers, the contract list
 * the server validates a stored preference against, and the ecosystem set the
 * shared packages ship catalogs for. Adding a locale means editing all three
 * in one pull request — these are what fail until that has happened.
 */
describe('the Studio locale registry', () => {
  it('offers exactly the locales the server will store', () => {
    expect(studioProductionLocales.map((entry) => entry.locale)).toEqual([
      ...SUPPORTED_STUDIO_LOCALES,
    ]);
  });

  it('stays a subset of the ecosystem set the shared catalogs cover', () => {
    const ecosystem = new Set(ecosystemLocales.map((entry) => entry.locale));
    for (const entry of studioProductionLocales) {
      expect(ecosystem.has(entry.locale)).toBe(true);
    }
  });

  it('defaults to a locale it declares', () => {
    expect(
      studioProductionLocales.some(
        (entry) => entry.locale === studioDefaultLocale,
      ),
    ).toBe(true);
  });

  it('keeps the pseudo-locale out of the production registry', () => {
    // Compared as plain tags: the registry's element type is a union of the
    // literals it declares, which would make a direct comparison a type error
    // rather than the runtime check this is.
    expect(
      studioProductionLocales.map((entry) => entry.locale as string),
    ).not.toContain(PSEUDO_LOCALE);
  });

  it('adds the pseudo-locale to the registry a development build mounts', () => {
    // Vitest runs with `import.meta.env.DEV` true, which is the same branch a
    // `vite dev` bundle takes: the mounted registry is the production one plus
    // the pseudo-locale, in that order.
    expect(studioLocales.map((entry) => entry.locale)).toEqual([
      ...studioProductionLocales.map((entry) => entry.locale),
      PSEUDO_LOCALE,
    ]);
  });
});

describe('mapping the app locale onto the shared site chrome', () => {
  it('maps every declared app locale to a real site locale', () => {
    const siteLocales = new Set(
      supportedSiteLocales.map((entry) => entry.locale),
    );
    for (const entry of studioProductionLocales) {
      const mapped = SITE_LOCALE_BY_APP_LOCALE[entry.locale];
      expect(mapped).toBeDefined();
      expect(siteLocales.has(mapped!)).toBe(true);
    }
  });

  it('maps English and British English to their site counterparts', () => {
    expect(siteLocaleFor('en')).toBe('en-US');
    expect(siteLocaleFor('en-GB')).toBe('en-GB');
  });

  it('falls back to the site default for the pseudo-locale', () => {
    // The site header is shared chrome with its own catalog, outside the
    // pseudo-transform; an unmapped tag must not reach it as-is.
    expect(siteLocaleFor(PSEUDO_LOCALE)).toBe('en-US');
  });
});
