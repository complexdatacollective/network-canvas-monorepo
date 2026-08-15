import { describe, expect, it } from 'vitest';

import { normalizeForComparison, toCanonicalText } from '../canonical-text.ts';

const PRECOMPOSED = 'Café';
const DECOMPOSED = 'Cafe\u0301';

describe('toCanonicalText', () => {
  it('composes canonically equivalent spellings onto one form', () => {
    expect(PRECOMPOSED).not.toBe(DECOMPOSED);
    expect(toCanonicalText(DECOMPOSED)).toBe(PRECOMPOSED);
    expect(toCanonicalText(PRECOMPOSED)).toBe(PRECOMPOSED);
  });

  // NFC, not NFKC: compatibility folding would rewrite researcher-authored
  // text into characters they did not type.
  it('leaves compatibility characters alone', () => {
    expect(toCanonicalText('ﬁve')).toBe('ﬁve');
    expect(toCanonicalText('①')).toBe('①');
    expect(toCanonicalText('Ａ')).toBe('Ａ');
  });
});

describe('normalizeForComparison', () => {
  it('collapses canonical equivalence and case together', () => {
    expect(normalizeForComparison(DECOMPOSED)).toBe(
      normalizeForComparison(PRECOMPOSED.toUpperCase()),
    );
  });

  // Locale-invariant on purpose: `toLocaleLowerCase` folds `I` to `ı` under a
  // Turkish or Azeri host locale, which would make whether two labels collide
  // depend on the machine the protocol was authored on.
  it('folds ASCII case the same way whatever the host locale', () => {
    expect(normalizeForComparison('Ilk')).toBe(normalizeForComparison('ilk'));
    expect(normalizeForComparison('I')).toBe('i');
  });

  it('keeps genuinely different text apart', () => {
    expect(normalizeForComparison('Café')).not.toBe(
      normalizeForComparison('Cafe'),
    );
  });
});
