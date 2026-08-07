import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';

import {
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_NODE_COUNT,
  defaultNumberWindow,
  inferTextGenerator,
  resolveEdgeTopology,
  resolveNodeCount,
  resolveVariableSynthetic,
  UNREACHABLE_NODE_COUNT,
} from '../resolveSynthetic';

const options = [
  { label: 'Friend', value: 'friend' },
  { label: 'Family', value: 'family' },
  { label: 'Coworker', value: 'coworker' },
];

describe('resolveNodeCount', () => {
  it('prefers a declared count', () => {
    const declared = { distribution: 'poisson', mean: 3 } as const;
    expect(
      resolveNodeCount({ synthetic: { count: declared } }, { creatable: true }),
    ).toEqual(declared);
  });

  it('defaults a creatable type to uniform 1-8', () => {
    expect(resolveNodeCount(undefined, { creatable: true })).toEqual(
      DEFAULT_NODE_COUNT,
    );
  });

  it('defaults an unreachable type to zero', () => {
    expect(resolveNodeCount({}, { creatable: false })).toEqual(
      UNREACHABLE_NODE_COUNT,
    );
  });
});

describe('resolveEdgeTopology', () => {
  it('prefers a declared topology', () => {
    const declared = {
      metric: 'meanDegree',
      distribution: { distribution: 'constant', value: 2 },
    } as const;
    expect(resolveEdgeTopology({ synthetic: { topology: declared } })).toEqual(
      declared,
    );
  });

  it('defaults to a uniform density between 0.3 and 0.5', () => {
    expect(resolveEdgeTopology(undefined)).toEqual(DEFAULT_EDGE_TOPOLOGY);
  });
});

describe('defaultNumberWindow', () => {
  it.each([
    ['both bounds', 5, 9, { min: 5, max: 9 }],
    ['no bounds', undefined, undefined, { min: 18, max: 80 }],
    ['a floor below the default ceiling', 20, undefined, { min: 20, max: 80 }],
    [
      'a floor above the default ceiling',
      100,
      undefined,
      { min: 100, max: 162 },
    ],
    ['a ceiling above the default floor', undefined, 60, { min: 18, max: 60 }],
    ['a ceiling below the default floor', undefined, 10, { min: -52, max: 10 }],
  ])('anchors the window with %s', (_label, min, max, expected) => {
    expect(defaultNumberWindow(min, max)).toEqual(expected);
  });
});

