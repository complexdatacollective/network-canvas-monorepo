import { describe, expect, it } from 'vitest';

import { ValueGenerator } from '../../../ValueGenerator';
import { buildVariableConstraints } from '../buildConstraints';
import type { ConstrainedVariable } from '../types';
import { valueSpaceSize } from '../valueSpace';

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

  // Narrower than one grid step, so the draw is pinned to a bound it is clamped
  // to. Counted as the one value that guarantees, which is under rather than
  // over what the two clamped ends can reach: a count above what the draw walks
  // is what lets a `unique` variable pass this analysis and then collide.
  it('counts a range narrower than one grid step as a single value', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'number',
      validation: { minValue: 10.501, maxValue: 10.509 },
    });
    expect(valueSpaceSize(variable, 100)).toBe(1);
  });

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

  // A floor later than today leaves the draw one date, which is the floor
  // itself. Counted as the one value that guarantees rather than as the empty
  // range a fabricated ceiling would describe.
  it('counts a date floor beyond today as the single date it reaches', () => {
    const variable = make({
      id: 'v',
      name: 'V',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '2030-01-01' },
      validation: { unique: true },
    });
    expect(valueSpaceSize(variable, 1_000)).toBe(1);
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
