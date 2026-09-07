import { describe, expect, it } from 'vitest';

import { withoutAbsentValues } from '../absentValues.ts';

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
});
