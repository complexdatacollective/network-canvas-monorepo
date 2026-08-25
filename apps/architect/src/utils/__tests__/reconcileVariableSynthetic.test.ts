import { describe, expect, it } from 'vitest';

import { VariableSchema } from '@codaco/protocol-validation';

import { reconcileVariableSynthetic } from '../reconcileVariableSynthetic';

/**
 * Held against the REAL schema throughout: the claim is that an option edit
 * can never leave a variable the schema refuses, so a stubbed schema would
 * test nothing. Each expectation asserts both what survived and that the
 * result parses.
 */

const parses = (variable: Record<string, unknown>): boolean =>
  VariableSchema.safeParse(variable).success;

const hobbies = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  name: 'hobbies',
  type: 'categorical',
  options: [
    { label: 'Sport', value: 'sport' },
    { label: 'Music', value: 'music' },
    { label: 'Reading', value: 'reading' },
  ],
  ...overrides,
});

describe('an option list the synthetic block has outgrown', () => {
  it('drops the weight of an option that was renamed, and keeps the others', () => {
    // The prompt editor rewrote `sport` as `exercise`; the weight naming the
    // old value is one generation could never draw on, and the schema refuses
    // the whole variable for it.
    const renamed = hobbies({
      options: [
        { label: 'Sport', value: 'exercise' },
        { label: 'Music', value: 'music' },
        { label: 'Reading', value: 'reading' },
      ],
      synthetic: {
        optionWeights: [
          { value: 'sport', weight: 5 },
          { value: 'music', weight: 2 },
        ],
        missingProbability: 0.1,
      },
    });
    expect(parses(renamed)).toBe(false);

    const reconciled = reconcileVariableSynthetic(renamed);

    expect(reconciled.synthetic).toEqual({
      optionWeights: [{ value: 'music', weight: 2 }],
      missingProbability: 0.1,
    });
    expect(parses(reconciled)).toBe(true);
  });

  it('removes the table entirely when every weight it named is gone', () => {
    const replaced = hobbies({
      options: [
        { label: 'Walking', value: 'walking' },
        { label: 'Running', value: 'running' },
      ],
      synthetic: {
        optionWeights: [
          { value: 'sport', weight: 5 },
          { value: 'music', weight: 2 },
        ],
      },
    });

    const reconciled = reconcileVariableSynthetic(replaced);

    // The block's last stated property went with it, so the key goes too:
    // authored means present (spec governing rule 4), and an empty block is
    // something the schema refuses in its own right.
    expect(reconciled).not.toHaveProperty('synthetic');
    expect(parses(reconciled)).toBe(true);
  });

  it('drops a number of selections no option list can fill, and rebalances', () => {
    const shortened = hobbies({
      options: [
        { label: 'Sport', value: 'sport' },
        { label: 'Music', value: 'music' },
      ],
      synthetic: {
        selectionCount: {
          probabilities: [
            { count: 1, probability: 0.5 },
            { count: 2, probability: 0.25 },
            { count: 3, probability: 0.25 },
          ],
        },
      },
    });
    expect(parses(shortened)).toBe(false);

    const reconciled = reconcileVariableSynthetic(shortened);

    expect(reconciled.synthetic).toEqual({
      selectionCount: {
        probabilities: [
          { count: 1, probability: 2 / 3 },
          { count: 2, probability: 1 / 3 },
        ],
      },
    });
    // Still a distribution, which is the one thing a selection table has to be.
    expect(parses(reconciled)).toBe(true);
  });

  it('leaves a block the schema is content with exactly as it was', () => {
    const authored = hobbies({
      synthetic: {
        optionWeights: [{ value: 'sport', weight: 5 }],
        missingProbability: 0.2,
      },
    });

    expect(reconcileVariableSynthetic(authored)).toBe(authored);
  });

  it('leaves a variable that carries no block alone', () => {
    const plain = hobbies();
    expect(reconcileVariableSynthetic(plain)).toBe(plain);
  });
});

/**
 * The sibling fields a field editor writes besides the option list. Each of
 * these edits is legitimate, made from a stage editor that renders no
 * generation control at all — so each one used to hand back a variable
 * `VariableSchema` refuses, and a protocol invalidated by an ordinary change
 * to an attribute.
 */
describe('validation and picker rules the synthetic block has outgrown', () => {
  const age = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    name: 'age',
    type: 'number',
    component: 'Number',
    ...overrides,
  });

  it('drops a constant the new validation bounds exclude, and keeps the rest', () => {
    const narrowed = age({
      validation: { minValue: 18, maxValue: 80 },
      synthetic: {
        distribution: 'constant',
        value: 5,
        missingProbability: 0.2,
      },
    });
    expect(parses(narrowed)).toBe(false);

    const reconciled = reconcileVariableSynthetic(narrowed);

    // The family went with the value it could not keep — a constant with no
    // value is not a declaration — but the missingness beside it is untouched
    // by anything the bounds say.
    expect(reconciled.synthetic).toEqual({ missingProbability: 0.2 });
    expect(parses(reconciled)).toBe(true);
  });

  it('keeps a distribution the new bounds can still be satisfied inside', () => {
    // A normal is clamped into the validation window rather than refused by
    // it, so narrowing the attribute costs this descriptor nothing.
    const narrowed = age({
      validation: { minValue: 18, maxValue: 80 },
      synthetic: { distribution: 'normal', mean: 40, sd: 12 },
    });

    expect(reconcileVariableSynthetic(narrowed)).toBe(narrowed);
    expect(parses(narrowed)).toBe(true);
  });

  it('drops a date bound the picker’s new resolution cannot express', () => {
    // The field editor moved the picker to whole years; a day-precision bound
    // is a date this variable can no longer hold.
    const coarsened = {
      name: 'met_on',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year' },
      synthetic: {
        distribution: 'uniform',
        min: '2020-06-15',
        missingProbability: 0.1,
      },
    };
    expect(parses(coarsened)).toBe(false);

    const reconciled = reconcileVariableSynthetic(coarsened);

    expect(reconciled.synthetic).toEqual({
      distribution: 'uniform',
      missingProbability: 0.1,
    });
    expect(parses(reconciled)).toBe(true);
  });

  it('drops a missingness the attribute has just been made to require', () => {
    const required = hobbies({
      validation: { required: true },
      synthetic: { missingProbability: 0.3 },
    });
    expect(parses(required)).toBe(false);

    const reconciled = reconcileVariableSynthetic(required);

    expect(reconciled).not.toHaveProperty('synthetic');
    expect(parses(reconciled)).toBe(true);
  });

  it('drops a block the schema will not have on any terms', () => {
    // An empty block is refused in its own right and names no key to remove;
    // the last resort is the only thing that can clear it.
    const empty = hobbies({ synthetic: {} });
    expect(parses(empty)).toBe(false);

    const reconciled = reconcileVariableSynthetic(empty);

    expect(reconciled).not.toHaveProperty('synthetic');
    expect(parses(reconciled)).toBe(true);
  });
});
