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
  'de',
  'es',
  'fr',
  'it',
  'nl',
  'pt-BR',
  'zh-Hans',
  'zh-Hant',
];

/**
 * Whether Network Canvas has its own wording in `locale` exactly. A protocol
 * whose default language it has none in holds that wording only as the
 * researcher writes it.
 */
export const hasSuppliedWording = (locale: LocaleTag): boolean => {
  const canonical = canonicalizeLocale(locale);
  return canonical !== undefined && SUPPLIED_LANGUAGES.includes(canonical);
};

/**
 * The entry of a table of text Network Canvas supplies, keyed by language,
 * for a protocol language, or `undefined` when it has none. Only the exact
 * language is read: text written into a protocol is recorded under that
 * language, so neither Mexican Spanish nor Catalan is given another
 * language's words, and no language is given English in place of its own.
 * A regional variant can have its base language added beside it instead
 * (see `suppliedBaseLanguage`), which the interview falls back to.
 */
export const suppliedTextFor = <Text>(
  table: Readonly<Record<string, Text>>,
  locale: LocaleTag,
): Text | undefined => {
  const canonical = canonicalizeLocale(locale);
  return canonical === undefined ? undefined : table[canonical];
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
  if (canonical === undefined || SUPPLIED_LANGUAGES.includes(canonical))
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
 * Whether a text Network Canvas supplies is still its own: the researcher has
 * not changed it in the protocol's default language. Where Network Canvas
 * writes nothing in that language, it is still its own while the researcher
 * has written nothing there either.
 */
export const isStillSupplied = (
  value: LocalizedString,
  supplied: SuppliedTextIn,
  defaultLocale: LocaleTag,
): boolean =>
  (Object.hasOwn(value, defaultLocale) ? value[defaultLocale] : undefined) ===
  supplied(defaultLocale);

/**
 * One text Network Canvas supplies, as it reads after a change to the
 * protocol's languages, for a text the researcher has not changed in the
 * default language. Each translation that is still Network Canvas's text for
 * its language becomes Network Canvas's text for the language as it now is,
 * or is removed where it writes none there; a translation the researcher
 * wrote moves with its language; and a language with no translation gains
 * Network Canvas's text.
 */
export const suppliedTextAfterLanguageChange = (
  value: LocalizedString,
  supplied: SuppliedTextIn,
  { after, renamed = {} }: LanguageChange,
): LocalizedString => {
  const next: Record<LocaleTag, string> = {};
  for (const [locale, text] of Object.entries(value)) {
    const target = renamed[locale] ?? locale;
    if (!after.locales.includes(target)) continue;
    if (text !== supplied(locale)) {
      next[target] = text;
      continue;
    }
    const replacement = supplied(target);
    if (replacement !== undefined) next[target] = replacement;
  }
  for (const locale of after.locales) {
    if (next[locale] !== undefined) continue;
    const text = supplied(locale);
    if (text !== undefined) next[locale] = text;
  }
  return next;
};
