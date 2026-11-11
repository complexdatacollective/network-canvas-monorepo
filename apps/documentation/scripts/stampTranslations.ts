#!/usr/bin/env tsx
/**
 * Records that a translation matches today's English. Run it only after the
 * translation has been checked against the English it now claims to match
 * (see translation/README.md); stamping says nothing about whether a
 * translation is right.
 *
 *   pnpm --filter @codaco/documentation translations:stamp <file>...
 *
 * Each file is a translated page (`docs/**\/<name>.<locale>.mdx`), whose
 * `translatedFrom` is set to its English page's current git blob id; a
 * message catalog (`messages/<locale>.json`), whose record in
 * `translation/sources/<locale>.json` is set to today's English for every
 * message the catalog has; or a folder's `metadata.json`, whose English
 * navigation label is recorded in `translation/sources/<locale>.labels.json`
 * for every locale that has a translated label.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MetadataFileSchema } from '~/app/types';
import { defaultLocale } from '~/lib/i18n/locales';
import {
  gitBlobId,
  labelSourcesPath,
  messageSourcesPath,
  readLabelSources,
  readTranslatedFrom,
  writeTranslatedFrom,
} from '~/lib/i18n/translations';

type Tree = { [key: string]: string | Tree };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readTree(path: string): Tree {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- message catalogs are nested string records
  return JSON.parse(readFileSync(path, 'utf-8')) as Tree;
}

// The English for every message the translation has, in the same shape.
function sourcesFor(english: Tree, translated: Tree): Tree {
  const out: Tree = {};
  for (const [key, value] of Object.entries(translated)) {
    const source = english[key];
    if (typeof value === 'string' && typeof source === 'string')
      out[key] = source;
    else if (typeof value === 'object' && typeof source === 'object')
      out[key] = sourcesFor(source, value);
  }
  return out;
}

function stampPage(file: string) {
  const match = /^(.+)\.([^.]+)\.(mdx?)$/.exec(basename(file));
  if (!match || match[2] === defaultLocale)
    throw new Error(`${file} is not a translated page`);
  const english = join(
    dirname(file),
    `${match[1]}.${defaultLocale}.${match[3]}`,
  );
  const blobId = gitBlobId(readFileSync(english));
  const content = readFileSync(file, 'utf-8');
  const previous = readTranslatedFrom(content);
  writeFileSync(file, writeTranslatedFrom(content, blobId));
  // oxlint-disable-next-line no-console -- the report is the script's output
  console.log(
    `${relative(root, file)}: ${previous ?? '(none)'} -> ${blobId} (${relative(root, english)})`,
  );
}

function stampMessages(file: string) {
  const locale = basename(file, '.json');
  const english = readTree(join(root, 'messages', `${defaultLocale}.json`));
  const sourcesFile = messageSourcesPath(root, locale);
  mkdirSync(dirname(sourcesFile), { recursive: true });
  writeFileSync(
    sourcesFile,
    `${JSON.stringify(sourcesFor(english, readTree(file)), null, 2)}\n`,
  );
  // oxlint-disable-next-line no-console -- the report is the script's output
  console.log(`${relative(root, sourcesFile)}: recorded today's English`);
}

function stampLabels(file: string) {
  const { localeLabels = {} } = MetadataFileSchema.parse(
    JSON.parse(readFileSync(file, 'utf-8')),
  );
  const english = localeLabels[defaultLocale];
  if (english === undefined)
    throw new Error(`${file} has no ${defaultLocale} entry in localeLabels`);
  const key = relative(root, file);
  for (const locale of Object.keys(localeLabels)) {
    if (locale === defaultLocale) continue;
    const sourcesFile = labelSourcesPath(root, locale);
    const sources = { ...readLabelSources(root, locale), [key]: english };
    const sorted = Object.fromEntries(
      Object.entries(sources).toSorted(([a], [b]) => a.localeCompare(b)),
    );
    mkdirSync(dirname(sourcesFile), { recursive: true });
    writeFileSync(sourcesFile, `${JSON.stringify(sorted, null, 2)}\n`);
    // oxlint-disable-next-line no-console -- the report is the script's output
    console.log(`${relative(root, sourcesFile)}: ${key} -> "${english}"`);
  }
}

const files = process.argv.slice(2).map((f) => resolve(f));
if (files.length === 0) {
  // oxlint-disable-next-line no-console -- usage
  console.error('Name the translated pages or message catalogs to stamp.');
  process.exit(1);
}

for (const file of files) {
  if (relative(join(root, 'messages'), file) === basename(file))
    stampMessages(file);
  else if (basename(file) === 'metadata.json') stampLabels(file);
  else stampPage(file);
}
