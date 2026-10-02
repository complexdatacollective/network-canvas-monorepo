import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  checkFullLocale,
  checkOverrideLocale,
  collectSourceFiles,
  extractMessages,
  readTranslationSources,
  type ExtractedCatalog,
} from '@codaco/app-i18n/catalog-guards';
import { ecosystemLocales } from '@codaco/app-i18n/locales';

import { interviewLocales } from '../../i18n/locales';
import { interviewCatalogs } from '../catalogs';
import de from '../de.json';

const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));
const committedEn = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as ExtractedCatalog;
const esSources = readTranslationSources(localesDir, 'es');
const zhHansSources = readTranslationSources(localesDir, 'zh-Hans');
const deSources = readTranslationSources(localesDir, 'de');
const nlSources = readTranslationSources(localesDir, 'nl');
const enGbSources = readTranslationSources(localesDir, 'en-GB');

describe('the interview package built-in message catalogs', () => {
  it('keeps the English extraction fresh, with unique explicit IDs and translator descriptions', async () => {
    const extracted = await extractMessages(
      collectSourceFiles(dirname(localesDir)),
    );
    expect(checkCatalogFreshness(committedEn, extracted)).toEqual([]);
  }, 120_000);

  it('owns only interview.* messages and leaves universal verbs to common.*', () => {
    expect(Object.keys(committedEn).length).toBeGreaterThan(0);
    for (const id of [
      ...Object.keys(committedEn),
      ...Object.values(interviewCatalogs).flatMap(Object.keys),
    ]) {
      expect(id).toMatch(/^interview\./);
    }
  });

  it('ships every ecosystem language without assuming the host registry', () => {
    const declared = interviewLocales.map(({ locale }) => locale);
    expect(declared).toEqual(['en', 'en-GB', 'es', 'zh-Hans', 'de', 'nl']);
    expect(ecosystemLocales.map(({ locale }) => locale).toSorted()).toEqual(
      declared.toSorted(),
    );
    expect(Object.keys(interviewCatalogs).toSorted()).toEqual(
      declared.filter((locale) => locale !== 'en').toSorted(),
    );
  });

  it('provides complete nonblank Spanish with ICU and rich-text token parity', () => {
    const es = JSON.parse(
      readFileSync(join(localesDir, 'es.json'), 'utf8'),
    ) as Record<string, string>;
    expect(checkFullLocale(committedEn, es, esSources)).toEqual([]);
  });

  it('provides complete nonblank Simplified Chinese with ICU and rich-text token parity', () => {
    const zhHans = JSON.parse(
      readFileSync(join(localesDir, 'zh-Hans.json'), 'utf8'),
    ) as Record<string, string>;
    expect(checkFullLocale(committedEn, zhHans, zhHansSources)).toEqual([]);
  });

  it('provides complete nonblank German with ICU and rich-text token parity', () => {
    expect(checkFullLocale(committedEn, de, deSources)).toEqual([]);
  });

  it('provides complete nonblank Dutch with ICU and rich-text token parity', () => {
    const nl = JSON.parse(
      readFileSync(join(localesDir, 'nl.json'), 'utf8'),
    ) as Record<string, string>;
    expect(checkFullLocale(committedEn, nl, nlSources)).toEqual([]);
  });

  it('keeps British English a valid sparse override', () => {
    const enGb = JSON.parse(
      readFileSync(join(localesDir, 'en-GB.json'), 'utf8'),
    ) as Record<string, string>;
    expect(checkOverrideLocale(committedEn, enGb, enGbSources)).toEqual([]);
    expect(Object.keys(enGb).length).toBeLessThan(
      Object.keys(committedEn).length,
    );
  });
});
