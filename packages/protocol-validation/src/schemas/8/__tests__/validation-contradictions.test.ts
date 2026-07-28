import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../schema.ts';
import { findValidationContradictions } from '../variables/validation-contradictions.ts';
import {
  EgoVariablesSchema,
  VariableSchema,
  VariablesSchema,
} from '../variables/variable.ts';

describe('findValidationContradictions — local checks', () => {
  it('reports minLength > maxLength, stripping both members', () => {
    const result = findValidationContradictions({
      a: {
        name: 'first_name',
        type: 'text',
        validation: { minLength: 10, maxLength: 2 },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('invertedBounds');
    expect(result[0]?.message).toBe(
      'Variable "first_name": minLength (10) is greater than maxLength (2)',
    );
    expect(result[0]?.variableIds).toEqual(['a']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'minLength' },
      { variableId: 'a', rule: 'maxLength' },
    ]);
  });

  it('reports minValue > maxValue and minSelected > maxSelected', () => {
    const result = findValidationContradictions({
      a: {
        name: 'age',
        type: 'number',
        validation: { minValue: 10, maxValue: 2 },
      },
      b: {
        name: 'colors',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
        ],
        validation: { minSelected: 4, maxSelected: 1 },
      },
    });
    expect(result.map((c) => c.class).toSorted()).toEqual([
      'invertedBounds',
      'invertedBounds',
      'minSelectedExceedsOptions',
    ]);
  });

  it('reports minSelected greater than the option count, stripping minSelected only', () => {
    const result = findValidationContradictions({
      a: {
        name: 'colors',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
        ],
        validation: { minSelected: 3 },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('minSelectedExceedsOptions');
    expect(result[0]?.message).toBe(
      'Variable "colors": minSelected (3) is greater than the number of options (2)',
    );
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'minSelected' },
    ]);
  });

  // Sixth-wave Finding 3: categoricalOptionsSchema permits duplicate-VALUE
  // option entries, but the runtime can only ever select a distinct value —
  // minSelected must be judged against the DISTINCT value count, not the
  // entry count.
  it('reports minSelected greater than the DISTINCT option value count, despite more entries', () => {
    const result = findValidationContradictions({
      a: {
        name: 'colors',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'x' },
          { label: 'Red (again)', value: 'x' },
          { label: 'Blue', value: 'y' },
        ],
        validation: { minSelected: 3 },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('minSelectedExceedsOptions');
    expect(result[0]?.message).toBe(
      'Variable "colors": minSelected (3) is greater than the number of options (2)',
    );
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'minSelected' },
    ]);
  });

  it('accepts minSelected equal to the distinct option value count despite a duplicate entry', () => {
    expect(
      findValidationContradictions({
        a: {
          name: 'colors',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'x' },
            { label: 'Red (again)', value: 'x' },
            { label: 'Blue', value: 'y' },
          ],
          validation: { minSelected: 2 },
        },
      }),
    ).toEqual([]);
  });

  it('accepts equal bounds and minSelected equal to the option count', () => {
    expect(
      findValidationContradictions({
        a: {
          name: 'age',
          type: 'number',
          validation: { minValue: 5, maxValue: 5 },
        },
        b: {
          name: 'colors',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
          ],
          validation: { minSelected: 2, maxSelected: 2 },
        },
      }),
    ).toEqual([]);
  });

  it('ignores variables with no validation and non-numeric rule values', () => {
    expect(
      findValidationContradictions({
        a: { name: 'layout', type: 'layout' },
        b: { name: 'age', type: 'number', validation: { minValue: 'ten' } },
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — reference structure', () => {
  const number = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'number',
    validation,
  });

  it('reports sameAs and differentFrom naming the same target', () => {
    const result = findValidationContradictions({
      a: number('a', { sameAs: 'b', differentFrom: 'b' }),
      b: number('b'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('conflictingReferencePair');
    expect(result[0]?.message).toBe(
      'Variable "a": sameAs and differentFrom both reference "b"',
    );
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'sameAs' },
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  it('reports a strict two-cycle (A > B and A < B)', () => {
    const result = findValidationContradictions({
      a: number('a', { greaterThanVariable: 'b', lessThanVariable: 'b' }),
      b: number('b'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('strictComparatorCycle');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
  });

  it('reports a three-variable strict cycle, stripping every edge in it', () => {
    const result = findValidationContradictions({
      a: number('a', { greaterThanVariable: 'b' }),
      b: number('b', { greaterThanVariable: 'c' }),
      c: number('c', { greaterThanVariable: 'a' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('strictComparatorCycle');
    expect(result[0]?.strips).toHaveLength(3);
  });

  it('reports a strict comparator inside a sameAs group, keeping sameAs', () => {
    const result = findValidationContradictions({
      a: number('a', { sameAs: 'b', greaterThanVariable: 'b' }),
      b: number('b'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('sameAsGroupConflict');
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'greaterThanVariable' },
    ]);
  });

  it('reports differentFrom joining two members of a sameAs chain', () => {
    const result = findValidationContradictions({
      a: number('a', { sameAs: 'b' }),
      b: number('b', { sameAs: 'c' }),
      c: number('c', { differentFrom: 'a' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('sameAsGroupConflict');
    expect(result[0]?.strips).toEqual([
      { variableId: 'c', rule: 'differentFrom' },
    ]);
  });

  it('reports self-references: differentFrom self and a strict comparator on self', () => {
    const result = findValidationContradictions({
      a: number('a', { differentFrom: 'a' }),
      b: number('b', { greaterThanVariable: 'b' }),
    });
    expect(result.map((c) => c.message).toSorted()).toEqual([
      'Variable "a": differentFrom references the variable itself',
      'Variable "b": greaterThanVariable references the variable itself',
    ]);
  });

  it('accepts every explicitly-accepted shape', () => {
    expect(
      findValidationContradictions({
        // one constraint stated from both sides — one edge, not a cycle
        start: number('start', { lessThanVariable: 'end' }),
        end: number('end', { greaterThanVariable: 'start' }),
        // mutual differentFrom — symmetric, one constraint
        a: number('a', { differentFrom: 'b' }),
        b: number('b', { differentFrom: 'a' }),
        // mutual non-strict comparators — forces equality, satisfiable
        c: number('c', { greaterThanOrEqualToVariable: 'd' }),
        d: number('d', { greaterThanOrEqualToVariable: 'c' }),
        // strict comparator plus redundant differentFrom
        e: number('e', { greaterThanVariable: 'f' }),
        f: number('f', { differentFrom: 'e' }),
        // sameAs chain closing on itself — every member shares one value
        g: number('g', { sameAs: 'h' }),
        h: number('h', { sameAs: 'g' }),
        // non-strict comparator inside a sameAs group — equality satisfies it
        i: number('i', { sameAs: 'j', lessThanOrEqualToVariable: 'j' }),
        j: number('j'),
        // non-strict self comparison is trivially true
        k: number('k', { greaterThanOrEqualToVariable: 'k' }),
      }),
    ).toEqual([]);
  });

  it('ignores references to missing or differently-typed targets', () => {
    expect(
      findValidationContradictions({
        a: number('a', { greaterThanVariable: 'missing' }),
        b: number('b', { sameAs: 'c', differentFrom: 'c' }),
        c: { name: 'c', type: 'text' },
      }),
    ).toEqual([
      // sameAs+differentFrom is reported on raw values even when the target's
      // type mismatches — the pair is contradictory regardless
      expect.objectContaining({ class: 'conflictingReferencePair' }),
    ]);
  });
});

describe('findValidationContradictions — bound disjointness', () => {
  it('reports a comparator whose bounds are disjoint, stripping the comparator only', () => {
    const result = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: { minValue: 10, lessThanVariable: 'b' },
      },
      b: { name: 'b', type: 'number', validation: { maxValue: 5 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variable "a": lessThanVariable "b" can never be satisfied because their value ranges do not overlap',
    );
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'lessThanVariable' },
    ]);
  });

  it('treats touching bounds as infeasible for strict, feasible for non-strict', () => {
    const strict = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: { maxValue: 5, greaterThanVariable: 'b' },
      },
      b: { name: 'b', type: 'number', validation: { minValue: 5 } },
    });
    expect(strict).toHaveLength(1);

    const nonStrict = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: { maxValue: 5, greaterThanOrEqualToVariable: 'b' },
      },
      b: { name: 'b', type: 'number', validation: { minValue: 5 } },
    });
    expect(nonStrict).toEqual([]);
  });

  it('reports a sameAs group with no shared value, stripping its sameAs rules', () => {
    const result = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: { maxValue: 5, sameAs: 'b' },
      },
      b: { name: 'b', type: 'number', validation: { minValue: 10 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but their rules leave no value they can share',
    );
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });

  it('intersects text length ranges across a sameAs group', () => {
    const result = findValidationContradictions({
      a: { name: 'a', type: 'text', validation: { maxLength: 3, sameAs: 'b' } },
      b: { name: 'b', type: 'text', validation: { minLength: 10 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('compares datetime windows across a comparator edge', () => {
    const disjoint = findValidationContradictions({
      a: {
        name: 'a',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', max: '2020' },
        validation: { greaterThanVariable: 'b' },
      },
      b: {
        name: 'b',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '2021' },
      },
    });
    expect(disjoint).toHaveLength(1);
    expect(disjoint[0]?.class).toBe('disjointBounds');

    // Twentieth-wave Finding 1 supersedes the "expands to Jan 1 vs Dec 31, so
    // a strict comparison is conservatively satisfiable" reading this case
    // previously asserted. A year picker stores the bare year, which
    // compareVariables resolves to 1 January, so `a` can only ever hold an
    // instant at or before 2020-01-01 and `b` one at or after it — a strict
    // `a > b` is unsatisfiable.
    const sameYear = findValidationContradictions({
      a: {
        name: 'a',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', max: '2020' },
        validation: { greaterThanVariable: 'b' },
      },
      b: {
        name: 'b',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '2020' },
      },
    });
    expect(sameYear).toHaveLength(1);
    expect(sameYear[0]?.class).toBe('disjointBounds');

    // One year of headroom leaves a = '2021', b = '2020' satisfying the
    // strict comparator.
    const overlapping = findValidationContradictions({
      a: {
        name: 'a',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', max: '2021' },
        validation: { greaterThanVariable: 'b' },
      },
      b: {
        name: 'b',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '2020' },
      },
    });
    expect(overlapping).toEqual([]);
  });

  it('does not double-report edges touching an already-empty sameAs group', () => {
    const result = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: { maxValue: 5, sameAs: 'b', lessThanVariable: 'c' },
      },
      b: { name: 'b', type: 'number', validation: { minValue: 10 } },
      c: { name: 'c', type: 'number', validation: { maxValue: 0 } },
    });
    expect(result.map((c) => c.class)).toEqual(['disjointBounds']);
  });

  it('accepts unbounded and overlapping ranges', () => {
    expect(
      findValidationContradictions({
        a: {
          name: 'a',
          type: 'number',
          validation: { minValue: 0, lessThanVariable: 'b' },
        },
        b: { name: 'b', type: 'number', validation: { maxValue: 100 } },
        c: { name: 'c', type: 'scalar', validation: { lessThanVariable: 'd' } },
        d: { name: 'd', type: 'scalar' },
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — Finding D: sameAs option-set disjointness', () => {
  const categorical = (
    name: string,
    optionValues: (string | number)[],
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'categorical',
    options: optionValues.map((value) => ({ label: String(value), value })),
    validation,
  });

  it('reports a sameAs categorical group whose option values share nothing', () => {
    const result = findValidationContradictions({
      a: categorical('a', ['red', 'blue'], { sameAs: 'b' }),
      b: categorical('b', ['green', 'yellow']),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but share no option values',
    );
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });

  it('accepts a sameAs categorical group with overlapping option values', () => {
    expect(
      findValidationContradictions({
        a: categorical('a', ['red', 'blue'], { sameAs: 'b' }),
        b: categorical('b', ['blue', 'green']),
      }),
    ).toEqual([]);
  });

  it('skips the option-set check when a member has no options array', () => {
    expect(
      findValidationContradictions({
        a: categorical('a', ['red', 'blue'], { sameAs: 'b' }),
        b: { name: 'b', type: 'categorical', validation: {} },
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — eighth-wave Finding 1: boolean domain intersection in equality groups', () => {
  const boolean = (
    name: string,
    validation: Record<string, unknown> = {},
    options?: { label: string; value: boolean }[],
  ) => ({
    name,
    type: 'boolean',
    validation,
    ...(options !== undefined ? { options } : {}),
  });

  const trueOnly = [{ label: 'Yes', value: true }];
  const falseOnly = [{ label: 'No', value: false }];

  // Twenty-first-wave Finding 1: singleton `options` only pin a boolean's
  // domain when the codebook declares `component: 'Boolean'` — the codebook
  // alone cannot otherwise know which control renders it. These fixtures
  // declare it explicitly so they keep exercising the group-level domain
  // check this block targets, rather than the (now-unpinned) componentless
  // case.
  it('rejects a true-only boolean sameAs a false-only boolean', () => {
    const result = findValidationContradictions({
      a: { ...boolean('a', { sameAs: 'b' }, trueOnly), component: 'Boolean' },
      b: { ...boolean('b', {}, falseOnly), component: 'Boolean' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but their available values never overlap',
    );
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });

  // Non-empty intersection ({true}) is accepted here. The separate wave-6
  // pinned-equal differentFrom check (both ends pinned to the same value) is
  // unrelated — it only fires when the joining rule is differentFrom, not
  // sameAs, and would reject this same pair of variables if reauthored with
  // differentFrom instead.
  it('accepts two true-only booleans joined by sameAs', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', { sameAs: 'b' }, trueOnly),
        b: boolean('b', {}, trueOnly),
      }),
    ).toEqual([]);
  });

  it('accepts a full-domain boolean pair joined by sameAs', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', { sameAs: 'b' }),
        b: boolean('b', {}),
      }),
    ).toEqual([]);
  });

  // Wave-7 provenance: unlike the datetime mixed-resolution check, this is
  // NOT scoped to groups with an actual sameAs edge — a comparator-only
  // equality group means the same thing for booleans (see the comment above
  // the check in validation-contradictions.ts). `greaterThanOrEqualToVariable`
  // is not offered to boolean variables by the schema (booleanValidations has
  // no comparator rules), but the analyser also runs on raw, unvalidated
  // migration input, so this exercises that defensive path directly.
  it('rejects a comparator-only true-only vs false-only boolean pair', () => {
    const result = findValidationContradictions({
      a: {
        ...boolean('a', { greaterThanOrEqualToVariable: 'b' }, trueOnly),
        component: 'Boolean',
      },
      b: {
        ...boolean('b', { greaterThanOrEqualToVariable: 'a' }, falseOnly),
        component: 'Boolean',
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are forced equal by the comparison rules but their available values never overlap',
    );
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
  });
});

describe('findValidationContradictions — second-wave Finding 1: shared-option cardinality vs minSelected', () => {
  const categorical = (
    name: string,
    optionValues: (string | number)[],
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'categorical',
    options: optionValues.map((value) => ({ label: String(value), value })),
    validation,
  });

  it('rejects a sameAs group whose shared option values are fewer than minSelected', () => {
    const result = findValidationContradictions({
      a: categorical('a', ['x', 'y'], { sameAs: 'b', minSelected: 2 }),
      b: categorical('b', ['x', 'z']),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but share only 1 option values, fewer than minSelected (2)',
    );
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });

  it('accepts a sameAs group whose minSelected does not exceed the shared value count', () => {
    expect(
      findValidationContradictions({
        a: categorical('a', ['x', 'y'], { sameAs: 'b', minSelected: 1 }),
        b: categorical('b', ['x', 'z']),
      }),
    ).toEqual([]);
  });

  it('accepts a sameAs group whose minSelected equals the shared value count', () => {
    expect(
      findValidationContradictions({
        a: categorical('a', ['x', 'y'], { sameAs: 'b', minSelected: 2 }),
        b: categorical('b', ['x', 'y']),
      }),
    ).toEqual([]);
  });

  // Sixth-wave Finding 3: a duplicate-VALUE option entry on one side of the
  // group must not inflate the shared-value count the intersection is
  // compared against — `optionValues` already builds a Set, so this is a
  // regression guard rather than a behaviour change.
  it('counts distinct shared values even when one member has a duplicate-value entry', () => {
    const result = findValidationContradictions({
      a: categorical('a', ['x', 'x', 'y'], { sameAs: 'b', minSelected: 2 }),
      b: categorical('b', ['x', 'y']),
    });
    expect(result).toEqual([]);
  });
});

describe('findValidationContradictions — Finding E: comparator-forced equality groups', () => {
  const number = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'number',
    validation,
  });

  it('rejects mutual non-strict comparators plus differentFrom, stripping differentFrom only', () => {
    const result = findValidationContradictions({
      a: number('a', {
        greaterThanOrEqualToVariable: 'b',
        differentFrom: 'b',
      }),
      b: number('b', { greaterThanOrEqualToVariable: 'a' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('sameAsGroupConflict');
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  it('rejects a three-member non-strict cycle whose bounds are disjoint, stripping the cycle comparators', () => {
    const result = findValidationContradictions({
      a: number('a', {
        greaterThanOrEqualToVariable: 'b',
        minValue: 10,
        maxValue: 20,
      }),
      b: number('b', { greaterThanOrEqualToVariable: 'c' }),
      c: number('c', { greaterThanOrEqualToVariable: 'a', maxValue: 5 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b', 'c']);
    expect(result[0]?.strips).toHaveLength(3);
    expect(
      result[0]?.strips.every(
        (strip) => strip.rule === 'greaterThanOrEqualToVariable',
      ),
    ).toBe(true);
  });

  it('still accepts mutual non-strict comparators alone', () => {
    expect(
      findValidationContradictions({
        c: number('c', { greaterThanOrEqualToVariable: 'd' }),
        d: number('d', { greaterThanOrEqualToVariable: 'c' }),
      }),
    ).toEqual([]);
  });

  // Ninth-wave Finding 3: a's sameAs already forces the group; the one-way
  // `lessThanOrEqualToVariable` merely sits between two members it did not
  // group (only a sameAs edge, or a genuine SCC, does that). The
  // minimal-strip repair must take the sameAs edge only, leaving the
  // comparator standing.
  it('strips sameAs only when a one-way non-strict comparator merely sits inside a sameAs group', () => {
    const result = findValidationContradictions({
      a: number('a', {
        maxValue: 5,
        sameAs: 'b',
        lessThanOrEqualToVariable: 'b',
      }),
      b: number('b', { minValue: 10 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });
});

describe('findValidationContradictions — second-wave Finding 4: odd boolean differentFrom cycles', () => {
  const boolean = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'boolean',
    validation,
  });

  it('rejects a three-variable differentFrom triangle over booleans', () => {
    const result = findValidationContradictions({
      a: boolean('a', { differentFrom: 'b' }),
      b: boolean('b', { differentFrom: 'c' }),
      c: boolean('c', { differentFrom: 'a' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('oddDifferentFromCycle');
    // Member order in the message reflects the reconstructed cycle's BFS
    // traversal (third-wave Finding 1), not authoring order — pin the
    // membership rather than a fragile exact ordering.
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b', 'c']);
    expect(result[0]?.message).toContain(
      'their differentFrom rules cannot all be satisfied with only two possible values',
    );
    expect(result[0]?.strips).toHaveLength(3);
    expect(
      result[0]?.strips.every((strip) => strip.rule === 'differentFrom'),
    ).toBe(true);
  });

  it('accepts a mutual two-cycle (one edge, not a cycle) over booleans', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', { differentFrom: 'b' }),
        b: boolean('b', { differentFrom: 'a' }),
      }),
    ).toEqual([]);
  });

  it('accepts an even four-variable differentFrom cycle over booleans', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', { differentFrom: 'b' }),
        b: boolean('b', { differentFrom: 'c' }),
        c: boolean('c', { differentFrom: 'd' }),
        d: boolean('d', { differentFrom: 'a' }),
      }),
    ).toEqual([]);
  });

  it('accepts a differentFrom triangle over text variables (unbounded domain)', () => {
    const text = (name: string, validation: Record<string, unknown> = {}) => ({
      name,
      type: 'text',
      validation,
    });
    expect(
      findValidationContradictions({
        a: text('a', { differentFrom: 'b' }),
        b: text('b', { differentFrom: 'c' }),
        c: text('c', { differentFrom: 'a' }),
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — third-wave Finding 1: odd-cycle strips scope to the cycle', () => {
  const boolean = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'boolean',
    validation,
  });

  it('strips only the triangle, leaving a branch rule hanging off it untouched', () => {
    // a-b-c is an odd cycle (triangle); d merely branches off a and never
    // closes a loop of its own, so d's differentFrom is a valid rule (e.g. a
    // branch condition) that must survive.
    const result = findValidationContradictions({
      a: boolean('a', { differentFrom: 'b' }),
      b: boolean('b', { differentFrom: 'c' }),
      c: boolean('c', { differentFrom: 'a' }),
      d: boolean('d', { differentFrom: 'a' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('oddDifferentFromCycle');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b', 'c']);
    expect(result[0]?.strips).toHaveLength(3);
    expect(
      result[0]?.strips.every(
        (strip) => strip.rule === 'differentFrom' && strip.variableId !== 'd',
      ),
    ).toBe(true);
  });
});

describe('findValidationContradictions — fifth-wave Finding 5: singleton boolean domains', () => {
  const boolean = (
    name: string,
    validation: Record<string, unknown> = {},
    options?: { label: string; value: boolean }[],
  ) => ({
    name,
    type: 'boolean',
    validation,
    ...(options !== undefined ? { options } : {}),
  });

  const trueOnly = [{ label: 'Yes', value: true }];

  // Sixth-wave Finding 2 renamed this class from 'singletonBooleanDomain' to
  // 'pinnedEqualDifferentFrom' and generalised the message when the boolean
  // check was folded into the type-agnostic pinned-value check.
  //
  // Twenty-first-wave Finding 1: singleton `options` only pin a boolean's
  // domain when the codebook declares `component: 'Boolean'` — a
  // componentless boolean's rendering is undetermined at the codebook layer
  // (it is renderable only by a NetworkComposer field, which supplies its
  // own component). These fixtures declare it explicitly so the pair still
  // expresses a rendering the codebook actually determines, preserving the
  // genuine singleton-domain detection this block targets.
  it('rejects two true-only booleans joined by differentFrom', () => {
    const result = findValidationContradictions({
      a: {
        ...boolean('a', { differentFrom: 'b' }, trueOnly),
        component: 'Boolean',
      },
      b: { ...boolean('b', {}, trueOnly), component: 'Boolean' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" must differ but their rules pin both to the same value',
    );
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  it('accepts a true-only boolean differing from a full-domain boolean', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', { differentFrom: 'b' }, trueOnly),
        b: boolean('b', {}),
      }),
    ).toEqual([]);
  });

  // Bipartiteness is unaffected by this check: an odd cycle over full-domain
  // booleans is still caught, and an even cycle is still accepted.
  it('still rejects an odd differentFrom triangle over full-domain booleans', () => {
    const result = findValidationContradictions({
      a: boolean('a', { differentFrom: 'b' }),
      b: boolean('b', { differentFrom: 'c' }),
      c: boolean('c', { differentFrom: 'a' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('oddDifferentFromCycle');
  });

  it('still accepts an even differentFrom cycle over full-domain booleans', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', { differentFrom: 'b' }),
        b: boolean('b', { differentFrom: 'c' }),
        c: boolean('c', { differentFrom: 'd' }),
        d: boolean('d', { differentFrom: 'a' }),
      }),
    ).toEqual([]);
  });

  // Thirteenth-wave Finding 2: the runtime's BooleanField defaults to Yes/No
  // only when no options are supplied at all, so an ABSENT options list still
  // means "both values", while an explicitly EMPTY one offers none. The
  // schema rejects the empty list outright; the analyser must not meanwhile
  // reason over values the control never renders.
  it('models an options-less boolean as offering both values', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', { differentFrom: 'b' }),
        b: boolean('b'),
      }),
    ).toEqual([]);
  });

  it('does not pin an explicitly empty-options boolean to a value', () => {
    // With `[]` modelled as both values, `a` and `b` would each look pinned
    // (to different values in the singleton case, to nothing here) — what
    // matters is that an empty control never yields a pinned value for the
    // differentFrom check to reason about.
    expect(
      findValidationContradictions({
        a: boolean('a', { differentFrom: 'b' }, []),
        b: boolean('b', {}, []),
      }),
    ).toEqual([]);
  });

  // Twenty-first-wave Finding 1: as above, an explicit `component: 'Boolean'`
  // is what makes the singleton `options` array a rendering the codebook
  // actually determines.
  it('still treats a singleton options array as a pinned value', () => {
    const result = findValidationContradictions({
      a: {
        ...boolean('a', { differentFrom: 'b' }, trueOnly),
        component: 'Boolean',
      },
      b: { ...boolean('b', {}, trueOnly), component: 'Boolean' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });
});

describe('findValidationContradictions — sixth-wave Finding 2: pinned-equal differentFrom', () => {
  const number = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'number',
    validation,
  });

  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  it('rejects two number variables each pinned by minValue === maxValue to the same value', () => {
    const result = findValidationContradictions({
      a: number('a', { minValue: 5, maxValue: 5, differentFrom: 'b' }),
      b: number('b', { minValue: 5, maxValue: 5 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" must differ but their rules pin both to the same value',
    );
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  it('accepts two number variables pinned to different values', () => {
    expect(
      findValidationContradictions({
        a: number('a', { minValue: 5, maxValue: 5, differentFrom: 'b' }),
        b: number('b', { minValue: 6, maxValue: 6 }),
      }),
    ).toEqual([]);
  });

  it('accepts a differentFrom pair where only one side is pinned', () => {
    expect(
      findValidationContradictions({
        a: number('a', { minValue: 5, maxValue: 5, differentFrom: 'b' }),
        b: number('b', { minValue: 1, maxValue: 10 }),
      }),
    ).toEqual([]);
  });

  it('rejects two full-resolution DatePickers each pinned to the same fixed window', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { min: '2020-05-03', max: '2020-05-03' },
        { differentFrom: 'b' },
      ),
      b: datePicker('b', { min: '2020-05-03', max: '2020-05-03' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
  });

  it('accepts two full-resolution DatePickers pinned to different fixed windows', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { min: '2020-05-03', max: '2020-05-03' },
          { differentFrom: 'b' },
        ),
        b: datePicker('b', { min: '2020-05-04', max: '2020-05-04' }),
      }),
    ).toEqual([]);
  });

  // Seventeenth-wave Finding 1 corrects this case. The sixth wave read a
  // month-resolution equal window as "every day in that month is still
  // selectable" and left it unpinned; the runtime stores the truncated
  // 'YYYY-MM' string, so the window really does pin one value. See the
  // seventeenth-wave block below.
  it('treats a month-resolution equal window as pinned', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'month', min: '2020-05', max: '2020-05' },
        { differentFrom: 'b' },
      ),
      b: datePicker('b', { type: 'month', min: '2020-05', max: '2020-05' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
  });
});

describe('findValidationContradictions — seventeenth-wave Finding 1: coarse DatePickers with an equal window are pinned', () => {
  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  // A year-resolution DatePicker renders a single Select whose options run
  // from max down to min (fresco-ui's DatePicker `years` loop), and stores the
  // chosen year as the bare 'YYYY' string. min === max therefore offers
  // exactly one option and one storable value.
  it('rejects two year-resolution DatePickers pinned to the same year', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2020', max: '2020' },
        { differentFrom: 'b' },
      ),
      b: datePicker('b', { type: 'year', min: '2020', max: '2020' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  it('rejects two month-resolution DatePickers pinned to the same month', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'month', min: '2020-05', max: '2020-05' },
        { differentFrom: 'b' },
      ),
      b: datePicker('b', { type: 'month', min: '2020-05', max: '2020-05' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  // The false-positive guard. A year picker stores '2020' and a full picker
  // stores '2020-01-01'; the runtime's differentFrom compares the stored
  // strings exactly (fresco-ui's isMatchingValue), so those two can always
  // differ and the pair must NOT be reported.
  it('accepts a year-resolution and a full-resolution DatePicker pinned to the same calendar point', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2020', max: '2020' },
          { differentFrom: 'b' },
        ),
        b: datePicker('b', { min: '2020-01-01', max: '2020-01-01' }),
      }),
    ).toEqual([]);
  });

  it('accepts month-resolution DatePickers whose windows span more than one month', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'month', min: '2020-05', max: '2020-06' },
          { differentFrom: 'b' },
        ),
        b: datePicker('b', { type: 'month', min: '2020-05', max: '2020-06' }),
      }),
    ).toEqual([]);
  });

  // Being pinned to the SAME value is what sameAs asks for, so an identically
  // pinned coarse pair stays satisfiable.
  it('accepts sameAs between two identically pinned year-resolution DatePickers', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2020', max: '2020' },
          { sameAs: 'b' },
        ),
        b: datePicker('b', { type: 'year', min: '2020', max: '2020' }),
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — seventeenth-wave Finding 2: componentless datetime variables keep their declared resolution', () => {
  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  const componentless = (
    name: string,
    parameters: Record<string, unknown> | undefined,
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    ...(parameters === undefined ? {} : { parameters }),
    validation,
  });

  // `component` is optional on the DatePicker datetime member, so this
  // variable is schema-valid and its `{ type: 'year' }` parameters are
  // unambiguously DatePicker's (RelativeDatePicker's parameters are a
  // strictObject of anchor/before/after).
  it('accepts a componentless year-parameterised datetime sameAs an explicit year picker', () => {
    expect(
      findValidationContradictions({
        a: componentless('a', { type: 'year' }, { sameAs: 'b' }),
        b: datePicker('b', { type: 'year' }),
      }),
    ).toEqual([]);
  });

  it('still rejects a componentless year-parameterised datetime sameAs a month picker', () => {
    const result = findValidationContradictions({
      a: componentless('a', { type: 'year' }, { sameAs: 'b' }),
      b: datePicker('b', { type: 'month' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but store dates at different resolutions',
    );
  });

  it('treats a componentless datetime with no parameters as full resolution', () => {
    const result = findValidationContradictions({
      a: componentless('a', undefined, { sameAs: 'b' }),
      b: datePicker('b', { type: 'year' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('treats componentless datetime parameters with no recognised type as full resolution', () => {
    expect(
      findValidationContradictions({
        a: componentless('a', { min: '2020-01-01' }, { sameAs: 'b' }),
        b: datePicker('b', {}),
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — seventeenth-wave Finding 3: pinned categorical sets encode without collision', () => {
  // Authored via fromCharCode so no literal NUL escape enters this file.
  const SEPARATOR = String.fromCharCode(0);

  const categorical = (
    name: string,
    optionValues: (string | number)[],
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'categorical',
    options: optionValues.map((value) => ({ label: String(value), value })),
    validation,
  });

  // Under the old `${typeof}:${value}` tokens joined on the separator, the
  // two-value set ['x', 'y'] and the singleton ['x<SEP>string:y'] produced the
  // identical key — but their runtime arrays differ in length, so
  // isMatchingValue can never call them equal.
  it('accepts a pair whose old-encoding keys collided', () => {
    expect(
      findValidationContradictions({
        a: categorical('a', ['x', 'y'], { minSelected: 2, differentFrom: 'b' }),
        b: categorical('b', [`x${SEPARATOR}string:y`], { minSelected: 1 }),
      }),
    ).toEqual([]);
  });

  it('still rejects genuinely equal sets whose values contain the separator', () => {
    const result = findValidationContradictions({
      a: categorical('a', [`x${SEPARATOR}string:y`], {
        minSelected: 1,
        differentFrom: 'b',
      }),
      b: categorical('b', [`x${SEPARATOR}string:y`], { minSelected: 1 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  // Type tagging must survive the new encoding: 5 and '5' are different
  // runtime values to isMatchingValue's own keying.
  it('accepts a numeric-valued and a string-valued singleton that stringify alike', () => {
    expect(
      findValidationContradictions({
        a: categorical('a', [5], { minSelected: 1, differentFrom: 'b' }),
        b: categorical('b', ['5'], { minSelected: 1 }),
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — tenth-wave Finding 2: pinned option-domain differentFrom', () => {
  const categorical = (
    name: string,
    optionValues: (string | number)[],
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'categorical',
    options: optionValues.map((value) => ({ label: String(value), value })),
    validation,
  });

  const ordinal = (
    name: string,
    optionValues: (string | number)[],
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'ordinal',
    options: optionValues.map((value) => ({ label: String(value), value })),
    validation,
  });

  // minSelected at the distinct-value count forces selecting every option, so
  // both sides are pinned to the same (multiset-compared) full set and
  // differentFrom can never be satisfied.
  it('rejects two all-options-forced categoricals with equal value sets joined by differentFrom', () => {
    const result = findValidationContradictions({
      a: categorical('a', ['x', 'y'], { minSelected: 2, differentFrom: 'b' }),
      b: categorical('b', ['x', 'y'], { minSelected: 2 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" must differ but their rules pin both to the same value',
    );
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  it('accepts the same pairing when the option value sets differ', () => {
    expect(
      findValidationContradictions({
        a: categorical('a', ['x', 'y'], { minSelected: 2, differentFrom: 'b' }),
        b: categorical('b', ['x', 'z'], { minSelected: 2 }),
      }),
    ).toEqual([]);
  });

  // The runtime compares categorical selections as order-insensitive
  // multisets, so declaration order must not affect the pinned key.
  it('rejects equal value sets declared in different orders', () => {
    const result = findValidationContradictions({
      a: categorical('a', ['x', 'y'], { minSelected: 2, differentFrom: 'b' }),
      b: categorical('b', ['y', 'x'], { minSelected: 2 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  it('accepts a pair whose minSelected leaves more than one possible selection', () => {
    expect(
      findValidationContradictions({
        a: categorical('a', ['x', 'y'], { minSelected: 1, differentFrom: 'b' }),
        b: categorical('b', ['x', 'y'], { minSelected: 1 }),
      }),
    ).toEqual([]);
  });

  // Ordinal is single-select, so one distinct option value (here via a
  // duplicate-value entry pair, which the schema permits) pins the variable
  // to that value outright — no minSelected involved.
  it('rejects two single-distinct-value ordinals with the same value joined by differentFrom', () => {
    const result = findValidationContradictions({
      a: ordinal('a', ['x', 'x'], { differentFrom: 'b' }),
      b: ordinal('b', ['x']),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  it('accepts single-distinct-value ordinals pinned to different values', () => {
    expect(
      findValidationContradictions({
        a: ordinal('a', ['x'], { differentFrom: 'b' }),
        b: ordinal('b', ['y']),
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — third-wave Finding 3: mixed-resolution datetime equality groups', () => {
  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  it('rejects a year-resolution DatePicker sameAs a full-resolution one', () => {
    const result = findValidationContradictions({
      a: datePicker('a', { type: 'year' }, { sameAs: 'b' }),
      b: datePicker('b', {}),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but store dates at different resolutions',
    );
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });

  it('accepts two year-resolution DatePickers joined by sameAs', () => {
    expect(
      findValidationContradictions({
        a: datePicker('a', { type: 'year' }, { sameAs: 'b' }),
        b: datePicker('b', { type: 'year' }),
      }),
    ).toEqual([]);
  });

  it('accepts mixed resolutions related only by a one-directional comparator', () => {
    // A single lessThanOrEqualToVariable edge (not mutual) never forms a
    // strongly-connected component, so buildEqualityGroups keeps a and b in
    // separate groups — this check is scoped to equality groups only.
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year' },
          { lessThanOrEqualToVariable: 'b' },
        ),
        b: datePicker('b', {}),
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — seventh-wave Finding 1: comparator-only equality groups skip the resolution check', () => {
  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  // RED case: a year-resolution and a full-resolution DatePicker unioned into
  // one equality group ONLY by mutual >= comparators (no sameAs edge at all).
  // fresco-ui's compareVariables converts both sides to Date before
  // comparing, so this pair CAN compare equal at interview time even though
  // their stored strings never would — the mixed-resolution check must not
  // fire here. Explicit overlapping windows rule out the interval-emptiness
  // check as an alternative explanation for a rejection: twentieth-wave
  // Finding 1 resolves the year picker's stored '2020' to 2020-01-01, so the
  // full picker is pinned to that same day for the two windows to overlap
  // (it was pinned to 2020-06-01 while a coarse max still expanded to the
  // period end).
  it('accepts a year+full pair joined only by mutual comparators with overlapping windows', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2020', max: '2020' },
        { greaterThanOrEqualToVariable: 'b' },
      ),
      b: datePicker(
        'b',
        { min: '2020-01-01', max: '2020-01-01' },
        { greaterThanOrEqualToVariable: 'a' },
      ),
    });
    expect(result).toEqual([]);
  });

  it('still rejects the same year+full pair when joined by sameAs instead', () => {
    const result = findValidationContradictions({
      a: datePicker('a', { type: 'year' }, { sameAs: 'b' }),
      b: datePicker('b', {}),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but store dates at different resolutions',
    );
  });

  // Tenth-wave Finding 5 supersedes the seventh-wave group scoping here: the
  // sameAs edge only requires exact stored-string equality along its OWN
  // connected component ({a, b}, uniformly year-resolution), while c is
  // joined in solely by comparators, which Date-convert before comparing —
  // so a = b = '2020', c = '2020-01-01' satisfies everything.
  it('accepts a uniform sameAs component with comparator-joined members at another resolution', () => {
    const result = findValidationContradictions({
      a: datePicker('a', { type: 'year' }, { sameAs: 'b' }),
      b: datePicker(
        'b',
        { type: 'year' },
        { greaterThanOrEqualToVariable: 'c' },
      ),
      c: datePicker('c', {}, { greaterThanOrEqualToVariable: 'b' }),
    });
    expect(result).toEqual([]);
  });
});

describe('findValidationContradictions — tenth-wave Finding 5: resolution uniformity scopes to sameAs components', () => {
  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  // The hybrid counterexample: a sameAs b (both full resolution) is uniform
  // within its sameAs component; year-resolution c is merged into the same
  // EQUALITY group only via mutual non-strict comparators with b. The
  // seventh-wave per-group flag rejected this, but a = b = '2020-01-01',
  // c = '2020' satisfies the comparators under Date conversion — resolution
  // uniformity must apply per sameAs-connected component, not per merged
  // group.
  it('accepts a uniform full-resolution sameAs pair with a comparator-joined year-resolution member', () => {
    const result = findValidationContradictions({
      a: datePicker('a', {}, { sameAs: 'b' }),
      b: datePicker('b', {}, { greaterThanOrEqualToVariable: 'c' }),
      c: datePicker(
        'c',
        { type: 'year' },
        { greaterThanOrEqualToVariable: 'b' },
      ),
    });
    expect(result).toEqual([]);
  });

  it('still rejects a direct cross-resolution sameAs edge, stripping that edge', () => {
    const result = findValidationContradictions({
      a: datePicker('a', {}, { sameAs: 'b' }),
      b: datePicker('b', { type: 'year' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but store dates at different resolutions',
    );
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });

  // Only the CROSS-resolution edge is stripped: a's sameAs joins two
  // full-resolution variables and survives. By transitivity, removing b's
  // edge alone leaves every remaining connected piece uniform ({a, b} full;
  // {c} year), so it is the minimal strip.
  it('strips only the cross-resolution edge of a chain', () => {
    const result = findValidationContradictions({
      a: datePicker('a', {}, { sameAs: 'b' }),
      b: datePicker('b', {}, { sameAs: 'c' }),
      c: datePicker('c', { type: 'year' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b', 'c']);
    expect(result[0]?.strips).toEqual([{ variableId: 'b', rule: 'sameAs' }]);
  });
});

describe('findValidationContradictions — fifth-wave Finding 3: fixed-anchor RelativeDatePicker windows are static', () => {
  const relativePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters,
    validation,
  });

  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  it('rejects a fixed-anchor RelativeDatePicker sameAs a disjoint DatePicker window', () => {
    const result = findValidationContradictions({
      a: relativePicker(
        'a',
        { anchor: '2020-01-01', before: 0, after: 0 },
        { sameAs: 'b' },
      ),
      b: datePicker('b', { min: '2021-01-01', max: '2021-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });

  it('leaves an anchor-less RelativeDatePicker unconstrained (interview-date-relative)', () => {
    expect(
      findValidationContradictions({
        a: relativePicker('a', { before: 0, after: 0 }, { sameAs: 'b' }),
        b: datePicker('b', { min: '2021-01-01', max: '2021-01-01' }),
      }),
    ).toEqual([]);
  });

  it('applies the documented before=180/after=0 defaults to a bare anchor', () => {
    // Computed via plain Date arithmetic rather than hand-computed, so the
    // expectation can't drift from the implementation's own day-number math.
    const anchor = '2020-06-15';
    const anchorMs = Date.UTC(2020, 5, 15);
    const dayMs = 86_400_000;
    const earliestDefault = new Date(anchorMs - 180 * dayMs)
      .toISOString()
      .slice(0, 10);
    const oneDayBeforeEarliest = new Date(anchorMs - 181 * dayMs)
      .toISOString()
      .slice(0, 10);

    // A single-day DatePicker window sitting exactly on the default
    // earliest bound (anchor - 180 days) overlaps.
    expect(
      findValidationContradictions({
        a: relativePicker('a', { anchor }, { sameAs: 'b' }),
        b: datePicker('b', { min: earliestDefault, max: earliestDefault }),
      }),
    ).toEqual([]);

    // One day earlier falls outside the default 180-day window.
    const result = findValidationContradictions({
      a: relativePicker('a', { anchor }, { sameAs: 'b' }),
      b: datePicker('b', {
        min: oneDayBeforeEarliest,
        max: oneDayBeforeEarliest,
      }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('treats a fixed-anchor RelativeDatePicker as full resolution in the mixed-resolution check', () => {
    // Interval overlap: the single anchor day sits on the year window's only
    // instant, so only the resolution-mismatch check (not interval emptiness)
    // fires. Twentieth-wave Finding 1 makes that instant 1 January — the
    // anchor was 2020-06-15 while a coarse max still expanded to 31 December.
    const result = findValidationContradictions({
      a: relativePicker(
        'a',
        { anchor: '2020-01-01', before: 0, after: 0 },
        { sameAs: 'b' },
      ),
      b: datePicker('b', { type: 'year', min: '2020', max: '2020' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but store dates at different resolutions',
    );
  });
});

describe('findValidationContradictions — fourteenth-wave Finding 1: anchorless RelativeDatePickers share the interview-date origin', () => {
  const relativePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters,
    validation,
  });

  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  it('rejects differentFrom between two anchorless RelativeDatePickers both pinned to the interview date', () => {
    const result = findValidationContradictions({
      a: relativePicker(
        'a',
        { before: 0, after: 0 },
        { required: true, differentFrom: 'b' },
      ),
      b: relativePicker('b', { before: 0, after: 0 }, { required: true }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.message).toBe(
      'Variables "a", "b" must differ but their rules pin both to the same value',
    );
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  it('accepts differentFrom between two anchorless RelativeDatePickers spanning the default window', () => {
    expect(
      findValidationContradictions({
        a: relativePicker('a', {}, { required: true, differentFrom: 'b' }),
        b: relativePicker('b', {}, { required: true }),
      }),
    ).toEqual([]);
  });

  it('accepts differentFrom between an anchorless and a fixed-anchor RelativeDatePicker', () => {
    expect(
      findValidationContradictions({
        a: relativePicker('a', { before: 0, after: 0 }, { differentFrom: 'b' }),
        b: relativePicker('b', {
          anchor: '2020-01-01',
          before: 0,
          after: 0,
        }),
      }),
    ).toEqual([]);
  });

  it('accepts differentFrom between an anchorless RelativeDatePicker and a pinned DatePicker', () => {
    expect(
      findValidationContradictions({
        a: relativePicker('a', { before: 0, after: 0 }, { differentFrom: 'b' }),
        b: datePicker('b', { min: '2021-01-01', max: '2021-01-01' }),
      }),
    ).toEqual([]);
  });

  // `before`/`after` are both non-negative (relativeDatePickerParametersSchema),
  // so every symbolic window spans [-before, +after] and therefore contains the
  // interview date itself — two symbolic windows can never be disjoint, and a
  // sameAs between them is always satisfiable. A STRICT comparator is the
  // reachable symbolic-vs-symbolic infeasibility: two pickers pinned to the
  // same offset cannot be ordered.
  it('rejects a strict comparator between two anchorless RelativeDatePickers pinned to the interview date', () => {
    const result = findValidationContradictions({
      a: relativePicker(
        'a',
        { before: 0, after: 0 },
        { greaterThanVariable: 'b' },
      ),
      b: relativePicker('b', { before: 0, after: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'greaterThanVariable' },
    ]);
  });

  it('accepts a strict comparator between an anchorless and a fixed-anchor RelativeDatePicker', () => {
    expect(
      findValidationContradictions({
        a: relativePicker(
          'a',
          { before: 0, after: 0 },
          { greaterThanVariable: 'b' },
        ),
        b: relativePicker('b', {
          anchor: '2020-01-01',
          before: 0,
          after: 0,
        }),
      }),
    ).toEqual([]);
  });

  it('accepts sameAs between two anchorless RelativeDatePickers pinned to the interview date', () => {
    expect(
      findValidationContradictions({
        a: relativePicker('a', { before: 0, after: 0 }, { sameAs: 'b' }),
        b: relativePicker('b', { before: 0, after: 0 }),
      }),
    ).toEqual([]);
  });

  it('rejects the record schema for the pinned anchorless differentFrom pair', () => {
    const result = VariablesSchema.safeParse({
      a: {
        name: 'a',
        type: 'datetime',
        component: 'RelativeDatePicker',
        parameters: { before: 0, after: 0 },
        validation: { required: true, differentFrom: 'b' },
      },
      b: {
        name: 'b',
        type: 'datetime',
        component: 'RelativeDatePicker',
        parameters: { before: 0, after: 0 },
        validation: { required: true },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) =>
        candidate.message.includes('pin both to the same value'),
      );
      expect(issue?.path).toEqual(['a', 'validation', 'differentFrom']);
    }
  });
});

describe('findValidationContradictions — eighteenth-wave Finding 3: componentless RelativeDatePicker-shaped datetimes keep their window', () => {
  const componentless = (
    name: string,
    parameters: Record<string, unknown>,
    validation: Record<string, unknown> = {},
  ) => ({ name, type: 'datetime', parameters, validation });

  const relativePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters,
    validation,
  });

  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  // `component` is optional on the RelativeDatePicker datetime member
  // (variable.ts's `dateTimeRelativeDatePickerSchema`), and an
  // anchor/before/after parameter record can only be that member's — the
  // DatePicker member's parameters are a strictObject of type/min/max. Both
  // variables are pinned to the single day 2020-01-01, so `differentFrom`
  // between them is unsatisfiable.
  it('rejects differentFrom between two componentless anchored pickers pinned to the same day', () => {
    const result = findValidationContradictions({
      a: componentless(
        'a',
        { anchor: '2020-01-01', before: 0, after: 0 },
        { differentFrom: 'b' },
      ),
      b: componentless('b', { anchor: '2020-01-01', before: 0, after: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
  });

  it('accepts differentFrom between two componentless anchored pickers spanning the default window', () => {
    expect(
      findValidationContradictions({
        a: componentless('a', { anchor: '2020-01-01' }, { differentFrom: 'b' }),
        b: componentless('b', { anchor: '2020-01-01' }),
      }),
    ).toEqual([]);
  });

  it('rejects differentFrom between two componentless anchorless pickers pinned to the interview date', () => {
    const result = findValidationContradictions({
      a: componentless('a', { before: 0, after: 0 }, { differentFrom: 'b' }),
      b: componentless('b', { before: 0, after: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  // An anchorless window is symbolic: its bounds are day offsets from the
  // interview date, never absolute calendar bounds. A componentless anchorless
  // picker must therefore stay incomparable with a pinned calendar day.
  it('accepts differentFrom between a componentless anchorless picker and a pinned DatePicker', () => {
    expect(
      findValidationContradictions({
        a: componentless('a', { before: 0, after: 0 }, { differentFrom: 'b' }),
        b: datePicker('b', { min: '2021-01-01', max: '2021-01-01' }),
      }),
    ).toEqual([]);
  });

  // Both are componentless, so each takes its component from the stage that
  // renders it — and each parameter shape admits exactly one component. Both
  // store the full ISO day 2020-01-01, so the pair can never differ.
  it('rejects differentFrom between a componentless anchored picker and a componentless pinned DatePicker', () => {
    const result = findValidationContradictions({
      a: componentless(
        'a',
        { anchor: '2020-01-01', before: 0, after: 0 },
        { differentFrom: 'b' },
      ),
      b: componentless('b', { min: '2020-01-01', max: '2020-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  // A DECLARED component always wins: an explicit DatePicker carrying stray
  // relative parameters keeps the DatePicker reading (no min/max, so no
  // window), exactly as before.
  it('leaves a declared DatePicker carrying relative parameters unwindowed', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { anchor: '2020-01-01', before: 0, after: 0 },
          { differentFrom: 'b' },
        ),
        b: datePicker('b', { anchor: '2020-01-01', before: 0, after: 0 }),
      }),
    ).toEqual([]);
  });

  // Parameters carrying keys from BOTH members match neither, so no
  // inference is safe — the pre-existing DatePicker reading stands. Each half
  // is asserted against a partner the OTHER reading would pin it to, so
  // neither assertion can pass under the relative reading.
  it('keeps the DatePicker reading for parameters that mix both shapes', () => {
    // The relative reading would pin this to its anchor day; the DatePicker
    // reading finds a lone `min` and pins nothing.
    expect(
      findValidationContradictions({
        a: componentless(
          'a',
          { anchor: '2020-01-01', before: 0, after: 0, min: '2019-01-01' },
          { differentFrom: 'b' },
        ),
        b: componentless('b', { min: '2020-01-01', max: '2020-01-01' }),
      }),
    ).toEqual([]);

    // ...and the DatePicker reading's own single-day window still pins, even
    // though the stray anchor names a different day.
    const result = findValidationContradictions({
      a: componentless(
        'a',
        {
          anchor: '2019-01-01',
          before: 0,
          after: 0,
          min: '2021-01-01',
          max: '2021-01-01',
        },
        { differentFrom: 'b' },
      ),
      b: componentless('b', { min: '2021-01-01', max: '2021-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  it('still pins a declared anchorless RelativeDatePicker to the interview date', () => {
    const result = findValidationContradictions({
      a: relativePicker('a', { before: 0, after: 0 }, { differentFrom: 'b' }),
      b: relativePicker('b', { before: 0, after: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });
});

describe('findValidationContradictions — fifteenth-wave Finding 1: equality groups track bounds per origin', () => {
  const relativePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters,
    validation,
  });

  const pinnedDatePicker = (
    name: string,
    day: string,
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters: { min: day, max: day },
    validation,
  });

  it('reports a fixed-vs-fixed conflict across an anchorless member of the same sameAs group', () => {
    const result = findValidationContradictions({
      a: pinnedDatePicker('a', '2020-01-01', { required: true, sameAs: 'b' }),
      b: relativePicker('b', {}, { required: true, sameAs: 'c' }),
      c: pinnedDatePicker('c', '2021-01-01', { required: true }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b', 'c']);
    expect(result[0]?.message).toContain(
      'are joined by sameAs but their rules leave no value they can share',
    );
    expect(
      result[0]?.strips.toSorted((x, y) =>
        x.variableId.localeCompare(y.variableId),
      ),
    ).toEqual([
      { variableId: 'a', rule: 'sameAs' },
      { variableId: 'b', rule: 'sameAs' },
    ]);
  });

  it('accepts the same group when both fixed members pin the same day', () => {
    expect(
      findValidationContradictions({
        a: pinnedDatePicker('a', '2020-01-01', { required: true, sameAs: 'b' }),
        b: relativePicker('b', {}, { required: true, sameAs: 'c' }),
        c: pinnedDatePicker('c', '2020-01-01', { required: true }),
      }),
    ).toEqual([]);
  });

  it('accepts a two-member sameAs pair spanning both origins', () => {
    expect(
      findValidationContradictions({
        a: pinnedDatePicker('a', '2020-01-01', { required: true, sameAs: 'b' }),
        b: relativePicker('b', { before: 0, after: 0 }, { required: true }),
      }),
    ).toEqual([]);
  });

  it('reports a symbolic-origin comparator conflict independently of a fixed group member', () => {
    const result = findValidationContradictions({
      a: relativePicker(
        'a',
        { before: 0, after: 0 },
        { sameAs: 'b', greaterThanVariable: 'd' },
      ),
      b: relativePicker('b', { before: 0, after: 0 }, { sameAs: 'c' }),
      c: pinnedDatePicker('c', '2020-01-01'),
      d: relativePicker('d', { before: 0, after: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'd']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'greaterThanVariable' },
    ]);
  });
});

describe('record schema conformance — contradiction refinement', () => {
  it('rejects a node variables record with inverted bounds, anchored at the offending rule', () => {
    const result = VariablesSchema.safeParse({
      a: {
        name: 'age',
        type: 'number',
        component: 'Number',
        validation: { minValue: 10, maxValue: 2 },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) =>
        candidate.message.includes(
          'minValue (10) is greater than maxValue (2)',
        ),
      );
      expect(issue?.path).toEqual(['a', 'validation', 'minValue']);
    }
  });

  it('rejects an ego variables record with a strict comparator cycle', () => {
    const result = EgoVariablesSchema.safeParse({
      a: {
        name: 'start',
        type: 'number',
        component: 'Number',
        validation: { greaterThanVariable: 'b' },
      },
      b: {
        name: 'end',
        type: 'number',
        component: 'Number',
        validation: { greaterThanVariable: 'a' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts the same constraint stated from both sides', () => {
    const result = VariablesSchema.safeParse({
      a: {
        name: 'start',
        type: 'number',
        component: 'Number',
        validation: { lessThanVariable: 'b' },
      },
      b: {
        name: 'end',
        type: 'number',
        component: 'Number',
        validation: { greaterThanVariable: 'a' },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('R1 — absolute floors on count-valued rules', () => {
  it('rejects maxLength 0 and negative minLength', () => {
    expect(
      VariableSchema.safeParse({
        name: 'first_name',
        type: 'text',
        component: 'Text',
        validation: { maxLength: 0 },
      }).success,
    ).toBe(false);
    expect(
      VariableSchema.safeParse({
        name: 'first_name',
        type: 'text',
        component: 'Text',
        validation: { minLength: -1 },
      }).success,
    ).toBe(false);
  });

  it('rejects maxSelected 0 and negative minSelected', () => {
    const categorical = (validation: Record<string, number>) => ({
      name: 'colors',
      type: 'categorical',
      component: 'CheckboxGroup',
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
      ],
      validation,
    });
    expect(
      VariableSchema.safeParse(categorical({ maxSelected: 0 })).success,
    ).toBe(false);
    expect(
      VariableSchema.safeParse(categorical({ minSelected: -1 })).success,
    ).toBe(false);
  });

  it('accepts the floor values themselves and negative minValue/maxValue', () => {
    expect(
      VariableSchema.safeParse({
        name: 'first_name',
        type: 'text',
        component: 'Text',
        validation: { minLength: 0, maxLength: 1 },
      }).success,
    ).toBe(true);
    expect(
      VariableSchema.safeParse({
        name: 'temperature',
        type: 'number',
        component: 'Number',
        validation: { minValue: -40, maxValue: -1 },
      }).success,
    ).toBe(true);
  });
});

describe('R2 — reference target type must equal the source type', () => {
  const protocolWith = (
    variables: Record<string, Record<string, unknown>>,
  ): Record<string, unknown> => {
    const protocol = structuredClone(createBaseProtocol()) as Record<
      string,
      unknown
    > & {
      codebook: {
        node: { person: { variables: Record<string, unknown> } };
      };
    };
    // Merge rather than replace: the base protocol's stages reference
    // existing person variables (e.g. the Sociogram's layout variable), and
    // severing those references would fail the parse for unrelated reasons.
    protocol.codebook.node.person.variables = {
      ...protocol.codebook.node.person.variables,
      ...variables,
    };
    return protocol;
  };

  it('rejects sameAs referencing a differently-typed variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith({
        a: {
          name: 'first_name',
          type: 'text',
          component: 'Text',
          validation: { sameAs: 'b' },
        },
        b: { name: 'age', type: 'number', component: 'Number' },
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('must reference another text variable'),
        ),
      ).toBe(true);
    }
  });

  it('accepts a comparator referencing a same-typed variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith({
        a: {
          name: 'start_age',
          type: 'number',
          component: 'Number',
          validation: { lessThanVariable: 'b' },
        },
        b: { name: 'end_age', type: 'number', component: 'Number' },
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe('DatePicker parameters refinement', () => {
  const datePicker = (parameters: Record<string, string>) => ({
    name: 'birth_date',
    type: 'datetime',
    component: 'DatePicker',
    parameters,
  });

  it('rejects a bound finer than the picker resolution', () => {
    expect(
      VariableSchema.safeParse(datePicker({ type: 'year', min: '2020-05-03' }))
        .success,
    ).toBe(false);
  });

  it('rejects a bound coarser than the picker resolution', () => {
    expect(
      VariableSchema.safeParse(datePicker({ type: 'full', min: '2020' }))
        .success,
    ).toBe(false);
  });

  it('rejects impossible calendar dates and months', () => {
    expect(
      VariableSchema.safeParse(datePicker({ min: '2020-02-31' })).success,
    ).toBe(false);
    expect(
      VariableSchema.safeParse(datePicker({ type: 'month', max: '2020-13' }))
        .success,
    ).toBe(false);
  });

  it('rejects min after max', () => {
    const result = VariableSchema.safeParse(
      datePicker({ type: 'month', min: '2021-06', max: '2020-01' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('"min" must not be after "max"'),
        ),
      ).toBe(true);
    }
  });

  it('accepts bounds at the exact resolution, including equal bounds', () => {
    expect(
      VariableSchema.safeParse(
        datePicker({ type: 'year', min: '1990', max: '2020' }),
      ).success,
    ).toBe(true);
    expect(
      VariableSchema.safeParse(
        datePicker({ min: '2020-01-15', max: '2020-01-15' }),
      ).success,
    ).toBe(true);
  });

  // Third-wave Finding 2: Date.UTC(year, ...) maps a 0-99 year into
  // 1900-1999 (the legacy two-digit-year rule), which would falsely reject a
  // real four-digit year like '0099'. isIsoDate/isValidDateAtResolution must
  // round-trip small years correctly while still rejecting genuinely invalid
  // calendar dates.
  it('accepts a real four-digit date whose year is below 100', () => {
    expect(
      VariableSchema.safeParse(datePicker({ min: '0099-12-31' })).success,
    ).toBe(true);
  });

  it('still rejects an impossible calendar date with a small year', () => {
    expect(
      VariableSchema.safeParse(datePicker({ min: '0099-02-30' })).success,
    ).toBe(false);
  });

  // Eighth-wave Finding 2: the interview builds a year/month-resolution
  // DatePicker's selectable year options via `y.toString()` (unpadded), so a
  // stored value ('99') could never match this zero-padded bound ('0099') —
  // unlike full resolution, whose always-padded YYYY-MM-DD strings round-trip
  // correctly at any year (the wave-3 fix above still applies there).
  it('rejects a year-resolution bound whose year is below 1000', () => {
    const result = VariableSchema.safeParse(
      datePicker({ type: 'year', min: '0099' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('must use a four-digit year of 1000 or later'),
        ),
      ).toBe(true);
    }
  });

  it('rejects a month-resolution bound whose year is below 1000', () => {
    expect(
      VariableSchema.safeParse(datePicker({ type: 'month', max: '0099-12' }))
        .success,
    ).toBe(false);
  });

  it('accepts a year-resolution bound at the four-digit-year floor', () => {
    expect(
      VariableSchema.safeParse(datePicker({ type: 'year', min: '1000' }))
        .success,
    ).toBe(true);
  });

  // Eleventh-wave Finding 1: '0000-12-31' is a real, round-tripping ISO date
  // (JS Date supports year 0), but the native HTML date input's earliest
  // selectable date is 0001-01-01 — a year-zero full-resolution bound (e.g.
  // max '0000-12-31' on a required field) leaves no selectable value that can
  // ever pass. Years 0001-0999 stay valid at full resolution (the wave-3
  // small-year support above).
  it('rejects a full-resolution bound whose year is 0000', () => {
    const result = VariableSchema.safeParse(datePicker({ max: '0000-12-31' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('native date input starts at year 0001'),
        ),
      ).toBe(true);
    }
  });

  it('still accepts the earliest native-input date at full resolution', () => {
    expect(
      VariableSchema.safeParse(datePicker({ min: '0001-01-01' })).success,
    ).toBe(true);
  });
});

// Eleventh-wave Finding 2: the analyser runs inside protocol parsing AND the
// v7→v8 migration, so a large (or adversarial) imported protocol must degrade
// to a slow-but-correct analysis, not crash the import with a RangeError from
// a recursive graph walk. These sizes overflowed the call stack when the
// Tarjan SCC walk and the strict-cycle DFS were recursive.
describe('findValidationContradictions — large comparator graphs', () => {
  const chainOf = (count: number, rule: string): Record<string, unknown> => {
    const variables: Record<string, unknown> = {};
    for (let i = 0; i < count; i++) {
      variables[`v${i}`] = {
        name: `v${i}`,
        type: 'number',
        validation: i < count - 1 ? { [rule]: `v${i + 1}` } : {},
      };
    }
    return variables;
  };

  const cycleOf = (count: number, rule: string): Record<string, unknown> => {
    const variables: Record<string, unknown> = {};
    for (let i = 0; i < count; i++) {
      variables[`v${i}`] = {
        name: `v${i}`,
        type: 'number',
        validation: { [rule]: `v${(i + 1) % count}` },
      };
    }
    return variables;
  };

  it('handles a long non-strict comparator chain without overflowing (Tarjan walk)', () => {
    // A pure chain has no cycle, so nothing is forced equal and nothing is
    // contradictory — but the SCC walk still descends its full length.
    const result = findValidationContradictions(
      chainOf(10_000, 'lessThanOrEqualToVariable'),
    );
    expect(result).toEqual([]);
  });

  it('handles a long strict comparator chain without overflowing (cycle DFS)', () => {
    // greaterThanVariable makes each variable's group depend on its
    // successor's, so the DFS entered at v0 descends the full chain (the
    // lessThanVariable direction happens to be visited in topological order
    // and never recursed deeply).
    const result = findValidationContradictions(
      chainOf(10_000, 'greaterThanVariable'),
    );
    expect(result).toEqual([]);
  });

  it('reports a single impossible cycle for a large strict comparator cycle', () => {
    const size = 10_000;
    const result = findValidationContradictions(
      cycleOf(size, 'lessThanVariable'),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('strictComparatorCycle');
    expect(result[0]?.variableIds).toHaveLength(size);
    expect(result[0]?.strips).toHaveLength(size);
  });
});

// Twenty-first-wave Finding 2: the odd-cycle bipartite BFS over the boolean
// `differentFrom` graph used `queue.shift()`, which is O(n) per call — a
// star-shaped component (one hub `differentFrom`-linked to thousands of
// leaves, which is entirely satisfiable: colour the hub true and every leaf
// false) made the whole walk quadratic in the leaf count, even though the
// graph contains no contradiction. Mirrors the "large comparator graphs"
// block above; the timing assertion is deliberately generous (wall-clock
// checks are flaky) — it exists to catch a regression back to quadratic
// behaviour, not to enforce a specific budget.
describe('findValidationContradictions — large boolean differentFrom graphs', () => {
  const starOf = (leafCount: number): Record<string, unknown> => {
    const variables: Record<string, unknown> = {
      hub: { name: 'hub', type: 'boolean', validation: {} },
    };
    for (let i = 0; i < leafCount; i++) {
      variables[`leaf${i}`] = {
        name: `leaf${i}`,
        type: 'boolean',
        validation: { differentFrom: 'hub' },
      };
    }
    return variables;
  };

  // 10,000 matches the size the file's other large-graph regressions use. The
  // original 30,000/50,000 stars were sized to the leaf counts quoted in the
  // review, but they exceeded the default 5s timeout on a CI runner even with
  // the linear queue, and the extra leaves buy no coverage the smaller star
  // does not already give: both walk the same queue. The explicit timeout is
  // headroom for a loaded runner, not a performance assertion — see the note
  // below on why this behaviour is deliberately not wall-clock guarded.
  it('handles a large star with no contradiction', { timeout: 30_000 }, () => {
    expect(findValidationContradictions(starOf(10_000))).toEqual([]);
  });

  // The bipartite queue advances a head index rather than calling
  // `Array.shift()`, whose O(n) compaction makes this star shape quadratic.
  // That property is deliberately NOT pinned by a timing assertion. Two were
  // tried and both proved unreliable: a ratio between two measurements goes
  // flaky whenever the machine is busy, and an absolute budget large enough
  // to be safe locally still timed out on a slower CI runner. Reported
  // timings for the quadratic form varied by an order of magnitude across
  // machines (~2.4s vs ~0.5s at 30,000 leaves), so no threshold separates
  // the two forms reliably everywhere. A test that fails for reasons
  // unrelated to the defect is worse than no test, so the guard here is the
  // result assertion above — it exercises the queue at scale — plus this
  // note. Reintroduce a timing pin only with a deterministic counter, never
  // a wall clock.
});

describe('findValidationContradictions — twentieth-wave Finding 1: coarse date bounds compare at their stored instant', () => {
  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  it('rejects a pinned year picker required to be greater than a mid-year full date', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2020', max: '2020' },
        { greaterThanVariable: 'b' },
      ),
      b: datePicker('b', { min: '2020-06-01', max: '2020-06-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'greaterThanVariable' },
    ]);
  });

  it('accepts a year picker whose range can still exceed a mid-year full date', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2020', max: '2021' },
          { greaterThanVariable: 'b' },
        ),
        b: datePicker('b', { min: '2020-06-01', max: '2020-06-01' }),
      }),
    ).toEqual([]);
  });

  it('rejects two year pickers pinned to the same year under a strict comparator', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2020', max: '2020' },
        { greaterThanVariable: 'b' },
      ),
      b: datePicker('b', { type: 'year', min: '2020', max: '2020' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('rejects two year pickers pinned to 2020 and 2021 with the comparator in the infeasible direction', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2020', max: '2020' },
        { greaterThanVariable: 'b' },
      ),
      b: datePicker('b', { type: 'year', min: '2021', max: '2021' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('rejects a pinned month picker required to be greater than a mid-month full date', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'month', min: '2020-05', max: '2020-05' },
        { greaterThanVariable: 'b' },
      ),
      b: datePicker('b', { min: '2020-05-15', max: '2020-05-15' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('accepts a month picker whose range can still exceed a mid-month full date', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'month', min: '2020-05', max: '2020-07' },
          { greaterThanVariable: 'b' },
        ),
        b: datePicker('b', { min: '2020-05-15', max: '2020-05-15' }),
      }),
    ).toEqual([]);
  });

  // The min edge is the period START at every resolution and is unchanged: a
  // year picker bounded below by '2020' can never precede a 2019 day.
  it('keeps a coarse min bound at the start of its period', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2020' },
        { lessThanVariable: 'b' },
      ),
      b: datePicker('b', { min: '2019-06-01', max: '2019-06-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  // A comparator SCC forces its members to compare EQUAL under
  // compareVariables' Date conversion, so a year picker pinned to '2020'
  // (stored '2020' -> 2020-01-01) can never equal a full picker pinned to a
  // mid-year day.
  it('rejects a comparator-forced equality between a pinned year picker and a mid-year full date', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2020', max: '2020' },
        { greaterThanOrEqualToVariable: 'b' },
      ),
      b: datePicker(
        'b',
        { min: '2020-06-01', max: '2020-06-01' },
        { greaterThanOrEqualToVariable: 'a' },
      ),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toContain('leave no value they can share');
  });

  it('accepts a comparator-forced equality whose coarse and full members share one instant', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2020', max: '2020' },
          { greaterThanOrEqualToVariable: 'b' },
        ),
        b: datePicker(
          'b',
          { min: '2020-01-01', max: '2020-01-01' },
          { greaterThanOrEqualToVariable: 'a' },
        ),
      }),
    ).toEqual([]);
  });

  // Scoping guard: the period-END expansion is retained for a FULL-resolution
  // picker carrying a coarse bound string. That shape only reaches the
  // analyser as raw (pre-schema) migration input, where the control really can
  // emit any day up to 2020-12-31, so the bound must still expand.
  it('keeps the period-end expansion for a full-resolution picker with a coarse max bound', () => {
    expect(
      findValidationContradictions({
        a: datePicker('a', { max: '2020' }, { greaterThanVariable: 'b' }),
        b: datePicker('b', { min: '2020-06-01', max: '2020-06-01' }),
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — twentieth-wave Finding 2: hybrid group repairs target the causing constraints', () => {
  const number = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'number',
    validation,
  });

  // The comparator SCC between the two pinned variables is what empties the
  // group; c's sameAs is satisfiable and unrelated, so it must survive.
  it('strips the comparator cycle rather than an unrelated sameAs', () => {
    const result = findValidationContradictions({
      a: number('a', {
        minValue: 0,
        maxValue: 0,
        greaterThanOrEqualToVariable: 'b',
      }),
      b: number('b', {
        minValue: 1,
        maxValue: 1,
        greaterThanOrEqualToVariable: 'a',
      }),
      c: number('c', { sameAs: 'a' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(
      result[0]?.strips.toSorted((x, y) =>
        x.variableId.localeCompare(y.variableId),
      ),
    ).toEqual([
      { variableId: 'a', rule: 'greaterThanOrEqualToVariable' },
      { variableId: 'b', rule: 'greaterThanOrEqualToVariable' },
    ]);
  });

  it('still strips sameAs only when the sameAs edges alone cause the emptiness', () => {
    const result = findValidationContradictions({
      a: number('a', { maxValue: 5, sameAs: 'b' }),
      b: number('b', { minValue: 10 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });

  it('leaves a comparator-only empty group stripping its comparators', () => {
    const result = findValidationContradictions({
      a: number('a', {
        minValue: 0,
        maxValue: 0,
        greaterThanOrEqualToVariable: 'b',
      }),
      b: number('b', {
        minValue: 1,
        maxValue: 1,
        greaterThanOrEqualToVariable: 'a',
      }),
    });
    expect(result).toHaveLength(1);
    expect(
      result[0]?.strips.toSorted((x, y) =>
        x.variableId.localeCompare(y.variableId),
      ),
    ).toEqual([
      { variableId: 'a', rule: 'greaterThanOrEqualToVariable' },
      { variableId: 'b', rule: 'greaterThanOrEqualToVariable' },
    ]);
  });

  // A residual sub-group of ONE is never "empty" for this policy: a lone
  // variable's own inverted bounds are a local contradiction that no amount of
  // edge-stripping resolves, so they must not widen the group repair.
  it('does not widen the strip when a residual member has its own inverted bounds', () => {
    const result = findValidationContradictions({
      a: number('a', {
        minValue: 10,
        maxValue: 2,
        sameAs: 'b',
        lessThanOrEqualToVariable: 'b',
      }),
      b: number('b'),
    });
    const group = result.find(
      (contradiction) => contradiction.class === 'disjointBounds',
    );
    expect(group?.strips).toEqual([{ variableId: 'a', rule: 'sameAs' }]);
  });

  // Neither mechanism alone splits the group, so both must go.
  it('strips both mechanisms when neither alone resolves the emptiness', () => {
    const result = findValidationContradictions({
      a: number('a', {
        minValue: 0,
        maxValue: 0,
        sameAs: 'b',
        greaterThanOrEqualToVariable: 'b',
      }),
      b: number('b', {
        minValue: 1,
        maxValue: 1,
        greaterThanOrEqualToVariable: 'a',
      }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.strips.map((strip) => strip.rule).toSorted()).toEqual([
      'greaterThanOrEqualToVariable',
      'greaterThanOrEqualToVariable',
      'sameAs',
    ]);
  });
});

describe('findValidationContradictions — Audit sweep: an explicitly null component reads as absent', () => {
  // Architect's field editors write a literal `null` — not `undefined` — when
  // a componentless codebook variable is picked (`handleChangeVariable` in
  // withFieldsHandlers), and `buildProspectiveVariables` layers that null onto
  // the prospective variable it hands this analyser. Every componentless
  // inference must therefore read null exactly as it reads absent.
  const nullComponent = (
    name: string,
    parameters: Record<string, unknown>,
    validation: Record<string, unknown> = {},
  ) => ({ name, type: 'datetime', component: null, parameters, validation });

  const componentless = (
    name: string,
    parameters: Record<string, unknown>,
    validation: Record<string, unknown> = {},
  ) => ({ name, type: 'datetime', parameters, validation });

  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  // `dateResolutionOf` used to score a null as "a component other than
  // DatePicker" and fall back to full resolution, inventing a resolution
  // mismatch against a genuine year picker.
  it('keeps a null-component year-parameterised datetime at year resolution', () => {
    expect(
      findValidationContradictions({
        a: nullComponent('a', { type: 'year' }, { sameAs: 'b' }),
        b: datePicker('b', { type: 'year' }),
      }),
    ).toEqual([]);
  });

  it('still rejects a null-component year picker sameAs a month picker', () => {
    const result = findValidationContradictions({
      a: nullComponent('a', { type: 'year' }, { sameAs: 'b' }),
      b: datePicker('b', { type: 'month' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  // `dateWindowInterval` used to score a null as "a component IS declared",
  // skipping the relative-shape inference and losing the window entirely.
  it('keeps a null-component relative-shaped datetime window', () => {
    const result = findValidationContradictions({
      a: nullComponent(
        'a',
        { anchor: '2020-01-01', before: 0, after: 0 },
        { differentFrom: 'b' },
      ),
      b: componentless('b', { anchor: '2020-01-01', before: 0, after: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
  });

  it('still accepts a null-component relative picker spanning the default window', () => {
    expect(
      findValidationContradictions({
        a: nullComponent('a', { anchor: '2020-01-01' }, { differentFrom: 'b' }),
        b: componentless('b', { anchor: '2020-01-01' }),
      }),
    ).toEqual([]);
  });

  // `isRelativeDatePickerShape` counted an explicitly null member key as
  // PRESENT, so a record carrying one matched neither shape and lost its
  // window. A null key is the editor's reset, i.e. absent — the mixed-shape
  // policy only applies to keys that really are set.
  it('treats an explicitly null member key as absent when classifying the shape', () => {
    const result = findValidationContradictions({
      a: componentless(
        'a',
        { anchor: '2020-01-01', before: 0, after: 0, min: null },
        { differentFrom: 'b' },
      ),
      b: componentless('b', { anchor: '2020-01-01', before: 0, after: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  // The same reading applies to the RELATIVE key set: a record whose
  // anchor/before/after were all cleared declares no window at all. Counting
  // those nulls as present classified it as an anchorless RelativeDatePicker
  // and invented the DEFAULT [-180, 0] interview-date window, which is enough
  // to make a strict comparator against a picker pinned to the interview date
  // look infeasible.
  it('declares no window when every relative member key is explicitly null', () => {
    expect(
      findValidationContradictions({
        a: componentless(
          'a',
          { anchor: null, before: null, after: null },
          { greaterThanVariable: 'b' },
        ),
        b: {
          name: 'b',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { before: 0, after: 0 },
          validation: {},
        },
      }),
    ).toEqual([]);
  });

  it('still keeps the DatePicker reading when both shapes are genuinely set', () => {
    const result = findValidationContradictions({
      a: componentless(
        'a',
        {
          anchor: '2019-01-01',
          before: 0,
          after: 0,
          min: '2021-01-01',
          max: '2021-01-01',
        },
        { differentFrom: 'b' },
      ),
      b: componentless('b', { min: '2021-01-01', max: '2021-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });
});

describe('findValidationContradictions — Audit sweep: a boolean domain follows its effective component', () => {
  const boolean = (
    name: string,
    component: unknown,
    options: { label: string; value: boolean }[] | undefined,
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'boolean',
    validation,
    ...(component === undefined ? {} : { component }),
    ...(options === undefined ? {} : { options }),
  });

  const trueOnly = [{ label: 'Yes', value: true }];

  // fresco-ui's ToggleField takes no `options` prop at all, so a Toggle is
  // unconditionally two-valued however the codebook variable is configured.
  // The stage-effective overlay (schema.ts) keeps the codebook `options` while
  // overriding `component`, and Architect's composer field editor layers a
  // draft `component` over the codebook variable's own options, so a
  // Toggle-rendered boolean reaches this analyser carrying an options list it
  // never renders.
  it('does not pin a singleton-options boolean rendered by a Toggle', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', 'Toggle', trueOnly, { differentFrom: 'b' }),
        b: boolean('b', 'Toggle', trueOnly),
      }),
    ).toEqual([]);
  });

  it('still pins a singleton-options boolean rendered by the Boolean choice control', () => {
    const result = findValidationContradictions({
      a: boolean('a', 'Boolean', trueOnly, { differentFrom: 'b' }),
      b: boolean('b', 'Boolean', trueOnly),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  // Twenty-first-wave Finding 1 supersedes this block's earlier assumption
  // that an absent/null `component` still reads `options` because "with no
  // override, the codebook default IS the rendering". At the codebook layer
  // there is no stage in scope, so a componentless boolean's rendering is
  // genuinely unknown — it is renderable only by a NetworkComposer field,
  // which always supplies its own `component` and may pick `Toggle` — so
  // this no longer pins, mirroring the Toggle case above.
  it('does not pin a singleton-options boolean with no component', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', undefined, trueOnly, { differentFrom: 'b' }),
        b: boolean('b', undefined, trueOnly),
      }),
    ).toEqual([]);
  });

  it('does not pin a singleton-options boolean whose component is null', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', null, trueOnly, { differentFrom: 'b' }),
        b: boolean('b', null, trueOnly),
      }),
    ).toEqual([]);
  });

  // A Toggle offers both values, so disjoint singleton options can no longer
  // make a sameAs group unsatisfiable when the group renders as Toggles.
  it('accepts a sameAs group of Toggle-rendered booleans with disjoint options', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', 'Toggle', trueOnly, { sameAs: 'b' }),
        b: boolean('b', 'Toggle', [{ label: 'No', value: false }]),
      }),
    ).toEqual([]);
  });

  it('still rejects a sameAs group of Boolean-rendered booleans with disjoint options', () => {
    const result = findValidationContradictions({
      a: boolean('a', 'Boolean', trueOnly, { sameAs: 'b' }),
      b: boolean('b', 'Boolean', [{ label: 'No', value: false }]),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });
});

describe('findValidationContradictions — twenty-first-wave Finding 3: bounds propagate along comparator chains', () => {
  const number = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'number',
    validation,
  });

  const datePicker = (
    name: string,
    parameters: Record<string, unknown>,
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation,
  });

  const relativePicker = (
    name: string,
    parameters: Record<string, unknown>,
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters,
    validation,
  });

  // The gap this closes: every single hop is feasible on its own because the
  // middle variable contributes no bound, yet no values satisfy the chain.
  it('rejects a three-link strict chain whose only bounds sit at its ends', () => {
    const result = findValidationContradictions({
      a: number('a', { maxValue: 1, greaterThanVariable: 'b' }),
      b: number('b', { greaterThanVariable: 'c' }),
      c: number('c', { minValue: 1 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toBe(
      'Variables "c", "b", "a" form a comparison chain their value ranges can never satisfy',
    );
    expect(result[0]?.variableIds).toEqual(['c', 'b', 'a']);
  });

  it('rejects a four-link strict chain, reporting it once rather than once per link', () => {
    const result = findValidationContradictions({
      a: number('a', { maxValue: 1, greaterThanVariable: 'b' }),
      b: number('b', { greaterThanVariable: 'c' }),
      c: number('c', { greaterThanVariable: 'd' }),
      d: number('d', { minValue: 1 }),
    });
    // Propagation derives an infeasible interval at all four nodes; the
    // bound-owning-pair canonicalisation collapses them to one report.
    expect(result).toHaveLength(1);
    expect(result[0]?.variableIds).toEqual(['d', 'c', 'b', 'a']);
  });

  it('reports two independent chains separately', () => {
    const result = findValidationContradictions({
      a: number('a', { maxValue: 1, greaterThanVariable: 'b' }),
      b: number('b', { greaterThanVariable: 'c' }),
      c: number('c', { minValue: 1 }),
      p: number('p', { maxValue: 1, greaterThanVariable: 'q' }),
      q: number('q', { greaterThanVariable: 'r' }),
      r: number('r', { minValue: 1 }),
    });
    expect(result).toHaveLength(2);
    expect(result.map((contradiction) => contradiction.variableIds)).toEqual([
      ['c', 'b', 'a'],
      ['r', 'q', 'p'],
    ]);
  });

  // The strip policy follows `strictComparatorCycle`: a chain has many
  // symmetric single-rule repairs, so every comparator on the witness goes and
  // the endpoint bound rules stay.
  it('strips every comparator on the chain and none of the endpoint bounds', () => {
    const result = findValidationContradictions({
      a: number('a', { maxValue: 1, greaterThanVariable: 'b' }),
      b: number('b', { greaterThanVariable: 'c' }),
      c: number('c', { greaterThanVariable: 'd' }),
      d: number('d', { minValue: 1 }),
    });
    expect(result[0]?.strips).toEqual([
      { variableId: 'c', rule: 'greaterThanVariable' },
      { variableId: 'b', rule: 'greaterThanVariable' },
      { variableId: 'a', rule: 'greaterThanVariable' },
    ]);
  });

  // `A >= B >= C` with `A.max === C.min` is genuinely satisfiable at
  // `a = b = c = 1`; only a strict link, or bounds that really do not meet,
  // make a chain impossible.
  it('accepts a non-strict chain whose end bounds touch', () => {
    expect(
      findValidationContradictions({
        a: number('a', { maxValue: 1, greaterThanOrEqualToVariable: 'b' }),
        b: number('b', { greaterThanOrEqualToVariable: 'c' }),
        c: number('c', { minValue: 1 }),
      }),
    ).toEqual([]);
  });

  it('rejects a non-strict chain whose end bounds genuinely do not meet', () => {
    const result = findValidationContradictions({
      a: number('a', { maxValue: 0, greaterThanOrEqualToVariable: 'b' }),
      b: number('b', { greaterThanOrEqualToVariable: 'c' }),
      c: number('c', { minValue: 1 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.strips).toEqual([
      { variableId: 'b', rule: 'greaterThanOrEqualToVariable' },
      { variableId: 'a', rule: 'greaterThanOrEqualToVariable' },
    ]);
  });

  // A strict step over a whole-numbered quantity advances the bound by exactly
  // one day, so two strict links need two days of headroom. `number` values
  // are NOT whole-numbered — the interview runtime coerces a number field with
  // a bare `Number()` — so the same shape over numbers only opens the bound
  // and one unit of headroom is enough (the case below).
  it('rejects a datetime chain with one day of headroom per two strict links', () => {
    const result = findValidationContradictions({
      a: datePicker('a', { max: '2020-01-02' }, { greaterThanVariable: 'b' }),
      b: datePicker('b', {}, { greaterThanVariable: 'c' }),
      c: datePicker('c', { min: '2020-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('accepts the same datetime chain given two days of headroom', () => {
    expect(
      findValidationContradictions({
        a: datePicker('a', { max: '2020-01-03' }, { greaterThanVariable: 'b' }),
        b: datePicker('b', {}, { greaterThanVariable: 'c' }),
        c: datePicker('c', { min: '2020-01-01' }),
      }),
    ).toEqual([]);
  });

  it('accepts a real-valued number chain with one unit of headroom', () => {
    expect(
      findValidationContradictions({
        a: number('a', { maxValue: 2, greaterThanVariable: 'b' }),
        b: number('b', { greaterThanVariable: 'c' }),
        c: number('c', { minValue: 1 }),
      }),
    ).toEqual([]);
  });

  it('propagates calendar bounds along a chain of DatePickers', () => {
    const result = findValidationContradictions({
      a: datePicker('a', { max: '2020-01-01' }, { greaterThanVariable: 'b' }),
      b: datePicker(
        'b',
        { min: '2010-01-01', max: '2030-01-01' },
        { greaterThanVariable: 'c' },
      ),
      c: datePicker('c', { min: '2020-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds).toEqual(['c', 'b', 'a']);
  });

  it('propagates symbolic interview-date offsets along a chain of anchorless pickers', () => {
    const result = findValidationContradictions({
      a: relativePicker(
        'a',
        { before: 0, after: 0 },
        { greaterThanVariable: 'b' },
      ),
      b: relativePicker(
        'b',
        { before: 180, after: 180 },
        { greaterThanVariable: 'c' },
      ),
      c: relativePicker('c', { before: 0, after: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds).toEqual(['c', 'b', 'a']);
  });

  // Each origin is propagated on its own, seeded only from its own bounds, so
  // a member measured against the other origin is a transparent relay. That
  // manufactures no cross-origin comparison: `A > B > C` gives `A > C` by
  // transitivity whatever B is measured against.
  it('relays a fixed-origin chain through an anchorless member', () => {
    const result = findValidationContradictions({
      a: datePicker('a', { max: '2020-01-01' }, { greaterThanVariable: 'b' }),
      b: relativePicker('b', {}, { greaterThanVariable: 'c' }),
      c: datePicker('c', { min: '2020-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds).toEqual(['c', 'b', 'a']);
  });

  it('relays a symbolic-origin chain through a fixed-window member', () => {
    const result = findValidationContradictions({
      a: relativePicker(
        'a',
        { before: 0, after: 0 },
        { greaterThanVariable: 'b' },
      ),
      b: datePicker(
        'b',
        { min: '2010-01-01', max: '2030-01-01' },
        { greaterThanVariable: 'c' },
      ),
      c: relativePicker('c', { before: 0, after: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds).toEqual(['c', 'b', 'a']);
  });

  it('leaves a mixed-origin chain alone when the shared origin is satisfiable', () => {
    expect(
      findValidationContradictions({
        a: datePicker('a', { max: '2030-01-01' }, { greaterThanVariable: 'b' }),
        b: relativePicker('b', {}, { greaterThanVariable: 'c' }),
        c: datePicker('c', { min: '2020-01-01' }),
      }),
    ).toEqual([]);
  });

  // The per-edge check declines to judge anything against a group whose own
  // bounds are already empty ("its strips resolve it first"); propagation
  // follows that precedent, treating such a group as an unbounded relay rather
  // than a chain endpoint. Once the sameAs repair splits the group, the
  // migration's strip fixpoint re-runs the analyser and any chain that is
  // still impossible surfaces then.
  it('does not chain off a group whose own bounds are already empty', () => {
    const result = findValidationContradictions({
      a: number('a', {
        maxValue: 5,
        sameAs: 'b',
        lessThanOrEqualToVariable: 'x',
      }),
      b: number('b', { minValue: 10 }),
      x: number('x', { lessThanOrEqualToVariable: 'y' }),
      y: number('y', { maxValue: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toBe(
      'Variables "a", "b" are joined by sameAs but their rules leave no value they can share',
    );
  });

  // A single hop is exactly what the per-edge check already reports, and
  // reports identically, so propagation must not duplicate it.
  it('leaves a single-hop disjoint comparator to the per-edge report', () => {
    const result = findValidationContradictions({
      a: number('a', { maxValue: 1, greaterThanVariable: 'b' }),
      b: number('b', { minValue: 1 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toBe(
      'Variable "a": greaterThanVariable "b" can never be satisfied because their value ranges do not overlap',
    );
  });

  // The upper bound has to travel DOWN the chain as well as the lower bound
  // travelling up. Here the tightest lower bound reaching `m2`'s ceiling comes
  // from `m2` itself one hop away — which the per-edge check already reports —
  // so the genuinely transitive `m -> x -> ceiling` conflict is only visible
  // once the ceiling has been pushed back down to `m`.
  it('reports a transitive chain hidden behind a tighter one-hop neighbour', () => {
    const result = findValidationContradictions({
      m: number('m', { minValue: 10, lessThanOrEqualToVariable: 'x' }),
      x: number('x', { lessThanOrEqualToVariable: 'ceiling' }),
      m2: number('m2', { minValue: 20, lessThanOrEqualToVariable: 'ceiling' }),
      ceiling: number('ceiling', { maxValue: 0 }),
    });
    expect(result.map((contradiction) => contradiction.class)).toEqual([
      'disjointBounds',
      'disjointBounds',
    ]);
    expect(result[0]?.message).toBe(
      'Variable "m2": lessThanOrEqualToVariable "ceiling" can never be satisfied because their value ranges do not overlap',
    );
    expect(result[1]?.variableIds).toEqual(['m', 'x', 'ceiling']);
    expect(result[1]?.strips).toEqual([
      { variableId: 'm', rule: 'lessThanOrEqualToVariable' },
      { variableId: 'x', rule: 'lessThanOrEqualToVariable' },
    ]);
  });

  // The mirror of the case above, pinning the other pass: here the tightest
  // CEILING reaching `floor` is one hop away — again already covered per-edge
  // — so the transitive `floor -> x -> farCeiling` conflict is only visible
  // once `floor`'s own floor has been carried up the chain.
  it('reports a transitive chain hidden behind a tighter one-hop ceiling', () => {
    const result = findValidationContradictions({
      floor: number('floor', { minValue: 0, lessThanOrEqualToVariable: 'x' }),
      x: number('x', { lessThanOrEqualToVariable: 'farCeiling' }),
      farCeiling: number('farCeiling', { maxValue: -10 }),
      nearCeiling: number('nearCeiling', {
        maxValue: -20,
        greaterThanOrEqualToVariable: 'floor',
      }),
    });
    expect(result.map((contradiction) => contradiction.class)).toEqual([
      'disjointBounds',
      'disjointBounds',
    ]);
    expect(result[0]?.message).toBe(
      'Variable "nearCeiling": greaterThanOrEqualToVariable "floor" can never be satisfied because their value ranges do not overlap',
    );
    expect(result[1]?.variableIds).toEqual(['floor', 'x', 'farCeiling']);
    expect(result[1]?.strips).toEqual([
      { variableId: 'floor', rule: 'lessThanOrEqualToVariable' },
      { variableId: 'x', rule: 'lessThanOrEqualToVariable' },
    ]);
  });

  // Groups inside a strict-edge SCC are already reported as
  // `strictComparatorCycle`, so they are dropped from propagation entirely
  // rather than surfacing a second time as an impossible chain.
  it('does not double-report a chain running through a strict comparator cycle', () => {
    const result = findValidationContradictions({
      y: number('y', { maxValue: 1, greaterThanVariable: 'a' }),
      a: number('a', { greaterThanVariable: 'b' }),
      b: number('b', { greaterThanVariable: 'a' }),
      z: number('z', { minValue: 1, lessThanVariable: 'b' }),
    });
    expect(result.map((contradiction) => contradiction.class)).toEqual([
      'strictComparatorCycle',
    ]);
  });

  it('still reports an unrelated chain alongside a strict comparator cycle', () => {
    const result = findValidationContradictions({
      a: number('a', { greaterThanVariable: 'b' }),
      b: number('b', { greaterThanVariable: 'a' }),
      p: number('p', { maxValue: 1, greaterThanVariable: 'q' }),
      q: number('q', { greaterThanVariable: 'r' }),
      r: number('r', { minValue: 1 }),
    });
    expect(
      result.map((contradiction) => contradiction.class).toSorted(),
    ).toEqual(['disjointBounds', 'strictComparatorCycle']);
  });

  // `sameAs(a, b)` plus `a <= c <= b` puts {a,b} and {c} on a group-level
  // two-cycle although no variable-level cycle exists, so the walk has to
  // condense it rather than assume a DAG. The condensed node then relays the
  // chain that runs into it.
  it('accepts a sameAs-induced group cycle that is satisfiable', () => {
    expect(
      findValidationContradictions({
        a: number('a', { sameAs: 'b', lessThanOrEqualToVariable: 'c' }),
        b: number('b', { maxValue: 5 }),
        c: number('c', { lessThanOrEqualToVariable: 'b' }),
      }),
    ).toEqual([]);
  });

  it('propagates a chain into a sameAs-induced group cycle', () => {
    const result = findValidationContradictions({
      a: number('a', { sameAs: 'b', lessThanOrEqualToVariable: 'c' }),
      b: number('b', { maxValue: 5 }),
      c: number('c', { lessThanOrEqualToVariable: 'b' }),
      e: number('e', {
        lessThanOrEqualToVariable: 'a',
        greaterThanOrEqualToVariable: 'f',
      }),
      f: number('f', { minValue: 10 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds).toEqual(['f', 'e', 'a', 'b', 'c']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'e', rule: 'greaterThanOrEqualToVariable' },
      { variableId: 'e', rule: 'lessThanOrEqualToVariable' },
    ]);
  });

  it('anchors the schema issue at the first stripped comparator', () => {
    const result = VariablesSchema.safeParse({
      a: {
        name: 'a',
        type: 'number',
        validation: { maxValue: 1, greaterThanVariable: 'b' },
      },
      b: {
        name: 'b',
        type: 'number',
        validation: { greaterThanVariable: 'c' },
      },
      c: { name: 'c', type: 'number', validation: { minValue: 1 } },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      'b',
      'validation',
      'greaterThanVariable',
    ]);
  });
});

describe('findValidationContradictions — twenty-first-wave Finding 3: large chains', () => {
  const boundedChainOf = (
    count: number,
    rule: string,
    first: Record<string, unknown>,
    last: Record<string, unknown>,
  ): Record<string, unknown> => {
    const variables: Record<string, unknown> = {};
    for (let i = 0; i < count; i++) {
      variables[`v${i}`] = {
        name: `v${i}`,
        type: 'number',
        validation: {
          ...(i < count - 1 ? { [rule]: `v${i + 1}` } : {}),
          ...(i === 0 ? first : {}),
          ...(i === count - 1 ? last : {}),
        },
      };
    }
    return variables;
  };

  it('accepts a long chain whose end bounds leave room', () => {
    // v0 <= v1 <= ... <= v9999, with v0 >= 1 and v9999 <= 100.
    expect(
      findValidationContradictions(
        boundedChainOf(
          10_000,
          'lessThanOrEqualToVariable',
          { minValue: 1 },
          { maxValue: 100 },
        ),
      ),
    ).toEqual([]);
  });

  it('reports a long strict chain whose end bounds do not, exactly once', () => {
    // v0 > v1 > ... > v9999, with v0 <= 1 and v9999 >= 1.
    const result = findValidationContradictions(
      boundedChainOf(
        10_000,
        'greaterThanVariable',
        { maxValue: 1 },
        { minValue: 1 },
      ),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds).toHaveLength(10_000);
    expect(result[0]?.strips).toHaveLength(9_999);
  });
});

// Twenty-first-wave Finding 1 (reviewer finding on booleanDomain, resolved):
// the audit sweep above already made the STAGE-EFFECTIVE overlay check
// (schema.ts's `validateComposerFieldContradictions`) correctly unpin a
// Toggle-rendered singleton-boolean pair — see "does not pin a
// singleton-options boolean rendered by a Toggle" above. The reviewer's
// report was that `rejectValidationContradictions` (variable.ts), chained
// directly onto the codebook's `VariablesSchema`, runs BEFORE any stage
// exists and therefore never sees a composer field's `component` override at
// all: it only ever saw the bare codebook variable, which — because a
// componentless boolean is renderable ONLY by a NetworkComposer field
// (confirmed: every shared-form-field path routes through schema.ts's
// `validateFormFieldVariable`, which rejects a componentless variable
// outright) — carries no reliable signal either way.
//
// The resolution: `booleanDomain` now only pins from `options` when the
// codebook declares `component: 'Boolean'` explicitly; an absent/null
// component reads as an unknowable (two-value) domain instead of trusting
// the codebook's `options`, closing the false rejection. This does not
// erase the genuine detection — it moves it to the stage-effective overlay,
// which now sees a `pinnedEqualDifferentFrom` contradiction the (silent)
// codebook-level baseline no longer reports, so the overlay's own dedup
// against that baseline no longer suppresses it (see the `baseKeys` diff in
// `validateComposerFieldContradictions`). The four cases below confirm the
// full shape at the protocol level: the reviewer's Toggle case now accepts,
// the same pair rendered with `component: 'Boolean'` is still caught (by the
// overlay instead of the codebook), a componentless pair with no composer
// stage at all has nothing to contradict, and an explicit `component:
// 'Boolean'` pair is still caught at the codebook layer exactly as before.
describe('findValidationContradictions — Twenty-first-wave Finding 1: componentless boolean domain follows the rendering stage, not the codebook', () => {
  type BaseProtocol = ReturnType<typeof createBaseProtocol> & {
    codebook: {
      node: { person: { variables: Record<string, unknown> } };
    };
  };

  const booleanVariable = (name: string, component: 'Boolean' | undefined) => ({
    name,
    type: 'boolean',
    ...(component !== undefined ? { component } : {}),
    options: [{ label: 'Yes', value: true }],
  });

  /**
   * A base protocol carrying a `differentFrom`-joined singleton-`true`
   * boolean pair (`boolA`/`boolB`) on the `person` node, with the codebook
   * variables' own `component` and the protocol's `stages` array both
   * caller-controlled — the two axes these tests vary independently.
   */
  const protocolWithBooleanPair = (
    variableComponent: 'Boolean' | undefined,
    stages: unknown[] | undefined,
  ) => {
    const base = structuredClone(createBaseProtocol()) as BaseProtocol;
    return {
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          ...base.codebook.node,
          person: {
            ...base.codebook.node.person,
            variables: {
              ...base.codebook.node.person.variables,
              boolA: {
                ...booleanVariable('BoolA', variableComponent),
                validation: { differentFrom: 'boolB' },
              },
              boolB: booleanVariable('BoolB', variableComponent),
            },
          },
        },
      },
      ...(stages !== undefined ? { stages } : {}),
    };
  };

  const networkComposerStage = (component: 'Toggle' | 'Boolean') => ({
    id: 'nc1',
    label: 'Build the network',
    type: 'NetworkComposer',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    layoutVariable: 'layoutPosition',
    background: { concentricCircles: 4 },
    nodeForm: {
      fields: [
        { variable: 'boolA', component, label: 'A?' },
        { variable: 'boolB', component, label: 'B?' },
      ],
    },
  });

  // The reviewer's exact report: componentless codebook variables, rendered
  // exclusively by NetworkComposer fields with `component: 'Toggle'`.
  // ToggleField takes no `options` prop and is unconditionally two-valued,
  // so this is genuinely satisfiable and must be accepted.
  it('accepts a componentless singleton-true boolean pair rendered exclusively as Toggle by NetworkComposer fields', () => {
    const protocol = protocolWithBooleanPair(undefined, [
      networkComposerStage('Toggle'),
    ]);

    const result = ProtocolSchemaV8.safeParse(protocol);

    expect(result.success).toBe(true);
  });

  // The important counterpart: the SAME componentless codebook pair, but the
  // NetworkComposer fields render the `Boolean` choice control instead — a
  // genuine contradiction, since Boolean honours `options` and both fields
  // are pinned to `true`. This proves detection moved to the stage-effective
  // overlay rather than vanishing: the codebook-level check no longer
  // reports anything (componentless, so `booleanDomain` treats it as
  // two-valued), so the rejection can only come from
  // `validateComposerFieldContradictions` overlaying `component: 'Boolean'`
  // from the fields onto the codebook variables and re-running the analyser.
  it('still rejects the same pair when the NetworkComposer fields render Boolean choice controls', () => {
    const protocol = protocolWithBooleanPair(undefined, [
      networkComposerStage('Boolean'),
    ]);

    const result = ProtocolSchemaV8.safeParse(protocol);

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) =>
        candidate.message.includes('must differ but their rules pin both'),
      );
      expect(issue).toBeDefined();
      // Anchored at the NetworkComposer field, not the codebook variable —
      // confirming this rejection comes from the stage-effective overlay,
      // not a (nonexistent) codebook-level report.
      expect(issue?.path.slice(0, 2)).toEqual(['stages', 0]);
    }
  });

  // A componentless pair that no composer field (or any other stage)
  // renders at all: nothing determines its runtime control, so nothing is
  // contradictory. The base protocol's own default stages (a NameGenerator
  // using unrelated variables) are left in place to confirm an unrelated
  // stage does not itself trigger a report.
  it('accepts a componentless singleton-true boolean pair with no composer stage at all', () => {
    const protocol = protocolWithBooleanPair(undefined, undefined);

    const result = ProtocolSchemaV8.safeParse(protocol);

    expect(result.success).toBe(true);
  });

  // An explicit `component: 'Boolean'` pair: the codebook itself commits to
  // the choice control, so this stays rejected at the codebook layer exactly
  // as before this wave — unchanged behaviour, confirmed end-to-end.
  it('still rejects an explicit component: Boolean singleton pair at the codebook layer, unchanged', () => {
    const protocol = protocolWithBooleanPair('Boolean', undefined);

    const result = ProtocolSchemaV8.safeParse(protocol);

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) =>
        candidate.message.includes('must differ but their rules pin both'),
      );
      expect(issue).toBeDefined();
      expect(issue?.path.slice(0, 2)).toEqual(['codebook', 'node']);
    }
  });
});
