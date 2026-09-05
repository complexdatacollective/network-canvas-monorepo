import { describe, expect, it } from 'vitest';

import { emptyRuleValue } from '../RuleValueField.tsx';

/**
 * What a rule's operand is reset to when the choice above it changes.
 *
 * Asserted directly rather than through the editor because two of these
 * answers are indistinguishable on screen: a checkbox group renders `''` and
 * `[]` identically, and reports the same emptiness to `required`. What the
 * difference decides is the SHAPE of the value the form is holding in the
 * meantime — and the protocol schema, which reads a multi-select operand as a
 * list, is the reader that cannot tell them apart until it is too late.
 */
describe('emptyRuleValue', () => {
  it('empties a multi-select operand as a selection, not as text', () => {
    expect(emptyRuleValue('categorical')).toEqual([]);
  });

  it('leaves a yes/no operand with no answer at all', () => {
    // Never `false`: that is what a yes/no control commits for "No", so
    // emptying to it both answered the question on the researcher's behalf and
    // satisfied the `required` rule that exists to ask it.
    expect(emptyRuleValue('boolean')).toBeUndefined();
  });

  it('leaves a numeric operand with no value at all', () => {
    // Never `''`: an empty string is not a number, and parking one in a field
    // whose control is numeric would show the researcher text they cannot have
    // typed.
    expect(emptyRuleValue('number')).toBeUndefined();
    // A scalar is compared as a number too, and is entered with the same
    // control.
    expect(emptyRuleValue('scalar')).toBeUndefined();
  });

  it('empties every other operand as text', () => {
    expect(emptyRuleValue('text')).toBe('');
    expect(emptyRuleValue('ordinal')).toBe('');
    expect(emptyRuleValue(undefined)).toBe('');
  });
});
