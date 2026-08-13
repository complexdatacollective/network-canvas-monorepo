import { describe, expect, it } from 'vitest';

import { buildVariableConstraints } from '../generateNetwork/constraints/buildConstraints';
import type { ConstrainedVariable } from '../generateNetwork/constraints/types';
import { valueKey } from '../generateNetwork/constraints/uniqueRegistry';
import {
  MAX_TEXT_DRAW_LENGTH,
  valueSpaceSize,
} from '../generateNetwork/constraints/valueSpace';
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

/** Any stable scope key; these tests never cross entity scopes. */
const SCOPE = 'node:person';

describe('neutralForVariable', () => {
  it('keeps a missing Boolean attribute false when true is the first option', () => {
    const generator = new ValueGenerator(1);

    expect(
      generator.neutralForVariable({
        id: 'affected',
        name: 'Affected',
        type: 'boolean',
        component: 'Boolean',
        options: [
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ],
      }),
    ).toBe(false);
  });

  it('leaves a missing number attribute absent', () => {
    const generator = new ValueGenerator(1);

    expect(
      generator.neutralForVariable({
        id: 'score',
        name: 'Score',
        type: 'number',
      }),
    ).toBeUndefined();
  });
});

describe('generateConstrained', () => {
  it('returns no value when an option-backed variable has no domain', () => {
    const generator = new ValueGenerator(1);

    expect(
      generator.generateConstrained(
        make({ id: 'v', name: 'V', type: 'ordinal', options: [] }),
        0,
        SCOPE,
      ),
    ).toBeUndefined();
  });

  it('respects an exact text length', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { minLength: 24, maxLength: 24 },
    });

    for (let index = 0; index < 25; index++) {
      expect(
        String(gen.generateConstrained(variable, index, SCOPE)),
      ).toHaveLength(24);
    }
  });

  it('generates a text length just under the cap', () => {
    const gen = new ValueGenerator(1);
    const length = MAX_TEXT_DRAW_LENGTH - 1;
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'text',
      validation: { minLength: length, maxLength: length },
    });

    expect(String(gen.generateConstrained(variable, 0, SCOPE))).toHaveLength(
      length,
    );
    expect(
      String(gen.generateConstrained(variable, 0, SCOPE, { distinctSeq: 3 })),
    ).toHaveLength(length);
  });

  it('throws rather than allocating a floor past the cap', () => {
    // `analyseFeasibility` refuses such a protocol before a seed is consulted,
    // so reaching the draw means it was generated without that pass. Throwing
    // on the declared number is what keeps the `RangeError: Invalid string
    // length` — and the hundreds of megabytes the floors below it allocate —
    // off this path.
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'Bio',
      type: 'text',
      validation: { minLength: 1_000_000_000 },
    });

    const started = performance.now();
    expect(() => gen.generateConstrained(variable, 0, SCOPE)).toThrow(
      `"Bio" declares minLength 1000000000, beyond the ${MAX_TEXT_DRAW_LENGTH} characters a generated value can hold.`,
    );
    expect(performance.now() - started).toBeLessThan(1000);
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
        String(gen.generateConstrained(variable, index, SCOPE)).length,
      ).toBeLessThanOrEqual(3);
    }
  });

  it('uses the shortest realistic composition that satisfies a name variable minimum', () => {
    const seed = 17;
    const firstName = String(
      new ValueGenerator(seed).generateConstrained(
        make({ id: 'name', name: 'Name', type: 'text' }),
        0,
        SCOPE,
      ),
    );

    const firstAndLast = String(
      new ValueGenerator(seed).generateConstrained(
        make({
          id: 'name',
          name: 'Name',
          type: 'text',
          validation: { minLength: firstName.length + 1 },
        }),
        0,
        SCOPE,
      ),
    );
    expect(firstAndLast.startsWith(`${firstName} `)).toBe(true);

    const lastName = firstAndLast.slice(firstName.length + 1);
    const fullName = String(
      new ValueGenerator(seed).generateConstrained(
        make({
          id: 'name',
          name: 'Name',
          type: 'text',
          validation: { minLength: firstAndLast.length + 1 },
        }),
        0,
        SCOPE,
      ),
    );
    expect(fullName.startsWith(`${firstName} `)).toBe(true);
    expect(fullName.endsWith(` ${lastName}`)).toBe(true);
    expect(fullName.length).toBeGreaterThan(firstAndLast.length);
  });

  it('prefers a realistic name before the distinct sequence for a unique draw', () => {
    const seed = 17;
    const expected = new ValueGenerator(seed).generateConstrained(
      make({ id: 'name', name: 'name', type: 'text' }),
      0,
      SCOPE,
    );
    const actual = new ValueGenerator(seed).generateConstrained(
      make({
        id: 'name',
        name: 'name',
        type: 'text',
        validation: { unique: true },
      }),
      0,
      SCOPE,
      { distinctSeq: 0, preferRealisticName: true },
    );

    expect(actual).toBe(expected);
  });

  it('uses the text sequence when no realistic name composition meets the minimum', () => {
    const seed = 17;
    const firstName = String(
      new ValueGenerator(seed).generateConstrained(
        make({ id: 'name', name: 'name', type: 'text' }),
        0,
        SCOPE,
      ),
    );
    const firstAndLast = String(
      new ValueGenerator(seed).generateConstrained(
        make({
          id: 'name',
          name: 'name',
          type: 'text',
          validation: { minLength: firstName.length + 1 },
        }),
        0,
        SCOPE,
      ),
    );
    const fullName = String(
      new ValueGenerator(seed).generateConstrained(
        make({
          id: 'name',
          name: 'name',
          type: 'text',
          validation: { minLength: firstAndLast.length + 1 },
        }),
        0,
        SCOPE,
      ),
    );
    const minLength = fullName.length + 1;

    expect(
      new ValueGenerator(seed).generateConstrained(
        make({
          id: 'name',
          name: 'name',
          type: 'text',
          validation: { minLength },
        }),
        0,
        SCOPE,
      ),
    ).toBe('a'.repeat(minLength));
  });

  it('uses the text sequence when a realistic first name exceeds the maximum', () => {
    const seed = 17;
    const firstName = String(
      new ValueGenerator(seed).generateConstrained(
        make({ id: 'name', name: 'name', type: 'text' }),
        0,
        SCOPE,
      ),
    );
    const maxLength = Math.max(0, firstName.length - 1);

    expect(
      new ValueGenerator(seed).generateConstrained(
        make({
          id: 'name',
          name: 'name',
          type: 'text',
          validation: { maxLength },
        }),
        0,
        SCOPE,
      ),
    ).toBe('a'.repeat(maxLength));
  });

  it('does not perturb the general random sequence for a preferred realistic name', () => {
    const seed = 17;
    const control = new ValueGenerator(seed);
    const subject = new ValueGenerator(seed);

    subject.generateConstrained(
      make({
        id: 'name',
        name: 'name',
        type: 'text',
        validation: { unique: true },
      }),
      0,
      SCOPE,
      { distinctSeq: 0, preferRealisticName: true },
    );

    expect(subject.randomInt(0, 1_000_000)).toBe(
      control.randomInt(0, 1_000_000),
    );
  });

  it('does not let general random draws perturb preferred realistic names', () => {
    const seed = 17;
    const control = new ValueGenerator(seed);
    const subject = new ValueGenerator(seed);
    const nameVariable = make({
      id: 'name',
      name: 'name',
      type: 'text',
      validation: { unique: true },
    });

    subject.randomInt(0, 1_000_000);

    expect(
      subject.generateConstrained(nameVariable, 0, SCOPE, {
        distinctSeq: 0,
        preferRealisticName: true,
      }),
    ).toBe(
      control.generateConstrained(nameVariable, 0, SCOPE, {
        distinctSeq: 0,
        preferRealisticName: true,
      }),
    );
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
        gen.generateConstrained(variable, 0, SCOPE, { distinctSeq: seq }),
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
        gen.generateConstrained(variable, 0, SCOPE, { distinctSeq: seq }),
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
      const value = Number(gen.generateConstrained(variable, index, SCOPE));
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
      const value = Number(gen.generateConstrained(variable, index, SCOPE));
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
        const value = Number(gen.generateConstrained(variable, index, SCOPE));
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
      const value = Number(gen.generateConstrained(variable, index, SCOPE));
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
        const value = Number(gen.generateConstrained(variable, index, SCOPE));
        expect(value).toBeGreaterThanOrEqual(validation.minValue);
        expect(value).toBeLessThanOrEqual(validation.maxValue);
      }
    }
  });

  // A `unique` variable only terminates because each redraw is handed the next
  // sequence number and lands somewhere the earlier draws did not. The
  // fractional branch used to ignore that number and roll the random stream
  // again, so a range feasibility had counted as wide enough could still spend
  // the whole redraw budget recolliding — and refuse a satisfiable protocol on
  // whichever seeds happened to collide.
  it('walks a number range that holds no integer by sequence number', () => {
    const gen = new ValueGenerator(1);
    const cases = [
      { validation: { minValue: 0.001, maxValue: 0.099 }, size: 11 },
      { validation: { minValue: 0.001, maxValue: 0.009 }, size: 2 },
      { validation: { minValue: 10.5, maxValue: 10.7 }, size: 21 },
    ];

    for (const { validation, size } of cases) {
      const variable = make({ id: 'v', name: 'V', type: 'number', validation });
      expect(valueSpaceSize(variable, size + 1)).toBe(size);

      const drawn = new Set<string>();
      for (let seq = 0; seq < size; seq++) {
        const value = Number(
          gen.generateConstrained(variable, 0, SCOPE, { distinctSeq: seq }),
        );
        expect(value).toBeGreaterThanOrEqual(validation.minValue);
        expect(value).toBeLessThanOrEqual(validation.maxValue);
        drawn.add(valueKey(value));
      }

      expect(drawn.size).toBe(size);
      // One past the count wraps, so the space holds nothing further.
      const repeated = gen.generateConstrained(variable, 0, SCOPE, {
        distinctSeq: size,
      });
      if (repeated === undefined) throw new Error('Expected a number value');
      expect(drawn.has(valueKey(repeated))).toBe(true);
    }
  });

  // The same walk on the same grid, for the same reason: a scalar redraw that
  // went back to the random stream could recollide until the budget ran out.
  it('walks a scalar range by sequence number, bounds included', () => {
    const gen = new ValueGenerator(1);
    const cases = [
      { bounds: { minValue: 0, maxValue: 1 }, size: 101 },
      { bounds: { minValue: 0.001, maxValue: 0.009 }, size: 2 },
      { bounds: { minValue: 0.004, maxValue: 0.5 }, size: 51 },
    ];

    for (const { bounds, size } of cases) {
      const variable = narrowed({ id: 'v', name: 'V', type: 'scalar' }, bounds);
      expect(valueSpaceSize(variable, size + 1)).toBe(size);

      const drawn = new Set<string>();
      for (let seq = 0; seq < size; seq++) {
        const value = Number(
          gen.generateConstrained(variable, 0, SCOPE, { distinctSeq: seq }),
        );
        expect(value).toBeGreaterThanOrEqual(bounds.minValue);
        expect(value).toBeLessThanOrEqual(bounds.maxValue);
        drawn.add(valueKey(value));
      }

      expect(drawn.size).toBe(size);
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
        const value = Number(gen.generateConstrained(variable, index, SCOPE));
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
      const value = gen.generateConstrained(variable, index, SCOPE);
      if (!Array.isArray(value)) {
        throw new Error(`expected an array, received ${typeof value}`);
      }
      expect(value.length).toBeGreaterThanOrEqual(2);
      expect(value.length).toBeLessThanOrEqual(3);
      expect(new Set(value).size).toBe(value.length);
    }
  });

  // `maxSelected: 0` is satisfied by the empty selection and by nothing else:
  // the interview's own validator rejects every non-empty array against it
  // ("Too many items selected. Select a maximum of 0 values."). A draw that
  // selected one option regardless would fail the form it was generated for.
  it('selects nothing under a zero categorical ceiling', () => {
    const gen = new ValueGenerator(1);
    const variable = categoricalWith(3, { maxSelected: 0 });

    for (let index = 0; index < 6; index++) {
      expect(gen.generateConstrained(variable, index, SCOPE)).toEqual([]);
      expect(
        gen.generateConstrained(variable, index, SCOPE, { distinctSeq: index }),
      ).toEqual([]);
    }
  });

  // The schema requires a categorical to offer two options but not two values,
  // so an imported protocol can list one value under two labels. A selection is
  // a set: picking both entries hands back one value, which is a shorter answer
  // than the size the draw chose and one the interview rejects outright ("Too
  // few selected. Select at least 2 values."). Selecting values rather than
  // positions is what keeps every draw the size its own range names.
  it('draws full-size selections from an option list that repeats a value', () => {
    const gen = new ValueGenerator(1, TODAY);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'categorical',
      options: [
        { label: 'A', value: 'a' },
        { label: 'Also A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ],
      validation: { minSelected: 2, maxSelected: 2, unique: true },
    });

    // The three pairs three values make, not the six four positions make.
    expect(valueSpaceSize(variable, 100)).toBe(3);

    const drawn = new Set<string>();
    for (let seq = 0; seq < 3; seq++) {
      const value = gen.generateConstrained(variable, 0, SCOPE, {
        distinctSeq: seq,
      });
      if (!Array.isArray(value)) {
        throw new Error(`expected an array, received ${typeof value}`);
      }
      expect(value).toHaveLength(2);
      drawn.add(valueKey(value));
    }
    expect(drawn.size).toBe(3);

    for (let index = 0; index < 12; index++) {
      const value = gen.generateConstrained(variable, index, SCOPE);
      if (!Array.isArray(value)) {
        throw new Error(`expected an array, received ${typeof value}`);
      }
      expect(value).toHaveLength(2);
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
        const value = gen.generateConstrained(variable, 0, SCOPE, {
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

  // An ordinal option list can repeat a value for the same reason a categorical
  // one can: the schema requires two options, not two values. Feasibility counts
  // what `valueSpaceSize` reports, so every value it counts has to be reachable
  // by a distinct sequence number — a draw walking entries meets the repeated
  // value once per entry, exhausts the redraw budget the entity generator gives
  // it, and refuses a protocol the count called satisfiable.
  it('reaches every ordinal value counted for an option list that repeats one', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'ordinal',
      options: [
        ...Array.from({ length: 20 }, (_, at) => ({
          label: `Low ${at + 1}`,
          value: 1,
        })),
        { label: 'High', value: 2 },
      ],
      validation: { unique: true },
    });

    // The two values twenty-one entries carry, not the twenty-one entries.
    expect(valueSpaceSize(variable, 100)).toBe(2);

    const drawn = new Set<string>();
    for (let seq = 0; seq < 2; seq++) {
      const value = gen.generateConstrained(variable, 0, SCOPE, {
        distinctSeq: seq,
      });
      if (value === undefined) throw new Error('Expected an ordinal value');
      drawn.add(valueKey(value));
    }
    expect(drawn.size).toBe(2);

    // A free draw spreads over the same values. Walking entries would answer
    // with the repeated value on twenty indices out of twenty-one, which is a
    // sample of the option list's labels rather than of the data it records.
    const free = new Set<string>();
    for (let index = 0; index < 4; index++) {
      const value = gen.generateConstrained(variable, index, SCOPE);
      if (value === undefined) throw new Error('Expected an ordinal value');
      free.add(valueKey(value));
    }
    expect(free.size).toBe(2);
  });

  // What holds the change above safe. An option list whose values are already
  // distinct — every list a protocol is likely to declare — is walked exactly as
  // it always was, because deduplication keeps first occurrences in order. These
  // are the values the draw emitted before it read the list by value.
  it('draws ordinal values from the distinct list, free and sequenced', () => {
    const gen = new ValueGenerator(1);
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'ordinal',
      options: [
        { label: 'Never', value: 1 },
        { label: 'Sometimes', value: 2 },
        { label: 'Often', value: 3 },
      ],
    });

    // Free draws are weighted samples over the distinct values (equal weights
    // by default), no longer an index-cycled walk.
    const free = Array.from({ length: 30 }, (_, index) =>
      gen.generateConstrained(variable, index, SCOPE),
    );
    for (const value of free) {
      expect([1, 2, 3]).toContain(value);
    }
    expect(new Set(free).size).toBe(3);

    // The sequence walk stays exhaustive and ordered: `unique` slots depend
    // on meeting every distinct value once per cycle.
    const sequenced = Array.from({ length: 7 }, (_, seq) =>
      gen.generateConstrained(variable, 0, SCOPE, { distinctSeq: seq }),
    );
    expect(sequenced).toEqual([1, 2, 3, 1, 2, 3, 1]);
  });

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
        Number(gen.generateConstrained(variable, index, SCOPE)),
      ).toBeLessThanOrEqual(5);
      expect(
        Number(
          gen.generateConstrained(variable, index, SCOPE, {
            distinctSeq: index,
          }),
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
      const value = String(gen.generateConstrained(variable, index, SCOPE));
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
      const value = String(gen.generateConstrained(variable, index, SCOPE));
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(value >= '2026-06-27').toBe(true);
      expect(value <= TODAY).toBe(true);
    }
  });

  // A window left open at the top, which is what a descriptor assembled outside
  // `buildVariableConstraints` carries: its own windows close at the last date
  // the field offers, so the generator's fallback — and the date injected into
  // it — is what an open one exercises.
  it('resolves an unbounded date against the injected date, not the clock', () => {
    const entry: VariableEntry = { id: 'v', name: 'V', type: 'datetime' };
    const variable: ConstrainedVariable = {
      entry,
      constraints: {
        ...buildVariableConstraints(entry, TODAY),
        dateWindow: { resolution: 'full' },
      },
    };

    const first = new ValueGenerator(7, TODAY).generateConstrained(
      variable,
      0,
      SCOPE,
    );
    const second = new ValueGenerator(7, TODAY).generateConstrained(
      variable,
      0,
      SCOPE,
    );
    const later = new ValueGenerator(7, '2027-01-15').generateConstrained(
      variable,
      0,
      SCOPE,
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
          gen.generateConstrained(variable, 0, SCOPE, { distinctSeq: seq }),
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
          gen.generateConstrained(variable, 0, SCOPE, { distinctSeq: seq }),
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
        gen.generateConstrained(variable, 0, SCOPE, { distinctSeq: seq }),
      );
      expect(value >= '1850').toBe(true);
      expect(value <= '1900').toBe(true);
      drawn.add(value);
    }

    expect(drawn.size).toBe(51);
  });

  it('is deterministic for a given seed', () => {
    const variable = make({ id: 'v', name: 'V', type: 'text' });
    const first = new ValueGenerator(7).generateConstrained(variable, 0, SCOPE);
    const second = new ValueGenerator(7).generateConstrained(
      variable,
      0,
      SCOPE,
    );
    expect(first).toBe(second);
  });
});
