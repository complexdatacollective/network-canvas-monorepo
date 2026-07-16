import { describe, expect, it } from 'vitest';

import {
  defaultSiteLocale,
  isSiteLocale,
  siteLocales,
  supportedSiteLocales,
} from '../site-locales.ts';

describe('site locales', () => {
  it('keeps locale identifiers, definitions, and the default in sync', () => {
    expect(siteLocales).toEqual(['en-US', 'en-GB', 'es']);
    expect(supportedSiteLocales.map(({ locale }) => locale)).toEqual(
      siteLocales,
    );
    expect(defaultSiteLocale).toBe('en-US');
    expect(isSiteLocale('en-GB')).toBe(true);
    expect(isSiteLocale('en')).toBe(false);
  });
});
