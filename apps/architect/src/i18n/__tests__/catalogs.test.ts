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

import { architectProductionLocales } from '../locales';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const en = JSON.parse(
  readFileSync(join(srcDir, 'locales/en.json'), 'utf8'),
) as ExtractedCatalog;
const es = JSON.parse(
  readFileSync(join(srcDir, 'locales/es.json'), 'utf8'),
) as Record<string, string>;
const enGb = JSON.parse(
  readFileSync(join(srcDir, 'locales/en-GB.json'), 'utf8'),
) as Record<string, string>;

describe('Architect catalog contract', () => {
  it('keeps the extraction fresh, namespaced, and documented', async () => {
    const extracted = await extractMessages(collectSourceFiles(srcDir));
    expect(checkCatalogFreshness(en, extracted)).toEqual([]);
    expect(Object.keys(extracted).length).toBeGreaterThan(1000);
    for (const [id, entry] of Object.entries(extracted)) {
      expect(id).toMatch(/^architect\./);
      expect(entry.defaultMessage.trim()).not.toBe('');
      expect(entry.description?.trim()).toBeTruthy();
    }
  }, 120_000);
  it('ships complete Spanish and reviewed sparse British English with identical ICU arguments and rich tags', () => {
    expect(checkFullLocale(en, es)).toEqual([]);
    expect(checkOverrideLocale(en, enGb)).toEqual([]);
  });
  it('keeps the selectable production set inside the shared ecosystem', () => {
    expect(architectProductionLocales.map((x) => x.locale)).toEqual([
      'en',
      'en-GB',
      'es',
    ]);
    const supported = new Set(ecosystemLocales.map((x) => x.locale));
    expect(
      architectProductionLocales.filter((x) => !supported.has(x.locale)),
    ).toEqual([]);
  });
  it('detects a removed Spanish message and an altered ICU argument', () => {
    const incomplete = { ...es };
    delete incomplete['architect.language.title'];
    expect(
      checkFullLocale(en, incomplete).some((x) =>
        x.includes('architect.language.title'),
      ),
    ).toBe(true);
    const corrupt = {
      ...es,
      'architect.stageEditor.stageHeading.stageOf': 'Etapa {incorrect}',
    };
    expect(
      checkFullLocale(en, corrupt).some((x) =>
        x.includes('architect.stageEditor.stageHeading.stageOf'),
      ),
    ).toBe(true);
  });
});