describe('resolveVariableSynthetic', () => {
  it('marks layout and location as stage-owned', () => {
    expect(
      resolveVariableSynthetic({ name: 'position', type: 'layout' }),
    ).toEqual({ kind: 'stageOwned' });
    expect(
      resolveVariableSynthetic({ name: 'home', type: 'location' }),
    ).toEqual({ kind: 'stageOwned' });
  });

  it('passes a declared number descriptor through with validation bounds', () => {
    const resolved = resolveVariableSynthetic({
      name: 'age',
      type: 'number',
      validation: { minValue: 18, maxValue: 99 },
      synthetic: { distribution: 'normal', mean: 34, sd: 12 },
    });
    expect(resolved).toEqual({
      kind: 'number',
      descriptor: { distribution: 'normal', mean: 34, sd: 12 },
      bounds: { min: 18, max: 99 },
      // Marked as the author's, so the draw returns it as sampled rather than
      // rounding it the way it rounds the default window.
      declared: true,
      missingProbability: 0,
    });
  });

  it('defaults an undeclared number to a uniform window', () => {
    const resolved = resolveVariableSynthetic({ name: 'age', type: 'number' });
    expect(resolved).toMatchObject({
      kind: 'number',
      descriptor: { distribution: 'uniform', min: 18, max: 80 },
      declared: false,
    });
  });

  it('keeps missingness from a missing-only number declaration', () => {
    const resolved = resolveVariableSynthetic({
      name: 'age',
      type: 'number',
      synthetic: { missingProbability: 0.08 },
    });
    expect(resolved).toMatchObject({
      descriptor: { distribution: 'uniform', min: 18, max: 80 },
      missingProbability: 0.08,
    });
  });

  it('zeroes missingness on a required variable', () => {
    const variable = {
      name: 'age',
      type: 'number',
      validation: { required: true },
      synthetic: { missingProbability: 0.5 },
    } as unknown as Variable;
    expect(resolveVariableSynthetic(variable)).toMatchObject({
      missingProbability: 0,
    });
  });

  it('defaults scalar to uniform over the 0-1 domain', () => {
    expect(
      resolveVariableSynthetic({ name: 'closeness', type: 'scalar' }),
    ).toEqual({
      kind: 'scalar',
      descriptor: { distribution: 'uniform' },
      bounds: { min: 0, max: 1 },
      missingProbability: 0,
    });
  });

  it('passes a declared beta scalar through', () => {
    expect(
      resolveVariableSynthetic({
        name: 'closeness',
        type: 'scalar',
        synthetic: { distribution: 'beta', mean: 0.7, sd: 0.18 },
      }),
    ).toMatchObject({
      descriptor: { distribution: 'beta', mean: 0.7, sd: 0.18 },
    });
  });

  it('defaults boolean to a fair coin and honours a declared probability', () => {
    expect(
      resolveVariableSynthetic({ name: 'smoker', type: 'boolean' }),
    ).toMatchObject({ kind: 'boolean', probabilityTrue: 0.5 });
    expect(
      resolveVariableSynthetic({
        name: 'smoker',
        type: 'boolean',
        synthetic: { probabilityTrue: 0.7 },
      }),
    ).toMatchObject({ probabilityTrue: 0.7 });
  });

  it('gives ordinal equal weights over distinct values by default', () => {
    const resolved = resolveVariableSynthetic({
      name: 'strength',
      type: 'ordinal',
      options: [
        { label: 'Weak', value: 1 },
        { label: 'Also weak', value: 1 },
        { label: 'Strong', value: 2 },
      ],
    });
    expect(resolved).toMatchObject({
      kind: 'ordinal',
      values: [1, 2],
      weights: [1, 1],
    });
  });

  it('fills omitted ordinal weights with the default weight', () => {
    const resolved = resolveVariableSynthetic({
      name: 'strength',
      type: 'ordinal',
      options: [
        { label: 'Weak', value: 1 },
        { label: 'Medium', value: 2 },
        { label: 'Strong', value: 3 },
      ],
      synthetic: { optionWeights: [{ value: 3, weight: 5 }] },
    });
    expect(resolved).toMatchObject({ values: [1, 2, 3], weights: [1, 1, 5] });
  });

  it('defaults categorical to equal weights and uniform legal counts', () => {
    const resolved = resolveVariableSynthetic({
      name: 'category',
      type: 'categorical',
      options,
    });
    expect(resolved).toMatchObject({
      kind: 'categorical',
      values: ['friend', 'family', 'coworker'],
      weights: [1, 1, 1],
    });
    if (resolved.kind !== 'categorical') throw new Error('unexpected kind');
    expect(resolved.selectionCounts.map((entry) => entry.count)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(resolved.selectionCounts[0]?.probability).toBeCloseTo(0.25);
  });

  it.each([
    ['required forbids zero', { required: true }, [1, 2, 3]],
    ['maxSelected caps counts', { maxSelected: 2 }, [0, 1, 2]],
    ['minSelected floors positive counts', { minSelected: 2 }, [0, 2, 3]],
  ])('%s in the default count table', (_label, validation, expected) => {
    const resolved = resolveVariableSynthetic({
      name: 'category',
      type: 'categorical',
      options,
      validation,
    });
    if (resolved.kind !== 'categorical') throw new Error('unexpected kind');
    expect(resolved.selectionCounts.map((entry) => entry.count)).toEqual(
      expected,
    );
  });

  it('limits default counts to positively-weighted values', () => {
    const resolved = resolveVariableSynthetic({
      name: 'category',
      type: 'categorical',
      options,
      synthetic: { optionWeights: [{ value: 'coworker', weight: 0 }] },
    });
    if (resolved.kind !== 'categorical') throw new Error('unexpected kind');
    expect(resolved.selectionCounts.map((entry) => entry.count)).toEqual([
      0, 1, 2,
    ]);
  });

  it('passes a declared selection-count table through', () => {
    const table = [
      { count: 1, probability: 0.4 },
      { count: 2, probability: 0.6 },
    ];
    const resolved = resolveVariableSynthetic({
      name: 'category',
      type: 'categorical',
      options,
      synthetic: { selectionCount: { probabilities: table } },
    });
    expect(resolved).toMatchObject({ selectionCounts: table });
  });

  it('defaults datetime to a window-uniform draw', () => {
    expect(
      resolveVariableSynthetic({ name: 'dateMet', type: 'datetime' }),
    ).toEqual({
      kind: 'datetime',
      descriptor: { distribution: 'uniform' },
      missingProbability: 0,
    });
  });

  it('passes a declared datetime normal through', () => {
    expect(
      resolveVariableSynthetic({
        name: 'dateMet',
        type: 'datetime',
        synthetic: { distribution: 'normal', mean: '2010-06-15', sdDays: 365 },
      }),
    ).toMatchObject({
      descriptor: { distribution: 'normal', mean: '2010-06-15', sdDays: 365 },
    });
  });

  it('infers personName for name-like text variables only', () => {
    expect(inferTextGenerator('name')).toBe('personName');
    expect(inferTextGenerator('first_name')).toBe('personName');
    expect(inferTextGenerator('Nickname')).toBe('personName');
    expect(inferTextGenerator('notes')).toBe('neutralWords');

    expect(
      resolveVariableSynthetic({ name: 'nickname', type: 'text' }),
    ).toMatchObject({ generator: 'personName' });
    expect(
      resolveVariableSynthetic({ name: 'notes', type: 'text' }),
    ).toMatchObject({ generator: 'neutralWords' });
  });

  it('prefers a declared text generator over inference', () => {
    expect(
      resolveVariableSynthetic({
        name: 'name',
        type: 'text',
        synthetic: { generator: 'occupation' },
      }),
    ).toMatchObject({ generator: 'occupation' });
  });
});
