import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { extract } from '@formatjs/cli-lib';
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser';

/** One extracted message: English source text plus translator context. */
export type ExtractedMessage = Readonly<{
  defaultMessage: string;
  description: string;
}>;

export type ExtractedCatalog = Readonly<Record<string, ExtractedMessage>>;

const MESSAGE_ID_PATTERN = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/;
const EXCLUDED_FILE_PATTERN =
  /(\.d\.ts$|\.test\.|\.stories\.|__tests__|__mocks__)/;

/**
 * Message-bearing source files under a directory: .ts/.tsx, excluding tests,
 * stories, and declarations. Deterministically sorted so extraction output
 * is stable.
 */
export function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(
      (entry) =>
        SOURCE_FILE_PATTERN.test(entry) && !EXCLUDED_FILE_PATTERN.test(entry),
    )
    .map((entry) => join(dir, entry))
    .toSorted();
}

/**
 * Programmatic FormatJS extraction with the package's conventions enforced:
 * explicit dot-namespaced ids and a mandatory description on every message.
 * Throws on duplicate ids (extractor) and on convention violations, so both
 * the regenerating script and the freshness guard fail loudly.
 */
export async function extractMessages(
  files: readonly string[],
): Promise<ExtractedCatalog> {
  const raw = await extract([...files], {
    extractSourceLocation: false,
    throws: true,
  });
  const parsed = JSON.parse(raw) as Record<
    string,
    { defaultMessage?: string; description?: string }
  >;
  const catalog: Record<string, ExtractedMessage> = {};
  for (const [id, entry] of Object.entries(parsed).toSorted(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    if (!MESSAGE_ID_PATTERN.test(id)) {
      throw new Error(
        `extractMessages: "${id}" is not an explicit dot-namespaced id`,
      );
    }
    if (entry.defaultMessage === undefined || entry.defaultMessage === '') {
      throw new Error(`extractMessages: "${id}" has no defaultMessage`);
    }
    if (entry.description === undefined || entry.description === '') {
      throw new Error(
        `extractMessages: "${id}" has no description for translators`,
      );
    }
    catalog[id] = {
      defaultMessage: entry.defaultMessage,
      description: entry.description,
    };
  }
  return catalog;
}

const collectTokens = (
  elements: readonly MessageFormatElement[],
  into: Set<string>,
): void => {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        into.add(`{${element.value}}`);
        break;
      case TYPE.select:
      case TYPE.plural:
        into.add(`{${element.value}}`);
        for (const option of Object.values(element.options)) {
          collectTokens(option.value, into);
        }
        break;
      case TYPE.tag:
        into.add(`<${element.value}>`);
        collectTokens(element.children, into);
        break;
      default:
        break;
    }
  }
};

/**
 * The placeholder and tag tokens of an ICU message, from its parsed AST —
 * the token-parity contract a translation must preserve. Throws on
 * unparseable ICU.
 */
export function messageTokens(message: string): readonly string[] {
  const tokens = new Set<string>();
  collectTokens(parse(message), tokens);
  return [...tokens].toSorted();
}

const tokensEqual = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((token, index) => token === b[index]);

/** Issues (empty = pass) for the committed en.json vs a fresh extraction. */
export function checkCatalogFreshness(
  committed: ExtractedCatalog,
  extracted: ExtractedCatalog,
): string[] {
  const issues: string[] = [];
  const committedIds = new Set(Object.keys(committed));
  for (const [id, entry] of Object.entries(extracted)) {
    const existing = committed[id];
    if (existing === undefined) {
      issues.push(`missing from committed catalog: ${id}`);
    } else if (
      existing.defaultMessage !== entry.defaultMessage ||
      existing.description !== entry.description
    ) {
      issues.push(`stale committed entry: ${id}`);
    }
    committedIds.delete(id);
  }
  for (const id of committedIds) {
    issues.push(`committed entry no longer in source: ${id}`);
  }
  return issues;
}

const checkEntry = (
  source: ExtractedCatalog,
  id: string,
  translation: string,
  issues: string[],
): void => {
  const sourceEntry = source[id];
  if (sourceEntry === undefined) {
    issues.push(`unknown id: ${id}`);
    return;
  }
  if (translation.trim() === '') {
    issues.push(`blank translation: ${id}`);
    return;
  }
  try {
    if (
      !tokensEqual(
        messageTokens(sourceEntry.defaultMessage),
        messageTokens(translation),
      )
    ) {
      issues.push(`token mismatch: ${id}`);
    }
  } catch {
    issues.push(`invalid ICU syntax: ${id}`);
  }
};

/**
 * A full locale must translate every extracted id, with token parity and no
 * blanks. Issues (empty = pass).
 */
export function checkFullLocale(
  source: ExtractedCatalog,
  catalog: Readonly<Record<string, string>>,
): string[] {
  const issues: string[] = [];
  for (const id of Object.keys(source)) {
    if (catalog[id] === undefined) issues.push(`untranslated id: ${id}`);
  }
  for (const [id, translation] of Object.entries(catalog)) {
    checkEntry(source, id, translation, issues);
  }
  return issues;
}

/**
 * An override locale (en-GB over en) is a subset: only known ids, with token
 * parity and no blanks; missing ids deliberately fall through to the base.
 * Issues (empty = pass).
 */
export function checkOverrideLocale(
  source: ExtractedCatalog,
  overrides: Readonly<Record<string, string>>,
): string[] {
  const issues: string[] = [];
  for (const [id, translation] of Object.entries(overrides)) {
    checkEntry(source, id, translation, issues);
  }
  return issues;
}
