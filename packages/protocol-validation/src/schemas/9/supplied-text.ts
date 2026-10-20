import { toScriptMatchingTag } from '@codaco/shared-consts';

import {
  canonicalizeLocale,
  type LocaleTag,
  type LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import type { LocalizedString } from './localized-string.ts';

/**
 * The tag itself, then each shorter tag left by removing its last subtag
 * (RFC 4647 lookup), so `en-US` reaches `en` and `zh-Hant-TW` reaches
 * `zh-Hant`. Chinese is also tried by script, so `zh-TW` reaches `zh-Hant`.
 */
const lookupCandidates = (locale: LocaleTag): readonly string[] => {
  const candidates: string[] = [];
  for (const tag of [locale, toScriptMatchingTag(locale)]) {
    const subtags = tag.split('-');
    for (let length = subtags.length; length > 0; length -= 1) {
      candidates.push(subtags.slice(0, length).join('-'));
    }
  }
  return candidates;
};

/**
 * The entry of a table of text Network Canvas supplies, keyed by language,
 * for a protocol language, or `undefined` when it has none. Deliberately
 * stricter than the interview's best-fit matching: text written into a
 * protocol must be in the language it is recorded under, so Catalan is not
 * given Spanish, nor European Portuguese the Brazilian text. A regional
 * variant is served by its language, so British English reads the `en` text.
 */
export const suppliedTextFor = <Text>(
  table: Readonly<Record<string, Text>>,
  locale: LocaleTag,
): Text | undefined => {
  const canonical = canonicalizeLocale(locale);
  if (canonical === undefined) return undefined;
  for (const candidate of lookupCandidates(canonical)) {
    const text = table[candidate];
    if (text !== undefined) return text;
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
    if (text !== supplied(locale, locale === before.defaultLocale)) {
      next[target] = text;
      continue;
    }
    const replacement = supplied(target, target === after.defaultLocale);
    if (replacement !== undefined) next[target] = replacement;
  }
  for (const locale of after.locales) {
    if (next[locale] !== undefined) continue;
    const text = supplied(locale, locale === after.defaultLocale);
    if (text !== undefined) next[locale] = text;
  }
  return next;
};
