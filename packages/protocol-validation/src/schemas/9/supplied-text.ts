import { toScriptMatchingTag } from '@codaco/shared-consts';

import {
  canonicalizeLocale,
  type LocaleTag,
} from '../../localization/localeTag.ts';

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
