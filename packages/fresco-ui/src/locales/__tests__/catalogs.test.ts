// Reads only the committed catalog artifacts and re-runs extraction over the
// package's source — it never imports fresco-ui components, so it stays
// runnable while sibling workspace packages are mid-edit (the same rule
// src/__tests__/exportsMap.test.ts follows).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  checkOverrideLocale,
  collectSourceFiles,
  extractMessages,
} from '@codaco/app-i18n/catalog-guards';
import type { ExtractedCatalog } from '@codaco/app-i18n/catalog-guards';
import { ecosystemLocales } from '@codaco/app-i18n/locales';

import { frescoUiCatalogs } from '../catalogs';

const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = dirname(localesDir);

const committedEn = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as ExtractedCatalog;

/** The locales a shared package must ship, minus the source language. */
const overrideLocales = ecosystemLocales
  .map((entry) => entry.locale)
  .filter((locale) => locale !== 'en');

describe('the package’s own frescoUi.* catalogs', () => {
  it('keeps src/locales/en.json fresh (regenerate with pnpm i18n:extract)', async () => {
    const extracted = await extractMessages(collectSourceFiles(srcDir));
    expect(checkCatalogFreshness(committedEn, extracted)).toEqual([]);
  }, 120_000);

  it('extracts something to guard', () => {
    expect(Object.keys(committedEn).length).toBeGreaterThan(0);
  });

  it('keeps every id under the frescoUi.* namespace', () => {
    for (const id of Object.keys(committedEn)) {
      expect(id).toMatch(/^frescoUi\./);
    }
  });

  it('leaves the shared common.* messages to @codaco/app-i18n', () => {
    // Components import `commonMessages` rather than redefining those verbs,
    // so no `common.*` id may be declared — or translated — here.
    const ids = [
      ...Object.keys(committedEn),
      ...Object.values(frescoUiCatalogs).flatMap((catalog) =>
        Object.keys(catalog),
      ),
    ];
    expect(ids.filter((id) => id.startsWith('common.'))).toEqual([]);
  });

  it('ships a catalog for every non-source ecosystem locale', () => {
    expect(Object.keys(frescoUiCatalogs).toSorted()).toEqual(
      overrideLocales.toSorted(),
    );
  });

  it('keeps the en-GB override catalog a valid subset', () => {
    const overrides = JSON.parse(
      readFileSync(join(localesDir, 'en-GB.json'), 'utf8'),
    ) as Record<string, string>;
    expect(checkOverrideLocale(committedEn, overrides)).toEqual([]);
  });
});
