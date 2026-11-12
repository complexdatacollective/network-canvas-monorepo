import { toScriptMatchingTag } from '@codaco/shared-consts';

import {
  canonicalizeLocale,
  type LocaleTag,
  type LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import type { LocalizedString } from './localized-string.ts';

/**
 * The languages Network Canvas writes its own wording in: the interface text,
 * the stages' supplied text, the finish screens and the Family Pedigree's
 * option labels each cover all of them.
 */
export const SUPPLIED_LANGUAGES: readonly LocaleTag[] = [
  'en',
  'ar',
  'de',
  'es',
  'fr',
  'it',
  'nl',
  'pt-BR',
  'zh-Hans',
  'zh-Hant',
];

/** A tag with its likely script and region filled in, by CLDR's data. */
const withLikelySubtags = (tag: LocaleTag): string | undefined => {
  try {
    return new Intl.Locale(tag).maximize().toString();
  } catch {
    return undefined;
  }
};

const SUPPLIED_LIKELY: ReadonlyMap<string, LocaleTag> = new Map(
  SUPPLIED_LANGUAGES.flatMap((language) => {
    const likely = withLikelySubtags(language);
    return likely === undefined ? [] : [[likely, language] as const];
  }),
);

/**
 * The language Network Canvas has its own wording in that `locale` is, or
 * `undefined` when it is none of them. Each of those languages is written
 * for the region CLDR takes it to mean when none is given: its English is
 * American English and its Spanish is Spain's, so `en-US` is `en`, `es-ES`
 * is `es`, `zh-TW` is `zh-Hant` and `pt` is `pt-BR`. Another region of one
 * (`en-GB`, `es-MX`) is not: it can have that language added beside it
 * instead (see `suppliedBaseLanguage`).
 */
export const suppliedLanguageOf = (
  locale: LocaleTag,
): LocaleTag | undefined => {
  const canonical = canonicalizeLocale(locale);
  if (canonical === undefined) return undefined;
  if (SUPPLIED_LANGUAGES.includes(canonical)) return canonical;
  const likely = withLikelySubtags(canonical);
  const supplied =
    likely === undefined ? undefined : SUPPLIED_LIKELY.get(likely);
  // CLDR fills in a language too (`und` is taken to be English): only the
  // script and region may be filled in.
  return supplied !== undefined &&
    new Intl.Locale(supplied).language === new Intl.Locale(canonical).language
    ? supplied
    : undefined;
};

/**
 * Whether Network Canvas has its own wording in `locale` (see
 * `suppliedLanguageOf`). A protocol whose default language it has none in
 * holds that wording only as the researcher writes it.
 */
export const hasSuppliedWording = (locale: LocaleTag): boolean =>
  suppliedLanguageOf(locale) !== undefined;

/**
 * The entry of a table of text Network Canvas supplies, keyed by language,
 * for a protocol language, or `undefined` when it has none. Only the same
 * language is read (`suppliedLanguageOf`, or an exact key the table has
 * beyond those languages): text written into a protocol is recorded under
 * that language, so neither Mexican Spanish nor Catalan is given another
 * language's words, and no language is given English in place of its own.
 * A regional variant can have its base language added beside it instead
 * (see `suppliedBaseLanguage`), which the interview falls back to.
 */
export const suppliedTextFor = <Text>(
  table: Readonly<Record<string, Text>>,
  locale: LocaleTag,
): Text | undefined => {
  const canonical = canonicalizeLocale(locale);
  if (canonical === undefined) return undefined;
  if (Object.hasOwn(table, canonical)) return table[canonical];
  const supplied = suppliedLanguageOf(canonical);
  return supplied === undefined ? undefined : table[supplied];
};

/**
 * The supplied language a regional variant belongs to, which a researcher
 * adding the variant may also add, so that the variant falls back to
 * Network Canvas's wording in it for any text it lacks: the tag's shorter
 * forms (RFC 4647 lookup), so `es-MX` and `en-GB` belong to `es` and `en`,
 * and for Chinese its script, so `zh-TW` belongs to `zh-Hant`. `undefined`
 * for a supplied language itself, or one with no such base. A language that
 * is only close to a supplied one (Galician to Spanish) has none: falling
 * back to it would show the participant another language.
 */
export const suppliedBaseLanguage = (
  locale: LocaleTag,
): LocaleTag | undefined => {
  const canonical = canonicalizeLocale(locale);
  if (canonical === undefined || hasSuppliedWording(canonical))
    return undefined;
  for (const tag of [canonical, toScriptMatchingTag(canonical)]) {
    const subtags = tag.split('-');
    for (let length = subtags.length; length > 0; length -= 1) {
      const candidate = subtags.slice(0, length).join('-');
      if (SUPPLIED_LANGUAGES.includes(candidate)) return candidate;
    }
  }
  return undefined;
};

/**
 * A change to a protocol's languages: the declaration before and after it,
 * and, when a language's tag was corrected, the tag each language now has.
 * A language missing from `after` was removed.
 */
export type LanguageChange = Readonly<{
  before: LocalizationDeclaration;
  after: LocalizationDeclaration;
  renamed?: Readonly<Record<LocaleTag, LocaleTag>>;
}>;

/**
 * The text Network Canvas writes in a protocol language, or `undefined` when
 * it writes none there.
 */
export type SuppliedTextIn = (locale: LocaleTag) => string | undefined;

/**
 * One text Network Canvas supplies, as it reads after a change to the
 * protocol's languages. Each translation moves with its language, and one in
 * a language that was removed goes with it. A translation that is Network
 * Canvas's text for a language whose tag was corrected becomes its text for
 * the corrected language, or is removed where it writes none there; any other
 * translation keeps the text it has, so a translation is never overwritten.
 * Then each language the protocol did not have before, whether added or the
 * corrected tag of one, gains Network Canvas's text where it still has none
 * and Network Canvas writes one there, even where the researcher has
 * reworded the text in another language. Languages the protocol already had
 * gain nothing, so removing a language or choosing another default changes
 * nothing but the removed translations.
 */
export const suppliedTextAfterLanguageChange = (
  value: LocalizedString,
  supplied: SuppliedTextIn,
  { before, after, renamed = {} }: LanguageChange,
): LocalizedString => {
  const next: Record<LocaleTag, string> = {};
  for (const [locale, text] of Object.entries(value)) {
    const target = renamed[locale] ?? locale;
    if (!after.locales.includes(target)) continue;
    if (target === locale || text !== supplied(locale)) {
      next[target] = text;
      continue;
    }
    const replacement = supplied(target);
    if (replacement !== undefined) next[target] = replacement;
  }
  for (const locale of after.locales) {
    if (before.locales.includes(locale) || Object.hasOwn(next, locale))
      continue;
    const text = supplied(locale);
    if (text !== undefined) next[locale] = text;
  }
  return next;
};
