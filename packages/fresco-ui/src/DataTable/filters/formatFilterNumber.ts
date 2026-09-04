import type { useAppIntl } from '@codaco/app-i18n/react';

// Derived rather than imported from react-intl: this package reaches the
// formatter only through app-i18n's curated API, which does not re-export the
// shape's own type.
type AppIntl = ReturnType<typeof useAppIntl>;

/**
 * How many decimal places a value actually carries, capped at the 20 `Intl`
 * will accept.
 *
 * A number small or large enough to stringify in exponential form has no digit
 * run to count, so it asks for the ceiling — being told 20 costs nothing for a
 * value that has fewer.
 */
const fractionDigitsOf = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const text = value.toString();
  if (text.includes('e') || text.includes('E')) return 20;
  const fraction = text.split('.')[1];
  return Math.min(fraction?.length ?? 0, 20);
};

/**
 * A filter's own number, in the reader's locale but at its own precision.
 *
 * `Intl.NumberFormat` rounds to three decimal places by default, which is
 * right for prose and wrong for a filter: these values are not descriptions of
 * a quantity but the exact bound or condition somebody typed, or that a table
 * author configured. Rounding `0.0005` to `0.001` in the label leaves the
 * control describing a filter it is not applying, and the reader with no way
 * to tell.
 *
 * The locale still decides digits, grouping and the decimal separator; only
 * the rounding is taken back.
 */
export const formatFilterNumber = (intl: AppIntl, value: number): string =>
  intl.formatNumber(value, {
    maximumFractionDigits: fractionDigitsOf(value),
  });
