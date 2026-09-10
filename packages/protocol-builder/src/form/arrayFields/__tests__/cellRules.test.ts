import { describe, expect, it } from 'vitest';

import { createMessageError } from '@codaco/app-i18n/messages';

import { readMessage } from '../../../testing/i18n.ts';
import { isOptionLabelEmpty } from '../optionCompleteness.ts';
import { requiredRow, uniqueRowAttribute } from '../rowValidators.ts';

/**
 * A rule answers with an encoded descriptor rather than a sentence, because
 * the message crosses Fresco's string-only validation contract before
 * `FieldErrors` renders it. `readMessage` is the same decode that render site
 * does, so these assertions still name the words on screen.
 */
const issue = (message: string | undefined) =>
  message === undefined ? undefined : readMessage(message);

/**
 * The two clashes an options list reports. Declared here rather than imported
 * because the rule under test takes its message from its caller: what these
 * assertions are about is which row it fires on, not where the words came
 * from. `Option.tsx` names its own, and `arrayEditors` covers what a cell
 * actually shows.
 */
const DUPLICATE_LABELS = createMessageError({
  id: 'protocolBuilderTesting.arrayField.duplicateLabels',
  defaultMessage: 'Labels must be unique',
});
const DUPLICATE_VALUES = createMessageError({
  id: 'protocolBuilderTesting.arrayField.duplicateValues',
  defaultMessage: 'Values must be unique',
});

/** `Zoë` precomposed (U+00EB), against `zoë` decomposed (`e` + U+0308). */
const PRECOMPOSED = 'Zoë';
const DECOMPOSED = 'zoe\u0308';

describe('requiredRow', () => {
  it('calls whitespace empty, exactly as the rule that refuses the row does', () => {
    // Two definitions of "empty" in one editor is how a cell reads as answered
    // while `isOptionComplete` refuses to let the row collapse and the array
    // rule refuses the save — with no error on screen naming the row at fault.
    expect(isOptionLabelEmpty('   ')).toBe(true);
    expect(issue(requiredRow()('   ', undefined, 'options[0].label'))).toBe(
      'Required',
    );
  });

  it('still counts `false` and `0` as answers', () => {
    // A boolean or numeric option value the researcher chose deliberately is
    // an answer, and complaining about it would be the opposite mistake.
    expect(requiredRow()(false, undefined, 'options[0].value')).toBeUndefined();
    expect(requiredRow()(0, undefined, 'options[0].value')).toBeUndefined();
  });
});

describe('uniqueRowAttribute', () => {
  it('says nothing about two rows that are both still blank', () => {
    // Emptiness is `requiredRow`'s business, and both rows already hear about
    // it from there. Reporting a clash as well names two problems for one gap.
    expect(
      uniqueRowAttribute(DUPLICATE_LABELS)(
        '  ',
        { options: [{ label: '  ' }, { label: '  ' }] },
        'options[0].label',
      ),
    ).toBeUndefined();
  });

  it('reports two rows that both hold the same numeric value', () => {
    // `0` is an answer, so two options carrying it really are two choices a
    // participant cannot tell apart.
    expect(
      issue(
        uniqueRowAttribute(DUPLICATE_VALUES)(
          0,
          { options: [{ value: 0 }, { value: 0 }] },
          'options[0].value',
        ),
      ),
    ).toBe('Values must be unique');
  });

  it('reads two spellings of the same text as one answer', () => {
    // Case and Unicode composition are accidents of the keyboard, input method
    // or paste source a row was typed on — not what tells two rows apart.
    // Compared raw, this pair reaches the participant as two choices nothing
    // distinguishes. `Options.tsx`'s array-level twin normalizes identically,
    // so the row and the array can never disagree about which entries clash.
    expect(PRECOMPOSED.toLowerCase()).not.toBe(DECOMPOSED);
    expect(
      issue(
        uniqueRowAttribute(DUPLICATE_LABELS)(
          PRECOMPOSED,
          { options: [{ label: PRECOMPOSED }, { label: DECOMPOSED }] },
          'options[0].label',
        ),
      ),
    ).toBe('Labels must be unique');

    // …and it is not simply always complaining: text that genuinely reads
    // differently is a different answer.
    expect(
      uniqueRowAttribute(DUPLICATE_LABELS)(
        PRECOMPOSED,
        { options: [{ label: PRECOMPOSED }, { label: 'Alex' }] },
        'options[0].label',
      ),
    ).toBeUndefined();
  });
});
