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

  it('reconciles a CREATED variable too, not only an updated one', () => {
    // The create-attribute dialog holds its synthetic block beside the form,
    // so an option renamed after a weight was typed reaches the codebook with
    // a weight naming a value the variable no longer offers. Creation goes
    // through the same merge as an update, which is why one reconciliation
    // covers both.
    const created = reducer(
      {
        node: { person: { name: 'person', variables: {} } },
        edge: {},
      } as unknown as Codebook,
      test.createVariable({
        entity: 'node',
        type: 'person',
        variable: AGE,
        configuration: {
          name: 'hobbies',
          type: 'categorical',
          options: [
            { label: 'Sport', value: 'exercise' },
            { label: 'Music', value: 'music' },
          ],
          synthetic: {
            optionWeights: [
              { value: 'sport', weight: 5 },
              { value: 'music', weight: 1 },
            ],
          },
        } as unknown as Variable,
      }),
    );

    expect(getAge(created)).toMatchObject({
      synthetic: { optionWeights: [{ value: 'music', weight: 1 }] },
    });
  });

  it('reconciles synthetic option metadata the new options have outgrown', () => {
    // Every prompt editor that binds a categorical attribute writes its option
    // list back through this action, carrying no synthetic block of its own —
    // so a renamed option used to leave a weight naming a value the variable
    // no longer offers, which `VariableSchema` refuses. The protocol became
    // invalid from an editor that never mentioned generation.
    const weighted = {
      name: 'hobbies',
      type: 'categorical',
      options: [
        { label: 'Sport', value: 'sport' },
        { label: 'Music', value: 'music' },
      ],
      synthetic: {
        optionWeights: [
          { value: 'sport', weight: 5 },
          { value: 'music', weight: 1 },
        ],
      },
    } as unknown as Variable;

    const next = reducer(
      codebookWith(weighted),
      test.updateVariable({
        variable: AGE,
        configuration: {
          options: [
            { label: 'Sport', value: 'exercise' },
            { label: 'Music', value: 'music' },
          ],
        } as Partial<Variable>,
      }),
    );

    expect(getAge(next)).toMatchObject({
      synthetic: { optionWeights: [{ value: 'music', weight: 1 }] },
    });
  });

  it('reconciles a distribution the new validation bounds have outgrown', () => {
    // The same write from a stage's field editor, this time carrying
    // validation rather than options: narrowing the attribute to 18–80 strands
    // a synthetic constant of 5, which `VariableSchema` refuses just as firmly
    // as a stale weight — and there is no generation control in that editor
    // either.
    const constant = {
      ...ageVariable,
      synthetic: {
        distribution: 'constant',
        value: 5,
        missingProbability: 0.2,
      },
    } as unknown as Variable;

    const next = reducer(
      codebookWith(constant),
      test.updateVariable({
        variable: AGE,
        configuration: {
          validation: { minValue: 18, maxValue: 80 },
        } as Partial<Variable>,
        replaceProperties: ['validation'],
      }),
    );

    // The constant went with the bounds it could not satisfy; the missingness
    // beside it, which nothing about the bounds touches, stayed.
    expect(getAge(next)).toEqual({
      name: 'age',
      type: 'number',
      component: 'Number',
      validation: { minValue: 18, maxValue: 80 },
      synthetic: { missingProbability: 0.2 },
    });
  });
});
