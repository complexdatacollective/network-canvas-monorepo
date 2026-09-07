// Reads only the committed catalog artifacts and re-runs extraction over the
// package's source — it never imports protocol-builder components, so it stays
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

import { protocolBuilderCatalogs } from '../catalogs';

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

describe('the package’s own protocolBuilder.* catalogs', () => {
  it('keeps src/locales/en.json fresh (regenerate with pnpm i18n:extract)', async () => {
    const extracted = await extractMessages(collectSourceFiles(srcDir));
    expect(checkCatalogFreshness(committedEn, extracted)).toEqual([]);
  }, 120_000);

  it('extracts something to guard', () => {
    expect(Object.keys(committedEn).length).toBeGreaterThan(0);
  });

  it('keeps every id under the protocolBuilder.* namespace', () => {
    for (const id of Object.keys(committedEn)) {
      expect(id).toMatch(/^protocolBuilder\./);
    }
  });

  it('leaves the shared common.* messages to @codaco/app-i18n', () => {
    // Components import `commonMessages` rather than redefining those verbs,
    // so no `common.*` id may be declared — or translated — here.
    const ids = [
      ...Object.keys(committedEn),
      ...Object.values(protocolBuilderCatalogs).flatMap((catalog) =>
        Object.keys(catalog),
      ),
    ];
    expect(ids.filter((id) => id.startsWith('common.'))).toEqual([]);
  });

  it('ships a catalog for every non-source ecosystem locale', () => {
    expect(Object.keys(protocolBuilderCatalogs).toSorted()).toEqual(
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
        `no protocolBuilder catalog file for ${locale}`,
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
      expect(issues, `protocolBuilder catalog issues for ${locale}`).toEqual(
        [],
      );
    }
  });
});

/**
 * The word families this package's copy spells differently on each side of the
 * Atlantic, American form first.
 *
 * The source locale is American English — a `defaultMessage` is what a
 * researcher reads wherever no catalog overrides it — and `en-GB.json` carries
 * the British forms, which is the same split `@codaco/fresco-ui` uses.
 *
 * Only families this package's copy actually contains are listed. A new one is
 * added when a new word arrives; the guards below are what make adding it
 * necessary rather than optional, because a British `defaultMessage` fails the
 * first and an un-overridden American one fails the third.
 *
 * `Anonymisation` is deliberately absent. It is not a spelling choice: the
 * researcher-facing name of that interface matches `StageType`'s own
 * `'Anonymisation'` literal, so the two are read together and neither moves.
 */
const AMERICAN_TO_BRITISH: ReadonlyMap<string, string> = new Map([
  ['color', 'colour'],
  ['colors', 'colours'],
  ['colored', 'coloured'],
  ['recognize', 'recognise'],
  ['recognizes', 'recognises'],
  ['recognized', 'recognised'],
  ['visualize', 'visualise'],
  ['visualizes', 'visualises'],
  ['visualized', 'visualised'],
  ['visualization', 'visualisation'],
  ['visualizations', 'visualisations'],
]);

const BRITISH_TO_AMERICAN: ReadonlyMap<string, string> = new Map(
  [...AMERICAN_TO_BRITISH].map(([american, british]) => [british, american]),
);

/**
 * Rewrites whole words through one of the tables above, keeping the case of
 * the first letter so a sentence-initial "Colour" survives the round trip.
 *
 * Whole words rather than substrings: "discolor" is not "color" with a prefix
 * a translator would want respelled, and matching inside words would rewrite
 * identifiers that happen to appear in copy.
 */
function respell(text: string, table: ReadonlyMap<string, string>): string {
  const alternatives = [...table.keys()].sort((a, b) => b.length - a.length);
  return text.replace(
    new RegExp(`\\b(?:${alternatives.join('|')})\\b`, 'gi'),
    (word) => {
      const replacement = table.get(word.toLowerCase()) ?? word;
      const head = word.charAt(0);
      return head === head.toUpperCase()
        ? `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`
        : replacement;
    },
  );
}

/**
 * Read from the committed file rather than through `protocolBuilderCatalogs`,
 * whose values are typed as pre-parsed ICU as well as source strings. An
 * override is compared against a `defaultMessage` here, so it has to be the
 * string a translator wrote.
 */
const enGb = JSON.parse(
  readFileSync(join(localesDir, 'en-GB.json'), 'utf8'),
) as Record<string, string>;

describe('the en-GB overrides and the American source they come from', () => {
  it('writes every defaultMessage in American English', () => {
    // The first half of the convention. A British default would be what a
    // researcher on en-US reads, and en-GB has no way to correct it back.
    const offenders = Object.entries(committedEn).flatMap(([id, message]) =>
      respell(message.defaultMessage, BRITISH_TO_AMERICAN) ===
      message.defaultMessage
        ? []
        : [`${id} — ${message.defaultMessage}`],
    );

    expect(offenders).toEqual([]);
  });

  it('overrides in en-GB only what the spelling changes, and changes nothing else', () => {
    // The second half. An override is the SAME sentence spelled British — so
    // respelling it back has to land exactly on the American default. That is
    // what stops en-GB drifting into a second, quietly different wording, and
    // it fails if either side is edited without the other.
    const offenders = Object.entries(enGb).flatMap(([id, british]) => {
      const american = committedEn[id]?.defaultMessage;
      if (american === undefined) return [`${id} — overrides no known id`];
      if (british === american) return [`${id} — override says nothing new`];
      return respell(british, BRITISH_TO_AMERICAN) === american
        ? []
        : [`${id} — override is not ${american}, respelled`];
    });

    expect(offenders).toEqual([]);
  });

  it('leaves no American spelling without its British override', () => {
    // Completeness, and the assertion that actually catches the common
    // mistake: Americanising a default and forgetting the en-GB half, which
    // silently ships American copy to British researchers.
    const offenders = Object.entries(committedEn).flatMap(([id, message]) =>
      respell(message.defaultMessage, AMERICAN_TO_BRITISH) !==
        message.defaultMessage && !(id in enGb)
        ? [`${id} — ${message.defaultMessage}`]
        : [],
    );

    expect(offenders).toEqual([]);
  });
});
