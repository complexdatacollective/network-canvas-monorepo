import { describe, expect, it } from 'vitest';

import { makeFieldEditorValidate } from '../contradictions';
import {
  completeRuleValues,
  incompleteRuleIssue,
  isRuleValueComplete,
} from '../ruleValue';
import { ruleMapIssue, type RuleMapContext } from '../validateRuleMap';

const context = (overrides: Partial<RuleMapContext> = {}): RuleMapContext => ({
  allVariables: {},
  currentVariableId: 'subject',
  variableType: 'number',
  ...overrides,
});

describe('isRuleValueComplete', () => {
  it('reads a null number rule as switched on but unanswered', () => {
    expect(isRuleValueComplete('minValue', null)).toBe(false);
    expect(isRuleValueComplete('minValue', 0)).toBe(true);
  });

  it('reads an unpicked comparison target as unanswered', () => {
    expect(isRuleValueComplete('sameAs', null)).toBe(false);
    expect(isRuleValueComplete('sameAs', '')).toBe(false);
    expect(isRuleValueComplete('sameAs', 'other')).toBe(true);
  });

  it('reads a value-less rule as answered whichever way it is set', () => {
    expect(isRuleValueComplete('required', true)).toBe(true);
    expect(isRuleValueComplete('required', false)).toBe(true);
    expect(isRuleValueComplete('required', null)).toBe(false);
  });

  // An unknown key is the schema's business. Reporting it here would leave a
  // researcher with an error and no control to fix it.
  it('leaves an unrecognised rule alone', () => {
    expect(isRuleValueComplete('somethingElse', 'value')).toBe(true);
  });
});

describe('completeRuleValues', () => {
  it('drops unanswered rules so the analyser never sees a null', () => {
    expect(
      completeRuleValues({ minValue: 5, maxValue: null, sameAs: null }),
    ).toEqual({ minValue: 5 });
  });

  it('keeps a legitimate zero and a legitimate false', () => {
    expect(completeRuleValues({ maxLength: 0, required: false })).toEqual({
      maxLength: 0,
      required: false,
    });
  });
});

describe('incompleteRuleIssue', () => {
  it('names an unanswered number rule', () => {
    expect(incompleteRuleIssue({ minValue: null })).toBe(
      'Enter a value for "Minimum value", or switch the rule off.',
    );
  });

  it('names an unanswered comparison rule differently', () => {
    expect(incompleteRuleIssue({ sameAs: null })).toBe(
      'Choose a comparison attribute for "Same as", or switch the rule off.',
    );
  });

  it('says nothing about a finished map', () => {
    expect(
      incompleteRuleIssue({ minValue: 1, required: true, sameAs: 'other' }),
    ).toBeUndefined();
  });
});

describe('ruleMapIssue', () => {
  it('accepts a satisfiable map', () => {
    expect(
      ruleMapIssue({ minValue: 1, maxValue: 10 }, context()),
    ).toBeUndefined();
  });

  it('reports an unanswered rule before anything else', () => {
    // The pair is ALSO contradictory, but nothing can be judged until the
    // unanswered rule has a value.
    expect(
      ruleMapIssue({ minValue: 10, maxValue: 2, sameAs: null }, context()),
    ).toBe(
      'Choose a comparison attribute for "Same as", or switch the rule off.',
    );
  });

  it('reports a value the schema itself would reject', () => {
    expect(ruleMapIssue({ minValue: 1.5 }, context())).toBe(
      'minValue must be a whole number',
    );
    expect(
      ruleMapIssue({ maxLength: -1 }, context({ variableType: 'text' })),
    ).toBe('maxLength must be at least 0');
  });

  it.each([
    ['text', { minLength: 10, maxLength: 3 }],
    ['number', { minValue: 100, maxValue: 50 }],
    ['categorical', { minSelected: 2, maxSelected: 1 }],
  ])('reports an inverted %s bound pair', (variableType, validation) => {
    expect(ruleMapIssue(validation, context({ variableType }))).toMatch(
      /is greater than/,
    );
  });

  it('reports a contradiction against another codebook variable', () => {
    const issue = ruleMapIssue(
      { sameAs: 'other', minValue: 100 },
      context({
        allVariables: {
          subject: { name: 'Subject', type: 'number' },
          other: {
            name: 'Other',
            type: 'number',
            validation: { maxValue: 10 },
          },
        },
      }),
    );

    expect(issue).toBeDefined();
  });

  it('says nothing about a value that is not a rule map at all', () => {
    expect(ruleMapIssue(undefined, context())).toBeUndefined();
    expect(ruleMapIssue('rules', context())).toBeUndefined();
    expect(ruleMapIssue([], context())).toBeUndefined();
  });

  // A variable whose type is not yet known (no input control chosen) has no
  // rules to judge; the `component` field's own `required` rule is what stops
  // that save.
  it('says nothing while the variable type is unknown', () => {
    expect(
      ruleMapIssue(
        { minValue: 100, maxValue: 1 },
        context({ variableType: '' }),
      ),
    ).toBeUndefined();
  });
});

/**
 * The rule map has TWO save gates: this one (the `validation` field's own
 * validator) and `makeFieldEditorValidate`, which the stage editors run over
 * the whole draft. They used to each write out the unanswered-rule check and
 * the schema-floor sweep, under a comment claiming both called through one
 * place — they did not, and the two sweeps had already diverged (one read the
 * raw map, the other the completed one). Both call `ruleMapPrecheck` now, and
 * this is what keeps saying so honest: a copy reintroduced in either gate has
 * to keep producing the same sentence for every one of these maps.
 */
describe('the two rule-map save gates agree', () => {
  const allVariables = {
    subject: { name: 'Subject', type: 'number', component: 'Number' },
  };

  it.each([
    ['an unanswered number rule', { minValue: 10, maxValue: 2, sameAs: null }],
    ['an unanswered comparison rule', { sameAs: null }],
    ['a fractional integer rule', { minValue: 1.5 }],
    ['a negative floor', { maxSelected: -1 }],
    [
      'an unanswered rule ahead of a floor issue',
      { maxSelected: null, minValue: 1.5 },
    ],
    ['a satisfiable map', { minValue: 1, maxValue: 10 }],
  ])('produce the same verdict for %s', (_case, validation) => {
    const fieldGate = ruleMapIssue(
      validation,
      context({ allVariables, currentVariableId: 'subject' }),
    );
    const editorGate = makeFieldEditorValidate(allVariables)({
      variable: 'subject',
      component: 'Number',
      validation,
    }).validation;

    expect(editorGate ?? undefined).toBe(fieldGate);
  });
});
