# Translating the documentation

English is the source. Every other language is a translation of it. The
published languages are English and Spanish, so every change to the English
must update the Spanish in the same pull request. A test
(`lib/__tests__/translations.test.ts`) enforces this in CI.

## Where translations live

- **Pages**: beside the English page, with the locale in the name:
  `docs/get-started/glossary.en.mdx` is translated as
  `docs/get-started/glossary.es.mdx`.
- **Navigation labels and section index pages**: the `localeLabels` and
  `localeIndexFiles` entries in each `docs/**/metadata.json`.
- **Interface text** (header, footer, search, buttons, and the text of the
  custom components pages use, such as the interface summary box and the
  compatibility and workflow tables): `messages/<locale>.json`. Interface
  names in `InterfaceNames` must match the names Architect uses in that
  language (`protocolBuilder.interface.*` in Architect's catalog).
- **The language switcher's own text**: the shared packages' catalogs
  (`@codaco/app-i18n` and `@codaco/fresco-ui`), loaded by
  `lib/i18n/appLocales.ts`.
- **Text written into a page's components**: some components take text from
  the page, such as an interface summary's `requires` list. Write it in the
  page's language. The interface summary picks each requirement's icon from
  keywords in every language (`REQUIREMENT_KEYWORDS` in
  `components/customComponents/InterfaceSummary.tsx`), so a new language adds
  its keywords there.
- **Terminology**: the shared glossary for each language in
  [`packages/app-i18n/glossary/`](../../../packages/app-i18n/glossary/), which
  the apps and the website use too. Translate with it.

## What the guard checks

Each translated page records which English it was translated from, as the git
blob id of the English file, in a `translatedFrom` frontmatter field. Each
message catalog's English is recorded in `translation/sources/<locale>.json`,
and each translated navigation label's English in
`translation/sources/<locale>.labels.json`. A section's `localeIndexFiles`
entry must name the translation of its English index page, and that page must
exist.

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

1. Edit the English page, message or navigation label.
2. Run the documentation tests. Each stale translation is listed.
3. Update each translation to match, and check it as described below. An
   editorial English change (a typo, punctuation) may need no change to the
   translation, but it still has to be read and re-stamped.
4. Stamp what you checked:

   ```sh
   pnpm --filter @codaco/documentation translations:stamp docs/get-started/glossary.es.mdx messages/es.json docs/get-started/metadata.json
   ```

   Stamping a `metadata.json` records its English label for every language
   that translates it.

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
2. Make sure the language has a verified glossary in
   `packages/app-i18n/glossary/<locale>.md`.
3. Translate and stamp the pages, labels and messages, section by section.
   Until the locale is published, the files are checked for staleness but not
   shown to readers.
4. Publish the language:
   - add it to `lib/i18n/locales.ts` (the guard then requires it to be
     complete) and to the sidebar's starting data in `lib/writeSidebarJson.ts`;
   - add it to `documentationAppLocales` and
     `siteLocaleByDocumentationLocale` in `lib/i18n/appLocales.ts`, so the
     footer switcher offers it and the shared navigation and language cookie
     name it the way the websites do;
   - add its messages to the 404 page (`components/NotFound/NotFoundContent.tsx`),
     which is one static page for every language and picks its language from
     the address in the browser;
   - add its requirement keywords to the interface summary (see above);
   - extend the edge function test in `netlify/edge-functions/__tests__/`;
   - ask whoever manages the Algolia crawler to crawl the new language's
     pages (see "Search in each language" in the documentation README).

Screenshots stay in English.
