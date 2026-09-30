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
const localesDir = join(srcDir, 'locales');
const esSources = readTranslationSources(localesDir, 'es');
const enGbSources = readTranslationSources(localesDir, 'en-GB');

describe('Architect catalog contract', () => {
  it('keeps the extraction fresh, namespaced, and documented', async () => {
    const extracted = await extractMessages(collectSourceFiles(srcDir));
    expect(checkCatalogFreshness(en, extracted)).toEqual([]);
    // A smoke check that extraction actually walked the tree, not a bound on
    // the catalog: 848 ids at the time this was set, down from the 1,140 of
    // the app before it handed its stage editors to @codaco/protocol-builder.
    // A floor a real extraction clears with room, and an empty or half-walked
    // one cannot.
    expect(Object.keys(extracted).length).toBeGreaterThan(800);
    for (const [id, entry] of Object.entries(extracted)) {
      expect(id).toMatch(/^architect\./);
      expect(entry.defaultMessage.trim()).not.toBe('');
      expect(entry.description?.trim()).toBeTruthy();
    }
  }, 120_000);
  it('ships complete Spanish and reviewed sparse British English with identical ICU arguments and rich tags', () => {
    expect(checkFullLocale(en, es, esSources)).toEqual([]);
    expect(checkOverrideLocale(en, enGb, enGbSources)).toEqual([]);
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
    delete incomplete[
      'architect.additional.form.arrayFields.options.noOptionsHaveBeenAddedYet'
    ];
    expect(
      checkFullLocale(en, incomplete, esSources).some((x) =>
        x.includes(
          'architect.additional.form.arrayFields.options.noOptionsHaveBeenAddedYet',
        ),
      ),
    ).toBe(true);
    const corrupt = {
      ...es,
      'architect.stageEditor.stageHeading.stageOf': 'Etapa {incorrect}',
    };
    expect(
      checkFullLocale(en, corrupt, esSources).some((x) =>
        x.includes('architect.stageEditor.stageHeading.stageOf'),
      ),
    ).toBe(true);
  });
  it('detects a Spanish message whose English has since been reworded', () => {
    // The failure the other two cannot see. Spanish that was translated from
    // one English sentence and left alone while the English changed to say
    // something else is complete, token-faithful and nonblank — and wrong on
    // screen. Rewording the recorded source stands in for the English edit.
    // Derived rather than named: a hardcoded id makes this test fail the next
    // time that message is renamed, which is a fact about the fixture and not
    // about the guard. It broke exactly that way once already.
    const id = Object.keys(esSources).find((key) => en[key] !== undefined);
    if (!id) throw new Error('The fixture needs one translated, recorded id');
    expect(en[id]?.defaultMessage).toBeTruthy();
    const issues = checkFullLocale(en, es, {
      ...esSources,
      [id]: 'Your protocol was not downloaded: {assetList}.',
    }).filter((issue) => issue.includes(id));
    expect(issues).toHaveLength(1);
    // The reader is told which English sentence the Spanish was made from and
    // which one it now has to say, because the two together are what decides
    // whether re-stamping or re-translating is the right fix.
    expect(issues[0]).toContain('"Your protocol was not downloaded');
    expect(issues[0]).toContain(en[id]?.defaultMessage ?? '');
  });
  it('detects a Spanish message with no record of the English behind it', () => {
    // Derived rather than named, for the reason given above: a hardcoded id
    // makes this test fail the next time that message is renamed or removed.
    const id = Object.keys(esSources).find((key) => en[key] !== undefined);
    if (!id) throw new Error('The fixture needs one translated, recorded id');
    const { [id]: _unrecorded, ...missing } = esSources;
    expect(
      checkFullLocale(en, es, missing).filter((issue) => issue.includes(id)),
    ).toEqual([`no recorded English source: ${id}`]);
  });
});
