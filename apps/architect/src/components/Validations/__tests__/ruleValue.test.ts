import { describe, expect, it } from 'vitest';

import { messageText } from '~/test/messageText';

import {
  floorIssue,
  formatCommitted,
  isRuleValueComplete,
  parseForRule,
  ruleMapPrecheck,
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

describe('floorIssue', () => {
  const ruleLabels: Record<string, string> = {
    minLength: 'Minimum text length',
    maxLength: 'Maximum text length',
    minValue: 'Minimum value',
    maxValue: 'Maximum value',
    minSelected: 'Minimum selection',
    maxSelected: 'Maximum selection',
  };
  const integerRules = [
    'minLength',
    'maxLength',
    'minValue',
    'maxValue',
    'minSelected',
    'maxSelected',
  ];

  it.each(integerRules)('rejects a fractional %s value', (rule) => {
    expect(messageText(floorIssue(rule, 1.5))).toBe(
      `${ruleLabels[rule]} must be a whole number`,
    );
  });

  it.each(integerRules)('accepts an integer %s value', (rule) => {
    expect(messageText(floorIssue(rule, 2))).toBeUndefined();
  });

  it.each(['maxLength', 'maxSelected'])(
    'accepts zero for an optional %s',
    (rule) => {
      expect(messageText(floorIssue(rule, 0))).toBeUndefined();
    },
  );

  it.each(['maxLength', 'maxSelected'])('rejects a negative %s', (rule) => {
    expect(messageText(floorIssue(rule, -1))).toBe(
      `${ruleLabels[rule]} must be at least 0`,
    );
  });
});

/**
 * The one implementation of the codebook-free half of the rule-map save gate.
 * Both gates — the `validation` field's own validator and the stage editors'
 * `makeFieldEditorValidate` — call this rather than each writing it out, which
 * is what stops the two from disagreeing about whether a map may be saved.
 */
describe('ruleMapPrecheck', () => {
  it('reports an unanswered rule ahead of everything else', () => {
    // The fractional value would be reported too, and the pair is inverted as
    // well; neither can be judged until the switched-on rule has a value.
    expect(
      messageText(ruleMapPrecheck({ sameAs: null, minValue: 1.5 }).issue),
    ).toBe(
      'Choose a comparison attribute for "Same as another attribute", or switch the rule off.',
    );
  });

  it('offers no completed map alongside an unanswered rule', () => {
    expect(ruleMapPrecheck({ minValue: 5, maxValue: null }).complete).toEqual(
      {},
    );
  });

  it('reports a value the schema itself would reject', () => {
    expect(messageText(ruleMapPrecheck({ minValue: 1.5 }).issue)).toBe(
      'Minimum value must be a whole number',
    );
    expect(messageText(ruleMapPrecheck({ maxLength: -1 }).issue)).toBe(
      'Maximum text length must be at least 0',
    );
  });

  it('hands a finished map through with nothing to report', () => {
    const { issue, complete } = ruleMapPrecheck({
      minValue: 1,
      maxValue: 10,
      required: true,
    });
    expect(issue).toBeUndefined();
    expect(complete).toEqual({ minValue: 1, maxValue: 10, required: true });
  });
});
