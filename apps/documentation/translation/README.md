# Translating the documentation

English is the source. Every other language is a translation of it, and once a
language is published every change to the English must update it too. A test
(`lib/__tests__/translations.test.ts`) enforces this in CI.

## Where translations live

- **Pages**: beside the English page, with the locale in the name:
  `docs/get-started/glossary.en.mdx` is translated as
  `docs/get-started/glossary.es.mdx`.
- **Navigation labels and section index pages**: the `localeLabels` and
  `localeIndexFiles` entries in each `docs/**/metadata.json`.
- **Interface text** (header, footer, search, buttons): `messages/<locale>.json`.
- **Glossaries**: `translation/glossary.<locale>.md`, the terms each language
  uses, taken from the apps' own translations.

## What the guard checks

Each translated page records which English it was translated from, as the git
blob id of the English file, in a `translatedFrom` frontmatter field. Each
message catalog's English is recorded in `translation/sources/<locale>.json`.

- **Any language with translated files**: a translation whose English has
  changed since it was made is reported as stale, and so is a translation that
  records no English or whose English page no longer exists. This applies
  while a language is still being translated, so finished pages do not
  silently fall behind.
- **Published languages** (listed in `lib/i18n/locales.ts`): every page,
  navigation label, section index page and message must also be translated.

A stale page's report includes a `git diff <recorded id> <english page>`
command that shows exactly what changed in the English.

## Changing the English

1. Edit the English page or message.
2. Run the documentation tests. Each stale translation is listed.
3. Update each translation to match, and check it as described below. An
   editorial English change (a typo, punctuation) may need no change to the
   translation, but it still has to be read and re-stamped.
4. Stamp what you checked:

   ```sh
   pnpm --filter @codaco/documentation translations:stamp docs/get-started/glossary.es.mdx messages/es.json
   ```

   Stamping records that a translation matches today's English. It does not
   say the translation is right, so never stamp a translation you have not
   checked.

## Checking a translation

Translations are machine-made and checked by blind reverse translation, using
the repository's `verifying-translations` skill: a fresh agent translates the
text back into English without seeing the original, and a second fresh agent
compares the two and reports problems, until a round finds none. Human review
by native speakers follows as it becomes available.

## Adding a language

1. Pick the language by reader numbers (PostHog browser languages on the
   documentation site).
2. Write `translation/glossary.<locale>.md` from the apps' catalogs.
3. Translate and stamp the pages, labels and messages, section by section.
   Until the locale is published, the files are checked for staleness but not
   shown to readers.
4. Add the locale to `lib/i18n/locales.ts`. The guard then requires it to be
   complete.

Screenshots stay in English.
