import { describe, expect, it } from 'vitest';

import {
  formatCommitted,
  isRuleValueComplete,
  parseForRule,
} from '../ruleValue';

// `isRuleValueComplete` replaced a near-identical `isDraftComplete`, which
// reported a value-less rule as complete whatever it held — including the
// `null` that now means "switched on, not answered yet".
describe('isRuleValueComplete', () => {
  it('treats a value-less rule as complete however it is set', () => {
    expect(isRuleValueComplete('required', true)).toBe(true);
    expect(isRuleValueComplete('unique', true)).toBe(true);
    expect(isRuleValueComplete('required', false)).toBe(true);
    expect(isRuleValueComplete('required', null)).toBe(false);
  });

  it('requires a number for a limit rule', () => {
    expect(isRuleValueComplete('minValue', 3)).toBe(true);
    expect(isRuleValueComplete('minValue', 0)).toBe(true);
    expect(isRuleValueComplete('minValue', null)).toBe(false);
    expect(isRuleValueComplete('minValue', '3')).toBe(false);
  });

  it('requires a non-empty target for a comparison rule', () => {
    expect(isRuleValueComplete('sameAs', 'variable-1')).toBe(true);
    expect(isRuleValueComplete('sameAs', '')).toBe(false);
    expect(isRuleValueComplete('sameAs', null)).toBe(false);
  });

  // An unrecognised rule is the schema's business; naming it here would leave
  // the researcher an error with no control to fix it.
  it('leaves an unrecognised rule alone', () => {
    expect(isRuleValueComplete('somethingElse', 'value')).toBe(true);
    expect(isRuleValueComplete('somethingElse', null)).toBe(false);
  });
});

describe('parseForRule', () => {
  it('resolves a value-less rule to true regardless of text', () => {
    expect(parseForRule('required', '')).toBe(true);
  });

  it.each([
    ['3', 3],
    ['0', 0],
    ['-5', -5],
    ['007', 7],
  ])('parses %s as a limit value', (text, expected) => {
    expect(parseForRule('minValue', text)).toBe(expected);
  });

  it.each(['', '   ', '-', '.', 'abc'])(
    'treats the in-progress input %o as no value yet',
    (text) => {
      expect(parseForRule('minValue', text)).toBeNull();
    },
  );

  it('parses a fraction rather than rejecting it', () => {
    expect(parseForRule('minValue', '1.5')).toBe(1.5);
  });

  it('passes a comparison target through, and empty text as no target', () => {
    expect(parseForRule('sameAs', 'variable-1')).toBe('variable-1');
    expect(parseForRule('sameAs', '')).toBeNull();
  });

  it('resolves an unknown rule to no value', () => {
    expect(parseForRule('', '3')).toBeNull();
    expect(parseForRule('nonsense', '3')).toBeNull();
  });
});

describe('formatCommitted', () => {
  it('renders a committed value as its input text', () => {
    expect(formatCommitted(3)).toBe('3');
    expect(formatCommitted(0)).toBe('0');
    expect(formatCommitted('variable-1')).toBe('variable-1');
  });

  it('renders anything without an input control as empty text', () => {
    expect(formatCommitted(true)).toBe('');
    expect(formatCommitted(null)).toBe('');
    expect(formatCommitted(undefined)).toBe('');
  });
});
