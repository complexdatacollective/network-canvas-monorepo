import {
  matchLocalePreference,
  normalizeLocalePreferences,
} from './localePreferences.ts';
import {
  canonicalizeLocale,
  compareLocaleTags,
  type LocaleTag,
  type LocalizationDeclaration,
} from './localeTag.ts';

type LocaleKeyedText = Readonly<Record<LocaleTag, string>>;

type MatchedBy = 'selected' | 'requested' | 'default' | 'any';

export type ResolvedLocalizedString = Readonly<{
  text: string;
  /** The language of the translation shown. */
  locale: LocaleTag;
  /** The language being shown: the first requested locale. */
  selectedLocale: LocaleTag;
  /** False only when the translation shown is the selected language's own. */
  usedFallback: boolean;
  /**
   * Which step found the translation shown: the selected language or its
   * closest related language; another requested language or its relative;
   * the protocol's default language or its relative; or, when none of those
   * has the text, any declared language that has it.
   */
  matchedBy: MatchedBy;
}>;

type Translation = Readonly<{ locale: LocaleTag; text: string }>;

type Resolved = Translation & Readonly<{ matchedBy: MatchedBy }>;

type Step = Readonly<{
  matchedBy: MatchedBy;
  preferences: readonly LocaleTag[];
}>;

/** The first translation a step's preferences reach, matched one at a time. */
const findInSteps = (
  available: readonly Translation[],
  steps: readonly Step[],
): Resolved | undefined => {
  const tags = available.map(({ locale }) => locale);
  for (const { matchedBy, preferences } of steps) {
    for (const preference of preferences) {
      const matched = matchLocalePreference(preference, tags);
      const translation = available.find(({ locale }) => locale === matched);
      if (translation !== undefined) return { ...translation, matchedBy };
    }
  }
  return undefined;
};

/**
 * The translation of `value` shown to a participant reading in
 * `requestedLocales[0]`. Without one, the text falls back to the rest of
 * `requestedLocales` (the other languages their browser lists, in preference
 * order), then the protocol's default language, then the first declared
 * language, by tag, that has it.
 *
 * Each step takes the language itself or else its closest related language
 * that has the text. Preferences are matched one at a time, so a later exact
 * match never beats an earlier related one; malformed ones are skipped. The
 * order the protocol declares its languages in plays no part.
 */
export function resolveLocalizedString(
  value: LocaleKeyedText,
  localization: LocalizationDeclaration,
  requestedLocales: readonly [string, ...string[]],
): ResolvedLocalizedString {
  const available = localization.locales
    .flatMap((locale): Translation[] => {
      const text = Object.hasOwn(value, locale) ? value[locale] : undefined;
      return text === undefined ? [] : [{ locale, text }];
    })
    .toSorted((a, b) => compareLocaleTags(a.locale, b.locale));
  const [first] = available;
  if (first === undefined) {
    throw new Error(
      `resolveLocalizedString: the value has no translation for any declared locale (${localization.locales.join(', ')}). Validate the protocol before resolving its strings.`,
    );
  }

  const [requestedSelection, ...otherRequested] = requestedLocales;
  const selected = canonicalizeLocale(requestedSelection);
  const resolved: Resolved = findInSteps(available, [
    {
      matchedBy: 'selected',
      preferences: selected === undefined ? [] : [selected],
    },
    {
      matchedBy: 'requested',
      preferences: normalizeLocalePreferences(otherRequested),
    },
    { matchedBy: 'default', preferences: [localization.defaultLocale] },
  ]) ?? { ...first, matchedBy: 'any' };

  const selectedLocale = selected ?? requestedSelection;
  return {
    text: resolved.text,
    locale: resolved.locale,
    selectedLocale,
    usedFallback: resolved.locale !== selectedLocale,
    matchedBy: resolved.matchedBy,
  };
}
