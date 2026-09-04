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
import { commonMessages } from '@codaco/app-i18n/common';
import { createAppIntl } from '@codaco/app-i18n/messages';

import { studioCatalogs } from '../catalogs.ts';

/**
 * The catalog artifacts cannot drift silently (design invariant 6). `en.json`
 * is generated, not written: it is what translators receive and what every
 * other locale is checked against, so a message added in source without a
 * regenerated catalog is a message no translator will ever see.
 *
 * Regenerate with `pnpm --filter @codaco/studio-client i18n:extract`.
 */

const srcDir = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const committedEn = JSON.parse(
  readFileSync(join(srcDir, 'locales/en.json'), 'utf8'),
) as ExtractedCatalog;

describe('the Studio client message catalogs', () => {
  it('keeps src/locales/en.json fresh (regenerate with pnpm i18n:extract)', async () => {
    const extracted = await extractMessages(collectSourceFiles(srcDir));
    expect(checkCatalogFreshness(committedEn, extracted)).toEqual([]);
  });

  it('keeps every id under the studio.* namespace', () => {
    // Ids name their owning workspace, which is what makes a merged catalog's
    // collisions structurally impossible: an id extracted here that claimed
    // `common.*` or `frescoUi.*` would silently shadow a shared package's.
    for (const id of Object.keys(committedEn)) {
      expect(id).toMatch(/^studio\./);
    }
  });

  it('extracts at least the whole converted surface', () => {
    // A floor rather than an exact count: it fails on a conversion that got
    // reverted or a catalog regenerated from a half-broken source tree, and
    // does not need editing every time a screen gains a sentence.
    expect(Object.keys(committedEn).length).toBeGreaterThan(300);
  });

  it('keeps the en-GB override catalog a valid subset with token parity', () => {
    const overrides = JSON.parse(
      readFileSync(join(srcDir, 'locales/en-GB.json'), 'utf8'),
    ) as Record<string, string>;
    expect(checkOverrideLocale(committedEn, overrides)).toEqual([]);
  });

  it('keeps en-GB an override rather than a full translation', () => {
    // The British catalog carries only the strings that actually diverge;
    // everything else deliberately falls through to the source. A catalog that
    // had grown to cover every id would mean somebody translated en into en.
    const overrides = JSON.parse(
      readFileSync(join(srcDir, 'locales/en-GB.json'), 'utf8'),
    ) as Record<string, string>;
    const ids = Object.keys(overrides);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(Object.keys(committedEn).length);
    for (const id of ids) {
      expect(overrides[id]).not.toBe(committedEn[id]?.defaultMessage);
    }
  });
});

describe('the merged catalog a locale actually renders through', () => {
  const enGb = createAppIntl({
    locale: 'en-GB',
    messages: studioCatalogs['en-GB'],
  });

  it('renders an overridden string in its British form', () => {
    expect(
      enGb.formatMessage({
        id: 'studio.teamActivity.unrecognizedEvent',
        defaultMessage: 'Unrecognized event',
      }),
    ).toBe('Unrecognised event');
  });

  it('falls through to the source string where nothing diverges', () => {
    // Which is most of the catalog, and is the point of an override locale:
    // an id it does not carry is not a gap to fill.
    expect(
      enGb.formatMessage({
        id: 'studio.teamStudies.heading',
        defaultMessage: 'Studies',
      }),
    ).toBe('Studies');
  });

  it('carries the shared common.* catalog into the same merge', () => {
    // Merge order is common → shared packages → app. The common verbs have no
    // British divergences today, so this asserts they RESOLVE rather than that
    // they change: a merge that dropped the common layer would still return
    // the default message, so the id has to be one the app never defines.
    expect(enGb.formatMessage(commonMessages.retry)).toBe('Try again');
    expect(Object.keys(studioCatalogs['en-GB'] ?? {})).not.toContain(
      'common.retry',
    );
  });
});
