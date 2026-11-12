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
import { ADDED_TEXT } from '../../wording/addedText';
import { isAddedTextId } from '../../wording/addedTextIds';
import { SUPPLIED_WORDING } from '../../wording/suppliedWording';

const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));
const committedEn = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as ExtractedCatalog;

/** The locale the messages are written in, so its catalogue is no translation. */
const SOURCE_LOCALE = 'en';

/** Where the catalogues of the wording a protocol may reword are kept. */
const wordingDir = join(localesDir, 'wording');

const readCatalogue = (locale: string) =>
  JSON.parse(
    readFileSync(join(wordingDir, `${locale}.json`), 'utf8'),
  ) as Record<string, string>;

/** The catalogues committed, by language. */
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

  // A file directly inside `locales` is one a build may take for an app's own
  // interface (`@codaco/app-i18n`'s convention): a translation is compiled
  // into parsed messages. The wording a protocol may reword has to stay text,
  // so its catalogues are one folder down.
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
    const expected = [...SUPPLIED_LANGUAGES, ...variants].toSorted();
    expect(committedLocales.toSorted()).toEqual(expected);
    expect(Object.keys(SUPPLIED_WORDING).toSorted()).toEqual(expected);
  });

  // The interview reads the English from a catalogue of its own, which
  // `pnpm --filter @codaco/interview i18n:extract` writes from the messages.
  // A difference here means that command has not been run since an edit.
  it('words every such text in English as its message is written, and nothing else', () => {
    expect(readCatalogue(SOURCE_LOCALE)).toEqual(
      Object.fromEntries(
        Object.entries(wordingEnglish).map(([id, { defaultMessage }]) => [
          id,
          defaultMessage,
        ]),
      ),
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

  it('serves each catalogue as it is committed', () => {
    expect(committedLocales).toContain(SOURCE_LOCALE);
    for (const locale of committedLocales) {
      expect(SUPPLIED_WORDING[locale]).toEqual(readCatalogue(locale));
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

// Text a correction adds within a schema version is the interview's own: no
// protocol of that version can hold it, so it is shown as Network Canvas
// words it, and it must be worded in every language Network Canvas supplies.
// Its messages are those whose id begins `interview.added.` (see
// `wording/addedTextIds.ts`). None exists until a correction needs one.
describe('the catalogues of the text corrections have added', () => {
  const addedDir = join(localesDir, 'added');

  const readAdded = (locale: string) =>
    JSON.parse(
      readFileSync(join(addedDir, `${locale}.json`), 'utf8'),
    ) as Record<string, string>;

  const addedLocales = readdirSync(addedDir)
    .filter((file) => file.endsWith('.json') && !file.endsWith('.source.json'))
    .map((file) => file.replace(/\.json$/, ''));

  /** The English of the messages corrections have added: what is translated. */
  const addedEnglish: ExtractedCatalog = Object.fromEntries(
    Object.entries(committedEn).filter(([id]) => isAddedTextId(id)),
  );

  it('has a catalogue for each supplied language, and no other', () => {
    const expected = SUPPLIED_LANGUAGES.toSorted();
    expect(addedLocales.toSorted()).toEqual(expected);
    expect(Object.keys(ADDED_TEXT).toSorted()).toEqual(expected);
  });

  // A text the schema names is one a protocol may hold, and is read from the
  // protocol first. A message cannot be both.
  it('holds no text a protocol may hold', () => {
    expect(wordingIds.filter(isAddedTextId)).toEqual([]);
  });

  // `pnpm --filter @codaco/interview i18n:extract` writes the English.
  it('words every such text in English as its message is written, and nothing else', () => {
    expect(readAdded(SOURCE_LOCALE)).toEqual(
      Object.fromEntries(
        Object.entries(addedEnglish).map(([id, { defaultMessage }]) => [
          id,
          defaultMessage,
        ]),
      ),
    );
  });

  it.each(SUPPLIED_LANGUAGES.filter((locale) => locale !== SOURCE_LOCALE))(
    'translates every such text into %s and nothing else, from today’s English',
    (locale) => {
      expect(
        checkFullLocale(
          addedEnglish,
          readAdded(locale),
          readTranslationSources(addedDir, locale),
        ),
      ).toEqual([]);
    },
  );

  it('serves each catalogue as it is committed', () => {
    for (const locale of addedLocales) {
      expect(ADDED_TEXT[locale]).toEqual(readAdded(locale));
    }
  });
});
