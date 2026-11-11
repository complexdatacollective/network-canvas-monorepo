import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { MetadataFileSchema } from '~/app/types';

import { defaultLocale } from './locales';

/**
 * Translation bookkeeping for the documentation.
 *
 * A translated page sits beside its English page (`intro.es.mdx` beside
 * `intro.en.mdx`) and records, in a `translatedFrom` frontmatter field, the
 * git blob id of the English file it was translated from. Changing the English
 * page changes its blob id, so every translation of it is reported stale until
 * it is updated and re-stamped. The blob id is what `git hash-object` prints,
 * so `git diff <recorded id> <english file>` shows exactly what changed in the
 * English since the translation was made.
 *
 * Interface messages (`messages/<locale>.json`) are recorded the same way, in
 * `translation/sources/<locale>.json`: the English each message was translated
 * from. That record lives outside `messages/` because next-intl loads every
 * JSON file it finds there.
 *
 * A locale is checked for staleness as soon as any of its files exist. It is
 * checked for completeness (every page, message and navigation label present)
 * once it is published, by being listed in `locales`.
 */

export const TRANSLATED_FROM_FIELD = 'translatedFrom';

// The id git gives a file's content: `git hash-object <file>`.
export function gitBlobId(content: Buffer | string): string {
  const body = typeof content === 'string' ? Buffer.from(content) : content;
  return createHash('sha1')
    .update(`blob ${body.length}\0`)
    .update(body)
    .digest('hex');
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const TRANSLATED_FROM_LINE = new RegExp(
  `^${TRANSLATED_FROM_FIELD}:[ \\t]*['"]?([^'"\\s]*)['"]?[ \\t]*$`,
  'm',
);

// The English blob id a translated page records, or undefined if it has none.
export function readTranslatedFrom(content: string): string | undefined {
  const frontmatter = FRONTMATTER.exec(content)?.[1];
  if (frontmatter === undefined) return undefined;
  const value = TRANSLATED_FROM_LINE.exec(frontmatter)?.[1];
  return value === '' ? undefined : value;
}

// The page with its `translatedFrom` field set, added to the end of its
// frontmatter if it had none. Nothing else in the file changes.
export function writeTranslatedFrom(content: string, blobId: string): string {
  const match = FRONTMATTER.exec(content);
  const line = `${TRANSLATED_FROM_FIELD}: ${blobId}`;
  if (!match) return `---\n${line}\n---\n\n${content}`;

  const frontmatter = match[1] ?? '';
  const updated = TRANSLATED_FROM_LINE.test(frontmatter)
    ? frontmatter.replace(TRANSLATED_FROM_LINE, line)
    : `${frontmatter}\n${line}`;
  const start = match[0].indexOf(frontmatter);
  return (
    content.slice(0, start) +
    updated +
    content.slice(start + frontmatter.length)
  );
}

type PageFile = { path: string; locale: string };

/** A documentation page: its English file and each translation of it. */
export type DocPage = {
  /** Path relative to the docs folder, without locale or extension. */
  key: string;
  english?: string;
  translations: PageFile[];
};

// `name.<locale>.md` or `name.<locale>.mdx`.
const PAGE_FILE =
  /^(?<name>[^.]+)\.(?<locale>[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)\.mdx?$/;

export function listPages(docsDir: string): DocPage[] {
  const pages = new Map<string, DocPage>();

  for (const entry of readdirSync(docsDir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const groups = PAGE_FILE.exec(entry.name)?.groups;
    if (!groups?.name || !groups.locale) continue;

    const path = join(entry.parentPath, entry.name);
    const key = join(relative(docsDir, entry.parentPath), groups.name);
    const page = pages.get(key) ?? { key, translations: [] };

    if (groups.locale === defaultLocale) page.english = path;
    else page.translations.push({ path, locale: groups.locale });

    pages.set(key, page);
  }

  return [...pages.values()].toSorted((a, b) => a.key.localeCompare(b.key));
}

type MessageTree = { [key: string]: string | MessageTree };

function flatten(tree: MessageTree, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') flat.set(id, value);
    else for (const [k, v] of flatten(value, id)) flat.set(k, v);
  }
  return flat;
}

function readJson(path: string): MessageTree {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- message catalogs are nested string records; a malformed file fails the checks below
  return JSON.parse(readFileSync(path, 'utf-8')) as MessageTree;
}

export type TranslationPaths = {
  /** The app folder: `apps/documentation`. */
  root: string;
  /** Locales the site offers to readers (`locales`). */
  published: readonly string[];
};

export type TranslationProblem = {
  locale: string;
  file: string;
  problem: string;
};

/** Every locale that has at least one translated file, plus the published ones. */
export function translationLocales({
  root,
  published,
}: TranslationPaths): string[] {
  const found = new Set(published.filter((l) => l !== defaultLocale));
  for (const page of listPages(join(root, 'docs')))
    for (const t of page.translations) found.add(t.locale);
  const messagesDir = join(root, 'messages');
  for (const name of readdirSync(messagesDir)) {
    const locale = /^(.+)\.json$/.exec(name)?.[1];
    if (locale && locale !== defaultLocale) found.add(locale);
  }
  return [...found].toSorted();
}

export const messageSourcesPath = (root: string, locale: string) =>
  join(root, 'translation', 'sources', `${locale}.json`);

/**
 * Everything that keeps the translations from matching the English: stale or
 * unrecorded translations of any locale, and missing ones for published
 * locales.
 */
export function findTranslationProblems(
  paths: TranslationPaths,
): TranslationProblem[] {
  const { root, published } = paths;
  const docsDir = join(root, 'docs');
  const problems: TranslationProblem[] = [];
  const pages = listPages(docsDir);
  const rel = (path: string) => relative(root, path);

  for (const locale of translationLocales(paths)) {
    const isPublished = published.includes(locale);
    const add = (file: string, problem: string) =>
      problems.push({ locale, file: rel(file), problem });

    // Pages.
    for (const page of pages) {
      const translation = page.translations.find((t) => t.locale === locale);

      if (!page.english) {
        if (translation) add(translation.path, 'has no English page beside it');
        continue;
      }

      if (!translation) {
        if (isPublished) add(page.english, `has no ${locale} translation`);
        continue;
      }

      const recorded = readTranslatedFrom(
        readFileSync(translation.path, 'utf-8'),
      );
      const current = gitBlobId(readFileSync(page.english));
      if (!recorded) {
        add(
          translation.path,
          `does not record which English it was translated from (${TRANSLATED_FROM_FIELD})`,
        );
      } else if (recorded !== current) {
        add(
          translation.path,
          `is stale: the English changed since it was translated. See what changed with \`git diff ${recorded} ${rel(page.english)}\``,
        );
      }
    }

    // Navigation labels and section index pages.
    if (isPublished) {
      for (const entry of readdirSync(docsDir, {
        recursive: true,
        withFileTypes: true,
      })) {
        if (!entry.isFile() || entry.name !== 'metadata.json') continue;
        const file = join(entry.parentPath, entry.name);
        const metadata = MetadataFileSchema.parse(
          JSON.parse(readFileSync(file, 'utf-8')),
        );
        for (const field of ['localeLabels', 'localeIndexFiles'] as const) {
          const values = metadata[field];
          if (values?.[defaultLocale] !== undefined && !values[locale])
            add(file, `has no ${locale} entry in ${field}`);
        }
      }
    }

    // Interface messages.
    const english = flatten(readJson(join(root, 'messages', 'en.json')));
    const messagesFile = join(root, 'messages', `${locale}.json`);
    const sourcesFile = messageSourcesPath(root, locale);

    if (!existsSync(messagesFile)) {
      if (isPublished) add(messagesFile, 'is missing');
      continue;
    }

    const translated = flatten(readJson(messagesFile));
    const sources = existsSync(sourcesFile)
      ? flatten(readJson(sourcesFile))
      : new Map<string, string>();

    for (const [id, text] of english) {
      if (!translated.has(id)) {
        if (isPublished) add(messagesFile, `has no message ${id}`);
        continue;
      }
      const source = sources.get(id);
      if (source === undefined)
        add(
          sourcesFile,
          `does not record which English ${id} was translated from`,
        );
      else if (source !== text)
        add(
          messagesFile,
          `${id} is stale: translated from "${source}", the English now says "${text}"`,
        );
    }
    for (const id of translated.keys())
      if (!english.has(id))
        add(messagesFile, `has message ${id}, which English no longer has`);
  }

  return problems;
}
