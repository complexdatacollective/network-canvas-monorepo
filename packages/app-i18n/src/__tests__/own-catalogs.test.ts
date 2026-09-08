import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  checkFullLocale,
  checkOverrideLocale,
  collectSourceFiles,
  extractMessages,
} from '../catalog-guards.ts';
import type { ExtractedCatalog } from '../catalog-guards.ts';
import { commonCatalogs } from '../common.ts';
import { ecosystemLocales } from '../locales.ts';

const srcDir = join(dirname(dirname(fileURLToPath(import.meta.url))));

/** The locale the descriptors are written in, so it has no catalog. */
const SOURCE_LOCALE = 'en';

const committedEn = JSON.parse(
  readFileSync(join(srcDir, 'locales/en.json'), 'utf8'),
) as ExtractedCatalog;

describe('the package’s own common.* catalogs', () => {
  it('keeps src/locales/en.json fresh (regenerate with pnpm i18n:extract)', async () => {
    const extracted = await extractMessages(collectSourceFiles(srcDir));
    expect(checkCatalogFreshness(committedEn, extracted)).toEqual([]);
  });

  it('keeps every id under the common.* namespace', () => {
    for (const id of Object.keys(committedEn)) {
      expect(id).toMatch(/^common\./);
    }
  });

  it('ships a valid common catalog for every ecosystem locale', () => {
    // Driven off the registry rather than off a list of filenames: the point
    // of the guard is that adding a locale anywhere in the ecosystem fails
    // here until the shared common.* copy exists for it.
    for (const { locale } of ecosystemLocales) {
      // English is the source: it renders from the descriptors themselves.
      if (locale === SOURCE_LOCALE) continue;

      expect(
        Object.keys(commonCatalogs),
        `commonCatalogs has no entry for ${locale}`,
      ).toContain(locale);

      const path = join(srcDir, 'locales', `${locale}.json`);
      expect(existsSync(path), `no common catalog file for ${locale}`).toBe(
        true,
      );
      const catalog = JSON.parse(readFileSync(path, 'utf8')) as Record<
        string,
        string
      >;

      // A regional variant of the source language overrides it and may carry
      // only its divergences; any other language has to translate everything,
      // because there is no base underneath it to fall through to.
      const issues =
        locale.split('-')[0] === SOURCE_LOCALE
          ? checkOverrideLocale(committedEn, catalog)
          : checkFullLocale(committedEn, catalog);
      expect(issues, `common catalog issues for ${locale}`).toEqual([]);
    }
  });
});
