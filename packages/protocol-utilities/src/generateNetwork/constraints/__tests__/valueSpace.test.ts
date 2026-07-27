import { describe, expect, it } from 'vitest';

import { buildVariableConstraints } from '../buildConstraints';
import type { ConstrainedVariable } from '../types';
import { valueSpaceSize } from '../valueSpace';

const TODAY = '2026-07-27';

function make(
  entry: Parameters<typeof buildVariableConstraints>[0],
): ConstrainedVariable {
  return { entry, constraints: buildVariableConstraints(entry, TODAY) };
}

describe('valueSpaceSize', () => {
  it('gives boolean exactly two values', () => {
    expect(
      valueSpaceSize(make({ id: 'v', name: 'V', type: 'boolean' }), 100),
    ).toBe(2);
  });

  it('gives ordinal its option count', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'ordinal',
      options: [
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
        { label: 'C', value: 3 },
      ],
    });
    expect(valueSpaceSize(variable, 100)).toBe(3);
  });

  it('counts categorical subsets within the selection bounds', () => {
    // 3 options, 1 or 2 selected: C(3,1) + C(3,2) = 3 + 3 = 6
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'categorical',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ],
      validation: { minSelected: 1, maxSelected: 2 },
    });
    expect(valueSpaceSize(variable, 100)).toBe(6);
  });

  it('counts a bounded integer range inclusively', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 1, maxValue: 3 },
    });
    expect(valueSpaceSize(variable, 100)).toBe(3);
  });

  it('treats an unbounded number as unbounded', () => {
    expect(
      valueSpaceSize(make({ id: 'v', name: 'V', type: 'number' }), 100),
    ).toBe('unbounded');
  });

  it('counts the steps in a bounded date window', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '2020-01-01', max: '2024-01-01' },
    });
    expect(valueSpaceSize(variable, 100)).toBe(5);
  });

  it('treats a date variable with no bounds as unbounded', () => {
    const variable = make({ id: 'v', name: 'V', type: 'datetime' });
    expect(valueSpaceSize(variable, 100)).toBe('unbounded');
  });

  it('returns zero rather than a negative count for an inverted date window', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '2024-01-01', max: '2020-01-01' },
    });
    expect(valueSpaceSize(variable, 100)).toBe(0);
  });

  it('treats text with no maxLength as unbounded', () => {
    expect(
      valueSpaceSize(make({ id: 'v', name: 'V', type: 'text' }), 100),
    ).toBe('unbounded');
  });

  it('counts text within a tight length budget', () => {
    // Exactly one character from a 36-symbol alphabet.
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { minLength: 1, maxLength: 1 },
    });
    expect(valueSpaceSize(variable, 100)).toBe(36);
  });

  it('counts text at the one length a draw is made at', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { minLength: 1, maxLength: 3 },
    });
    // Every draw is three characters long, so the space is 36 ** 3 rather than
    // the 36 + 36 ** 2 + 36 ** 3 the whole length range would offer.
    expect(valueSpaceSize(variable, 1_000_000)).toBe(36 ** 3);
  });

  it('counts the rounding grid a scalar draw lands on', () => {
    expect(
      valueSpaceSize(make({ id: 'v', name: 'V', type: 'scalar' }), 1_000),
    ).toBe(101);
  });

  it('counts the rounding grid over an explicit scalar range', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'scalar',
      validation: { minValue: 0.25, maxValue: 0.5 },
    });
    expect(valueSpaceSize(variable, 1_000)).toBe(26);
  });

  it('stops counting once the space reaches the ceiling', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 0, maxValue: 1_000_000 },
    });
    expect(valueSpaceSize(variable, 10)).toBe('unbounded');
  });

  it('treats layout and location as unbounded', () => {
    expect(
      valueSpaceSize(make({ id: 'v', name: 'V', type: 'layout' }), 100),
    ).toBe('unbounded');
  });
});
