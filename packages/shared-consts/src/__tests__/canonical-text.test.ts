import { describe, expect, it } from 'vitest';

import {
  hasDuplicateOptionLabels,
  normalizeForComparison,
  toCanonicalText,
} from '../canonical-text.ts';

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

describe('hasDuplicateOptionLabels', () => {
  it('accepts labels a participant can tell apart', () => {
    expect(
      hasDuplicateOptionLabels([
        { label: 'Close', value: 'close' },
        { label: 'Distant', value: 'distant' },
      ]),
    ).toBe(false);
  });

  it('reports two labels differing only in case', () => {
    expect(
      hasDuplicateOptionLabels([
        { label: 'Close', value: 'close' },
        { label: 'close', value: 'nearby' },
      ]),
    ).toBe(true);
  });

  it('reports two labels differing only in how an accent is composed', () => {
    expect(
      hasDuplicateOptionLabels([
        { label: PRECOMPOSED, value: 'one' },
        { label: DECOMPOSED, value: 'two' },
      ]),
    ).toBe(true);
  });

  /**
   * An unwritten label is an unfinished list rather than a clash — the rules
   * about a half-finished option say so, and saying both about one edit would
   * send the researcher looking for a clash that is not there.
   */
  it('says nothing about labels nobody has written', () => {
    expect(
      hasDuplicateOptionLabels([
        { label: '', value: 'one' },
        { label: '   ', value: 'two' },
        { value: 'three' },
        { label: 7, value: 'four' },
      ]),
    ).toBe(false);
  });

  /**
   * Whitespace is compared as it was typed — the same comparison the cell
   * beside the label makes, which is the point.
   *
   * Not because padding is harmless: a rendered label collapses a trailing
   * space, so a participant reads `Close ` and `Close` the same way, and the
   * yes-or-no pair's own rule trims for exactly that reason. But this rule is
   * asked by four things at once, and the cell that tells the researcher WHICH
   * two rows clash is one of them. Trimming here alone would refuse a save
   * with nothing on screen saying why; trimming everywhere would newly refuse
   * protocols that already carry such a pair, which is a tightening rather
   * than the alignment this rule exists for.
   */
  it('compares the padding around a label as it was typed', () => {
    expect(
      hasDuplicateOptionLabels([
        { label: 'Close', value: 'close' },
        { label: 'Close ', value: 'nearby' },
      ]),
    ).toBe(false);
  });

  it('answers for anything a protocol might hold in place of a list', () => {
    expect(hasDuplicateOptionLabels(undefined)).toBe(false);
    expect(hasDuplicateOptionLabels('Close')).toBe(false);
    expect(hasDuplicateOptionLabels([null, 'Close', 3])).toBe(false);
  });
});
