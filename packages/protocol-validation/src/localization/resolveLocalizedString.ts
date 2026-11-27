import {
  matchLocalePreferences,
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

/** The translation the first step whose preferences fit one reaches. */
const findInSteps = (
  available: readonly Translation[],
  steps: readonly Step[],
): Resolved | undefined => {
  const tags = available.map(({ locale }) => locale);
  for (const { matchedBy, preferences } of steps) {
    const matched = matchLocalePreferences(preferences, tags);
    const translation = available.find(({ locale }) => locale === matched);
    if (translation !== undefined) return { ...translation, matchedBy };
  }
  return undefined;
};

/** The translations of `value` in the protocol's languages, by tag. */
const declaredTranslations = (
  value: LocaleKeyedText,
  localization: LocalizationDeclaration,
): Translation[] =>
  localization.locales
    .flatMap((locale): Translation[] => {
      const text = Object.hasOwn(value, locale) ? value[locale] : undefined;
      return text === undefined ? [] : [{ locale, text }];
    })
    .toSorted((a, b) => compareLocaleTags(a.locale, b.locale));

/** The first step: the selected language, or its closest related language. */
const selectedStep = (selected: LocaleTag | undefined): Step => ({
  matchedBy: 'selected',
  preferences: selected === undefined ? [] : [selected],
});

/**
 * The translation of `value` shown to a participant reading in
 * `requestedLocales[0]`. Without one, the text falls back to the rest of
 * `requestedLocales` (the other languages their browser lists, in preference
 * order), then the protocol's default language, then the first declared
 * language, by tag, that has it.
 *
 * Each step takes the language itself or else its closest related language
 * that has the text, best fit over the step's preferences (see
 * `matchLocalePreferences`); malformed ones are skipped. The order the
 * protocol declares its languages in plays no part.
 */
export function resolveLocalizedString(
  value: LocaleKeyedText,
  localization: LocalizationDeclaration,
  requestedLocales: readonly [string, ...string[]],
): ResolvedLocalizedString {
  const available = declaredTranslations(value, localization);
  const [first] = available;
  if (first === undefined) {
    throw new Error(
      `resolveLocalizedString: the value has no translation for any declared locale (${localization.locales.join(', ')}). Validate the protocol before resolving its strings.`,
    );
  }

  const [requestedSelection, ...otherRequested] = requestedLocales;
  const selected = canonicalizeLocale(requestedSelection);
  const resolved: Resolved = findInSteps(available, [
    selectedStep(selected),
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

/**
 * Texts shown one after another, each translated on its own, as they read in
 * each language any of them has a translation in: for that language, each
 * text is the translation `resolveLocalizedString` shows a participant
 * reading in it, falling back as it does where the text has none. A string
 * is one text in every language and names none. A language no text has is
 * left out, since text joined from these falls back there as each one would.
 *
 * Every language a text holds counts as one of the protocol's, so text that
 * holds only languages the protocol does not declare, which validation
 * reports, still reads as something; text holding no translation at all
 * reads as empty.
 */
export function resolveTextsInEachLocale(
  texts: readonly (string | LocaleKeyedText)[],
  defaultLocale: LocaleTag,
): Record<LocaleTag, string[]> {
  const locales = new Set<LocaleTag>(
    texts.flatMap((text) =>
      typeof text === 'string' ? [] : Object.keys(text),
    ),
  );
  return Object.fromEntries(
    [...locales].map((locale) => [
      locale,
      texts.map((text) => {
        if (typeof text === 'string') return text;
        const held = Object.keys(text);
        if (held.length === 0) return '';
        return resolveLocalizedString(text, { defaultLocale, locales: held }, [
          locale,
        ]).text;
      }),
    ]),
  );
}

/**
 * The declared languages whose translation of `value` a participant reading
 * in `locale` may be shown (`resolveLocalizedString`), whatever languages
 * their browser lists after it. Those languages are not known when the
 * protocol is written.
 *
 * The first step, the selected language or its closest related language,
 * does not depend on the browser: when it finds a translation, that is the
 * only one that can be shown. When it finds none, the browser may list any
 * declared language that has the text first, so each of them may be shown.
 * Empty when no declared language has the text.
 */
export function localesThatMayBeShown(
  value: LocaleKeyedText,
  localization: LocalizationDeclaration,
  locale: string,
): ReadonlySet<LocaleTag> {
  const available = declaredTranslations(value, localization);
  const selected = findInSteps(available, [
    selectedStep(canonicalizeLocale(locale)),
  ]);
  return new Set(
    selected === undefined
      ? available.map((translation) => translation.locale)
      : [selected.locale],
  );
}
