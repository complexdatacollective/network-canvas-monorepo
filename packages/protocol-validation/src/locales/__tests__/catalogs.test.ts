// Reads only the committed catalog artifacts and re-runs extraction over the
// package's source — it never imports protocol-validation components, so it stays
// runnable while sibling workspace packages are mid-edit (the same rule
// src/__tests__/exportsMap.test.ts follows).
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
} from '@codaco/app-i18n/catalog-guards';
import type { ExtractedCatalog } from '@codaco/app-i18n/catalog-guards';
import { ecosystemLocales } from '@codaco/app-i18n/locales';

import { protocolValidationCatalogs } from '../catalogs.ts';

const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = dirname(localesDir);

const committedEn = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as ExtractedCatalog;

/** The locale the descriptors are written in, so it has no catalog. */
const SOURCE_LOCALE = 'en';

/** The locales a shared package must ship, minus the source language. */
const overrideLocales = ecosystemLocales
  .map((entry) => entry.locale)
  .filter((locale) => locale !== SOURCE_LOCALE);

describe('the package’s own protocolValidation.* catalogs', () => {
  it('keeps src/locales/en.json fresh (regenerate with pnpm i18n:extract)', async () => {
    const extracted = await extractMessages(collectSourceFiles(srcDir));
    expect(checkCatalogFreshness(committedEn, extracted)).toEqual([]);
  }, 120_000);

  it('extracts something to guard', () => {
    expect(Object.keys(committedEn).length).toBeGreaterThan(0);
  });

  it('keeps every id under the protocolValidation.* namespace', () => {
    for (const id of Object.keys(committedEn)) {
      expect(id).toMatch(/^protocolValidation\./);
    }
  });

  it('leaves the shared common.* messages to @codaco/app-i18n', () => {
    // Components import `commonMessages` rather than redefining those verbs,
    // so no `common.*` id may be declared — or translated — here.
    const ids = [
      ...Object.keys(committedEn),
      ...Object.values(protocolValidationCatalogs).flatMap((catalog) =>
        Object.keys(catalog),
      ),
    ];
    expect(ids.filter((id) => id.startsWith('common.'))).toEqual([]);
  });

  it('ships a catalog for every non-source ecosystem locale', () => {
    expect(Object.keys(protocolValidationCatalogs).toSorted()).toEqual(
      overrideLocales.toSorted(),
    );
  });

  it('ships a valid catalog for every non-source ecosystem locale', () => {
    // Driven off the registry rather than off the one locale that exists
    // today: the point of the guard is that adding a language anywhere in the
    // ecosystem fails here until this package's copy exists for it, and a
    // key-only check would pass an empty file while every component silently
    // fell back to English.
    for (const locale of overrideLocales) {
      const path = join(localesDir, `${locale}.json`);
      expect(
        existsSync(path),
        `no protocolValidation catalog file for ${locale}`,
      ).toBe(true);
      const catalog = JSON.parse(readFileSync(path, 'utf8')) as Record<
        string,
        string
      >;

      // A regional variant of the source language overrides it and may carry
      // only its divergences; any other language has to translate everything,
      // because there is no base underneath it to fall through to. Same rule
      // as the shared common.* guard in @codaco/app-i18n.
      const issues =
        locale.split('-')[0] === SOURCE_LOCALE
          ? checkOverrideLocale(committedEn, catalog)
          : checkFullLocale(committedEn, catalog);
      expect(issues, `protocolValidation catalog issues for ${locale}`).toEqual(
        [],
      );
    }
  });
});
