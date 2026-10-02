import { describe, expect, it } from 'vitest';

import {
  defaultSiteLocale,
  isSiteLocale,
  siteLocales,
  supportedSiteLocales,
  toScriptMatchingTag,
} from '../site-locales.ts';

describe('site locales', () => {
  it('keeps locale identifiers, definitions, and the default in sync', () => {
    expect(siteLocales).toEqual([
      'en-US',
      'en-GB',
      'es',
      'zh-Hans',
      'zh-Hant',
      'de',
      'nl',
      'pt-BR',
    ]);
    expect(supportedSiteLocales.map(({ locale }) => locale)).toEqual(
      siteLocales,
    );
    expect(defaultSiteLocale).toBe('en-US');
    expect(isSiteLocale('en-GB')).toBe(true);
    expect(isSiteLocale('en')).toBe(false);
  });

  it('gives every locale its own compact label', () => {
    const labels = supportedSiteLocales.map(({ compactLabel }) => compactLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it.each([
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-MO', 'zh-Hant'],
    ['zh-Hant-HK', 'zh-Hant'],
    ['zh', 'zh-Hans'],
    ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
    ['zh-Hans', 'zh-Hans'],
    ['en-GB', 'en-GB'],
    ['es-MX', 'es-MX'],
    ['not a tag', 'not a tag'],
  ])('matches %s by the tag %s', (tag, expected) => {
    expect(toScriptMatchingTag(tag)).toBe(expected);
  });
});
