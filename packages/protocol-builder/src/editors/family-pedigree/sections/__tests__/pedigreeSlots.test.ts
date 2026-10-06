import { describe, expect, it } from 'vitest';

import { genderTermsFromDefaults } from '../pedigreeSlots.ts';

describe('genderTermsFromDefaults', () => {
  it('gives an option named for a default that default’s words, and the rest neutral words', () => {
    expect(
      genderTermsFromDefaults([
        { value: 'unknown', label: 'Unsure' },
        { value: 'agender', label: 'Agender' },
        { value: 'woman', label: 'Female' },
        { value: 'man', label: 'Male' },
        { value: 'preferNotToSay', label: 'No answer' },
      ]),
    ).toEqual([
      { value: 'unknown', words: 'unknown' },
      { value: 'agender', words: 'neutral' },
      { value: 'woman', words: 'feminine' },
      { value: 'man', words: 'masculine' },
      { value: 'preferNotToSay', words: 'neutral' },
    ]);
  });

  it('matches by value exactly, not by label', () => {
    expect(
      genderTermsFromDefaults([
        { value: 1, label: 'woman' },
        { value: 'Woman', label: 'man' },
      ]),
    ).toEqual([
      { value: 1, words: 'neutral' },
      { value: 'Woman', words: 'neutral' },
    ]);
  });

  it('maps nothing for an attribute with no options', () => {
    expect(genderTermsFromDefaults([])).toEqual([]);
  });
});
