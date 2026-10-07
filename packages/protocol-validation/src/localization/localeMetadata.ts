import { LANGUAGE_NAMES } from './languageNames.ts';
import { canonicalizeLocale, type LocaleTag } from './localeTag.ts';

export type LocaleMetadata = Readonly<{
  locale: LocaleTag;
  label: string;
  direction: 'ltr' | 'rtl';
}>;

type TextDirection = LocaleMetadata['direction'];

// The ES2024 lib does not declare the Intl Locale Info API. Runtimes expose
// either the `getTextInfo()` method or the older `textInfo` accessor.
type LocaleWithTextInfo = Intl.Locale &
  Readonly<{
    getTextInfo?: () => unknown;
    textInfo?: unknown;
  }>;

// Unicode scripts written right to left that are in current use.
const RIGHT_TO_LEFT_SCRIPTS: ReadonlySet<string> = new Set([
  'Adlm',
  'Arab',
  'Hebr',
  'Mand',
  'Mend',
  'Nkoo',
  'Rohg',
  'Samr',
  'Syrc',
  'Thaa',
  'Yezi',
]);

const readDirection = (textInfo: unknown): TextDirection | undefined => {
  if (
    typeof textInfo !== 'object' ||
    textInfo === null ||
    !('direction' in textInfo)
  ) {
    return undefined;
  }
  return textInfo.direction === 'rtl' || textInfo.direction === 'ltr'
    ? textInfo.direction
    : undefined;
};

const getDirection = (locale: LocaleTag): TextDirection => {
  const intlLocale: LocaleWithTextInfo = new Intl.Locale(locale);
  const reported =
    (typeof intlLocale.getTextInfo === 'function'
      ? readDirection(intlLocale.getTextInfo())
      : undefined) ?? readDirection(intlLocale.textInfo);
  if (reported !== undefined) return reported;

  const { script } = intlLocale.maximize();
  return script !== undefined && RIGHT_TO_LEFT_SCRIPTS.has(script)
    ? 'rtl'
    : 'ltr';
};

// A runtime without `Intl.DisplayNames`, or one that rejects the tag, has no
// name to offer.
const readRuntime = <T>(read: () => T): T | undefined => {
  if (typeof Intl.DisplayNames !== 'function') return undefined;
  try {
    return read();
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      return undefined;
    }
    throw error;
  }
};

const runtimeSupports = (displayLocale: string): boolean =>
  readRuntime(
    () => Intl.DisplayNames.supportedLocalesOf([displayLocale]).length > 0,
  ) ?? false;

// `fallback: 'none'` makes an unknown name come back undefined rather than as
// the bare tag. A display locale the runtime lacks is answered in the
// runtime's own default locale.
const runtimeName = (
  locale: LocaleTag,
  displayLocale: string,
): string | undefined =>
  readRuntime(() =>
    new Intl.DisplayNames([displayLocale], {
      type: 'language',
      fallback: 'none',
    }).of(locale),
  );

const getLabel = (locale: LocaleTag, displayLocale: string): string => {
  const fromRuntime = runtimeName(locale, displayLocale);
  if (fromRuntime !== undefined && runtimeSupports(displayLocale)) {
    return fromRuntime;
  }

  const known = Object.hasOwn(LANGUAGE_NAMES, locale)
    ? LANGUAGE_NAMES[locale]
    : undefined;
  if (known !== undefined) {
    const [englishName, autonym] = known;
    return displayLocale === locale ? (autonym ?? englishName) : englishName;
  }

  return fromRuntime ?? locale;
};

/**
 * Presentation data for a locale. The label defaults to the locale's own name
 * for itself (its autonym) and varies between JavaScript runtimes, so it must
 * never be persisted, validated, or hashed.
 *
 * A label comes from the runtime's `Intl.DisplayNames` when the runtime has
 * data for the display locale and a name for the language. Chromium ships
 * trimmed ICU data and lacks many names, so otherwise the label is the
 * language's autonym (when the display locale is the language itself) or its
 * English name from a built-in CLDR table, then the runtime's name in its own
 * default locale, then the tag.
 */
export function getLocaleMetadata(
  locale: string,
  displayLocale?: string,
): LocaleMetadata {
  const canonical = canonicalizeLocale(locale);
  if (canonical === undefined) {
    throw new RangeError(
      `getLocaleMetadata: "${locale}" is not a well-formed BCP 47 locale tag.`,
    );
  }

  return {
    locale: canonical,
    label: getLabel(canonical, displayLocale ?? canonical),
    direction: getDirection(canonical),
  };
}

/**
 * Orders languages alphabetically by the names a reader sees, collated for the
 * reader's language. A protocol's languages carry no order of their own, so
 * every list of them is shown this way.
 */
export function sortByLanguageName<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  displayLocale: string,
): T[] {
  const collator = new Intl.Collator(displayLocale);
  return items.toSorted((a, b) => collator.compare(nameOf(a), nameOf(b)));
}
