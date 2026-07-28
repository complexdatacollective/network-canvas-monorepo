import { describe, expect, it } from 'vitest';

import type { VariableValue } from '@codaco/shared-consts';

import { ValueGenerator } from '../../../ValueGenerator';
import { buildVariableConstraints } from '../buildConstraints';
import type { ConstrainedVariable } from '../types';
import { valueKey } from '../uniqueRegistry';
import { selectionSizeRange, valueSpaceSize } from '../valueSpace';

const TODAY = '2026-07-27';

function make(
  entry: Parameters<typeof buildVariableConstraints>[0],
): ConstrainedVariable {
  return { entry, constraints: buildVariableConstraints(entry, TODAY) };
}

/** A date variable whose picker declares nothing but the resolution it writes. */
function openDate(
  type: 'year' | 'month' | 'full',
  unique: boolean,
): ConstrainedVariable {
  return make({
    id: 'v',
    name: 'V',
    type: 'datetime',
    component: 'DatePicker',
    parameters: { type },
    ...(unique ? { validation: { unique: true } } : {}),
  });
}

/**
 * The distinct values a draw reaches over the first `ranks` sequence numbers,
 * keyed the way the unique registry keys them. The sequence wraps at the end of
 * the space, so walking well past it shows the space holds nothing further.
 */
function reachedByDraw(
  variable: ConstrainedVariable,
  ranks: number,
): Set<string> {
  const keys = new Set<string>();
  for (const value of drawnBySequence(variable, ranks)) {
    keys.add(valueKey(value));
  }
  return keys;
}

/** The same walk, keeping the values themselves so bounds can be checked. */
function drawnBySequence(
  variable: ConstrainedVariable,
  ranks: number,
): VariableValue[] {
  const generator = new ValueGenerator(1, TODAY);
  const values: VariableValue[] = [];

  for (let seq = 0; seq < ranks; seq++) {
    values.push(
      generator.generateConstrained(variable, 0, { distinctSeq: seq }),
    );
  }

  return values;
}

/**
 * A scalar whose bounds were narrowed after its rules were read, as the
 * comparator machinery narrows them: the schema accepts no `minValue`/
 * `maxValue` on the type, so a scalar sub-range can only arrive that way.
 */
