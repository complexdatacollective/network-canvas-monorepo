import { describe, expect, it } from 'vitest';

import { VARIABLE_TYPE_VALIDATIONS } from '@codaco/protocol-validation';

import { variableRoleKey } from '../variableRoles.ts';
import {
  buildProspectiveVariables,
  completeRuleValues,
  crossClassPickErrors,
  draftAdditionalAttributeVariableIds,
  draftFormFieldVariableIds,
  draftVariableId,
  findDraftContradictions,
  findLegalReferenceTargets,
  getGroupedValidationsForVariableType,
  getValidationOptionsForVariableType,
  isRuleValueComplete,
  makeFieldEditorValidate,
  parseForRule,
  ruleMapIssue,
  ruleMapPrecheck,
  validatedElsewhereMessage,
  type RuleMapContext,
} from '../variableValidation.ts';

const SUBJECT = { entity: 'node', type: 'person' } as const;

const numberVariable = (
  name: string,
  validation: Record<string, unknown> = {},
) => ({ name, type: 'number', validation });

const ruleContext = (
  overrides: Partial<RuleMapContext> = {},
): RuleMapContext => ({
  allVariables: {},
  currentVariableId: 'subject',
  variableType: 'number',
  ...overrides,
});

describe('variable validation options', () => {
  it.each(Object.entries(VARIABLE_TYPE_VALIDATIONS))(
    'offers exactly the canonical %s rules',
    (variableType, rules) => {
      expect(
        getValidationOptionsForVariableType(variableType, 'node').map(
          ({ value }) => value,
        ),
      ).toEqual(Object.keys(rules));
    },
  );

  it('keeps host-only passphrases narrow and removes unique for ego', () => {
    expect(
      getGroupedValidationsForVariableType('passphrase', 'node').flatMap(
        ({ rules }) => rules.map(({ value }) => value),
      ),
    ).toEqual(['minLength', 'maxLength']);
    expect(
      getValidationOptionsForVariableType('text', 'ego').map(
        ({ value }) => value,
      ),
    ).not.toContain('unique');
    expect(getValidationOptionsForVariableType('unknown', 'node')).toEqual([]);
  });
});

describe('rule draft values', () => {
  it('preserves cleared values as null and reports them as incomplete', () => {
    expect(parseForRule('minValue', '')).toBeNull();
    expect(parseForRule('sameAs', '')).toBeNull();
    expect(isRuleValueComplete('minValue', null)).toBe(false);
    expect(isRuleValueComplete('required', null)).toBe(false);
    expect(ruleMapPrecheck({ minValue: null, maxValue: 2 })).toEqual({
      issue: 'Enter a value for "Minimum value", or switch the rule off.',
      complete: {},
    });
  });

  it('keeps zero and false while dropping only incomplete values', () => {
    expect(
      completeRuleValues({ maxLength: 0, required: false, sameAs: null }),
    ).toEqual({ maxLength: 0, required: false });
  });

  it('rejects fractional integer rules before contradiction analysis', () => {
    expect(ruleMapPrecheck({ minValue: 1.5 }).issue).toBe(
      'minValue must be a whole number',
    );
    expect(ruleMapPrecheck({ maxSelected: -1 }).issue).toBe(
      'maxSelected must be at least 0',
    );
  });
});

describe('prospective contradiction analysis', () => {
  it('uses a collision-free id for a newly created variable', () => {
    const allVariables = {
      '__draft-variable__': numberVariable('Existing'),
      '__draft-variable__2': numberVariable('Existing2'),
    };

    expect(draftVariableId(allVariables)).toBe('__draft-variable__3');
    expect(
      buildProspectiveVariables({
        allVariables,
        currentVariableId: '',
        variableType: 'number',
        validation: { required: true },
        draftVariableName: 'Draft',
      })['__draft-variable__3'],
    ).toMatchObject({ name: 'Draft', validation: { required: true } });
  });

  it('reports an inverted bound introduced by the draft', () => {
    expect(
      findDraftContradictions({
        allVariables: { subject: numberVariable('Subject') },
        currentVariableId: 'subject',
        variableType: 'number',
        validation: { minValue: 10, maxValue: 2 },
      }),
    ).not.toHaveLength(0);
  });

  it('finds a contradiction introduced between two other variables', () => {
    const allVariables = {
      a: numberVariable('A', { sameAs: 'b' }),
      b: numberVariable('B', { lessThanVariable: 'c' }),
      c: numberVariable('C', { required: true, maxValue: 10 }),
    };

    expect(
      findDraftContradictions({
        allVariables,
        currentVariableId: 'a',
        variableType: 'number',
        validation: { required: true, sameAs: 'b', minValue: 10 },
      }),
    ).not.toHaveLength(0);
  });
});

describe('legal comparison targets', () => {
  it('excludes a target made impossible by propagated draft bounds', () => {
    const allVariables = {
      a: numberVariable('A'),
      b: numberVariable('B', { lessThanVariable: 'c' }),
      c: numberVariable('C', { required: true, maxValue: 10 }),
      d: numberVariable('D'),
    };

    expect(
      findLegalReferenceTargets({
        allVariables,
        currentVariableId: 'a',
        variableType: 'number',
        validation: { required: true, minValue: 10 },
        ruleKey: 'sameAs',
        candidateIds: ['b', 'd'],
      }),
    ).toEqual(new Set(['d']));
  });

  it("retains another variable's incoming constraint on the edited variable", () => {
    const allVariables = {
      x: numberVariable('X', {
        minValue: 10,
        maxValue: 10,
        lessThanVariable: 'a',
      }),
      a: numberVariable('A'),
      below: numberVariable('Below', { minValue: 5, maxValue: 5 }),
      above: numberVariable('Above', { minValue: 100, maxValue: 100 }),
    };

    expect(
      findLegalReferenceTargets({
        allVariables,
        currentVariableId: 'a',
        variableType: 'number',
        validation: {},
        ruleKey: 'lessThanVariable',
        candidateIds: ['below', 'above'],
      }),
    ).toEqual(new Set(['above']));
  });

  it('treats __proto__ as an ordinary variable record id', () => {
    const allVariables = Object.fromEntries([
      ['a', numberVariable('A')],
      ['__proto__', numberVariable('Prototype')],
    ]);

    expect(
      findLegalReferenceTargets({
        allVariables,
        currentVariableId: 'a',
        variableType: 'number',
        validation: {},
        ruleKey: 'lessThanVariable',
        candidateIds: ['__proto__'],
      }),
    ).toEqual(new Set(['__proto__']));
  });
});

