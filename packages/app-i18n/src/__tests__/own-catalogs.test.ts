import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  checkOverrideLocale,
  collectSourceFiles,
  extractMessages,
} from '../catalog-guards.ts';
import type { ExtractedCatalog } from '../catalog-guards.ts';

const srcDir = join(dirname(dirname(fileURLToPath(import.meta.url))));

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

  it('keeps the en-GB override catalog a valid subset', () => {
    const overrides = JSON.parse(
      readFileSync(join(srcDir, 'locales/en-GB.json'), 'utf8'),
    ) as Record<string, string>;
    expect(checkOverrideLocale(committedEn, overrides)).toEqual([]);
  });
});