function narrowedScalar(bounds: {
  minValue: number;
  maxValue: number;
}): ConstrainedVariable {
  const variable = make({
    id: 'v',
    name: 'V',
    type: 'scalar',
    component: 'VisualAnalogScale',
  });
  return {
    entry: variable.entry,
    constraints: { ...variable.constraints, ...bounds },
  };
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
    expect(reachedByDraw(variable, 64).size).toBe(3);
  });

  // The schema requires two options but not two values, so an imported protocol
  // can label one value twice. Both entries draw that one value, and counting
  // entries is what let a `unique` ordinal pass this analysis and then exhaust
  // generation on the second entity.
  it('counts an ordinal by its distinct option values, not its entries', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'ordinal',
      options: [
        { label: 'A', value: 1 },
        { label: 'B', value: 1 },
        { label: 'C', value: 2 },
      ],
    });
    expect(valueSpaceSize(variable, 100)).toBe(2);
    expect(reachedByDraw(variable, 64).size).toBe(2);
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
    expect(reachedByDraw(variable, 64).size).toBe(6);
  });

  // The same defect over subsets, where a duplicated value inflates the
  // combination count rather than a single tally: three entries carrying two
  // values are drawn as the three selections those two values make, not the
  // seven the positions do.
  it('counts a categorical by its distinct option values, not its entries', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'categorical',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'a' },
        { label: 'C', value: 'b' },
      ],
      validation: { unique: true },
    });
    expect(valueSpaceSize(variable, 100)).toBe(3);
    expect(reachedByDraw(variable, 64).size).toBe(3);
  });

  // A selection floor above the distinct values is not met by anything: two
  // entries of one value are one member of a selection, and `minSelected: 2` is
  // asking for a second the list does not have. The range collapses to the one
  // value the draw can reach, and the count reports that one value — what no
  // count can do is invent the second. Refusing such a protocol belongs to
  // feasibility's own `minSelected` guard, which still measures against the
  // entry count and so does not yet see this one.
  it('counts a categorical whose selection floor exceeds its distinct values', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'categorical',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'a' },
      ],
      validation: { minSelected: 2, maxSelected: 2 },
    });
    expect(selectionSizeRange(variable)).toEqual({ min: 1, max: 1 });
    expect(valueSpaceSize(variable, 100)).toBe(1);
    expect(reachedByDraw(variable, 64).size).toBe(1);
  });

  // The selection range is what the draw walks and what the count is summed
  // over, so it has to be sized in values too. Four entries carrying three
  // values reach a three-value selection and never a four-value one, whatever
  // `maxSelected` says.
  it('sizes the selection range by distinct values, not by entries', () => {
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
      validation: { minSelected: 1, maxSelected: 4 },
    });
    expect(selectionSizeRange(variable)).toEqual({ min: 1, max: 3 });
    // C(3,1) + C(3,2) + C(3,3) = 3 + 3 + 1
    expect(valueSpaceSize(variable, 100)).toBe(7);
    expect(reachedByDraw(variable, 64).size).toBe(7);
  });

  // Selection bounds the protocol leaves out are the generator's own defaults,
  // and those differ by whether the variable has to hold a distinct value: a
  // `unique` categorical reaches every subset size, an ordinary one keeps its
  // selections to one or two options.
  it.each([
    { unique: false, size: 10 },
    { unique: true, size: 15 },
  ])(
    'counts the subset sizes a categorical with unique $unique is drawn over',
    ({ unique, size }) => {
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
        ...(unique ? { validation: { unique: true } } : {}),
      });
      expect(valueSpaceSize(variable, 100)).toBe(size);
    },
  );

  // The draw never emits an empty selection, whatever `minSelected` says, so
  // the empty set is not one of the values it can reach.
  it('leaves the empty selection out of a categorical count', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'categorical',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      validation: { minSelected: 0, maxSelected: 2 },
    });
    expect(valueSpaceSize(variable, 100)).toBe(3);
  });

  // The mirror of the case above: `maxSelected: 0` leaves the empty selection
  // as the only value the interview accepts, so it is the one ceiling under
  // which the draw does emit it, and the one count that includes it.
  it('counts the empty selection as the only value under a zero ceiling', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'categorical',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      validation: { maxSelected: 0 },
    });
    expect(valueSpaceSize(variable, 100)).toBe(1);
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

  // The draw walks whole values wherever the range holds one, so this range
  // reaches 63 values rather than the 6201 rounding-grid points inside it.
  it('counts whole values over a range that holds integers', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 18, maxValue: 80 },
    });
    expect(valueSpaceSize(variable, 10_000)).toBe(63);
  });

  // No integer lies between 0.1 and 0.9, but the range is not empty: the draw
  // falls back to the two-decimal grid inside it, which is 0.10 through 0.90.
  it('counts the rounding grid a range holding no integer is drawn on', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 0.1, maxValue: 0.9 },
    });
    expect(valueSpaceSize(variable, 1_000)).toBe(81);
  });

  // Narrower than one grid step, so every draw rounds out of the range and is
  // clamped back to whichever bound it passed — which is two values, not one.
  // Both are inside the range, so the `minValue` and `maxValue` a participant's
  // form applies accept them; counting one refused a two-entity stage a
  // protocol could fill.
  it.each([
    { min: 10.501, max: 10.509 },
    { min: 0.001, max: 0.009 },
    { min: 0.004, max: 0.006 },
  ])(
    'counts both clamped ends of [$min, $max], narrower than one grid step',
    ({ min, max }) => {
      const variable = make({
        id: 'v',
        name: 'V',
        type: 'number',
        validation: { minValue: min, maxValue: max },
      });

      expect(valueSpaceSize(variable, 100)).toBe(2);
      expect(reachedByDraw(variable, 20)).toEqual(
        new Set([valueKey(min), valueKey(max)]),
      );
    },
  );

  // A range holding a single value stays a single value: both ends are the
  // same value, and counting each of them would promise a second draw.
  it('counts a range pinned to one value as one value', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 0.55, maxValue: 0.55 },
    });

    expect(valueSpaceSize(variable, 100)).toBe(1);
    expect(reachedByDraw(variable, 10)).toEqual(new Set([valueKey(0.55)]));
  });

  // What feasibility spends on a fractional range. It accepts a `unique`
  // variable once this count reports one value per entity, so every value
  // counted has to be reachable by a distinct sequence number and none beyond
  // them — the draw used to ignore the sequence here and re-roll at random,
  // which exhausted the redraw budget on ranges this analysis had passed.
  it.each([
    { min: 0.1, max: 0.9, size: 81 },
    { min: 0.001, max: 0.099, size: 11 },
    { min: 10.5, max: 10.7, size: 21 },
    { min: -3.2, max: -3.1, size: 11 },
    { min: 0.001, max: 0.009, size: 2 },
  ])(
    'reaches every one of the $size values counted for [$min, $max]',
    ({ min, max, size }) => {
      const variable = make({
        id: 'v',
        name: 'V',
        type: 'number',
        validation: { minValue: min, maxValue: max },
      });

      // Read from the count rather than taken from the table, so the two
      // describe the same space or this fails whichever of them moved.
      expect(valueSpaceSize(variable, size + 1)).toBe(size);

      const drawn = drawnBySequence(variable, size * 3);
      expect(new Set(drawn.map((value) => valueKey(value))).size).toBe(size);
      for (const value of drawn) {
        expect(Number(value)).toBeGreaterThanOrEqual(min);
        expect(Number(value)).toBeLessThanOrEqual(max);
      }
    },
  );

  it('treats a number left unbounded on both sides as unbounded', () => {
    expect(
      valueSpaceSize(
        make({
          id: 'v',
          name: 'V',
          type: 'number',
          validation: { unique: true },
        }),
        100,
      ),
    ).toBe('unbounded');
  });

  // A number that declares neither bound is still drawn from a range: the
  // realistic default the generator falls back to. Only a `unique` variable
  // widens that range far enough to be worth calling unbounded.
  it('counts the default range a number with no bounds is drawn from', () => {
    expect(
      valueSpaceSize(make({ id: 'v', name: 'V', type: 'number' }), 1_000),
    ).toBe(63);
  });

  // A ceiling with no floor is the generator's default floor and that ceiling,
  // not the unbounded space an absent bound used to imply. A `unique` variable
  // capped at 30 can reach 13 values, and a 14th entity has to be refused here
  // rather than throwing partway through the network.
  it('counts what a number given only a ceiling can reach', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { unique: true, maxValue: 30 },
    });
    expect(valueSpaceSize(variable, 1_000)).toBe(13);
  });

  // Below the default floor the whole range slides under the ceiling rather
  // than inverting, so its width is the default one.
  it('counts a ceiling below the default floor as the range that slides under it', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { unique: true, maxValue: 5 },
    });
    expect(valueSpaceSize(variable, 1_000)).toBe(63);
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

  // A date the protocol leaves open is still drawn from a window: the picker
  // offers nothing before 1920 or after today, and the generator reaches back
  // a decade from there, or as far as the picker allows where the value has to
  // be distinct. Counting it as unbounded is what let a `unique` date pass this
  // analysis and then run out of years partway through the network.
  it.each([
    { unique: false, type: 'year', size: 41 },
    { unique: false, type: 'month', size: 481 },
    { unique: false, type: 'full', size: 3651 },
    { unique: true, type: 'year', size: 107 },
    { unique: true, type: 'month', size: 1279 },
    { unique: true, type: 'full', size: 38_925 },
  ] as const)(
    'counts the $type window a date with unique $unique is drawn over',
    ({ unique, type, size }) => {
      expect(valueSpaceSize(openDate(type, unique), 1_000_000)).toBe(size);
    },
  );

  // What feasibility spends. It accepts a `unique` variable once this count
  // reports at least one value per entity, so every value counted has to be
  // reachable by a distinct sequence number, and none beyond them.
  it.each([
    { unique: false, type: 'year', size: 41 },
    { unique: false, type: 'month', size: 481 },
    { unique: false, type: 'full', size: 3651 },
    { unique: true, type: 'year', size: 107 },
    { unique: true, type: 'month', size: 1279 },
    { unique: true, type: 'full', size: 38_925 },
  ] as const)(
    'reaches every one of the $size $type dates counted for unique $unique',
    ({ unique, type, size }) => {
      const variable = openDate(type, unique);
      const generator = new ValueGenerator(1, TODAY);

      // Read here rather than taken from the table, so the count's own picture
      // of the window is what the draw is held against: the two describe the
      // same space, or this fails whichever of them moved.
      expect(valueSpaceSize(variable, size + 1)).toBe(size);

      const drawn = new Set<string>();
      for (let seq = 0; seq < size; seq++) {
        drawn.add(
          String(
            generator.generateConstrained(variable, 0, { distinctSeq: seq }),
          ),
        );
      }

      expect(drawn.size).toBe(size);
      // One past the count wraps, so the space holds no further value.
      expect(
        drawn.has(
          String(
            generator.generateConstrained(variable, 0, { distinctSeq: size }),
          ),
        ),
      ).toBe(true);
    },
  );

  // A floor the protocol declares is the picker's own `min`, and the field
  // offers every date from it up to today.
  it('counts a declared floor up to the day the picker stops offering', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '2000-01-01' },
      validation: { unique: true },
    });
    expect(valueSpaceSize(variable, 1_000)).toBe(27);
  });

  // A floor later than today sits above the last date the picker offers, so
  // the field lists no year at all. Counted as the empty space it is, which is
  // what refuses the protocol rather than generating the one unselectable date.
  it('counts a date floor beyond today as an empty space', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '2030-01-01' },
      validation: { unique: true },
    });
    expect(valueSpaceSize(variable, 1_000)).toBe(0);
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

  // A ceiling in a low year is one the schema admits at full resolution, and the
  // reach behind it underflowed past year zero: the floor came back as
  // `-996-12-25`, `stepsBetween` read a window of negative width, and the count
  // called a field offering every date from 0001-01-01 to 0005-01-01 empty —
  // which refuses the protocol before a single node is generated. Both spans
  // reach behind year zero from here, so both are held at the same floor.
  it.each([{ unique: true }, { unique: false }])(
    'counts every date a ceiling in year 0005 leaves reachable (unique $unique)',
    ({ unique }) => {
      const variable = make({
        id: 'v',
        name: 'V',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', max: '0005-01-01' },
        ...(unique ? { validation: { unique: true } } : {}),
      });

      // Every day of years 0001-0004, plus the ceiling itself.
      expect(valueSpaceSize(variable, 10_000)).toBe(1462);
    },
  );

  // The draw has to reach exactly what the count spends. A floor the two
  // disagreed about let feasibility accept a `unique` variable and the draw then
  // hand back one date — the malformed floor reparsed — for every entity.
  it('draws the whole low-year space it counts, and no date outside it', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', max: '0005-01-01' },
      validation: { unique: true },
    });
    const size = valueSpaceSize(variable, 10_000);
    expect(size).toBe(1462);

    const generator = new ValueGenerator(1, TODAY);
    const drawn = new Set<string>();
    for (let seq = 0; seq < 1462; seq++) {
      drawn.add(
        String(
          generator.generateConstrained(variable, 0, { distinctSeq: seq }),
        ),
      );
    }

    expect(drawn.size).toBe(1462);
    expect([...drawn].toSorted()[0]).toBe('0001-01-01');
    expect([...drawn].toSorted().at(-1)).toBe('0005-01-01');
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

  // The schema accepts no value bounds on a scalar, so a pair in a draft
  // protocol describes a range neither the interview collects nor its slider
  // renders. The normalised scale is counted instead.
  it('counts the normalised scale however a draft bounds a scalar', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'scalar',
      validation: { minValue: 0, maxValue: 100 },
    });
    expect(valueSpaceSize(variable, 1_000)).toBe(101);
  });

  it('counts the rounding grid over a scalar range a group narrowed', () => {
    const variable = make({ id: 'v', name: 'V', type: 'scalar' });
    expect(
      valueSpaceSize(
        {
          entry: variable.entry,
          constraints: {
            ...variable.constraints,
            minValue: 0.25,
            maxValue: 0.5,
          },
        },
        1_000,
      ),
    ).toBe(26);
  });

  // A scalar is drawn on the same grid with the same clamp as a number in a
  // fractional range, so it reaches the same clamped ends. It only ever gets
  // off-grid bounds by being held equal to a number that declares them, which
  // is the one shape where counting the grid alone was a value or two short.
  it.each([
    { min: 0.004, max: 0.006, size: 2 },
    { min: 0.001, max: 0.014, size: 3 },
    { min: 0.005, max: 0.025, size: 4 },
    { min: 0.004, max: 0.5, size: 51 },
    { min: 0, max: 0.996, size: 101 },
  ])(
    'counts the $size values a scalar bounded to [$min, $max] can reach',
    ({ min, max, size }) => {
      const variable = narrowedScalar({ minValue: min, maxValue: max });

      expect(valueSpaceSize(variable, size + 1)).toBe(size);

      const drawn = drawnBySequence(variable, size * 2);
      expect(new Set(drawn.map((value) => valueKey(value))).size).toBe(size);
      for (const value of drawn) {
        expect(Number(value)).toBeGreaterThanOrEqual(min);
        expect(Number(value)).toBeLessThanOrEqual(max);
      }
    },
  );

  // A `unique` scalar is not something the schema permits, but in-progress
  // protocol state can declare one, and the count is spent on it either way.
  // The draw ignored its sequence number entirely until this was fixed, so
  // every redraw was a fresh roll of the same 101 values.
  it('reaches the whole scale it counts, by distinct sequence number', () => {
    const variable = make({ id: 'v', name: 'V', type: 'scalar' });

    expect(valueSpaceSize(variable, 1_000)).toBe(101);
    expect(reachedByDraw(variable, 101).size).toBe(101);
    // One past the count wraps, so the space holds no further value.
    expect(reachedByDraw(variable, 202).size).toBe(101);
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
    expect(
      valueSpaceSize(make({ id: 'v', name: 'V', type: 'location' }), 100),
    ).toBe('unbounded');
  });
});
