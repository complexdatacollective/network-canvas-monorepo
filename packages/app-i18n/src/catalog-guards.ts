import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

import { runtimeCatalogLocale } from './compileCatalog.ts';

/** One extracted message: English source text plus translator context. */
export type ExtractedMessage = Readonly<{
  defaultMessage: string;
  description: string;
}>;

export type ExtractedCatalog = Readonly<Record<string, ExtractedMessage>>;

/**
 * A copy of a record safe to index by a message id.
 *
 * Ids reach this module out of catalog JSON that no schema has validated — a
 * translator's file, a merge, a hand edit — and every name on `Object.prototype`
 * is a legal JSON key. On an ordinary object `record['constructor']` is neither
 * a message nor `undefined`, so an `=== undefined` guard fails open and a
 * value-typed use throws on something that is not a string. Copying onto a null
 * prototype makes every lookup below see own properties only, which is why
 * those lookups can stay written as plain indexing.
 *
 * `__proto__` is handled by the same copy: on a null-prototype target there is
 * no inherited setter, so it lands as an ordinary property rather than
 * silently reassigning the object's prototype.
 */
const lookupTable = <T>(
  record: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> => {
  const table = Object.create(null) as Record<string, T>;
  for (const [id, value] of Object.entries(record)) table[id] = value;
  return table;
};

const MESSAGE_ID_PATTERN = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/;
const EXCLUDED_FILE_PATTERN =
  /(\.d\.ts$|\.test\.|\.spec\.|\.stories\.|__tests__|__mocks__)/;

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
  const merged = Object.create(null) as Record<string, Record<string, unknown>>;
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

  const catalog = Object.create(null) as Record<string, ExtractedMessage>;
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
  committedCatalog: ExtractedCatalog,
  extracted: ExtractedCatalog,
): string[] {
  const committed = lookupTable(committedCatalog);
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

/**
 * The English each translation in a locale catalog was made from: id → the
 * `defaultMessage` as it read at the time. Committed beside the catalog as
 * `<tag>.source.json` and rewritten by the package's `pnpm i18n:stamp`.
 *
 * This is what makes changing an English sentence invalidate its translations.
 * Without it a reworded English string leaves every translation saying the old
 * thing with every other guard still green — the catalog is complete, the ICU
 * arguments still match, nothing is blank, and the copy on screen is wrong.
 */
export type TranslationSources = Readonly<Record<string, string>>;

/** Quoted on one line, so a long message stays greppable in test output. */
const quote = (message: string): string =>
  JSON.stringify(message.replaceAll('\n', ' '));

const checkEntry = (
  source: ExtractedCatalog,
  sources: TranslationSources,
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
  const translatedFrom = sources[id];
  if (translatedFrom === undefined) {
    issues.push(`no recorded English source: ${id}`);
  } else if (translatedFrom !== sourceEntry.defaultMessage) {
    // Both sentences and the translation, because the reader's next decision
    // is whether the English edit changed the meaning: most do not — a
    // capitalisation or a comma needs a re-stamp, not a re-translation — and
    // that judgement is only possible with all three in front of them.
    issues.push(
      `translated from older English: ${id} — was ${quote(translatedFrom)}, now ${quote(sourceEntry.defaultMessage)}, translation says ${quote(translation)}`,
    );
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
 * Provenance entries for ids this catalog does not translate. Reported so a
 * sidecar cannot be stamped ahead of the translation it vouches for, and does
 * not accumulate records of ids that have since been deleted.
 */
const checkUnusedSources = (
  catalog: Readonly<Record<string, string>>,
  sources: TranslationSources,
  issues: string[],
): void => {
  for (const id of Object.keys(sources)) {
    if (catalog[id] === undefined) {
      issues.push(`recorded English source for an untranslated id: ${id}`);
    }
  }
};

/**
 * A full locale must translate every extracted id, with token parity, no
 * blanks, and a recorded English source that still matches today's English.
 * Issues (empty = pass).
 *
 * `sources` is required rather than optional: a catalog whose provenance is
 * merely *allowed* is one an adopting package can forget to pass, and the
 * whole point of this guard is that a silently stale translation is
 * indistinguishable from a correct one by every other check here.
 */
export function checkFullLocale(
  sourceCatalog: ExtractedCatalog,
  translations: Readonly<Record<string, string>>,
  recordedSources: TranslationSources,
): string[] {
  const source = lookupTable(sourceCatalog);
  const catalog = lookupTable(translations);
  const sources = lookupTable(recordedSources);
  const issues: string[] = [];
  for (const id of Object.keys(source)) {
    if (catalog[id] === undefined) issues.push(`untranslated id: ${id}`);
  }
  for (const [id, translation] of Object.entries(catalog)) {
    checkEntry(source, sources, id, translation, issues);
  }
  checkUnusedSources(catalog, sources, issues);
  return issues;
}

/**
 * An override locale (en-GB over en) is a subset: only known ids, with token
 * parity, no blanks, and a recorded English source that still matches today's
 * English; missing ids deliberately fall through to the base. Issues (empty =
 * pass).
 *
 * An override drifts the same way a full locale does, and more quietly: it
 * exists precisely because its wording differs from the base, so a reader
 * comparing the two cannot tell a deliberate divergence from a stale one.
 */
export function checkOverrideLocale(
  sourceCatalog: ExtractedCatalog,
  overrideCatalog: Readonly<Record<string, string>>,
  recordedSources: TranslationSources,
): string[] {
  const source = lookupTable(sourceCatalog);
  const overrides = lookupTable(overrideCatalog);
  const sources = lookupTable(recordedSources);
  const issues: string[] = [];
  for (const [id, translation] of Object.entries(overrides)) {
    checkEntry(source, sources, id, translation, issues);
  }
  checkUnusedSources(overrides, sources, issues);
  return issues;
}

/**
 * Where a locale's provenance record lives: beside the catalog it vouches for,
 * holding a copy of every English sentence that catalog was translated from.
 *
 * Read from disk here and by the stamping script rather than imported. The
 * name is what keeps that copy out of bundles: a locale tag cannot contain a
 * dot, so `runtimeCatalogLocale` declines these files and no build step that
 * scans a locales directory can mistake one for a catalog.
 */
export function translationSourcePath(
  localesDir: string,
  locale: string,
): string {
  return join(localesDir, `${locale}.source.json`);
}

const isSources = (value: unknown): value is TranslationSources =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === 'string');

/**
 * The English a locale's translations were made from. A file that does not
 * exist yet reads as no records at all rather than throwing, so a catalog
 * adopting this guard fails by naming every unrecorded id — which is the list
 * `pnpm i18n:stamp` is about to write — instead of on a missing path.
 */
export function readTranslationSources(
  localesDir: string,
  locale: string,
): TranslationSources {
  const path = translationSourcePath(localesDir, locale);
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isSources(parsed)) {
    throw new Error(`${path} is not a map of message id to English source`);
  }
  return lookupTable(parsed);
}

/** One id whose recorded English was written or rewritten by a stamp. */
export type StampedTranslation = Readonly<{
  id: string;
  /** The English previously recorded; undefined when nothing was recorded. */
  previous: string | undefined;
  current: string;
  translation: string;
}>;

export type LocaleStamp = Readonly<{
  locale: string;
  recorded: readonly StampedTranslation[];
  dropped: readonly string[];
}>;

/**
 * Rewrite every locale's provenance record in `localesDir` from the committed
 * `en.json`, and report what moved.
 *
 * This is a baseline-acceptance tool, so it is built to be read rather than
 * merely run: the caller prints each id with the English it used to be
 * translated from and the English it is now stamped against, and that pair is
 * the reviewable record of what was accepted. A translated id whose English
 * has been deleted is left unstamped, so it keeps failing as an unknown id
 * rather than being quietly blessed.
 */
export function stampTranslationSources(localesDir: string): LocaleStamp[] {
  const english = lookupTable(
    JSON.parse(
      readFileSync(join(localesDir, 'en.json'), 'utf8'),
    ) as ExtractedCatalog,
  );

  const stamps: LocaleStamp[] = [];
  for (const fileName of readdirSync(localesDir).toSorted()) {
    const locale = runtimeCatalogLocale(fileName);
    if (locale === undefined) continue;

    const catalog = lookupTable(
      JSON.parse(readFileSync(join(localesDir, fileName), 'utf8')) as Record<
        string,
        string
      >,
    );
    const previous = readTranslationSources(localesDir, locale);

    const next = Object.create(null) as Record<string, string>;
    const recorded: StampedTranslation[] = [];
    for (const id of Object.keys(catalog).toSorted()) {
      const current = english[id]?.defaultMessage;
      const translation = catalog[id];
      if (current === undefined || translation === undefined) continue;
      next[id] = current;
      if (previous[id] !== current) {
        recorded.push({ id, previous: previous[id], current, translation });
      }
    }

    writeFileSync(
      translationSourcePath(localesDir, locale),
      `${JSON.stringify(next, null, 2)}\n`,
    );
    stamps.push({
      locale,
      recorded,
      dropped: Object.keys(previous).filter((id) => next[id] === undefined),
    });
  }
  return stamps;
}

/**
 * What a stamp accepted, as prose for whoever ran it and for whoever reviews
 * the commit. Every rewritten record prints both English sentences, because
 * re-stamping an id whose English changed meaning — rather than re-translating
 * it — is precisely the mistake this guard exists to catch, and the pair is
 * the only thing that distinguishes the two cases.
 */
export function formatStampReport(stamps: readonly LocaleStamp[]): string {
  const lines: string[] = [];
  for (const { locale, recorded, dropped } of stamps) {
    const newly = recorded.filter(({ previous }) => previous === undefined);
    const rewritten = recorded.length - newly.length;
    lines.push(
      `${locale}: ${newly.length} newly recorded, ${rewritten} re-stamped, ${dropped.length} dropped`,
    );
    for (const { id, previous, current, translation } of recorded) {
      // Only a rewritten record has a pair to weigh; a newly recorded one is
      // counted above and has nothing it could have drifted from.
      if (previous === undefined) continue;
      lines.push(`  ${id}`);
      lines.push(`    English was : ${quote(previous)}`);
      lines.push(`    English now : ${quote(current)}`);
      lines.push(`    translation : ${quote(translation)}`);
    }
    for (const id of dropped) lines.push(`  dropped ${id}`);
  }
  return lines.join('\n');
}
