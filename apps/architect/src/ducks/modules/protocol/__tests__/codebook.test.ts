import { describe, expect, it } from 'vitest';

import type { Codebook, Variable } from '@codaco/protocol-validation';

import reducer, { test } from '../codebook';

const AGE = 'c5fee926-855d-4419-b5bb-54e89010cea6';

const ageVariable = {
  name: 'age',
  type: 'number',
  component: 'Number',
  validation: { maxValue: 99 },
} as unknown as Variable;

const codebookWith = (variable: Variable): Codebook =>
  ({
    node: { person: { name: 'person', variables: { [AGE]: variable } } },
    edge: {},
  }) as unknown as Codebook;

const getAge = (state: Codebook) =>
  (state.node!.person!.variables as Record<string, Variable>)[
    AGE
  ] as unknown as Record<string, unknown> | undefined;

describe('codebook.updateVariable', () => {
  it('preserves properties the caller does not claim', () => {
    const next = reducer(
      codebookWith(ageVariable),
      test.updateVariable({
        variable: AGE,
        configuration: { validation: { maxValue: 120 } } as Partial<Variable>,
        replaceProperties: ['options', 'validation'],
      }),
    );

    expect(getAge(next)).toEqual({
      name: 'age',
      type: 'number',
      component: 'Number',
      validation: { maxValue: 120 },
    });
  });

  it('deletes a claimed property when the payload omits it', () => {
    const next = reducer(
      codebookWith(ageVariable),
      test.updateVariable({
        variable: AGE,
        configuration: {},
        replaceProperties: ['validation'],
      }),
    );

    expect(getAge(next)).not.toHaveProperty('validation');
    expect(getAge(next)).toMatchObject({ name: 'age', component: 'Number' });
  });

  it('does not delete an unclaimed property when the payload omits it', () => {
    const next = reducer(
      codebookWith(ageVariable),
      test.updateVariable({
        variable: AGE,
        configuration: {},
        replaceProperties: ['options'],
      }),
    );

    expect(getAge(next)).toEqual(ageVariable);
  });

  it('keeps component when a composer-style edit claims only options and validation', () => {
    const next = reducer(
      codebookWith(ageVariable),
      test.updateVariable({
        variable: AGE,
        configuration: {} as Partial<Variable>,
        replaceProperties: ['options', 'validation'],
      }),
    );

    expect(getAge(next)!.component).toBe('Number');
  });

  it('keeps readOnly and encrypted through a form-field edit', () => {
    const guarded = {
      ...ageVariable,
      encrypted: true,
      readOnly: true,
    } as unknown as Variable;

    const next = reducer(
      codebookWith(guarded),
      test.updateVariable({
        variable: AGE,
        configuration: {
          component: 'Number',
          type: 'number',
        } as Partial<Variable>,
        replaceProperties: ['options', 'parameters', 'component', 'validation'],
      }),
    );

    expect(getAge(next)).toMatchObject({ encrypted: true, readOnly: true });
  });

  it('defaults to a pure merge when no properties are claimed', () => {
    const next = reducer(
      codebookWith(ageVariable),
      test.updateVariable({
        variable: AGE,
        configuration: { name: 'age_years' } as Partial<Variable>,
      }),
    );

    expect(getAge(next)).toEqual({ ...ageVariable, name: 'age_years' });
  });

  it('ignores an update for a variable that is not in the codebook', () => {
    const state = codebookWith(ageVariable);
    const next = reducer(
      state,
      test.updateVariable({
        variable: 'not-a-real-uuid',
        configuration: { name: 'nope' } as Partial<Variable>,
      }),
    );

    expect(next).toEqual(state);
  });
});
