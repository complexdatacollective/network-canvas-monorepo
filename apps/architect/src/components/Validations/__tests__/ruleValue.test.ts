import { describe, expect, it } from 'vitest';

import { formatCommitted, isDraftComplete, parseForRule } from '../ruleValue';

describe('isDraftComplete', () => {
  it('treats a value-less rule as complete once switched on', () => {
    expect(isDraftComplete('required', true)).toBe(true);
    expect(isDraftComplete('unique', true)).toBe(true);
  });

  it('requires a number for a limit rule', () => {
    expect(isDraftComplete('minValue', 3)).toBe(true);
    expect(isDraftComplete('minValue', 0)).toBe(true);
    expect(isDraftComplete('minValue', null)).toBe(false);
    expect(isDraftComplete('minValue', '3')).toBe(false);
  });

  it('requires a non-empty target for a comparison rule', () => {
    expect(isDraftComplete('sameAs', 'variable-1')).toBe(true);
    expect(isDraftComplete('sameAs', '')).toBe(false);
    expect(isDraftComplete('sameAs', null)).toBe(false);
  });

  it('is never complete without a rule key', () => {
    expect(isDraftComplete('', true)).toBe(false);
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
