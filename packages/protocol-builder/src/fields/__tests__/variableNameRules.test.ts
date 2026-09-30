import { describe, expect, it } from 'vitest';

import { enIntl as intl } from '../../testing/i18n.ts';
import { variableNameRefusal } from '../variableNameRules.ts';

/**
 * The one rule both controls that take an attribute name ask: the create row
 * of the attribute window, and the editor the held pill opens on the name it
 * already has. Two controls that judged a name differently would offer a name
 * the other refuses.
 */
const NAMES = ['age', 'contactFreq'];

describe('the rule for an attribute name', () => {
  it('takes a name nothing else holds', () => {
    expect(variableNameRefusal('height', { intl, namesInUse: NAMES })).toBe(
      undefined,
    );
  });

  /**
   * Case-folded, the way `assertVariableNameAvailable` compares at the write:
   * a control that offered `AGE` while the codebook held `age` would spend a
   * round trip to answer with a duplicate-name refusal about a name the
   * researcher believed was free.
   */
  it('refuses a name another attribute holds in another case', () => {
    expect(variableNameRefusal('AGE', { intl, namesInUse: NAMES })).toBe(
      'this type already has an attribute called that',
    );
    expect(
      variableNameRefusal('CONTACTFREQ', { intl, namesInUse: NAMES }),
    ).toBe('this type already has an attribute called that');
  });

  /** An attribute is not the thing standing in its own way. */
  it('excludes the name the attribute being renamed already has', () => {
    expect(
      variableNameRefusal('age', { intl, namesInUse: NAMES, excluding: 'age' }),
    ).toBe(undefined);
    // Including a change of case of its own name, which is a rename a
    // researcher may well want and no duplicate at all.
    expect(
      variableNameRefusal('Age', { intl, namesInUse: NAMES, excluding: 'age' }),
    ).toBe(undefined);
    // And excluding one name does not excuse another.
    expect(
      variableNameRefusal('contactFreq', {
        intl,
        namesInUse: NAMES,
        excluding: 'age',
      }),
    ).toBe('this type already has an attribute called that');
  });

  it('refuses characters the export formats cannot carry', () => {
    for (const typed of ['full name', 'café', 'a/b', 'name!']) {
      expect(variableNameRefusal(typed, { intl, namesInUse: NAMES })).toBe(
        'only letters, numbers and the symbols ._-: can be used in a name',
      );
    }
    // And accepts every character they can.
    expect(variableNameRefusal('a-b_c.d:e9', { intl, namesInUse: NAMES })).toBe(
      undefined,
    );
  });

  /**
   * Asked of the whole type rather than of whatever list a control offers, so
   * a caller with nothing to compare against still has the charset rule.
   */
  it('still judges the characters when it is given no names at all', () => {
    expect(variableNameRefusal('full name', { intl })).toBe(
      'only letters, numbers and the symbols ._-: can be used in a name',
    );
    expect(variableNameRefusal('full_name', { intl })).toBe(undefined);
  });
});
