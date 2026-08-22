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

  it('leaves a refusal no option edit can explain to the commit-time backstop', () => {
    // A missingness on an attribute its own validation requires: nothing about
    // the option list caused it, and silently deleting what the researcher
    // authored is not this function's business.
    const contradictory = hobbies({
      validation: { required: true },
      synthetic: { missingProbability: 0.3 },
    });

    expect(reconcileVariableSynthetic(contradictory)).toBe(contradictory);
    expect(parses(contradictory)).toBe(false);
  });

  it('leaves a variable that carries no block alone', () => {
    const plain = hobbies();
    expect(reconcileVariableSynthetic(plain)).toBe(plain);
  });
});
