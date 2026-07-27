import { describe, expect, it } from 'vitest';

import { buildVariableConstraints } from '../generateNetwork/constraints/buildConstraints';
import type { ConstrainedVariable } from '../generateNetwork/constraints/types';
import { valueKey } from '../generateNetwork/constraints/uniqueRegistry';
import { valueSpaceSize } from '../generateNetwork/constraints/valueSpace';
import type { VariableEntry } from '../types';
import { ValueGenerator } from '../ValueGenerator';

const TODAY = '2026-07-27';

/**
 * Today written at each resolution a picker emits, so a drawn value is held
 * against a ceiling of its own precision. A year compared against the full date
 * lands the right way round by lexical accident, which says nothing about the
 * invariant: no draw is later than today, read at whatever precision it carries.
 */
const TODAY_AT = {
  year: TODAY.slice(0, 4),
  month: TODAY.slice(0, 7),
  full: TODAY,
};

function make(entry: VariableEntry): ConstrainedVariable {
  return { entry, constraints: buildVariableConstraints(entry, TODAY) };
}

function categoricalWith(
  optionCount: number,
  validation: Record<string, unknown>,
): ConstrainedVariable {
  return make({
    id: 'v',
    name: 'V',
    type: 'categorical',
    options: Array.from({ length: optionCount }, (_, at) => ({
      label: `Option ${at + 1}`,
      value: `o${at + 1}`,
    })),
    validation,
  });
}

/**
 * A variable whose value bounds were narrowed after its rules were read, as the
 * comparator machinery narrows them. Scalar has no declared bounds to narrow —
 * the schema accepts none, and `buildVariableConstraints` gives every scalar the
 * normalised scale — so a scalar sub-range can only arrive this way.
 */
