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
  type ExtractedCatalog,
} from '@codaco/app-i18n/catalog-guards';
import { ecosystemLocales } from '@codaco/app-i18n/locales';

import { interviewLocales } from '../../i18n/locales';
import { interviewCatalogs } from '../catalogs';

const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));
const committedEn = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as ExtractedCatalog;

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
    expect(declared).toEqual(['en', 'en-GB', 'es']);
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
    expect(checkFullLocale(committedEn, es)).toEqual([]);
  });

  it('keeps British English a valid sparse override', () => {
    const enGb = JSON.parse(
      readFileSync(join(localesDir, 'en-GB.json'), 'utf8'),
    ) as Record<string, string>;
    expect(checkOverrideLocale(committedEn, enGb)).toEqual([]);
    expect(Object.keys(enGb).length).toBeLessThan(
      Object.keys(committedEn).length,
    );
  });
});
