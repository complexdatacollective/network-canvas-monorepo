import { describe, expect, it } from 'vitest';

import { readMessage } from '../../../testing/i18n.ts';
import {
  invalidOptionValue,
  isDuplicatedInColumn,
  isSameOptionValue,
  optionExportColumnIssue,
  requiredCell,
} from '../cellRules.ts';
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

  it('reads option values as they will be stored when given isSameOptionValue', () => {
    // `1` and `"1"` export to one column, and `"yes "` is stored as `"yes"`,
    // so the codebook write refuses each pair; the row has to say so first.
    expect(
      isDuplicatedInColumn([{ value: 1 }, { value: '1' }], 'value', 1),
    ).toBe(false);
    expect(
      isDuplicatedInColumn(
        [{ value: 1 }, { value: '1' }],
        'value',
        1,
        isSameOptionValue,
      ),
    ).toBe(true);
    expect(
      isDuplicatedInColumn(
        [{ value: 'yes' }, { value: 'yes ' }],
        'value',
        'yes',
        isSameOptionValue,
      ),
    ).toBe(true);
    expect(
      isDuplicatedInColumn(
        [{ value: 'yes' }, { value: 'no' }],
        'value',
        'yes',
        isSameOptionValue,
      ),
    ).toBe(false);
  });
});

describe('invalidOptionValue', () => {
  it.each([
    'yes',
    'yes please',
    '友人',
    'amigo cercano',
    'Collègue',
    'a.b [1]',
  ])('accepts %j', (value) => {
    expect(invalidOptionValue(value)).toBeUndefined();
  });

  it('judges a value as it will be stored, so a padded one is not a complaint', () => {
    expect(invalidOptionValue('  yes  ')).toBeUndefined();
    expect(invalidOptionValue('café'.normalize('NFD'))).toBeUndefined();
  });

  it.each(['yes\nno', 'yes\tno', `yes${String.fromCharCode(0)}`])(
    'refuses %j, which holds a control character',
    (value) => {
      expect(issue(invalidOptionValue(value))).toBe(
        'Cannot contain line breaks, tabs or other control characters',
      );
    },
  );

  it('leaves an empty value to the required rule, and a non-text one alone', () => {
    expect(invalidOptionValue('')).toBeUndefined();
    expect(invalidOptionValue('   ')).toBeUndefined();
    expect(invalidOptionValue(0)).toBeUndefined();
    expect(invalidOptionValue(true)).toBeUndefined();
    expect(invalidOptionValue(undefined)).toBeUndefined();
  });
});

describe('optionExportColumnIssue', () => {
  const columns = {
    entity: 'node',
    name: 'foo',
    type: 'categorical',
    siblings: [
      { name: 'foo_bar', type: 'text' },
      { name: 'pos', type: 'layout' },
    ],
  } as const;

  it('says nothing where the attribute is not known', () => {
    expect(optionExportColumnIssue('bar', undefined)).toBeUndefined();
  });

  it('names the attribute whose column the value would be written to', () => {
    expect(issue(optionExportColumnIssue('bar', columns))).toBe(
      'Option “bar” of “foo” would be exported to a column called “foo_bar”, but the attribute “foo_bar” already has a column called “foo_bar”. Change the option value or the attribute name.',
    );
  });

  it('reads the value as it will be stored', () => {
    expect(optionExportColumnIssue('  bar  ', columns)).toBeDefined();
    expect(optionExportColumnIssue('BAR', columns)).toBeDefined();
  });

  it('accepts a value whose column is free', () => {
    expect(optionExportColumnIssue('baz', columns)).toBeUndefined();
    expect(optionExportColumnIssue('', columns)).toBeUndefined();
    expect(optionExportColumnIssue(1, columns)).toBeUndefined();
  });

  it('refuses a number that spells a taken column', () => {
    expect(
      optionExportColumnIssue(1, {
        ...columns,
        siblings: [{ name: 'foo_1', type: 'text' }],
      }),
    ).toBeDefined();
  });
});
