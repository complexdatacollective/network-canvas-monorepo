import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';

import {
  assembleSynthetic,
  initialSyntheticValues,
  type SyntheticDraftContext,
  syntheticField,
  validateAssembledVariable,
  weightRows,
} from './syntheticDraft';

/**
 * The editor's own controls carry native `min`/`max`/`step` attributes that
 * nothing enforces, so these cover the values that reach the submit handler
 * anyway and must not be dispatched into the codebook.
 */

const contextFor = (variable: Variable): SyntheticDraftContext => ({
  variable,
  options:
    'options' in variable && Array.isArray(variable.options)
      ? (variable.options as { label: string; value: string | number }[])
      : [],
  required: Boolean('validation' in variable && variable.validation?.required),
});

const booleanVariable = {
  name: 'Is_Close',
  type: 'boolean',
  component: 'Boolean',
} as const satisfies Variable;

const numberVariable = {
  name: 'Age',
  type: 'number',
  component: 'Number',
} as const satisfies Variable;

const categoricalVariable = {
  name: 'Closeness',
  type: 'categorical',
  component: 'CheckboxGroup',
  options: [
    { label: 'Close', value: 'close' },
    { label: 'Distant', value: 'distant' },
  ],
} as const satisfies Variable;

describe('validateAssembledVariable()', () => {
  it('accepts a draft with the section turned off', () => {
    expect(
      validateAssembledVariable(contextFor(numberVariable), undefined),
    ).toBeUndefined();
  });

  it('accepts a valid descriptor', () => {
    expect(
      validateAssembledVariable(contextFor(numberVariable), {
        distribution: 'normal',
        mean: 40,
        sd: 12,
      }),
    ).toBeUndefined();
  });

  it('rejects a probability above one, under its own control', () => {
    const errors = validateAssembledVariable(contextFor(booleanVariable), {
      probabilityTrue: 2,
    });
    expect(errors?.fieldErrors).toEqual({
      [syntheticField('probabilityTrue')]: ['Enter 1 or less'],
    });
    expect(errors?.formErrors).toEqual([]);
  });

  it('rejects a negative missing probability', () => {
    const errors = validateAssembledVariable(contextFor(numberVariable), {
      distribution: 'uniform',
      min: 0,
      max: 10,
      missingProbability: -1,
    });
    expect(errors?.fieldErrors[syntheticField('missingProbability')]).toEqual([
      'Enter 0 or more',
    ]);
  });

  it('rejects a negative standard deviation', () => {
    const errors = validateAssembledVariable(contextFor(numberVariable), {
      distribution: 'normal',
      mean: 40,
      sd: -1,
    });
    expect(errors?.fieldErrors[syntheticField('sd')]).toEqual([
      'Enter 0 or more',
    ]);
  });

  it('rejects inverted bounds', () => {
    const errors = validateAssembledVariable(contextFor(numberVariable), {
      distribution: 'uniform',
      min: 10,
      max: 1,
    });
    expect(errors?.fieldErrors[syntheticField('max')]).toEqual([
      '"min" must not be greater than "max"',
    ]);
  });

  it('rejects a window outside the variable validation bounds', () => {
    const errors = validateAssembledVariable(
      contextFor({
        ...numberVariable,
        validation: { minValue: 0, maxValue: 5 },
      }),
      { distribution: 'uniform', min: 10, max: 20 },
    );
    expect(errors?.fieldErrors[syntheticField('min')]).toEqual([
      'Synthetic "min" exceeds the validation maxValue',
    ]);
  });

  it('rejects option weights that are all zero, as a form error', () => {
    const context = contextFor(categoricalVariable);
    const errors = validateAssembledVariable(context, {
      optionWeights: weightRows(context).map((row) => ({
        value: row.value,
        weight: 0,
      })),
    });
    expect(errors?.formErrors).toEqual([
      'At least one option value must have a positive weight',
    ]);
    expect(errors?.fieldErrors).toEqual({});
  });

  it('reports a rejected weight under the row that owns it', () => {
    const context = contextFor(categoricalVariable);
    const errors = validateAssembledVariable(context, {
      optionWeights: [
        { value: 'close', weight: 1 },
        { value: 'distant', weight: -1 },
      ],
    });
    expect(errors?.fieldErrors).toEqual({
      [syntheticField('weight', 1)]: ['Enter 0 or more'],
    });
  });

  it('reports a rejected selection count no row offers as a form error', () => {
    // A required variable offers no "no selection" row, so the count that
    // fails belongs to no control the author can see.
    const context = contextFor({
      ...categoricalVariable,
      validation: { required: true },
    });
    const errors = validateAssembledVariable(context, {
      selectionCount: {
        probabilities: [
          { count: 0, probability: 0.5 },
          { count: 1, probability: 0.5 },
        ],
      },
    });
    expect(errors?.formErrors).toEqual([
      'A selection count of 0 is only legal when the variable is not required',
    ]);
    expect(errors?.fieldErrors).toEqual({});
  });

  it('reports a rejected selection count under the row that owns it', () => {
    // Two selected values are unreachable once one of the two options is
    // weighted out of the draw, and the "2 selected" row is on screen.
    const context = contextFor(categoricalVariable);
    const errors = validateAssembledVariable(context, {
      selectionCount: {
        probabilities: [
          { count: 1, probability: 0.5 },
          { count: 2, probability: 0.5 },
        ],
      },
      optionWeights: [
        { value: 'close', weight: 1 },
        { value: 'distant', weight: 0 },
      ],
    });
    expect(errors?.fieldErrors[syntheticField('count', 2)]).toEqual([
      'Selection count 2 exceeds the 1 option values with positive weight',
    ]);
  });

  it('rejects a synthetic date window disjoint from the field window', () => {
    const errors = validateAssembledVariable(
      contextFor({
        name: 'Date_Met',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2020-01-01', max: '2020-12-31' },
      }),
      { distribution: 'uniform', min: '2030-01-01' },
    );
    expect(errors?.fieldErrors[syntheticField('min')]).toEqual([
      'Synthetic "min" is after the latest date this field accepts',
    ]);
  });

  it('ignores invalidity the editor did not introduce and cannot reach', () => {
    // A legacy single-option categorical fails the schema's two-option rule
    // whatever this editor does; blocking the save would strand the author.
    const context = contextFor({
      ...categoricalVariable,
      options: [{ label: 'Close', value: 'close' }],
    });
    expect(
      validateAssembledVariable(context, { missingProbability: 0.1 }),
    ).toBeUndefined();
  });
});

describe('the neutral-words text generator', () => {
  // Resolution infers `personName` for a name-like variable, so storing the
  // neutral choice as "nothing declared" makes it unsavable: reopening the
  // editor shows the inferred generator back again.
  const nameLike = {
    name: 'firstName',
    type: 'text',
  } as unknown as Variable;

  it('survives a round trip through the draft', () => {
    const ctx = contextFor(nameLike);
    const values = initialSyntheticValues(ctx);

    expect(values[syntheticField('generator')]).toBe('personName');

    const assembled = assembleSynthetic(ctx, {
      ...values,
      [syntheticField('generator')]: 'neutralWords',
    });
    expect(assembled).toMatchObject({ generator: 'neutralWords' });

    const reopened = initialSyntheticValues(
      contextFor({ ...nameLike, synthetic: assembled } as unknown as Variable),
    );
    expect(reopened[syntheticField('generator')]).toBe('neutralWords');
  });
});
