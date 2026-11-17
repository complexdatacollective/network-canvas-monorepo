export type TextDirection = 'ltr' | 'rtl';

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

/**
 * The direction a language's text is written in, from its BCP 47 tag: what
 * the runtime reports, otherwise the direction of the script the tag names or
 * implies. A tag the runtime cannot parse is left to right.
 */
export function textDirectionOf(locale: string): TextDirection {
  let intlLocale: LocaleWithTextInfo;
  try {
    intlLocale = new Intl.Locale(locale);
  } catch {
    return 'ltr';
  }
  const reported =
    (typeof intlLocale.getTextInfo === 'function'
      ? readDirection(intlLocale.getTextInfo())
      : undefined) ?? readDirection(intlLocale.textInfo);
  if (reported !== undefined) return reported;

  const { script } = intlLocale.maximize();
  return script !== undefined && RIGHT_TO_LEFT_SCRIPTS.has(script)
    ? 'rtl'
    : 'ltr';
}
