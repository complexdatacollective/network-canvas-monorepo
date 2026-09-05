import { describe, expect, it } from 'vitest';

import { incompleteRulePart, isCompleteRule, type RuleDraft } from '../rule.ts';

const alterRule = (options: Record<string, unknown>): RuleDraft => ({
  type: 'node',
  options,
});

const egoRule = (options: Record<string, unknown>): RuleDraft => ({
  type: 'ego',
  options,
});

/**
 * The editor sends the researcher to the control that holds the gap, so what
 * matters is not only THAT a rule is incomplete but WHICH part of it is.
 */
describe('the part of a rule that has not been answered', () => {
  it('names the target of a rule that is about nothing yet', () => {
    expect(incompleteRulePart({ type: '' })).toBe('target');
    expect(incompleteRulePart(undefined)).toBe('target');
  });

  it('names the entity type an alter rule has not been pointed at', () => {
    expect(incompleteRulePart(alterRule({ operator: 'EXISTS' }))).toBe(
      'entityType',
    );
  });

  it('names the attribute of an ego rule that has not chosen one', () => {
    expect(incompleteRulePart(egoRule({ operator: 'EXACTLY' }))).toBe(
      'attribute',
    );
  });

  it('names the attribute an alter rule left empty after asking for one', () => {
    // The `attribute` KEY is what makes this an attribute rule rather than a
    // presence rule, so an empty one is a gap rather than a different shape.
    expect(
      incompleteRulePart(alterRule({ type: 'person', attribute: '' })),
    ).toBe('attribute');
  });

  it('reads an attribute key holding nothing as a gap, not as a presence rule', () => {
    // The KEY is the difference between the two rule shapes, in the schema and
    // here alike. A key left behind by a control that has been cleared makes
    // this an attribute rule with no attribute — never a presence rule that
    // happens to be complete.
    expect(
      incompleteRulePart(
        alterRule({ type: 'person', attribute: undefined, operator: 'EXISTS' }),
      ),
    ).toBe('attribute');
    expect(
      incompleteRulePart(alterRule({ type: 'person', operator: 'EXISTS' })),
    ).toBeUndefined();
  });

  it('names the operator once the rule knows what it is comparing', () => {
    expect(incompleteRulePart(alterRule({ type: 'person' }))).toBe('operator');
    expect(
      incompleteRulePart(alterRule({ type: 'person', attribute: 'age' })),
    ).toBe('operator');
  });

  it('names the operand of an operator that compares against one', () => {
    expect(
      incompleteRulePart(
        alterRule({ type: 'person', attribute: 'age', operator: 'EXACTLY' }),
      ),
    ).toBe('value');
    expect(
      incompleteRulePart(
        egoRule({ attribute: 'egoName', operator: 'OPTIONS_EQUALS' }),
      ),
    ).toBe('value');
  });

  it('asks for no operand from an operator that takes none', () => {
    expect(
      incompleteRulePart(
        alterRule({ type: 'person', attribute: 'age', operator: 'CONTAINS' }),
      ),
    ).toBeUndefined();
    // A presence rule is about the entity itself, so it never has an operand
    // to be missing whatever its operator says.
    expect(
      incompleteRulePart(alterRule({ type: 'person', operator: 'EXISTS' })),
    ).toBeUndefined();
  });

  it('counts a false and a zero operand as answers, and a blank one as not', () => {
    const withValue = (value: unknown) =>
      incompleteRulePart(
        alterRule({
          type: 'person',
          attribute: 'age',
          operator: 'EXACTLY',
          ...(value === undefined ? {} : { value }),
        }),
      );

    expect(withValue(false)).toBeUndefined();
    expect(withValue(0)).toBeUndefined();
    expect(withValue(['happy'])).toBeUndefined();
    expect(withValue('')).toBe('value');
    expect(withValue([])).toBe('value');
    expect(withValue(undefined)).toBe('value');
  });
});

describe('whether a rule is complete', () => {
  it('agrees with the part that is missing, in both directions', () => {
    const complete = alterRule({ type: 'person', operator: 'EXISTS' });
    const incomplete = alterRule({ type: 'person' });

    expect(isCompleteRule(complete)).toBe(true);
    expect(incompleteRulePart(complete)).toBeUndefined();
    expect(isCompleteRule(incomplete)).toBe(false);
    expect(incompleteRulePart(incomplete)).toBe('operator');
  });

  it('rejects a rule whose target is not one the schema knows', () => {
    expect(isCompleteRule({ type: 'session' })).toBe(false);
    expect(isCompleteRule(undefined)).toBe(false);
  });
});
