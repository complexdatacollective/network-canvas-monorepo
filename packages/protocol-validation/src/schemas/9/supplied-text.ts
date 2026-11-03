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
 * The entry of a table of text Network Canvas supplies, keyed by language,
 * for a protocol language, or `undefined` when it has none. Only the exact
 * language is read: text written into a protocol is recorded under that
 * language, so neither British English nor Catalan is given another
 * language's words unasked (see `suppliedBaseLanguage`).
 */
export const suppliedTextFor = <Text>(
  table: Readonly<Record<string, Text>>,
  locale: LocaleTag,
): Text | undefined => {
  const canonical = canonicalizeLocale(locale);
  return canonical === undefined ? undefined : table[canonical];
};

/**
 * The supplied language a regional variant can start from, which the
 * researcher may choose to have its wording copied in and then adapted: the
 * tag's shorter forms (RFC 4647 lookup), so `es-MX` and `en-GB` start from
 * `es` and `en`, and for Chinese its script, so `zh-TW` starts from `zh-Hant`.
 * `undefined` for a supplied language itself, or one with no such base.
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
 * Languages the researcher chose to start from Network Canvas's wording in
 * another language (see `suppliedBaseLanguage`), keyed by the language that
 * starts from it, as a protocol records them (`localization.startFrom`).
 */
export type StartFrom = NonNullable<LocalizationDeclaration['startFrom']>;

/**
 * The language whose supplied wording Network Canvas writes in a protocol
 * language: the language it starts from, when the researcher chose one, else
 * the language itself.
 */
export const suppliedLanguageOf = (
  localization: LocalizationDeclaration,
  locale: LocaleTag,
): LocaleTag => localization.startFrom?.[locale] ?? locale;

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
 * The text Network Canvas writes in a protocol language, which may depend on
 * whether that language is the default, or `undefined` when it writes none.
 */
export type SuppliedTextIn = (
  locale: LocaleTag,
  isDefault: boolean,
) => string | undefined;

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
  { before, after, renamed = {} }: LanguageChange,
): LocalizedString => {
  const next: Record<LocaleTag, string> = {};
  for (const [locale, text] of Object.entries(value)) {
    const target = renamed[locale] ?? locale;
    if (!after.locales.includes(target)) continue;
    if (
      text !==
      supplied(
        suppliedLanguageOf(before, locale),
        locale === before.defaultLocale,
      )
    ) {
      next[target] = text;
      continue;
    }
    const replacement = supplied(
      suppliedLanguageOf(after, target),
      target === after.defaultLocale,
    );
    if (replacement !== undefined) next[target] = replacement;
  }
  for (const locale of after.locales) {
    if (next[locale] !== undefined) continue;
    const text = supplied(
      suppliedLanguageOf(after, locale),
      locale === after.defaultLocale,
    );
    if (text !== undefined) next[locale] = text;
  }
  return next;
};
