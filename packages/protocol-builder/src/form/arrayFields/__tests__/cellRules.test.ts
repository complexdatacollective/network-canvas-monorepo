import { describe, expect, it } from 'vitest';

import { readMessage } from '../../../testing/i18n.ts';
import { isDuplicatedInColumn, requiredCell } from '../cellRules.ts';
import { isOptionLabelEmpty } from '../optionCompleteness.ts';

/**
 * A rule answers with an encoded descriptor rather than a sentence, because
 * the message crosses Fresco's string-only validation contract before
 * `FieldErrors` renders it. `readMessage` is the same decode that render site
 * does, so these assertions still name the words on screen.
 */
const issue = (message: string | undefined) =>
  message === undefined ? undefined : readMessage(message);

/** `Zoë` precomposed (U+00EB), against `zoë` decomposed (`e` + U+0308). */
const PRECOMPOSED = 'Zoë';
const DECOMPOSED = 'zoë';

describe('requiredCell', () => {
  it('calls whitespace empty, exactly as the rule that refuses the row does', () => {
    // Two definitions of "empty" in one editor is how a cell reads as answered
    // while `isOptionComplete` refuses to let the row collapse and the array
    // rule refuses the save — with no error on screen naming the row at fault.
    expect(isOptionLabelEmpty('   ')).toBe(true);
    expect(issue(requiredCell('   '))).toBe('Required');
  });

  it('still counts `false` and `0` as answers', () => {
    // A boolean or numeric option value the researcher chose deliberately is
    // an answer, and complaining about it would be the opposite mistake.
    expect(requiredCell(false)).toBeUndefined();
    expect(requiredCell(0)).toBeUndefined();
  });
});

describe('isDuplicatedInColumn', () => {
  it('says nothing about two rows that are both still blank', () => {
    // Emptiness is `requiredCell`'s business, and both rows already hear about
    // it from there. Reporting a clash as well names two problems for one gap.
    expect(
      isDuplicatedInColumn([{ label: '  ' }, { label: '  ' }], 'label', '  '),
    ).toBe(false);
  });

  it('reports two rows that both hold the same numeric value', () => {
    // `0` is an answer, so two options carrying it really are two choices a
    // participant cannot tell apart.
    expect(isDuplicatedInColumn([{ value: 0 }, { value: 0 }], 'value', 0)).toBe(
      true,
    );
  });

  it('reads two spellings of the same text as one answer', () => {
    // Case and Unicode composition are accidents of the keyboard, input method
    // or paste source a row was typed on — not what tells two rows apart.
    // Compared raw, this pair reaches the participant as two choices nothing
    // distinguishes. `Options.tsx`'s array-level twin normalizes through the
    // same comparison, so the row and the array can never disagree about which
    // entries clash.
    expect(PRECOMPOSED.toLowerCase()).not.toBe(DECOMPOSED);
    expect(
      isDuplicatedInColumn(
        [{ label: PRECOMPOSED }, { label: DECOMPOSED }],
        'label',
        PRECOMPOSED,
      ),
    ).toBe(true);

    // …and it is not simply always complaining: text that genuinely reads
    // differently is a different answer.
    expect(
      isDuplicatedInColumn(
        [{ label: PRECOMPOSED }, { label: 'Alex' }],
        'label',
        PRECOMPOSED,
      ),
    ).toBe(false);
  });
});
