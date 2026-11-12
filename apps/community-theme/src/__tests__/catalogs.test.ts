import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  checkFullLocale,
  collectSourceFiles,
  extractMessages,
  readTranslationSources,
  type ExtractedCatalog,
} from '@codaco/app-i18n/catalog-guards';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(srcDir, 'locales');

function readCatalog(locale: string): Record<string, string> {
  return JSON.parse(
    readFileSync(join(localesDir, `${locale}.json`), 'utf8'),
  ) as Record<string, string>;
}

const en = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as ExtractedCatalog;

// Every language the Network Canvas websites are translated into. British
// English needs no catalog: the home page's copy has no spelling that differs.
const translatedLocales = [
  'es',
  'de',
  'fr',
  'it',
  'nl',
  'pt-BR',
  'zh-Hans',
  'zh-Hant',
] as const;

const es = readCatalog('es');
const esSources = readTranslationSources(localesDir, 'es');

describe('community theme catalogs', () => {
  it('keeps the extraction fresh, namespaced, and documented', async () => {
    const extracted = await extractMessages(collectSourceFiles(srcDir));
    expect(checkCatalogFreshness(en, extracted)).toEqual([]);
    expect(Object.keys(extracted).length).toBeGreaterThan(0);
    for (const [id, entry] of Object.entries(extracted)) {
      expect(id).toMatch(/^communityTheme\./);
      expect(entry.defaultMessage.trim()).not.toBe('');
      expect(entry.description?.trim()).toBeTruthy();
    }
  });

  it.each(translatedLocales)(
    'ships complete %s with the English it was translated from',
    (locale) => {
      expect(
        checkFullLocale(
          en,
          readCatalog(locale),
          readTranslationSources(localesDir, locale),
        ),
      ).toEqual([]);
    },
  );

  it('detects a removed message and an altered ICU argument', () => {
    const id = Object.keys(en).find((key) =>
      en[key]?.defaultMessage.includes('{count'),
    );
    if (!id) throw new Error('The fixture needs one plural message');
    const { [id]: _removed, ...incomplete } = es;
    expect(
      checkFullLocale(en, incomplete, esSources).some((x) => x.includes(id)),
    ).toBe(true);
    const corrupt = { ...es, [id]: '{incorrect, plural, other {#}}' };
    expect(
      checkFullLocale(en, corrupt, esSources).some((x) => x.includes(id)),
    ).toBe(true);
  });

  it('detects a translation whose English has since been reworded', () => {
    // Derived rather than named, so renaming a message does not break the
    // test. Rewording the recorded source stands in for an English edit: the
    // Spanish is still complete and token-faithful, and now says the wrong
    // thing.
    const id = Object.keys(esSources).find((key) => en[key] !== undefined);
    if (!id) throw new Error('The fixture needs one translated, recorded id');
    const issues = checkFullLocale(en, es, {
      ...esSources,
      [id]: 'An English sentence nobody translated.',
    }).filter((issue) => issue.includes(id));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"An English sentence nobody translated.');
    expect(issues[0]).toContain(en[id]?.defaultMessage ?? '');
  });

  it('detects a translation with no record of the English behind it', () => {
    const id = Object.keys(esSources).find((key) => en[key] !== undefined);
    if (!id) throw new Error('The fixture needs one translated, recorded id');
    const { [id]: _unrecorded, ...missing } = esSources;
    expect(
      checkFullLocale(en, es, missing).filter((issue) => issue.includes(id)),
    ).toEqual([`no recorded English source: ${id}`]);
  });
});
