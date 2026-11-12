import { readdirSync, readFileSync } from 'node:fs';
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
  readTranslationSources,
} from '@codaco/app-i18n/catalog-guards';
import {
  SUPPLIED_LANGUAGES,
  SUPPLIED_TEXTS,
} from '@codaco/protocol-validation';

import { interfaceTextMessages } from '../../i18n/interfaceTextMessages';
import { stageWordingMessages } from '../../i18n/stageWordingMessages';
import { SUPPLIED_WORDING } from '../../wording/suppliedWording';

const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));
const committedEn = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as ExtractedCatalog;

/** The locale the messages are written in, so it has no catalogue of translations. */
const SOURCE_LOCALE = 'en';

/** Where the translations of the wording a protocol may reword are kept. */
const wordingDir = join(localesDir, 'wording');

const readCatalogue = (locale: string) =>
  JSON.parse(
    readFileSync(join(wordingDir, `${locale}.json`), 'utf8'),
  ) as Record<string, string>;

/** The catalogues of translations committed, by language. */
const committedLocales = readdirSync(wordingDir)
  .filter((file) => file.endsWith('.json') && !file.endsWith('.source.json'))
  .map((file) => file.replace(/\.json$/, ''));

/** The message that words each text a protocol may reword. */
const wordingIds = [...new Set(SUPPLIED_TEXTS.map(({ wording }) => wording))];

/** The English of the messages a protocol may reword: what is translated. */
const wordingEnglish: ExtractedCatalog = Object.fromEntries(
  wordingIds.flatMap((id) => {
    const message = committedEn[id];
    return message === undefined ? [] : [[id, message]];
  }),
);

/** The texts also worded in a regional variant, by variant. */
const variantIds = (variant: string) =>
  [
    ...new Set(
      SUPPLIED_TEXTS.filter(({ variants }) => variants?.includes(variant)).map(
        ({ wording }) => wording,
      ),
    ),
  ].toSorted();

const variants = [
  ...new Set(SUPPLIED_TEXTS.flatMap(({ variants: also }) => also ?? [])),
];

describe('the interview package built-in messages', () => {
  it('keeps the English extraction fresh, with unique explicit IDs and translator descriptions', async () => {
    const extracted = await extractMessages(
      collectSourceFiles(dirname(localesDir)),
    );
    expect(checkCatalogFreshness(committedEn, extracted)).toEqual([]);
  }, 120_000);

  // A catalogue directly inside `locales` is one every build compiles into
  // parsed messages (`@codaco/app-i18n`'s convention). The wording a protocol
  // may reword has to stay text, so its translations are one folder down.
  it('keeps no translation where a build would compile it', () => {
    expect(
      readdirSync(localesDir).filter((file) => file.endsWith('.json')),
    ).toEqual(['en.json']);
  });

  it('owns only interview.* messages and leaves universal verbs to common.*', () => {
    expect(Object.keys(committedEn).length).toBeGreaterThan(0);
    for (const id of Object.keys(committedEn)) {
      expect(id).toMatch(/^interview\./);
    }
  });
});

// The interview's messages are written in English. Those a protocol may
// reword are Network Canvas's wording for a schema 9 protocol, so they are
// translated into every language the schema says Network Canvas supplies.
// The rest is text only screen readers read, which stays English.
describe('the catalogues of the wording Network Canvas supplies', () => {
  it('has a message, in English, for every text the schema says it words', () => {
    expect(wordingIds.length).toBeGreaterThan(200);
    expect(wordingIds.filter((id) => committedEn[id] === undefined)).toEqual(
      [],
    );
  });

  it('has a catalogue for each supplied language and each variant a text is worded in, and no other', () => {
    expect(committedLocales.toSorted()).toEqual(
      [
        ...SUPPLIED_LANGUAGES.filter((locale) => locale !== SOURCE_LOCALE),
        ...variants,
      ].toSorted(),
    );
    expect(Object.keys(SUPPLIED_WORDING).toSorted()).toEqual(
      [...SUPPLIED_LANGUAGES, ...variants].toSorted(),
    );
  });

  it.each(SUPPLIED_LANGUAGES.filter((locale) => locale !== SOURCE_LOCALE))(
    'translates every such text into %s and nothing else, from today’s English',
    (locale) => {
      expect(
        checkFullLocale(
          wordingEnglish,
          readCatalogue(locale),
          readTranslationSources(wordingDir, locale),
        ),
      ).toEqual([]);
    },
  );

  it.each(variants)(
    'words in %s exactly the texts the schema says have that variant',
    (variant) => {
      const catalogue = readCatalogue(variant);
      expect(Object.keys(catalogue).toSorted()).toEqual(variantIds(variant));
      expect(
        checkOverrideLocale(
          wordingEnglish,
          catalogue,
          readTranslationSources(wordingDir, variant),
        ),
      ).toEqual([]);
    },
  );

  it('serves each catalogue as it is committed, and English as it is written', () => {
    for (const locale of committedLocales) {
      expect(SUPPLIED_WORDING[locale]).toEqual(readCatalogue(locale));
    }
    for (const id of wordingIds) {
      expect(SUPPLIED_WORDING.en?.[id]).toBe(committedEn[id]?.defaultMessage);
    }
  });

  it('declares no wording message the schema does not name', () => {
    const declared = [
      ...Object.values(interfaceTextMessages),
      ...Object.values(stageWordingMessages),
    ].map(({ id }) => id);
    expect(declared.filter((id) => !wordingIds.includes(id))).toEqual([]);
  });
});
