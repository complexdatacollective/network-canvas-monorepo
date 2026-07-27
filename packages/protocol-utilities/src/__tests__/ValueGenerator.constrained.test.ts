import { describe, expect, it } from 'vitest';

import { buildVariableConstraints } from '../generateNetwork/constraints/buildConstraints';
import type { ConstrainedVariable } from '../generateNetwork/constraints/types';
import type { VariableEntry } from '../types';
import { ValueGenerator } from '../ValueGenerator';

const TODAY = '2026-07-27';

function make(entry: VariableEntry): ConstrainedVariable {
  return { entry, constraints: buildVariableConstraints(entry, TODAY) };
}

describe('generateConstrained', () => {
  it('respects an exact text length', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { minLength: 24, maxLength: 24 },
    });

    for (let index = 0; index < 25; index++) {
      expect(String(gen.generateConstrained(variable, index))).toHaveLength(24);
    }
  });

  it('respects a text maximum shorter than a generated name', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { maxLength: 3 },
    });

    for (let index = 0; index < 25; index++) {
      expect(
        String(gen.generateConstrained(variable, index)).length,
      ).toBeLessThanOrEqual(3);
    }
  });

  it('produces distinct text for distinct sequence numbers within the budget', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { minLength: 24, maxLength: 24, unique: true },
    });

    const values = new Set<string>();
    for (let seq = 0; seq < 200; seq++) {
      const value = String(
        gen.generateConstrained(variable, 0, { distinctSeq: seq }),
      );
      expect(value).toHaveLength(24);
      values.add(value);
    }
    expect(values.size).toBe(200);
  });

  it('produces distinct text inside a short length budget', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { minLength: 1, maxLength: 3, unique: true },
    });

    const values = new Set<string>();
    for (let seq = 0; seq < 40; seq++) {
      const value = String(
        gen.generateConstrained(variable, 0, { distinctSeq: seq }),
      );
      expect(value.length).toBeGreaterThanOrEqual(1);
      expect(value.length).toBeLessThanOrEqual(3);
      values.add(value);
    }
    expect(values.size).toBe(40);
  });

  it('respects number bounds', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 10, maxValue: 12 },
    });

    for (let index = 0; index < 25; index++) {
      const value = Number(gen.generateConstrained(variable, index));
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThanOrEqual(12);
    }
  });

  it('respects scalar bounds', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'scalar',
      validation: { minValue: 0.25, maxValue: 0.5 },
    });

    for (let index = 0; index < 25; index++) {
      const value = Number(gen.generateConstrained(variable, index));
      expect(value).toBeGreaterThanOrEqual(0.25);
      expect(value).toBeLessThanOrEqual(0.5);
    }
  });

  it('stays inside a number range that holds no integer', () => {
    const gen = new ValueGenerator(1);
    const ranges = [
      { minValue: 0.1, maxValue: 0.9 },
      { minValue: 10.5, maxValue: 10.7 },
      { minValue: -3.2, maxValue: -3.1 },
    ];

    for (const validation of ranges) {
      const variable = make({ id: 'v', name: 'V', type: 'number', validation });
      for (let index = 0; index < 25; index++) {
        const value = Number(gen.generateConstrained(variable, index));
        expect(value).toBeGreaterThanOrEqual(validation.minValue);
        expect(value).toBeLessThanOrEqual(validation.maxValue);
      }
    }
  });

  it('stays inside scalar bounds that are off the rounding grid', () => {
    const gen = new ValueGenerator(1);
    const ranges = [
      { minValue: 0, maxValue: 0.996 },
      { minValue: 0.001, maxValue: 0.009 },
      { minValue: 0.004, maxValue: 0.5 },
    ];

    for (const validation of ranges) {
      const variable = make({ id: 'v', name: 'V', type: 'scalar', validation });
      for (let index = 0; index < 200; index++) {
        const value = Number(gen.generateConstrained(variable, index));
        expect(value).toBeGreaterThanOrEqual(validation.minValue);
        expect(value).toBeLessThanOrEqual(validation.maxValue);
      }
    }
  });

  it('respects categorical selection bounds', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'categorical',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
        { label: 'D', value: 'd' },
      ],
      validation: { minSelected: 2, maxSelected: 3 },
    });

    for (let index = 0; index < 25; index++) {
      const value = gen.generateConstrained(variable, index);
      if (!Array.isArray(value)) {
        throw new Error(`expected an array, received ${typeof value}`);
      }
      expect(value.length).toBeGreaterThanOrEqual(2);
      expect(value.length).toBeLessThanOrEqual(3);
      expect(new Set(value).size).toBe(value.length);
    }
  });

  it('emits a datetime at the component resolution inside its window', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'month', min: '2020-01-01', max: '2020-06-30' },
    });

    for (let index = 0; index < 25; index++) {
      const value = String(gen.generateConstrained(variable, index));
      expect(value).toMatch(/^\d{4}-\d{2}$/);
      expect(value >= '2020-01').toBe(true);
      expect(value <= '2020-06').toBe(true);
    }
  });

  it('emits a full-resolution date for RelativeDatePicker inside its window', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { anchor: TODAY, before: 30, after: 0 },
    });

    for (let index = 0; index < 25; index++) {
      const value = String(gen.generateConstrained(variable, index));
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(value >= '2026-06-27').toBe(true);
      expect(value <= TODAY).toBe(true);
    }
  });

  it('resolves an unbounded date against the injected date, not the clock', () => {
    const variable = make({ id: 'v', name: 'V', type: 'datetime' });

    const first = new ValueGenerator(7, TODAY).generateConstrained(variable, 0);
    const second = new ValueGenerator(7, TODAY).generateConstrained(
      variable,
      0,
    );
    const later = new ValueGenerator(7, '2027-01-15').generateConstrained(
      variable,
      0,
    );

    expect(first).toBe(second);
    expect(later).not.toBe(first);
  });

  it('keeps unique dates in a real calendar range at every resolution', () => {
    const gen = new ValueGenerator(1, TODAY);

    for (const type of ['year', 'month'] as const) {
      const variable = make({
        id: 'v',
        name: 'V',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type },
        validation: { unique: true },
      });

      for (let seq = 0; seq < 50; seq++) {
        const value = String(
          gen.generateConstrained(variable, 0, { distinctSeq: seq }),
        );
        expect(value >= '1000').toBe(true);
        expect(value <= TODAY).toBe(true);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const variable = make({ id: 'v', name: 'V', type: 'text' });
    const first = new ValueGenerator(7).generateConstrained(variable, 0);
    const second = new ValueGenerator(7).generateConstrained(variable, 0);
    expect(first).toBe(second);
  });
});

