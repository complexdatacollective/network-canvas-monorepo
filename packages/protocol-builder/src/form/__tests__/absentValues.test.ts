import { describe, expect, it } from 'vitest';

import { isAbsentValue, withoutAbsentValues } from '../absentValues.ts';

describe('a row as the researcher left it', () => {
  it('removes every spelling of "not answered"', () => {
    expect(
      withoutAbsentValues({
        id: 'prompt-1',
        text: 'Who do you know?',
        negativeLabel: '',
        edgeVariable: null,
        createEdge: undefined,
      }),
    ).toEqual({ id: 'prompt-1', text: 'Who do you know?' });
  });

  it('keeps answers that look empty but are not', () => {
    expect(withoutAbsentValues({ fuzziness: 0, otherVariable: false })).toEqual(
      { fuzziness: 0, otherVariable: false },
    );
  });

  it('removes a group of controls nobody filled in', () => {
    expect(
      withoutAbsentValues({ id: 'p', edges: { create: '', display: null } }),
    ).toEqual({ id: 'p' });
  });

  it('keeps a group with one answer in it', () => {
    expect(
      withoutAbsentValues({ edges: { create: 'knows', display: null } }),
    ).toEqual({ edges: { create: 'knows' } });
  });

  /**
   * A list the researcher emptied is a list they emptied. Whether that is
   * allowed is the owning field's rule — a prompt list refuses it, an
   * additional-attributes list does not — and deciding it here would take the
   * question away from both.
   */
  it('leaves an emptied list alone', () => {
    expect(withoutAbsentValues({ variableOptions: [] })).toEqual({
      variableOptions: [],
    });
  });

  it('cleans the rows inside a list', () => {
    expect(
      withoutAbsentValues({ options: [{ label: 'Yes', value: 1, note: '' }] }),
    ).toEqual({ options: [{ label: 'Yes', value: 1 }] });
  });

  it('removes text that is only whitespace', () => {
    // A control the researcher cleared by selecting and deleting leaves the
    // spaces around what they removed. `interviewScript: "   "` saved as
    // content nobody wrote, and read back as a script the interview shows.
    expect(
      withoutAbsentValues({ id: 'prompt-1', interviewScript: '   \n\t' }),
    ).toEqual({ id: 'prompt-1' });
  });

  it('removes the NaN a half-typed number leaves behind', () => {
    // A number input mid-entry — a lone minus sign, an emptied field — reports
    // `NaN`, which is not a number the schema accepts anywhere.
    expect(withoutAbsentValues({ fuzziness: Number.NaN })).toEqual({});
  });
});

/**
 * One definition of emptiness, shared with the form that produced the value.
 *
 * A form judges a field unanswered with fresco-ui's `isUnanswered`, and it is
 * that judgement the researcher sees: an optional control holding only
 * whitespace collects no error, and neither does a number input the researcher
 * is halfway through emptying. So a submit that judged the same value
 * differently would save what the form told the researcher was not there —
 * `negativeLabel: "  "` written into the stage, and `NaN` handed to a schema
 * that refuses it against a path the form raised nothing about.
 *
 * Two answers are this package's own, and both are about containers rather
 * than about what a control holds. An empty ARRAY is not emptiness here: a
 * list the researcher emptied is a list they emptied, and whether that is
 * allowed belongs to the field that owns it. An empty OBJECT is: it is what a
 * group of unanswered controls assembles into, and never a value in its own
 * right.
 */
describe('what the stage calls nothing', () => {
  it.each([
    ['a value nothing ever wrote', undefined],
    ['a picker that was never used', null],
    ['a cleared text control', ''],
    ['text that is only whitespace', '   '],
    ['a number control mid-entry', Number.NaN],
    ['a group of controls nobody filled in', {}],
  ])('counts %s as nothing', (_case, value) => {
    expect(isAbsentValue(value)).toBe(true);
  });

  it.each([
    ['a list the researcher emptied', []],
    ['zero', 0],
    ['false', false],
    ['a group with one answer in it', { create: 'knows' }],
    ['text that says something', 'knows'],
  ])('counts %s as an answer', (_case, value) => {
    expect(isAbsentValue(value)).toBe(false);
  });
});