function narrowed(
  entry: VariableEntry,
  bounds: { minValue?: number; maxValue?: number },
): ConstrainedVariable {
  const variable = make(entry);
  return {
    entry: variable.entry,
    constraints: { ...variable.constraints, ...bounds },
  };
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
    const variable = narrowed(
      { id: 'v', name: 'V', type: 'scalar' },
      { minValue: 0.25, maxValue: 0.5 },
    );

    for (let index = 0; index < 25; index++) {
      const value = Number(gen.generateConstrained(variable, index));
      expect(value).toBeGreaterThanOrEqual(0.25);
      expect(value).toBeLessThanOrEqual(0.5);
    }
  });

  // A scalar is recorded on a normalised 0-1 scale, and the slider that collects
  // one renders that range whatever else it is told. A bound outside it is
  // therefore not a range to draw from but a bound to fold back in.
  it('keeps a scalar inside the normalised scale whatever it is bounded by', () => {
    const gen = new ValueGenerator(1);
    const ranges = [
      { minValue: -5, maxValue: 5 },
      { minValue: -1, maxValue: -0.02 },
      { minValue: 1.01, maxValue: 2 },
      { minValue: 0.5, maxValue: 100 },
    ];

    for (const bounds of ranges) {
      const variable = narrowed({ id: 'v', name: 'V', type: 'scalar' }, bounds);
      for (let index = 0; index < 100; index++) {
        const value = Number(gen.generateConstrained(variable, index));
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('draws a scalar over the whole scale when nothing narrows it', () => {
    const gen = new ValueGenerator(1);
    const variable = make({ id: 'v', name: 'V', type: 'scalar' });
    const drawn = new Set<number>();

    for (let index = 0; index < 200; index++) {
      const value = Number(gen.generateConstrained(variable, index));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      drawn.add(value);
    }

    expect(drawn.size).toBeGreaterThan(1);
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

    for (const bounds of ranges) {
      const variable = narrowed({ id: 'v', name: 'V', type: 'scalar' }, bounds);
      for (let index = 0; index < 200; index++) {
        const value = Number(gen.generateConstrained(variable, index));
        expect(value).toBeGreaterThanOrEqual(bounds.minValue);
        expect(value).toBeLessThanOrEqual(bounds.maxValue);
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

  // What feasibility spends. It accepts a `unique` variable once
  // `valueSpaceSize` reports at least one value per entity, so every value that
  // count includes has to be reachable by a distinct sequence number — a draw
  // that walks fewer of them passes the analysis and then runs out mid-network.
  it.each([
    { options: 4, minSelected: 2, maxSelected: 2, size: 6 },
    { options: 4, minSelected: 1, maxSelected: 4, size: 15 },
    { options: 5, minSelected: 2, maxSelected: 3, size: 20 },
    { options: 3, minSelected: 1, maxSelected: 3, size: 7 },
    { options: 6, minSelected: 3, maxSelected: 3, size: 20 },
  ])(
    'reaches every one of the $size selections counted for $options options over $minSelected-$maxSelected',
    ({ options, minSelected, maxSelected, size }) => {
      const gen = new ValueGenerator(1);
      const variable = categoricalWith(options, {
        minSelected,
        maxSelected,
        unique: true,
      });

      expect(valueSpaceSize(variable, size + 1)).toBe(size);

      const drawn = new Set<string>();
      for (let seq = 0; seq < size; seq++) {
        const value = gen.generateConstrained(variable, 0, {
          distinctSeq: seq,
        });
        if (!Array.isArray(value)) {
          throw new Error(`expected an array, received ${typeof value}`);
        }
        expect(value.length).toBeGreaterThanOrEqual(minSelected);
        expect(value.length).toBeLessThanOrEqual(maxSelected);
        expect(new Set(value).size).toBe(value.length);
        // Keyed the way the unique registry keys a claim, so two orderings of
        // one selection count as the collision the registry would call it.
        drawn.add(valueKey(value));
      }

      expect(drawn.size).toBe(size);
    },
  );

  // The default floor of 18 is a realism default for ages, not a rule, so a
  // declared ceiling below it wins. `SyntheticInterview.getNetwork` draws
  // straight from `buildVariableConstraints`, with nothing between the declared
  // bounds and the draw to lower a floor left above the ceiling.
  it('honours a number ceiling below the default floor', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { maxValue: 5 },
    });

    for (let index = 0; index < 25; index++) {
      expect(
        Number(gen.generateConstrained(variable, index)),
      ).toBeLessThanOrEqual(5);
      expect(
        Number(
          gen.generateConstrained(variable, index, { distinctSeq: index }),
        ),
      ).toBeLessThanOrEqual(5);
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
        expect(value <= TODAY_AT[type]).toBe(true);
      }
    }
  });

  // A DatePicker given no `min` offers no year before 1920 (fresco-ui's
  // DatePicker.tsx, DEFAULT_MIN), so an earlier value passes every validator
  // and still cannot be entered or shown.
  it('keeps an unbounded unique date inside the years its picker offers', () => {
    const gen = new ValueGenerator(1, TODAY);

    for (const type of ['year', 'month', 'full'] as const) {
      const variable = make({
        id: 'v',
        name: 'V',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type },
        validation: { unique: true },
      });

      for (let seq = 0; seq < 60; seq++) {
        const value = String(
          gen.generateConstrained(variable, 0, { distinctSeq: seq }),
        );
        expect(value >= '1920').toBe(true);
        expect(value <= TODAY_AT[type]).toBe(true);
      }
    }
  });

  // The floor stands in for a bound the protocol left open. One the protocol
  // declares is the picker's own `min`, which the field then offers.
  it('draws inside a declared window that starts before the picker default', () => {
    const gen = new ValueGenerator(1, TODAY);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '1850-01-01', max: '1900-01-01' },
      validation: { unique: true },
    });

    const drawn = new Set<string>();
    for (let seq = 0; seq < 51; seq++) {
      const value = String(
        gen.generateConstrained(variable, 0, { distinctSeq: seq }),
      );
      expect(value >= '1850').toBe(true);
      expect(value <= '1900').toBe(true);
      drawn.add(value);
    }

    expect(drawn.size).toBe(51);
  });

  it('is deterministic for a given seed', () => {
    const variable = make({ id: 'v', name: 'V', type: 'text' });
    const first = new ValueGenerator(7).generateConstrained(variable, 0);
    const second = new ValueGenerator(7).generateConstrained(variable, 0);
    expect(first).toBe(second);
  });
});
