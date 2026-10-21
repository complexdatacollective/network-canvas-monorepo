/**
 * The language protocol and participant values are formatted and alphabetised
 * in: the protocol language the interview is showing. A component shown
 * outside the protocol provider has no protocol language, so the interface
 * language stands in.
 */
export function resolveContentLocale(
  protocolLocale: string | undefined,
  interfaceLocale: string,
): string {
  return protocolLocale ?? interfaceLocale;
}

/** The most fraction digits a coordinate is shown with. */
const COORDINATE_FRACTION_DIGITS = 4;

/**
 * `Intl.NumberFormat` stops at three fraction digits unless told otherwise,
 * which would round a stored value like 3.14159 on its way to the screen. A
 * fraction-digit ceiling still rounds a small nonzero value such as 1e-21 to
 * 0, so precision is counted in significant digits instead: 21 is the most
 * `Intl` accepts, and more than the 17 the shortest form of a double needs.
 */
const NUMBER_SIGNIFICANT_DIGITS = 21;

/**
 * Magnitudes `String(number)` writes in exponent form. Outside them a value is
 * shown in scientific notation rather than as a run of zeros, at the same
 * points the stored value's own text switches.
 */
const isExponentMagnitude = (value: number) => {
  const magnitude = Math.abs(value);
  return magnitude !== 0 && (magnitude < 1e-6 || magnitude >= 1e21);
};

export type ContentFormat = Readonly<{
  /** The BCP 47 tag everything below formats in. */
  locale: string;
  /** A stored number, at the precision it was stored with. */
  formatNumber: (value: number) => string;
  /** One coordinate, with at most four fraction digits. */
  formatCoordinate: (value: number) => string;
  /** A count added to something shown, always signed: "+3". */
  formatSigned: (value: number) => string;
  /** A fraction as a whole percentage: 0.4 as "40%". */
  formatPercent: (fraction: number) => string;
  /**
   * Items in the locale's list pattern: "a, b, and c", or, for a `unit`
   * list of measures or terms, "a, b, c".
   */
  formatList: (
    items: readonly string[],
    type?: 'conjunction' | 'unit',
  ) => string;
  /** Alphabetical order in the locale. */
  collator: Intl.Collator;
}>;

function createContentFormat(locale: string): ContentFormat {
  const number = new Intl.NumberFormat(locale, {
    maximumSignificantDigits: NUMBER_SIGNIFICANT_DIGITS,
  });
  const scientific = new Intl.NumberFormat(locale, {
    notation: 'scientific',
    maximumSignificantDigits: NUMBER_SIGNIFICANT_DIGITS,
  });
  const coordinate = new Intl.NumberFormat(locale, {
    maximumFractionDigits: COORDINATE_FRACTION_DIGITS,
  });
  const signed = new Intl.NumberFormat(locale, { signDisplay: 'always' });
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  });
  const lists = {
    conjunction: new Intl.ListFormat(locale, {
      type: 'conjunction',
      style: 'long',
    }),
    unit: new Intl.ListFormat(locale, { type: 'unit', style: 'long' }),
  };
  return {
    locale,
    // Formatted from the value's shortest decimal text, which `Intl` reads as
    // an exact decimal: the digits shown are the digits stored, never the
    // binary expansion of the double.
    formatNumber: (value) =>
      (isExponentMagnitude(value) ? scientific : number).format(
        String(value) as `${number}`,
      ),
    formatCoordinate: (value) => coordinate.format(value),
    formatSigned: (value) => signed.format(value),
    formatPercent: (fraction) => percent.format(fraction),
    formatList: (items, type = 'conjunction') => lists[type].format(items),
    collator: new Intl.Collator(locale),
  };
}

const contentFormats = new Map<string, ContentFormat>();

/**
 * Formatters for protocol and participant values in `locale`, built once per
 * locale and shared by every caller: the `Intl` constructors are the expensive
 * part, and a roster mounts one card per row as it scrolls.
 */
export function contentFormatFor(locale: string): ContentFormat {
  let format = contentFormats.get(locale);
  if (format === undefined) {
    format = createContentFormat(locale);
    contentFormats.set(locale, format);
  }
  return format;
}
