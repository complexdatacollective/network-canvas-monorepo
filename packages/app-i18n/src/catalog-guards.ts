import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { extract } from '@formatjs/cli-lib';
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import type {
  DateTimeSkeleton,
  MessageFormatElement,
  NumberSkeleton,
  PluralElement,
  SelectElement,
} from '@formatjs/icu-messageformat-parser';

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
 * explicit dot-namespaced ids, a mandatory prose description on every message,
 * and an id declared in only one place. Throws on any of those, so both the
 * regenerating script and the freshness guard fail loudly.
 *
 * Duplicate ids are counted as the extractor walks the source, not read back
 * off its output, because its output cannot show them. Two descriptors
 * sharing an id are coalesced into one entry: an identical pair merges
 * silently, and a *conflicting* pair does not throw either — the extractor
 * logs `[WARN] Duplicate message id` and the later one wins, so one call site
 * renders the other's copy and the catalog carries no trace of the message it
 * replaced. `onMsgExtracted` fires per occurrence, before that coalescing, so
 * it sees the pair the returned map has already lost.
 */
export async function extractMessages(
  files: readonly string[],
): Promise<ExtractedCatalog> {
  // Typed as JSON rather than as ExtractedMessage: the extractor writes back
  // whatever shape the descriptor used, so the narrowing below is what makes
  // the declared types true rather than merely asserted.
  //
  // Each file counts its own occurrences, so this stays deterministic while
  // the files extract concurrently; the cross-file check below runs after,
  // over the settled results, and names the two files in input order.
  const perFile = await Promise.all(
    files.map(async (file) => {
      const seen = new Set<string>();
      const raw = await extract([file], {
        extractSourceLocation: false,
        throws: true,
        onMsgExtracted: (_path, messages) => {
          for (const { id } of messages) {
            if (id === undefined) continue;
            if (seen.has(id)) {
              throw new Error(
                `extractMessages: "${id}" is declared twice in ${file}`,
              );
            }
            seen.add(id);
          }
        },
      });
      return [
        file,
        JSON.parse(raw) as Record<string, Record<string, unknown>>,
      ] as const;
    }),
  );

  const declaredIn = new Map<string, string>();
  const merged: Record<string, Record<string, unknown>> = {};
  for (const [file, extracted] of perFile) {
    for (const [id, entry] of Object.entries(extracted)) {
      const first = declaredIn.get(id);
      if (first !== undefined) {
        throw new Error(
          `extractMessages: "${id}" is declared in both ${first} and ${file}`,
        );
      }
      declaredIn.set(id, file);
      merged[id] = entry;
    }
  }

  const catalog: Record<string, ExtractedMessage> = {};
  for (const [id, entry] of Object.entries(merged).toSorted(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    if (!MESSAGE_ID_PATTERN.test(id)) {
      throw new Error(
        `extractMessages: "${id}" is not an explicit dot-namespaced id`,
      );
    }
    const { defaultMessage, description } = entry;
    // Trimmed, matching how a translation is checked further down: a lone
    // space is not copy, and accepting one puts a blank string in front of a
    // reader with every guard still green.
    if (typeof defaultMessage !== 'string' || defaultMessage.trim() === '') {
      throw new Error(`extractMessages: "${id}" has no defaultMessage`);
    }
    if (
      description === undefined ||
      (typeof description === 'string' && description.trim() === '')
    ) {
      throw new Error(
        `extractMessages: "${id}" has no description for translators`,
      );
    }
    // FormatJS also accepts a structured description. This package does not:
    // a description is committed to en.json and handed to a translator as
    // prose, and an object there compares by reference on the next freshness
    // run — so extraction would emit a catalog its own guard could never
    // accept, with no way to tell from the failure why.
    if (typeof description !== 'string') {
      throw new Error(
        `extractMessages: "${id}" has a non-string description; write it as prose for translators`,
      );
    }
    catalog[id] = { defaultMessage, description };
  }
  return catalog;
}

/**
 * A style as written, canonical enough to compare two messages by. Skeletons
 * are compared on their parsed options rather than their token order, so
 * `::currency/GBP group-off` and `::group-off currency/GBP` — one formatting
 * written two ways — do not read as a divergence.
 */
const styleSignature = (
  style: string | NumberSkeleton | DateTimeSkeleton | null | undefined,
): string => {
  if (style === null || style === undefined) return '';
  if (typeof style === 'string') return style;
  return Object.entries(style.parsedOptions)
    .map(([option, value]) => `${option}=${String(value)}`)
    .toSorted()
    .join(' ');
};

const formatToken = (
  value: string,
  kind: string,
  style: string | NumberSkeleton | DateTimeSkeleton | null | undefined,
): string => {
  const written = styleSignature(style);
  return written === ''
    ? `{${value}, ${kind}}`
    : `{${value}, ${kind}, ${written}}`;
};

/**
 * The arms of a select or plural a translation is obliged to keep.
 *
 * A select's arms are named by the author and matched against a runtime value,
 * so dropping `male` and `female` does not fail — ICU falls through to `other`
 * and both render the generic wording. Exact `=0`-style plural arms behave the
 * same way: without one, zero renders through `other` as "0 items". CLDR
 * plural categories are the exception this list exists to make, because `few`
 * and `many` belong to the target language rather than to the message.
 */
const requiredArms = (element: SelectElement | PluralElement): string[] => {
  const arms = Object.keys(element.options);
  return (
    element.type === TYPE.select
      ? arms
      : arms.filter((arm) => arm.startsWith('='))
  ).toSorted();
};

const collectTokens = (
  elements: readonly MessageFormatElement[],
  into: Set<string>,
): void => {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
        into.add(`{${element.value}}`);
        break;
      case TYPE.number:
        into.add(formatToken(element.value, 'number', element.style));
        break;
      case TYPE.date:
        into.add(formatToken(element.value, 'date', element.style));
        break;
      case TYPE.time:
        into.add(formatToken(element.value, 'time', element.style));
        break;
      case TYPE.select:
        into.add(
          `{${element.value}, select, ${requiredArms(element).join('|')}}`,
        );
        for (const option of Object.values(element.options)) {
          collectTokens(option.value, into);
        }
        break;
      case TYPE.plural: {
        const exact = requiredArms(element);
        into.add(
          `{${element.value}, ${
            element.pluralType === 'ordinal' ? 'selectordinal' : 'plural'
          }, offset:${element.offset}${exact.length === 0 ? '' : `, ${exact.join('|')}`}}`,
        );
        for (const option of Object.values(element.options)) {
          collectTokens(option.value, into);
        }
        break;
      }
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
 *
 * A token carries how the argument is formatted, not just its name: `{price}`,
 * `{price, number}` and `{price, number, ::currency/GBP}` are three different
 * tokens, because a translation that drops the `number` or its skeleton keeps
 * rendering — just as an unlocalized bare value, which is exactly the silent
 * regression this guard exists to catch.
 *
 * Arms are pinned only where losing one is silent: a select's arms and a
 * plural's exact `=0`-style arms, both of which fall through to `other` rather
 * than failing. CLDR plural categories are free — a locale that needs `few`
 * and `many` is translating correctly — and `#` is not required to survive,
 * since an arm may legitimately be worded without repeating the number.
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