describe('generateComparedTo', () => {
  it('produces a number strictly greater than its target', () => {
    const gen = new ValueGenerator(1);
    const variable = make({ id: 'v', name: 'V', type: 'number' });
    const value = Number(gen.generateComparedTo(variable, 40, 'greater'));
    expect(value).toBeGreaterThan(40);
  });

  it('produces a number strictly less than its target', () => {
    const gen = new ValueGenerator(1);
    const variable = make({ id: 'v', name: 'V', type: 'number' });
    const value = Number(gen.generateComparedTo(variable, 40, 'less'));
    expect(value).toBeLessThan(40);
  });

  it('allows equality for the inclusive directions', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 40, maxValue: 40 },
    });
    expect(Number(gen.generateComparedTo(variable, 40, 'greaterOrEqual'))).toBe(
      40,
    );
  });

  it('produces a date after its target at the window resolution', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2020-12-31' },
    });

    const value = String(
      gen.generateComparedTo(variable, '2020-06-15', 'greater'),
    );
    expect(value > '2020-06-15').toBe(true);
    expect(value <= '2020-12-31').toBe(true);
  });

  it('clamps into its own bounds', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 0, maxValue: 100 },
    });
    const value = Number(gen.generateComparedTo(variable, 99, 'greater'));
    expect(value).toBe(100);
  });

  it('rounds before clamping to a fractional maximum', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 0, maxValue: 10.6 },
    });
    const value = Number(gen.generateComparedTo(variable, 10, 'greater'));
    expect(value).toBeGreaterThan(10);
    expect(value).toBeLessThanOrEqual(10.6);
  });

  it('rounds before clamping to a fractional minimum', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 0.4 },
    });
    const value = Number(gen.generateComparedTo(variable, 1, 'less'));
    expect(value).toBeGreaterThanOrEqual(0.4);
    expect(value).toBeLessThan(1);
  });

  it('rounds before clamping a scalar to a fractional maximum', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'scalar',
      validation: { minValue: 0, maxValue: 0.996 },
    });
    const value = Number(gen.generateComparedTo(variable, 0.99, 'greater'));
    expect(value).toBeGreaterThan(0.99);
    expect(value).toBeLessThanOrEqual(0.996);
  });

  it('clamps a date comparison against both ends of its window', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2020-12-31' },
    });

    expect(gen.generateComparedTo(variable, '2019-01-01', 'greater')).toBe(
      '2020-01-01',
    );
    expect(gen.generateComparedTo(variable, '2021-06-01', 'less')).toBe(
      '2020-12-31',
    );
  });

  it('falls back to an ordinary draw for a type no comparator supports', () => {
    const gen = new ValueGenerator(1);
    const booleanVariable = make({ id: 'v', name: 'V', type: 'boolean' });
    expect(
      typeof gen.generateComparedTo(booleanVariable, true, 'greater'),
    ).toBe('boolean');

    const optionValues = [1, 2, 5, 10];
    const ordinalVariable = make({
      id: 'o',
      name: 'O',
      type: 'ordinal',
      options: optionValues.map((value) => ({ label: String(value), value })),
    });
    expect(optionValues).toContain(
      gen.generateComparedTo(ordinalVariable, 5, 'greater'),
    );
  });

  it('falls back to an ordinary draw for a null target', () => {
    const gen = new ValueGenerator(1);

    const numberVariable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 10, maxValue: 12 },
    });
    const number = Number(
      gen.generateComparedTo(numberVariable, null, 'greater'),
    );
    expect(number).toBeGreaterThanOrEqual(10);
    expect(number).toBeLessThanOrEqual(12);

    const dateVariable = make({
      id: 'd',
      name: 'D',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2020-12-31' },
    });
    const date = String(gen.generateComparedTo(dateVariable, null, 'greater'));
    expect(date >= '2020-01-01').toBe(true);
    expect(date <= '2020-12-31').toBe(true);
  });
});
