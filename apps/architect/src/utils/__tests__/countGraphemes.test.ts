import { describe, expect, it } from 'vitest';

import countGraphemes from '../countGraphemes';

// The whole point of this helper is that it disagrees with `String#length` for
// exactly the scripts #1397 is about, so every case asserts BOTH numbers: a
// regression that quietly fell back to code units would still satisfy a test
// that only checked the grapheme count of ASCII.
describe('countGraphemes', () => {
  it('counts ASCII one per character', () => {
    expect(countGraphemes('Wave 2 pilot')).toBe(12);
    expect('Wave 2 pilot'.length).toBe(12);
  });

  it('counts Arabic one per character', () => {
    const arabic = 'مشروع بحث';
    expect(countGraphemes(arabic)).toBe(9);
    expect(arabic.length).toBe(9);
  });

  it('counts a ZWJ emoji sequence as one character, not eight', () => {
    const family = '🧑‍🤝‍🧑';
    expect(family.length).toBe(8);
    expect(countGraphemes(family)).toBe(1);
    expect(countGraphemes(family.repeat(100))).toBe(100);
  });

  it('counts a regional-indicator flag as one character, not four', () => {
    const flag = '🇸🇦';
    expect(flag.length).toBe(4);
    expect(countGraphemes(flag)).toBe(1);
  });

  it('counts an emoji with a skin-tone modifier as one character', () => {
    const wave = '👋🏽';
    expect(wave.length).toBe(4);
    expect(countGraphemes(wave)).toBe(1);
  });

  it('counts a combining mark with its base character', () => {
    const decomposed = 'é';
    expect(decomposed.length).toBe(2);
    expect(countGraphemes(decomposed)).toBe(1);
  });

  it('counts a Devanagari cluster as one character', () => {
    const kshi = 'क्षि';
    expect(kshi.length).toBe(4);
    expect(countGraphemes(kshi)).toBe(1);
  });

  it('counts an empty string as zero', () => {
    expect(countGraphemes('')).toBe(0);
  });
});
