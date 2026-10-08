/**
 * The language protocol and participant values are formatted and alphabetised
 * in: the protocol language the interview is showing, unless the protocol does
 * not specify one (`und`), when the interface language stands in. A protocol
 * that has no declared locale at all (a component shown outside the protocol
 * provider) is treated the same way.
 */
export function resolveContentLocale(
  protocolLocale: string | undefined,
  interfaceLocale: string,
): string {
  return protocolLocale === undefined || protocolLocale === 'und'
    ? interfaceLocale
    : protocolLocale;
}

/** The most fraction digits a coordinate is shown with. */
const COORDINATE_FRACTION_DIGITS = 4;

/**
 * `Intl.NumberFormat` stops at three fraction digits unless told otherwise,
 * which would round a stored value like 3.14159 on its way to the screen. The
 * ceiling is the most `Intl` accepts everywhere; a double never needs more.
 */
const NUMBER_FRACTION_DIGITS = 20;

export type ContentFormat = Readonly<{
  /** The BCP 47 tag everything below formats in. */
  locale: string;
  /** A stored number, at the precision it was stored with. */
  formatNumber: (value: number) => string;
  /** One coordinate, with at most four fraction digits. */
  formatCoordinate: (value: number) => string;
  /** Items in the locale's list pattern ("a, b, and c"). */
  formatList: (items: readonly string[]) => string;
  /** Alphabetical order in the locale. */
  collator: Intl.Collator;
}>;

/**
 * Formatters for protocol and participant values in `locale`. Build one per
 * locale and reuse it: the `Intl` constructors are the expensive part.
 */
export function createContentFormat(locale: string): ContentFormat {
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: NUMBER_FRACTION_DIGITS,
  });
  const coordinate = new Intl.NumberFormat(locale, {
    maximumFractionDigits: COORDINATE_FRACTION_DIGITS,
  });
  const list = new Intl.ListFormat(locale, {
    type: 'conjunction',
    style: 'long',
  });
  return {
    locale,
    formatNumber: (value) => number.format(value),
    formatCoordinate: (value) => coordinate.format(value),
    formatList: (items) => list.format(items),
    collator: new Intl.Collator(locale),
  };
}
