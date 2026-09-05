import { describe, expect, it } from 'vitest';

import { uniqueRowAttribute } from '../rowValidators.ts';

/** `Zoë` precomposed (U+00EB), against `zoë` decomposed (`e` + U+0308). */
const PRECOMPOSED = 'Zoë';
const DECOMPOSED = 'zoe\u0308';

describe('uniqueRowAttribute', () => {
  it('reads two spellings of the same text as one answer', () => {
    // Case and Unicode composition are accidents of the keyboard, input method
    // or paste source a row was typed on — not what tells two rows apart.
    // Compared raw, this pair reaches the participant as two choices nothing
    // distinguishes. `Options.tsx`'s array-level twin normalizes identically,
    // so the row and the array can never disagree about which entries clash.
    expect(PRECOMPOSED.toLowerCase()).not.toBe(DECOMPOSED);
    expect(
      uniqueRowAttribute()(
        PRECOMPOSED,
        { options: [{ label: PRECOMPOSED }, { label: DECOMPOSED }] },
        'options[0].label',
      ),
    ).toBe('Labels must be unique');

    // …and it is not simply always complaining: text that genuinely reads
    // differently is a different answer.
    expect(
      uniqueRowAttribute()(
        PRECOMPOSED,
        { options: [{ label: PRECOMPOSED }, { label: 'Alex' }] },
        'options[0].label',
      ),
    ).toBeUndefined();
  });
});
