import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';

import {
  getActiveValidationStatuses,
  getSyntheticStatus,
  getVariablePillMetadata,
} from './variablePillMetadata';

describe('variablePillMetadata', () => {
  it('keeps zero-valued rules and omits disabled boolean rules', () => {
    const variable = {
      name: 'score',
      type: 'number',
      validation: {
        required: false,
        minValue: 0,
        maxValue: 100,
        unique: true,
      },
    } satisfies Variable;

    expect(
      getActiveValidationStatuses(variable).map(({ key, label }) => ({
        key,
        label,
      })),
    ).toEqual([
      { key: 'minValue', label: 'Minimum value: 0' },
      { key: 'maxValue', label: 'Maximum value: 100' },
      { key: 'unique', label: 'Unique value' },
    ]);
  });

  it('reports the resolved default distribution when metadata is absent', () => {
    const status = getSyntheticStatus({
      name: 'age',
      type: 'number',
    });

    expect(status).toMatchObject({
      shape: { kind: 'continuous', distribution: 'uniform' },
      isDefault: true,
      label: 'Uniform distribution (default)',
    });
  });

  it('reports configured continuous distributions', () => {
    const status = getSyntheticStatus({
      name: 'income',
      type: 'number',
      synthetic: {
        distribution: 'lognormal',
        mean: 50,
        sd: 10,
      },
    });

    expect(status).toMatchObject({
      shape: {
        kind: 'continuous',
        distribution: 'lognormal',
        mean: 50,
        sd: 10,
      },
      isDefault: false,
      label: 'Log-normal distribution',
    });
  });

  it('describes categorical option and selection-count distributions', () => {
    const variable = {
      name: 'support',
      type: 'categorical',
      options: [
        { label: 'Emotional', value: 'emotional' },
        { label: 'Practical', value: 'practical' },
      ],
      synthetic: {
        optionWeights: [
          { value: 'emotional', weight: 3 },
          { value: 'practical', weight: 1 },
        ],
        selectionCount: {
          probabilities: [{ count: 1, probability: 1 }],
        },
      },
    } satisfies Variable;

    expect(getSyntheticStatus(variable)).toMatchObject({
      shape: { kind: 'options', weights: [3, 1] },
      label: 'Weighted categorical distribution with custom selection counts',
    });
  });

  it('describes inferred text generators and stage-owned values', () => {
    expect(
      getSyntheticStatus({ name: 'first_name', type: 'text' }),
    ).toMatchObject({
      shape: { kind: 'text' },
      label: 'Person name generator (default)',
    });
    expect(
      getSyntheticStatus({ name: 'position', type: 'layout' }),
    ).toMatchObject({
      shape: { kind: 'stageOwned' },
      label: 'Synthetic values are managed by interview stages',
    });
  });

  it('builds a complete accessible summary', () => {
    const metadata = getVariablePillMetadata({
      name: 'age',
      type: 'number',
      validation: { required: true, minValue: 18 },
    });

    expect(metadata.accessibleText).toBe(
      'Validation: Required; Minimum value: 18. Synthetic data: Uniform distribution (default).',
    );
  });
});
