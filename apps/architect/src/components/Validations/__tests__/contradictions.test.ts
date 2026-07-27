import { describe, expect, it } from 'vitest';

import {
  buildProspectiveVariables,
  DRAFT_VARIABLE_ID,
  findDraftContradictions,
  makeFieldEditorValidate,
} from '../contradictions';

const numberVariable = (
  name: string,
  validation: Record<string, unknown> = {},
) => ({ name, type: 'number', validation });

describe('buildProspectiveVariables', () => {
  it('adds a new variable under the draft placeholder id', () => {
    const result = buildProspectiveVariables({
      allVariables: { a: numberVariable('a') },
      currentVariableId: '',
      variableType: 'number',
      validation: { minValue: 1 },
    });
    expect(result[DRAFT_VARIABLE_ID]).toMatchObject({
      type: 'number',
      validation: { minValue: 1 },
    });
    expect(result.a).toEqual(numberVariable('a'));
  });

  it('substitutes the edited variable, keeping its other properties', () => {
    const result = buildProspectiveVariables({
      allVariables: { a: { ...numberVariable('a'), readOnly: true } },
      currentVariableId: 'a',
      variableType: 'number',
      validation: { minValue: 1 },
    });
    expect(result.a).toMatchObject({
      readOnly: true,
      validation: { minValue: 1 },
    });
  });
});

describe('findDraftContradictions', () => {
  it('reports a contradiction the draft introduces', () => {
    const result = findDraftContradictions({
      allVariables: {},
      currentVariableId: '',
      variableType: 'number',
      validation: { minValue: 10, maxValue: 2 },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('is greater than');
  });

  it('reports a contradiction whose offending rule lives on another variable', () => {
    // Editing b's maxValue below a's minimum makes a's comparator impossible.
    const result = findDraftContradictions({
      allVariables: {
        a: numberVariable('a', { minValue: 10, lessThanVariable: 'b' }),
        b: numberVariable('b'),
      },
      currentVariableId: 'b',
      variableType: 'number',
      validation: { maxValue: 5 },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('ignores pre-existing contradictions between other variables', () => {
    const result = findDraftContradictions({
      allVariables: {
        a: numberVariable('a', { minValue: 10, maxValue: 2 }),
        b: numberVariable('b'),
      },
      currentVariableId: 'b',
      variableType: 'number',
      validation: { required: true },
    });
    expect(result).toEqual([]);
  });

  it('checks minSelected against draft options', () => {
    const result = findDraftContradictions({
      allVariables: {},
      currentVariableId: '',
      variableType: 'categorical',
      validation: { minSelected: 3 },
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('minSelectedExceedsOptions');
  });
});

describe('makeFieldEditorValidate', () => {
  const allVariables = {
    colors: {
      name: 'colors',
      type: 'categorical',
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
        { label: 'Green', value: 'green' },
      ],
      validation: { minSelected: 3 },
    },
  };

  it('flags a contradiction introduced by shrinking the options', () => {
    const validate = makeFieldEditorValidate(allVariables);
    const errors = validate({
      variable: 'colors',
      validation: { minSelected: 3 },
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
      ],
    });
    expect(errors.validation).toContain('minSelected');
  });

  it('passes a coherent draft and ignores dialogs without validation', () => {
    const validate = makeFieldEditorValidate(allVariables);
    expect(
      validate({
        variable: 'colors',
        validation: { minSelected: 3 },
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
          { label: 'Green', value: 'green' },
        ],
      }),
    ).toEqual({});
    expect(validate({ variable: 'colors' })).toEqual({});
  });

  it('derives the type from the chosen component for a new variable', () => {
    const validate = makeFieldEditorValidate({});
    const errors = validate({
      component: 'Text',
      validation: { minLength: 10, maxLength: 2 },
    });
    expect(errors.validation).toContain('minLength');
  });

  // Finding 2 (second-wave review): a variable that is only a TARGET of
  // another's sameAs/comparator never configures rules of its own, so
  // `values.validation` can be absent entirely — previously that short-
  // circuited the whole check and let an edit silently break the incoming
  // relationship. The involvement filter in `findDraftContradictions` still
  // restricts the result to contradictions the edited variable (b) actually
  // participates in.
  it('flags a contradiction on a target-only variable with no validation of its own', () => {
    const targetOnlyVariables = {
      a: {
        name: 'a',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
        ],
        validation: { sameAs: 'b' },
      },
      b: {
        name: 'b',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
        ],
        // No `validation` key at all: b only ever appears as a's sameAs
        // target and has never had rules of its own configured.
      },
    };
    const validate = makeFieldEditorValidate(targetOnlyVariables);
    const errors = validate({
      variable: 'b',
      // No `validation` key on the dialog values either — the Validations
      // field never rendered any rule rows for a target-only variable.
      options: [
        { label: 'Green', value: 'green' },
        { label: 'Yellow', value: 'yellow' },
      ],
    });
    expect(errors.validation).toContain('share no option values');
  });

  // Finding C: the dialog is the only editor surface that can change
  // `parameters` (the row editor's `checkDraft` path never sees them), so it
  // must forward the draft parameters into the analyser or an edit like this
  // one — narrowing a DatePicker window until it no longer overlaps a
  // committed comparator's other side — would slip through unvalidated.
  it('flags a disjointBounds contradiction introduced by editing parameters.max', () => {
    const dateVariables = {
      start: {
        name: 'start',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '2020' },
        validation: { lessThanVariable: 'end' },
      },
      end: {
        name: 'end',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', max: '2025' },
        validation: {},
      },
    };
    const validate = makeFieldEditorValidate(dateVariables);
    const errors = validate({
      variable: 'end',
      validation: {},
      parameters: { type: 'year', max: '2019' },
    });
    expect(errors.validation).toContain(
      'can never be satisfied because their value ranges do not overlap',
    );
  });

  // Third-wave Finding 6: without forwarding the draft's `component`, the
  // prospective variable keeps the COMMITTED RelativeDatePicker component
  // even though the draft's `parameters` describe a DatePicker's absolute
  // window — dateWindowInterval short-circuits on RelativeDatePicker and
  // never reads that window, silently missing the new contradiction.
  it('flags a disjointBounds contradiction when a draft switches component from RelativeDatePicker to DatePicker', () => {
    const dateVariables = {
      start: {
        name: 'start',
        type: 'datetime',
        component: 'RelativeDatePicker',
        parameters: { anchor: '2020-01-01' },
        validation: { lessThanVariable: 'end' },
      },
      end: {
        name: 'end',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', max: '2019' },
        validation: {},
      },
    };
    const validate = makeFieldEditorValidate(dateVariables);
    const errors = validate({
      variable: 'start',
      component: 'DatePicker',
      validation: { lessThanVariable: 'end' },
      parameters: { type: 'year', min: '2025' },
    });
    expect(errors.validation).toContain(
      'can never be satisfied because their value ranges do not overlap',
    );
  });
});
