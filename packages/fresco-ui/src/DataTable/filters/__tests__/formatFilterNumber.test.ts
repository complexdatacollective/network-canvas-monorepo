import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import { formatFilterNumber } from '../formatFilterNumber';

/**
 * A filter's numbers are not prose. They are the exact bound a table author
 * configured, or the exact condition somebody typed, and the label has to
 * agree with the filter actually being applied — while still reading in the
 * locale's own digits and separators.
 */
describe('formatFilterNumber', () => {
  const en = createAppIntl({ locale: 'en' });

  it('keeps precision Intl would otherwise round away', () => {
    // Intl.NumberFormat stops at three fraction digits by default, so this is
    // the case where the label would have described a different filter.
    expect(formatFilterNumber(en, 0.0005)).toBe('0.0005');
    expect(formatFilterNumber(en, 1.23456789)).toBe('1.23456789');
  });

  it('still groups and localises', () => {
    expect(formatFilterNumber(en, 1234567.5)).toBe('1,234,567.5');
    const arabic = createAppIntl({ locale: 'ar-EG' });
    // Different digits and a different decimal separator, same value.
    expect(formatFilterNumber(arabic, 0.0005)).toBe('٠٫٠٠٠٥');
  });

  it('adds no decimals a whole number did not have', () => {
    expect(formatFilterNumber(en, 42)).toBe('42');
    expect(formatFilterNumber(en, 1000)).toBe('1,000');
  });

  it('survives values that stringify in exponential form', () => {
    // `1e-7` has no digit run to count, so the ceiling stands in; the point is
    // that it neither throws nor silently rounds to zero.
    expect(formatFilterNumber(en, 1e-7)).not.toBe('0');
  });
});
