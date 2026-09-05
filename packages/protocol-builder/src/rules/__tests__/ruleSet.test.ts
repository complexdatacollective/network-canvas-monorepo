import { describe, expect, it } from 'vitest';

import type { RuleDraft } from '../rule.ts';
import {
  describeRule,
  RULE_PROBLEM_CODES,
  type RuleProblemCode,
} from '../ruleDescription.ts';
import {
  asRuleSetValue,
  ruleSetIssues,
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

describe('ruleSetIssues', () => {
  it('finds nothing wrong with rules the codebook accounts for', () => {
    expect(ruleSetIssues({ rules: [presenceRule('a')] }, codebook)).toEqual([]);
  });

  it('names the position of a rule whose attribute was deleted', () => {
    const issues = ruleSetIssues(
      {
        join: 'AND',
        rules: [presenceRule('a'), danglingAttributeRule('b')],
      },
      codebook,
    );

    expect(issues).toEqual([
      {
        position: 2,
        summary: 'codebook',
        message:
          'This rule refers to an attribute that is no longer in the codebook. Edit or delete the rule.',
      },
    ]);
  });

  it('reports an unfinished rule, which nothing outside the editor refuses', () => {
    // A rule the researcher never finished cannot have come from this
    // editor's dialog, which refuses every gap. It came from an import, from
    // a hand-edited protocol, or from another session — and the protocol
    // schema accepts it, because `value` is optional there. Left unreported,
    // an operand-taking operator with no operand saves silently and runs as an
    // unintended presence test.
    expect(
      ruleSetIssues(
        { rules: [{ id: 'a', type: 'node', options: { type: 'person' } }] },
        codebook,
      ),
    ).toEqual([
      {
        position: 1,
        summary: 'unfinished',
        message:
          'This rule is not complete. Edit it to fill in every part, or delete it.',
      },
    ]);
  });
});

/**
 * One rule per thing that can be wrong with one, so the treatment of each is
 * asserted rather than assumed.
 *
 * The record is total over `RULE_PROBLEM_CODES`, and the test below proves
 * every code has a rule here: a problem code added without a case fails to
 * compile, and one added without being reported fails here.
 */
const RULE_BY_PROBLEM: Readonly<Record<RuleProblemCode, RuleDraft>> =
  Object.freeze({
    unknownTarget: { id: 'a', type: 'sideways' },
    missingEntityType: {
      id: 'a',
      type: 'node',
      options: { type: 'ghost', operator: 'EXISTS' },
    },
    missingAttribute: {
      id: 'a',
      type: 'node',
      options: {
        type: 'person',
        attribute: 'favouriteColour',
        operator: 'EXACTLY',
        value: 'blue',
      },
    },
    invalidOperator: {
      id: 'a',
      type: 'node',
      options: {
        type: 'person',
        attribute: 'note',
        operator: 'GREATER_THAN',
        value: 1,
      },
    },
    invalidOperand: {
      id: 'a',
      type: 'node',
      options: {
        type: 'person',
        attribute: 'mood',
        operator: 'EXACTLY',
        value: 5,
      },
    },
    missingOption: {
      id: 'a',
      type: 'node',
      options: {
        type: 'person',
        attribute: 'mood',
        operator: 'INCLUDES',
        value: ['retired'],
      },
    },
    unusableOption: {
      id: 'a',
      type: 'node',
      options: {
        type: 'person',
        attribute: 'mood',
        operator: 'INCLUDES',
        value: [true],
      },
    },
    incomplete: {
      id: 'a',
      type: 'node',
      options: { type: 'person', attribute: 'age', operator: 'EXACTLY' },
    },
  });

/**
 * Every problem a rule can have reaches the researcher, in both places.
 *
 * The rule LIST renders `describeRule`'s problems as they come, so a problem
 * that reaches `ruleSetIssues` with its own message is a problem the row
 * marks; the field's verdict is what refuses the stage save. The list this
 * replaced named the reportable codes by hand and left `incomplete` and
 * `unknownTarget` out of both.
 */
describe('every problem a rule can have', () => {
  it('has a rule to demonstrate it', () => {
    expect(Object.keys(RULE_BY_PROBLEM).toSorted()).toEqual(
      [...RULE_PROBLEM_CODES].toSorted(),
    );
  });

  it.each(RULE_PROBLEM_CODES)('is reported and refused: %s', (code) => {
    const rule = RULE_BY_PROBLEM[code];
    const problem = describeRule({ rule, codebook }).problems.find(
      (candidate) => candidate.code === code,
    );
    // The fixture's own proof: a rule that stopped producing this problem
    // would otherwise pass the two assertions below by having no problem at
    // all.
    expect(problem).toBeDefined();

    expect(ruleSetIssues({ rules: [rule] }, codebook)).toContainEqual(
      expect.objectContaining({ position: 1, message: problem?.message }),
    );
    expect(ruleSetValidationMessage({ rules: [rule] }, codebook)).toEqual(
      expect.any(String),
    );
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

  it('counts the rules that are broken, not the things wrong with each', () => {
    // One rule, two problems: losing the entity type takes the attribute's
    // definition with it, so `describeRule` reports both against the same row.
    const orphanedRule = {
      id: 'a',
      type: 'node',
      options: {
        type: 'ghost',
        attribute: 'age',
        operator: 'EXACTLY',
        value: 30,
      },
    };
    expect(ruleSetIssues({ rules: [orphanedRule] }, codebook)).toEqual([
      expect.objectContaining({ position: 1 }),
      expect.objectContaining({ position: 1 }),
    ]);

    expect(ruleSetValidationMessage({ rules: [orphanedRule] }, codebook)).toBe(
      "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
    );
  });

  it('refuses a rule whose operand no longer suits its attribute type', () => {
    // `EXACTLY` is legal for both `number` and `categorical`, so nothing about
    // the OPERATOR is wrong here — only the operand, which a categorical
    // attribute answers as a list.
    expect(
      ruleSetValidationMessage(
        {
          rules: [
            {
              id: 'a',
              type: 'node',
              options: {
                type: 'person',
                attribute: 'mood',
                operator: 'EXACTLY',
                value: 5,
              },
            },
          ],
        },
        codebook,
      ),
    ).toBe(
      "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
    );
  });

  it('refuses a rule naming an option the attribute no longer offers', () => {
    // Nothing about the SHAPE of this rule is wrong: `mood` is still a
    // categorical, `INCLUDES` is still legal for one, and the operand is still
    // an option value — it is just not one of `mood`'s options any more.
    expect(
      ruleSetValidationMessage(
        {
          rules: [
            {
              id: 'a',
              type: 'node',
              options: {
                type: 'person',
                attribute: 'mood',
                operator: 'INCLUDES',
                value: ['retired'],
              },
            },
          ],
        },
        codebook,
      ),
    ).toBe(
      "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
    );
  });

  it('refuses a rule whose operator was never given its operand', () => {
    // `EXACTLY` compares against a value, and this rule has none. The protocol
    // schema accepts it — `value` is optional there — and the interview reads
    // it as a presence test the researcher never wrote.
    expect(
      ruleSetValidationMessage(
        {
          rules: [
            {
              id: 'a',
              type: 'node',
              options: {
                type: 'person',
                attribute: 'age',
                operator: 'EXACTLY',
              },
            },
          ],
        },
        codebook,
      ),
    ).toBe(
      'Rule 1 is not finished. Open it to fill in every part, or delete it.',
    );
  });

  it('says which sentence a set of unfinished rules gets', () => {
    const unfinished = (id: string) => ({
      id,
      type: 'node',
      options: { type: 'person', attribute: 'age', operator: 'EXACTLY' },
    });
    expect(
      ruleSetValidationMessage(
        { join: 'AND', rules: [unfinished('a'), unfinished('b')] },
        codebook,
      ),
    ).toBe(
      '2 of these rules are not finished. Open each marked rule to fill in every part, or delete it.',
    );
  });

  it('lets codebook drift take the sentence over from an unfinished rule', () => {
    // A rule the researcher left half-written is one they know about; a rule a
    // collaborator broke under them is not, so that is what the field says.
    expect(
      ruleSetValidationMessage(
        {
          join: 'AND',
          rules: [
            {
              id: 'a',
              type: 'node',
              options: {
                type: 'person',
                attribute: 'age',
                operator: 'EXACTLY',
              },
            },
            danglingAttributeRule('b'),
          ],
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
