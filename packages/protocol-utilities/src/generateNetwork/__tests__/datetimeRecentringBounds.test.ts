import { describe, expect, it } from 'vitest';

import type { VariableEntry } from '../../types';
import { ValueGenerator } from '../../ValueGenerator';
import { buildVariableConstraints } from '../constraints/buildConstraints';
import type { ConstrainedVariable } from '../constraints/types';

const TODAY = '2026-08-13';

function make(entry: VariableEntry): ConstrainedVariable {
  return { entry, constraints: buildVariableConstraints(entry, TODAY) };
}

const SCOPE = 'node:person';

describe('datetime normal draws against the descriptor own declared max', () => {
  it('never draws past the descriptor declared max when the mean lies beyond it', () => {
    const gen = new ValueGenerator(42, TODAY);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      // No authored parameters.min/max: full resolution, derived ceiling.
      synthetic: {
        distribution: 'normal',
        mean: '2030-01-01',
        sdDays: 30,
        max: '2020-01-01',
      },
    });

    // Sanity: the field window is the derived stand-in the claim describes.
    expect(variable.constraints.dateWindow).toMatchObject({
      resolution: 'full',
      max: TODAY,
      maxDerived: true,
    });

    for (let index = 0; index < 20; index++) {
      const value = String(gen.generateConstrained(variable, index, SCOPE));
      // Truncation semantics: a drawn value is clamped into the effective
      // window, whose ceiling is the descriptor's own declared max.
      expect(value <= '2020-01-01').toBe(true);
    }
  });
});
