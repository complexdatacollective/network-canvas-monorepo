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

const getLabel = (locale: LocaleTag, displayLocale: string): string => {
  if (typeof Intl.DisplayNames !== 'function') return locale;
  try {
    return (
      new Intl.DisplayNames([displayLocale], { type: 'language' }).of(locale) ??
      locale
    );
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      return locale;
    }
    throw error;
  }
};

/**
 * Presentation data for a locale. The label defaults to the locale's own name
 * for itself (its autonym) and varies between JavaScript runtimes, so it must
 * never be persisted, validated, or hashed.
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
