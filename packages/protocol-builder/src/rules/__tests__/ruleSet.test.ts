import { describe, expect, it } from 'vitest';

import {
  asRuleSetValue,
  ruleSetCodebookIssues,
  ruleSetProblem,
  ruleSetValidationMessage,
} from '../ruleSet.ts';
import { testCodebook } from './fixtures.ts';

const codebook = testCodebook;

const presenceRule = (id: string) => ({
  id,
  type: 'node',
  options: { type: 'person', operator: 'EXISTS' },
});

const danglingAttributeRule = (id: string) => ({
  id,
  type: 'node',
  options: {
    type: 'person',
    attribute: 'favouriteColour',
    operator: 'EXACTLY',
    value: 'blue',
  },
});

describe('asRuleSetValue', () => {
  it('answers undefined — never null — for a value that is not a rule set', () => {
    expect(asRuleSetValue(undefined)).toBeUndefined();
    expect(asRuleSetValue(null)).toBeUndefined();
    expect(asRuleSetValue('rules')).toBeUndefined();
    expect(asRuleSetValue([])).toBeUndefined();
  });

  it('keeps only the two keys the schema knows about', () => {
    expect(
      asRuleSetValue({ rules: [], join: 'AND', leftover: 'discard me' }),
    ).toEqual({ rules: [], join: 'AND' });
  });
});

describe('ruleSetProblem', () => {
  it('says nothing about a capability that holds no value', () => {
    expect(ruleSetProblem(undefined)).toBeUndefined();
  });

  it('asks for at least one rule', () => {
    expect(ruleSetProblem({ rules: [] })).toBe(
      'Please create at least one rule.',
    );
  });

  it('asks how two rules combine', () => {
    expect(
      ruleSetProblem({ rules: [presenceRule('a'), presenceRule('b')] }),
    ).toBe('Please choose how these rules should be combined.');
  });

  it('accepts two rules that say how they combine', () => {
    expect(
      ruleSetProblem({
        join: 'AND',
        rules: [presenceRule('a'), presenceRule('b')],
      }),
    ).toBeUndefined();
  });

  it('does not ask a single rule how it combines', () => {
    expect(ruleSetProblem({ rules: [presenceRule('a')] })).toBeUndefined();
  });
});

describe('ruleSetCodebookIssues', () => {
  it('finds nothing wrong with rules the codebook accounts for', () => {
    expect(
      ruleSetCodebookIssues({ rules: [presenceRule('a')] }, codebook),
    ).toEqual([]);
  });

  it('names the position of a rule whose attribute was deleted', () => {
    const issues = ruleSetCodebookIssues(
      {
        join: 'AND',
        rules: [presenceRule('a'), danglingAttributeRule('b')],
      },
      codebook,
    );

    expect(issues).toEqual([
      {
        position: 2,
        message:
          'This rule refers to an attribute that is no longer in the codebook. Edit or delete the rule.',
      },
    ]);
  });

  it('does not report an unfinished rule, which the editor already refuses', () => {
    expect(
      ruleSetCodebookIssues(
        { rules: [{ id: 'a', type: 'node', options: { type: 'person' } }] },
        codebook,
      ),
    ).toEqual([]);
  });
});

describe('ruleSetValidationMessage', () => {
  it('reports the shape problem before looking at the codebook', () => {
    expect(ruleSetValidationMessage({ rules: [] }, codebook)).toBe(
      'Please create at least one rule.',
    );
  });

  it('names the one rule that has to be fixed', () => {
    expect(
      ruleSetValidationMessage(
        { join: 'OR', rules: [presenceRule('a'), danglingAttributeRule('b')] },
        codebook,
      ),
    ).toBe(
      "Rule 2 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
    );
  });

  it('counts them when there is more than one', () => {
    expect(
      ruleSetValidationMessage(
        {
          join: 'OR',
          rules: [danglingAttributeRule('a'), danglingAttributeRule('b')],
        },
        codebook,
      ),
    ).toBe(
      "2 of these rules no longer work with this protocol's codebook. Open each marked rule to fix it, or delete it.",
    );
  });

  it('passes a healthy rule set', () => {
    expect(
      ruleSetValidationMessage({ rules: [presenceRule('a')] }, codebook),
    ).toBeUndefined();
  });
});