describe('rule-map and field-editor save gates', () => {
  it('reports the same incomplete draft from both gates', () => {
    const allVariables = { subject: numberVariable('Subject') };
    const validation = { minValue: null };

    expect(
      makeFieldEditorValidate(allVariables)({
        variable: 'subject',
        component: 'Number',
        validation,
      }).validation,
    ).toBe(
      ruleMapIssue(
        validation,
        ruleContext({ allVariables, currentVariableId: 'subject' }),
      ),
    );
  });

  it('infers a new variable type from the canonical component map', () => {
    expect(
      makeFieldEditorValidate({})({
        variable: 'NewVariable',
        _createNewVariable: 'NewVariable',
        component: 'Number',
        validation: { minValue: 10, maxValue: 1 },
      }).validation,
    ).toMatch(/is greater than/);
  });

  it('reports a contradiction introduced by shrinking categorical options', () => {
    const allVariables = {
      colors: {
        name: 'Colors',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
          { label: 'Green', value: 'green' },
        ],
        validation: { minSelected: 3 },
      },
    };

    expect(
      makeFieldEditorValidate(allVariables)({
        variable: 'colors',
        validation: { minSelected: 3 },
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
        ],
      }).validation,
    ).toContain('minSelected');
  });

  it('checks every independently resolved stage-effective form view', () => {
    const allVariables = {
      a: {
        name: 'A',
        type: 'datetime',
        component: 'DatePicker',
        validation: {},
      },
      b: {
        name: 'B',
        type: 'datetime',
        component: 'DatePicker',
        validation: {},
      },
    };
    const validate = makeFieldEditorValidate(
      allVariables,
      undefined,
      undefined,
      undefined,
      [
        {
          renderedVariableIds: new Set(['a', 'b']),
          overlay: {
            a: { component: 'DatePicker', parameters: { type: 'year' } },
            b: { component: 'DatePicker', parameters: { type: 'year' } },
          },
        },
        {
          renderedVariableIds: new Set(['a', 'b']),
          overlay: {
            a: { component: 'DatePicker', parameters: { type: 'year' } },
            b: { component: 'DatePicker', parameters: {} },
          },
        },
      ],
    );

    expect(
      validate({
        variable: 'a',
        validation: { sameAs: 'b' },
        component: 'DatePicker',
        parameters: {},
      }).validation,
    ).toContain('different resolutions');
  });

  it('applies the unchanged-pick escape to its cross-class save backstop', () => {
    const allVariables = {
      colors: {
        name: 'Colors',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
        ],
        validation: {},
      },
    };
    const validate = makeFieldEditorValidate(
      allVariables,
      undefined,
      undefined,
      () => true,
    );

    expect(
      validate(
        { variable: 'colors', validation: {} },
        { initialValues: { variable: 'colors' } },
      ),
    ).toEqual({});
    expect(
      validate(
        { variable: 'colors', validation: {} },
        { initialValues: { variable: 'other' } },
      ).variable,
    ).toBeDefined();
  });
});

describe('draft writer roles and cross-class picks', () => {
  it('collects live form and additional-attribute writers', () => {
    expect(
      draftFormFieldVariableIds([
        { variable: 'validated' },
        { variable: null },
      ]),
    ).toEqual(new Set(['validated']));
    expect(
      draftAdditionalAttributeVariableIds([
        { additionalAttributes: [{ variable: 'first' }] },
        { additionalAttributes: [{ variable: 'second' }] },
      ]),
    ).toEqual(new Set(['first', 'second']));
  });

  it('rejects a changed nested pick claimed by the opposite writer class', () => {
    const key = variableRoleKey(SUBJECT, 'category');
    const roleMap = Object.fromEntries([
      [key, { validated: 1, unvalidated: 0 }],
    ]);
    const allVariables = {
      category: { name: 'Category', type: 'categorical' },
    };

    expect(
      crossClassPickErrors({
        values: { highlight: { variable: 'category' } },
        initialValues: { highlight: { variable: 'previous' } },
        picks: [{ path: 'highlight.variable', writerClass: 'unvalidated' }],
        subject: SUBJECT,
        roleMap,
        allVariables,
      }),
    ).toEqual({
      'highlight.variable': validatedElsewhereMessage('Category'),
    });
  });

  it('allows an unchanged pre-existing cross-class conflict', () => {
    const key = variableRoleKey(SUBJECT, 'category');
    const roleMap = Object.fromEntries([
      [key, { validated: 1, unvalidated: 0 }],
    ]);
    const row = { highlight: { variable: 'category' } };

    expect(
      crossClassPickErrors({
        values: row,
        initialValues: row,
        picks: [{ path: 'highlight.variable', writerClass: 'unvalidated' }],
        subject: SUBJECT,
        roleMap,
        allVariables: {
          category: { name: 'Category', type: 'categorical' },
        },
      }),
    ).toBeUndefined();
  });
});
