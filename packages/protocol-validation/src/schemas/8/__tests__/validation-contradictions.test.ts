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

  // Twenty-first-wave Finding 1 scoped options-derived domains to an explicit
  // `component: 'Boolean'`; twenty-sixth-wave Finding 1 further gates them on
  // `stageEffectiveComponents` — a codebook-level read can never know whether
  // a NetworkComposer field overrides even an explicit component, so these
  // fixtures run in stage-effective mode to keep exercising the group-level
  // domain check this block targets.
  it('rejects a true-only boolean sameAs a false-only boolean', () => {
    const result = findValidationContradictions(
      {
        a: { ...boolean('a', { sameAs: 'b' }, trueOnly), component: 'Boolean' },
        b: { ...boolean('b', {}, falseOnly), component: 'Boolean' },
      },
      { stageEffectiveComponents: true },
    );
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
    const result = findValidationContradictions(
      {
        a: {
          ...boolean('a', { greaterThanOrEqualToVariable: 'b' }, trueOnly),
          component: 'Boolean',
        },
        b: {
          ...boolean('b', { greaterThanOrEqualToVariable: 'a' }, falseOnly),
          component: 'Boolean',
        },
      },
      { stageEffectiveComponents: true },
    );
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

describe('findValidationContradictions — Twenty-first-wave Finding 6: comparator cycles closed only by sameAs contraction', () => {
  const number = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'number',
    validation,
  });

  // The reviewer's own example: `a.sameAs = c` plus `a >= b` and `b >= c`
  // squeezes every value equal (`a = b = c`), even though the two comparator
  // edges alone are just an acyclic chain `c -> b -> a` on the RAW variable
  // graph — the cycle only exists once `a` and `c` are contracted into one
  // node by `sameAs`. `b.differentFrom = c` then names two variables the rest
  // of the rules already force equal.
  it('rejects a non-strict comparator cycle that only closes once sameAs contracts its endpoints', () => {
    const result = findValidationContradictions({
      a: number('a', { sameAs: 'c', greaterThanOrEqualToVariable: 'b' }),
      b: number('b', {
        greaterThanOrEqualToVariable: 'c',
        differentFrom: 'c',
      }),
      c: number('c'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('sameAsGroupConflict');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b', 'c']);
    expect(result[0]?.message).toBe(
      'Variable "b": differentFrom references "c", but the comparison rules already require them to be equal',
    );
    // The differentFrom edge itself is what a class-9 group conflict always
    // strips; removing it leaves `a.sameAs = c`, `a >= b >= c` satisfiable
    // (e.g. a = b = c), so this genuinely resolves the contradiction rather
    // than merely relocating it.
    expect(result[0]?.strips).toEqual([
      { variableId: 'b', rule: 'differentFrom' },
    ]);
  });

  // Drop the differentFrom: the same three rules force `a = b = c`, but
  // nothing requires them to differ, so one shared value satisfies
  // everything.
  it('still accepts the same three comparator/sameAs rules without differentFrom', () => {
    expect(
      findValidationContradictions({
        a: number('a', { sameAs: 'c', greaterThanOrEqualToVariable: 'b' }),
        b: number('b', { greaterThanOrEqualToVariable: 'c' }),
        c: number('c'),
      }),
    ).toEqual([]);
  });

  // A one-way non-strict chain with nothing closing it into a cycle — no
  // sameAs, no reverse edge — must never be read as forcing equality. This is
  // the false-rejection guard for the fix: enlarging equality groups can only
  // ever ADD rejections, so a chain that stays a chain must stay accepted.
  it('still accepts a one-way non-strict chain with no sameAs to close it', () => {
    expect(
      findValidationContradictions({
        p: number('p', { greaterThanOrEqualToVariable: 'q' }),
        q: number('q', { greaterThanOrEqualToVariable: 'r' }),
        r: number('r'),
      }),
    ).toEqual([]);
  });

  // A longer contraction: `w.sameAs = z` plus the three-hop chain
  // `w >= x >= y >= z` closes a FOUR-member cycle, not just the two-variable
  // case above — every member of the closing SCC must be unioned, not just
  // the first pair `stronglyConnectedComponents` happens to return.
  // `x.differentFrom = y` then names two variables from the middle of the
  // chain, neither of which carries a `sameAs` edge itself.
  it('merges every member of a longer cycle closed by sameAs contraction', () => {
    const result = findValidationContradictions({
      w: number('w', { sameAs: 'z', greaterThanOrEqualToVariable: 'x' }),
      x: number('x', {
        greaterThanOrEqualToVariable: 'y',
        differentFrom: 'y',
      }),
      y: number('y', { greaterThanOrEqualToVariable: 'z' }),
      z: number('z'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('sameAsGroupConflict');
    expect(result[0]?.variableIds.toSorted()).toEqual(['w', 'x', 'y', 'z']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'x', rule: 'differentFrom' },
    ]);
  });

  // No test exercises a genuine SECOND round of contraction, because none
  // can be constructed: contracting a directed graph's strongly-connected
  // components always yields an acyclic condensation (a standard
  // graph-theory fact — if two contracted components still closed a cycle
  // with each other, their members would already have been mutually
  // reachable before contraction, so Tarjan would have merged them into one
  // SCC on the first pass). `buildEqualityGroups` seeds every `sameAs` union
  // before the first SCC pass runs, so that first pass already sees the
  // fully sameAs-contracted graph; any further round is mathematically
  // guaranteed to find nothing. The loop still runs generally (bounded by
  // the variable count, stopping the instant a round finds no new
  // component) rather than hard-coding "at most one round", so it stays
  // correct if a future change feeds it a second, non-sameAs seed relation.
});

describe('findValidationContradictions — Twenty-second-wave Finding 3: comparator equality does not force identical stored dates', () => {
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

  // The reviewer's own counterexample: a full-resolution picker pinned to
  // '2021-01-01' and a month-resolution picker pinned to '2021-01' both
  // resolve to the same UTC instant under `compareVariables`' `Date`
  // conversion, so mutual `lessThanOrEqualToVariable` rules are satisfiable
  // (both sides Date-equal) WITHOUT the two ever holding the same stored
  // string — `differentFrom` compares stored strings exactly, so it remains
  // satisfiable too (e.g. '2021-01-01' vs '2021-01'). Windows are pinned to
  // the same instant (rather than left open) so a genuinely satisfiable
  // protocol is exercised, not merely an unconstrained one.
  it('accepts a mixed-resolution datetime pair joined only by mutual comparators, with differentFrom', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { min: '2021-01-01', max: '2021-01-01' },
        {
          required: true,
          lessThanOrEqualToVariable: 'b',
          differentFrom: 'b',
        },
      ),
      b: datePicker(
        'b',
        { type: 'month', min: '2021-01', max: '2021-01' },
        { required: true, lessThanOrEqualToVariable: 'a' },
      ),
    });
    expect(result).toEqual([]);
  });

  // Same mixed-resolution pair, but joined by `sameAs` (via a third-variable
  // relay, so class 7's same-variable sameAs+differentFrom check does not
  // also fire) rather than mutual comparators. `sameAs` forces the stored
  // strings themselves equal (fresco-ui's `isMatchingValue`), so this stays
  // unsatisfiable regardless of resolution — the class-9 `sameAsGroupConflict`
  // must still fire. The mixed resolutions ALSO trip the pre-existing,
  // unrelated `mixedResolutionSameAsContradictions` check (a direct
  // cross-resolution `sameAs` edge is disjointBounds on its own), so both
  // entries are expected; only the sameAsGroupConflict one is this fix's
  // concern.
  it('still rejects the same mixed-resolution pair when joined by sameAs instead of comparators', () => {
    const result = findValidationContradictions({
      a: datePicker('a', {}, { required: true, sameAs: 'b' }),
      b: datePicker(
        'b',
        { type: 'month' },
        { required: true, differentFrom: 'a' },
      ),
    });
    const groupConflict = result.find((c) => c.class === 'sameAsGroupConflict');
    expect(groupConflict).toBeDefined();
    expect(groupConflict?.message).toBe(
      'Variable "b": differentFrom references "a", but sameAs already requires them to be equal',
    );
    expect(groupConflict?.strips).toEqual([
      { variableId: 'b', rule: 'differentFrom' },
    ]);
  });

  // Two datetime variables at the SAME resolution, joined only by mutual
  // comparators: unlike the mixed-resolution case above, a forced Date-equal
  // between two full-resolution pickers DOES imply their stored strings
  // match too (full-resolution is a single canonical string per instant), so
  // this must stay rejected — the guard that scopes the false-rejection fix
  // to genuinely mismatched resolutions.
  it('still rejects two SAME-resolution datetime variables joined only by mutual comparators, with differentFrom', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        {},
        { required: true, lessThanOrEqualToVariable: 'b', differentFrom: 'b' },
      ),
      b: datePicker(
        'b',
        {},
        { required: true, lessThanOrEqualToVariable: 'a' },
      ),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('sameAsGroupConflict');
    expect(result[0]?.message).toBe(
      'Variable "a": differentFrom references "b", but the comparison rules already require them to be equal',
    );
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  // Number comparator equality DOES force identical stored values (a number
  // has no second textual representation the way a truncated date string
  // does), so this class of rejection must not change for number.
  it('still rejects a number comparator-only equality group with differentFrom, unchanged', () => {
    const result = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        validation: {
          greaterThanOrEqualToVariable: 'b',
          differentFrom: 'b',
        },
      },
      b: {
        name: 'b',
        type: 'number',
        validation: { greaterThanOrEqualToVariable: 'a' },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('sameAsGroupConflict');
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  // Defensive/raw-input guard: the fix's datetime exception is keyed off the
  // variable's OWN type, not merely a resolution mismatch as computed by
  // `dateResolutionOf` — which defaults a componentless variable to 'full'
  // and would otherwise read a stray `parameters.type` as coarse. The
  // analyser also runs on raw, unvalidated migration input, so a `number`
  // variable carrying a leftover DatePicker-shaped `parameters.type` field
  // (never offered by the schema, but not excluded from raw input either)
  // must not be read as datetime and must not gain the resolution exception.
  it('keeps rejecting a number comparator-only pair even if raw input carries a stray datetime-shaped parameters.type', () => {
    const result = findValidationContradictions({
      a: {
        name: 'a',
        type: 'number',
        parameters: { type: 'month' },
        validation: {
          greaterThanOrEqualToVariable: 'b',
          differentFrom: 'b',
        },
      },
      b: {
        name: 'b',
        type: 'number',
        validation: { greaterThanOrEqualToVariable: 'a' },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('sameAsGroupConflict');
  });
});

describe('findValidationContradictions — second-wave Finding 4: odd boolean differentFrom cycles', () => {
  const boolean = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'boolean',
    validation,
  });

  // Twenty-third-wave Finding 1: removing any ONE edge from an odd cycle
  // makes the remainder bipartite, so a minimal-strip repair only needs to
  // strip that one edge's declarations — not every edge in the cycle (the
  // old over-strip behaviour, which discarded two otherwise-valid authored
  // constraints alongside the truly contradictory one).
  it('rejects a three-variable differentFrom triangle over booleans, stripping exactly one edge', () => {
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
    expect(result[0]?.strips).toHaveLength(1);
    expect(
      result[0]?.strips.every((strip) => strip.rule === 'differentFrom'),
    ).toBe(true);
    // The repair is genuinely minimal: applying just this one strip resolves
    // the contradiction (the graph becomes satisfiable), and it is chosen
    // deterministically — by the edge's own canonical sorted key — so it is
    // stable across runs.
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
    expect(
      findValidationContradictions({
        a: boolean('a', {}),
        b: boolean('b', { differentFrom: 'c' }),
        c: boolean('c', { differentFrom: 'a' }),
      }),
    ).toEqual([]);
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
    // Twenty-third-wave Finding 1: only ONE edge of the triangle is
    // stripped now, not all three — d's branch rule was already untouched
    // (it never closed a loop of its own), and now two of the triangle's
    // three edges also survive.
    expect(result[0]?.strips).toHaveLength(1);
    expect(
      result[0]?.strips.every(
        (strip) => strip.rule === 'differentFrom' && strip.variableId !== 'd',
      ),
    ).toBe(true);
  });
});

describe('findValidationContradictions — Twenty-third-wave Finding 1: minimal odd-cycle strips', () => {
  const boolean = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'boolean',
    validation,
  });

  it('strips exactly one edge from a longer (five-node) odd cycle, leaving a satisfiable graph', () => {
    const result = findValidationContradictions({
      a: boolean('a', { differentFrom: 'b' }),
      b: boolean('b', { differentFrom: 'c' }),
      c: boolean('c', { differentFrom: 'd' }),
      d: boolean('d', { differentFrom: 'e' }),
      e: boolean('e', { differentFrom: 'a' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('oddDifferentFromCycle');
    expect(result[0]?.variableIds.toSorted()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(result[0]?.strips).toHaveLength(1);
    const stripped = result[0]?.strips[0];
    expect(stripped?.rule).toBe('differentFrom');
    // Applying the reported strip (deleting that one rule) must leave the
    // rest of the five-cycle satisfiable.
    expect(stripped).toBeDefined();
    if (!stripped) throw new Error('unreachable');
    const repaired: Record<string, ReturnType<typeof boolean>> = {
      a: boolean('a', { differentFrom: 'b' }),
      b: boolean('b', { differentFrom: 'c' }),
      c: boolean('c', { differentFrom: 'd' }),
      d: boolean('d', { differentFrom: 'e' }),
      e: boolean('e', { differentFrom: 'a' }),
    };
    delete repaired[stripped.variableId]?.validation[stripped.rule];
    expect(findValidationContradictions(repaired)).toEqual([]);
  });

  it('strips both declarations of a chosen edge when it is declared from both endpoints (via a multi-member equality group)', () => {
    // Three equality groups form a triangle: {p, q} (via sameAs), {r, s}
    // (via sameAs), and {t}. The p-r edge is declared from BOTH sides — p
    // (its group's "own" declaration) and s (the other group's member
    // declaring the same edge back) — so its bucket carries two sources.
    // Sorting the three edge keys ("p\0r" < "p\0t" < "r\0t") deterministically
    // picks the p-r edge, so both p's and s's differentFrom must be stripped
    // together.
    const variables = {
      p: boolean('p', { differentFrom: 'r' }),
      q: boolean('q', { sameAs: 'p' }),
      r: boolean('r', { differentFrom: 't' }),
      s: boolean('s', { sameAs: 'r', differentFrom: 'q' }),
      t: boolean('t', { differentFrom: 'p' }),
    };
    const result = findValidationContradictions(variables);
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('oddDifferentFromCycle');
    expect(result[0]?.strips).toHaveLength(2);
    expect(new Set(result[0]?.strips.map((strip) => strip.variableId))).toEqual(
      new Set(['p', 's']),
    );
    expect(
      result[0]?.strips.every((strip) => strip.rule === 'differentFrom'),
    ).toBe(true);

    // Applying both strips leaves q's sameAs, r's differentFrom, s's sameAs
    // and t's differentFrom intact, and the graph satisfiable.
    const repaired = structuredClone(variables);
    delete repaired.p.validation.differentFrom;
    delete repaired.s.validation.differentFrom;
    expect(findValidationContradictions(repaired)).toEqual([]);
    expect(repaired.q.validation.sameAs).toBe('p');
    expect(repaired.s.validation.sameAs).toBe('r');
    expect(repaired.r.validation.differentFrom).toBe('t');
    expect(repaired.t.validation.differentFrom).toBe('p');
  });
});

describe('findValidationContradictions — Twenty-third-wave Finding 2: domain-aware bipartite colouring', () => {
  const pinnedBoolean = (
    name: string,
    validation: Record<string, unknown> = {},
    options?: { label: string; value: boolean }[],
    component = 'Boolean',
  ) => ({
    name,
    type: 'boolean',
    component,
    validation,
    ...(options !== undefined ? { options } : {}),
  });

  // Twenty-sixth-wave Finding 1: options-derived boolean pins only exist in
  // stage-effective mode (a codebook-level read cannot know whether a
  // NetworkComposer field overrides even an explicit `component: 'Boolean'`),
  // so this whole block — whose subject is exactly those pins against the
  // differentFrom graph — runs the analyser in that mode.
  const analyse = (variables: Record<string, unknown>) =>
    findValidationContradictions(variables, {
      stageEffectiveComponents: true,
    });

  const trueOnly = [{ label: 'Yes', value: true }];
  const falseOnly = [{ label: 'No', value: false }];
  const bothValues = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];

  // Applies every reported strip and re-analyses, confirming a MINIMAL
  // repair actually resolves the contradiction — the same "is it genuinely
  // satisfiable afterwards" bar Finding 1's tests hold the odd-cycle repair
  // to.
  const applyStripsAndReanalyse = (
    variables: Record<
      string,
      { name: string; validation: Record<string, unknown> }
    >,
    strips: readonly { variableId: string; rule: string }[],
  ) => {
    const repaired = structuredClone(variables);
    for (const strip of strips) {
      delete repaired[strip.variableId]?.validation[strip.rule];
    }
    return analyse(repaired);
  };

  it("reports the reviewer's A={true}, B={true,false}, C={false} chain as unsatisfiable", () => {
    // The graph is bipartite (a-b-c is a simple path, not a cycle), but a
    // and c are pinned to opposite values 2 hops apart — an EVEN distance,
    // which forces them to the SAME value under either of the component's
    // two valid colourings.
    const variables = {
      a: pinnedBoolean('a', { required: true, differentFrom: 'b' }, trueOnly),
      b: pinnedBoolean('b', { required: true, differentFrom: 'c' }),
      c: pinnedBoolean('c', { required: true }, falseOnly),
    };
    const result = analyse(variables);
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedDifferentFromParity');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b', 'c']);
    expect(result[0]?.strips.length).toBeGreaterThan(0);
    expect(
      result[0]?.strips.every((strip) => strip.rule === 'differentFrom'),
    ).toBe(true);
    expect(applyStripsAndReanalyse(variables, result[0]?.strips ?? [])).toEqual(
      [],
    );
  });

  it('accepts the same chain once C also admits both values', () => {
    expect(
      analyse({
        a: pinnedBoolean('a', { required: true, differentFrom: 'b' }, trueOnly),
        b: pinnedBoolean('b', { required: true, differentFrom: 'c' }),
        c: pinnedBoolean('c', { required: true }, bothValues),
      }),
    ).toEqual([]);
  });

  // False-rejection guard: fewer than two pinned members in a component must
  // never be flagged, regardless of the graph's shape.
  it('accepts a chain with no singleton domains at all', () => {
    expect(
      analyse({
        a: pinnedBoolean('a', { differentFrom: 'b' }),
        b: pinnedBoolean('b', { differentFrom: 'c' }),
        c: pinnedBoolean('c', {}),
      }),
    ).toEqual([]);
  });

  // False-rejection guard: two singletons an EVEN number of hops apart are
  // required to hold the SAME value — pinning them to matching values is
  // exactly what satisfies that, and must stay accepted.
  it('accepts two singletons at even distance pinned to agreeing values', () => {
    expect(
      analyse({
        a: pinnedBoolean('a', { differentFrom: 'b' }, trueOnly),
        b: pinnedBoolean('b', { differentFrom: 'c' }),
        c: pinnedBoolean('c', {}, trueOnly),
      }),
    ).toEqual([]);
  });

  // Two singletons an ODD number of hops apart are required to hold
  // DIFFERENT values (the chain's alternation forces it); pinning them to
  // the SAME value instead is unsatisfiable. Distance 3 (not 1) so this
  // exercises the chain-parity check rather than the directly-adjacent case
  // `pinnedEqualDifferentFromContradictions` already reports on its own.
  it('reports two singletons at odd distance pinned to the same value', () => {
    const variables = {
      a: pinnedBoolean('a', { differentFrom: 'b' }, trueOnly),
      b: pinnedBoolean('b', { differentFrom: 'c' }),
      c: pinnedBoolean('c', { differentFrom: 'd' }),
      d: pinnedBoolean('d', {}, trueOnly),
    };
    const result = analyse(variables);
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedDifferentFromParity');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b', 'c', 'd']);
    expect(applyStripsAndReanalyse(variables, result[0]?.strips ?? [])).toEqual(
      [],
    );
  });

  // Twenty-first-wave Finding 1 / this file's `booleanDomain`: `options` only
  // pins a domain when the EFFECTIVE component is the choice control.
  // Singleton detection must go through `booleanDomain` (via
  // `sharedBooleanDomain`), not read `options` directly, so a
  // Toggle-rendered boolean stays unconditionally two-valued here exactly as
  // it does everywhere else in this file — reproducing the reviewer's shape
  // but rendered by Toggle must NOT be flagged.
  it('treats a Toggle-rendered singleton-options boolean as a full domain', () => {
    expect(
      analyse({
        a: pinnedBoolean(
          'a',
          { required: true, differentFrom: 'b' },
          trueOnly,
          'Toggle',
        ),
        b: pinnedBoolean(
          'b',
          { required: true, differentFrom: 'c' },
          undefined,
          'Toggle',
        ),
        c: pinnedBoolean('c', { required: true }, falseOnly, 'Toggle'),
      }),
    ).toEqual([]);
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
  // own component). Twenty-sixth-wave Finding 1 goes one step further: even
  // an explicit component is only the RENDERED control in a stage-effective
  // view (a composer field can override it to Toggle), so these fixtures run
  // in stage-effective mode, preserving the genuine singleton-domain
  // detection this block targets.
  it('rejects two true-only booleans joined by differentFrom', () => {
    const result = findValidationContradictions(
      {
        a: {
          ...boolean('a', { differentFrom: 'b' }, trueOnly),
          component: 'Boolean',
        },
        b: { ...boolean('b', {}, trueOnly), component: 'Boolean' },
      },
      { stageEffectiveComponents: true },
    );
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

  // Twenty-first / twenty-sixth-wave Finding 1: as above, an explicit
  // `component: 'Boolean'` in a stage-effective view is what makes the
  // singleton `options` array a rendering that actually reaches a
  // participant.
  it('still treats a singleton options array as a pinned value', () => {
    const result = findValidationContradictions(
      {
        a: {
          ...boolean('a', { differentFrom: 'b' }, trueOnly),
          component: 'Boolean',
        },
        b: { ...boolean('b', {}, trueOnly), component: 'Boolean' },
      },
      { stageEffectiveComponents: true },
    );
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

describe('findValidationContradictions — Twenty-third-wave Finding 9 (reverted): singleton domains pin regardless of required', () => {
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

  // The reviewer's original finding: two option ENTRIES sharing one distinct
  // value ('x') collapse to a single-value domain (`optionValues` dedupes),
  // so two required categoricals joined by differentFrom are pinned to the
  // same value even though neither sets `minSelected`. Still rejected under
  // the uniform (non-`required`-gated) policy — `required` is incidental
  // here, not load-bearing.
  it('rejects two required categoricals whose duplicate-value options force the same singleton selection', () => {
    const result = findValidationContradictions({
      a: categorical('a', ['x', 'x'], { required: true, differentFrom: 'b' }),
      b: categorical('b', ['x', 'x'], { required: true }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  // Uniformity case (a): a singleton distinct-value domain pins the same way
  // whether or not `required` is set — an unanswered field is outside the
  // contradiction model, so the possibility of leaving it blank does not
  // rescue `differentFrom`. This is new detection: pre-wave-23 there was no
  // categorical singleton pin at all.
  it('rejects two optional categoricals whose duplicate-value options force the same singleton selection', () => {
    const result = findValidationContradictions({
      a: categorical('a', ['x', 'x'], { differentFrom: 'b' }),
      b: categorical('b', ['x', 'x']),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  // Two distinct option values are never a singleton domain, so this stays
  // unpinned regardless of `required`.
  it('accepts a required categorical pair with two distinct option values and no minSelected', () => {
    expect(
      findValidationContradictions({
        a: categorical('a', ['x', 'y'], {
          required: true,
          differentFrom: 'b',
        }),
        b: categorical('b', ['x', 'y'], { required: true }),
      }),
    ).toEqual([]);
  });

  // Uniformity case (c): the pre-existing minSelected-based pin (tenth-wave
  // Finding 2) fires without `required` set anywhere, re-asserting existing
  // behaviour.
  it('rejects two optional categoricals with minSelected at the distinct-value count joined by differentFrom', () => {
    const result = findValidationContradictions({
      a: categorical('a', ['x', 'y'], { minSelected: 2, differentFrom: 'b' }),
      b: categorical('b', ['x', 'y'], { minSelected: 2 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  // Uniformity case (a), ordinal side: single-select, so a singleton
  // distinct-value domain pins outright with no `required` set anywhere —
  // matches the reverted tenth-wave Finding 2 test above, asserted again
  // here alongside its categorical counterparts for direct comparison.
  it('rejects two optional ordinals with the same single distinct option value', () => {
    const result = findValidationContradictions({
      a: ordinal('a', ['x'], { differentFrom: 'b' }),
      b: ordinal('b', ['x']),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  // Mirror accept case, guarding against over-reach: two distinct option
  // values leave an ordinal's domain non-empty but not determined, so it
  // stays unpinned — with no `required` set anywhere.
  it('accepts two optional ordinals with two distinct option values', () => {
    expect(
      findValidationContradictions({
        a: ordinal('a', ['x', 'y'], { differentFrom: 'b' }),
        b: ordinal('b', ['x', 'y']),
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

  // Twenty-sixth-wave Finding 1 reverses the twenty-third-wave expectation
  // here: options-derived boolean pins no longer exist at the RECORD level,
  // because the record refinement cannot see whether every NetworkComposer
  // occurrence overrides even an explicit `component: 'Boolean'` to Toggle
  // (which renders no options and offers both values) — rejecting here made
  // the v7→v8 migration strip rules from runtime-satisfiable protocols. The
  // parity class now surfaces only through schema.ts's stage-effective
  // composer overlay (exercised end-to-end in the twenty-first-wave protocol
  // block below); the record schema must ACCEPT this shape.
  it('accepts a node variables record whose boolean differentFrom parity would only be unsatisfiable under codebook-declared renderings', () => {
    const result = VariablesSchema.safeParse({
      a: {
        name: 'a',
        type: 'boolean',
        component: 'Boolean',
        options: [{ label: 'Yes', value: true }],
        validation: { differentFrom: 'b' },
      },
      b: {
        name: 'b',
        type: 'boolean',
        component: 'Boolean',
        validation: { differentFrom: 'c' },
      },
      c: {
        name: 'c',
        type: 'boolean',
        component: 'Boolean',
        options: [{ label: 'No', value: false }],
        validation: {},
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

describe('findValidationContradictions — twenty-first-wave Finding 2: coarse pickers model their discrete emission set, not just their interval', () => {
  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation: { required: true, ...validation },
  });

  // The reviewer's own report: a year picker spanning 2020-2021 emits only
  // {2020-01-01, 2021-01-01}; a month picker spanning 2020-02–2020-12 emits
  // only the first of each of those months. Their convex day-number
  // intervals overlap (the month's nests inside the year's), so the interval
  // check alone accepts mutual >=, but no value the two controls can
  // actually emit is ever shared.
  it('rejects a year picker mutually >= a month picker whose ranges overlap but share no instant', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2020', max: '2021' },
        { greaterThanOrEqualToVariable: 'b' },
      ),
      b: datePicker(
        'b',
        { type: 'month', min: '2020-02', max: '2020-12' },
        { greaterThanOrEqualToVariable: 'a' },
      ),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toContain(
      'the exact dates their pickers can ever emit share no instant',
    );
    expect(
      result[0]?.strips.toSorted((a, b) =>
        a.variableId.localeCompare(b.variableId),
      ),
    ).toEqual([
      { variableId: 'a', rule: 'greaterThanOrEqualToVariable' },
      { variableId: 'b', rule: 'greaterThanOrEqualToVariable' },
    ]);
  });

  // The false-positive guard, and the one that matters most: shrinking the
  // month picker's window to include January still leaves a genuinely shared
  // instant (2020-01-01), so this must stay accepted.
  it('accepts a year picker and a month picker whose emittable sets do share an instant', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2020', max: '2021' },
          { greaterThanOrEqualToVariable: 'b' },
        ),
        b: datePicker(
          'b',
          { type: 'month', min: '2020-01', max: '2020-06' },
          { greaterThanOrEqualToVariable: 'a' },
        ),
      }),
    ).toEqual([]);
  });

  // Two coarse pickers at the SAME resolution never trigger a false
  // rejection: their discrete sets and their convex day-number intervals
  // agree exactly (both step in whole years), so an overlapping pair is
  // genuinely satisfiable — both January-1sts of the shared years.
  it('accepts two year pickers with overlapping ranges', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2020', max: '2022' },
          { greaterThanOrEqualToVariable: 'b' },
        ),
        b: datePicker(
          'b',
          { type: 'year', min: '2021', max: '2023' },
          { greaterThanOrEqualToVariable: 'a' },
        ),
      }),
    ).toEqual([]);
  });

  // The general form of the reviewer's report: it is not specific to
  // coarse-vs-coarse. A wide-ranging year picker forced equal to a FULL
  // picker pinned to a day the year picker can never actually emit is the
  // same shape of false accept, and the same discrete-set reasoning closes
  // it — filtered here through the full picker's own (exact) interval rather
  // than a second coarse set.
  it('rejects a ranged year picker mutually >= a full picker pinned off every year-start day', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2020', max: '2021' },
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
  });

  // Cap boundary, exercised deliberately from both sides. A year window of
  // exactly 1,000 periods (1000-1999) still enumerates exactly — the month
  // picker below never touches January of any year, so this is a genuine,
  // detectable contradiction.
  it('still enumerates and rejects a coarse window sized exactly at the cap', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '1000', max: '1999' },
        { greaterThanOrEqualToVariable: 'b' },
      ),
      b: datePicker(
        'b',
        { type: 'month', min: '1500-02', max: '1500-03' },
        { greaterThanOrEqualToVariable: 'a' },
      ),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  // One period past the cap (1000-2000 is 1,001 years) falls back to the
  // plain convex-interval check for the whole group instead of enumerating —
  // the same genuinely-empty pair as the previous test, widened by one year,
  // is silently accepted rather than reported. This is the deliberate
  // DoS-avoidance trade-off: a false rejection is worse than a missed one,
  // and the runtime plus the feasibility analyser remain as backstops.
  it('falls back to interval-only reasoning once a coarse window exceeds the cap', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '1000', max: '2000' },
          { greaterThanOrEqualToVariable: 'b' },
        ),
        b: datePicker(
          'b',
          { type: 'month', min: '1500-02', max: '1500-03' },
          { greaterThanOrEqualToVariable: 'a' },
        ),
      }),
    ).toEqual([]);
  });

  // The fallback is scoped to the WHOLE GROUP, not just the unenumerable
  // member: b and c alone are the reviewer's own genuinely-empty pair (a year
  // picker vs. a month picker sharing no instant), but a's unbounded window
  // makes the group unenumerable, so nothing is reported — not even the
  // real conflict between b and c. A version that merely skipped the
  // unenumerable member while still reasoning about the rest would
  // (incorrectly, per this fix's design) go on to catch b-vs-c anyway; this
  // pins the coarser, whole-group fallback the task calls for.
  it('gives up on the whole group, not just the unenumerable member', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '1000', max: '3000' },
        { greaterThanOrEqualToVariable: 'b' },
      ),
      b: datePicker(
        'b',
        { type: 'year', min: '2020', max: '2021' },
        { greaterThanOrEqualToVariable: 'c' },
      ),
      c: datePicker(
        'c',
        { type: 'month', min: '2020-02', max: '2020-12' },
        { greaterThanOrEqualToVariable: 'a' },
      ),
    });
    expect(result).toEqual([]);
  });

  // Mixed-origin guard: an anchorless RelativeDatePicker's window is
  // symbolic day OFFSETS from the (unknown) interview date, on the
  // 'interviewDate' origin — never comparable to a DatePicker's calendar
  // 'fixed' origin. A coarse member's discrete set must not be filtered
  // against a different-origin member's interval; this pair stays exactly as
  // conservatively unjudged as it was before this change.
  it('leaves a coarse picker mutually >= an anchorless RelativeDatePicker unjudged (different origins)', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2020', max: '2020' },
          { greaterThanOrEqualToVariable: 'b' },
        ),
        b: {
          name: 'b',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: {},
          validation: {
            required: true,
            greaterThanOrEqualToVariable: 'a',
          },
        },
      }),
    ).toEqual([]);
  });

  // Type-uniformity guard, exercised on RAW (pre-schema) migration input: a
  // merged equality group is always uniformly typed in a schema-valid
  // protocol (every union edge requires `usableReference`'s same-type
  // check), but this analyser also runs before the schema has rejected
  // anything. A categorical pair stray `component`/`parameters` keys happen
  // to shape like a coarse DatePicker window is a real (if unusual) raw
  // shape, and reasoning over those keys would falsely reject a pair whose
  // actual equality only ever concerns their shared option value.
  it('does not read DatePicker-shaped parameters off a non-datetime type', () => {
    const staleDatePickerShaped = (
      name: string,
      month: string,
      validation: Record<string, unknown> = {},
    ) => ({
      name,
      type: 'categorical',
      options: [{ label: 'X', value: 'x' }],
      // Stray fields a prior schema revision or hand-edited fixture could
      // still carry; a categorical variable never reads these.
      component: 'DatePicker',
      parameters: { type: 'month', min: month, max: month },
      validation,
    });
    expect(
      findValidationContradictions({
        a: staleDatePickerShaped('a', '2020-02', { sameAs: 'b' }),
        b: staleDatePickerShaped('b', '2020-03'),
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

  // Twenty-sixth-wave Finding 1: "rendered by" is a stage-effective claim —
  // only a caller that has resolved each variable's actual rendering may let
  // an explicit `component: 'Boolean'` read its options, so the pinning
  // cases below run in that mode.
  it('still pins a singleton-options boolean rendered by the Boolean choice control', () => {
    const result = findValidationContradictions(
      {
        a: boolean('a', 'Boolean', trueOnly, { differentFrom: 'b' }),
        b: boolean('b', 'Boolean', trueOnly),
      },
      { stageEffectiveComponents: true },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
  });

  // The record-level (default-mode) counterpart: the same pair is ACCEPTED,
  // because the codebook alone cannot know that no composer field overrides
  // the rendering to Toggle — the false rejection the migration would have
  // converted into silently stripped rules (twenty-sixth-wave Finding 1).
  it('does not pin an explicit-Boolean singleton pair at the record level', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', 'Boolean', trueOnly, { differentFrom: 'b' }),
        b: boolean('b', 'Boolean', trueOnly),
      }),
    ).toEqual([]);
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
    const result = findValidationContradictions(
      {
        a: boolean('a', 'Boolean', trueOnly, { sameAs: 'b' }),
        b: boolean('b', 'Boolean', [{ label: 'No', value: false }]),
      },
      { stageEffectiveComponents: true },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('accepts the same disjoint-options sameAs group at the record level', () => {
    expect(
      findValidationContradictions({
        a: boolean('a', 'Boolean', trueOnly, { sameAs: 'b' }),
        b: boolean('b', 'Boolean', [{ label: 'No', value: false }]),
      }),
    ).toEqual([]);
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

  // Twenty-sixth-wave Finding 1, the reviewer's exact report: an EXPLICIT
  // `component: 'Boolean'` pair whose every occurrence overrides the
  // rendering to Toggle. ToggleField takes no `options` prop and is
  // unconditionally two-valued, so this is runtime-satisfiable — the old
  // codebook-layer rejection was a false positive the migration converted
  // into silently stripped rules, and it must now be accepted.
  it('accepts an explicit component: Boolean singleton pair rendered exclusively as Toggle by NetworkComposer fields', () => {
    const protocol = protocolWithBooleanPair('Boolean', [
      networkComposerStage('Toggle'),
    ]);

    const result = ProtocolSchemaV8.safeParse(protocol);

    expect(result.success).toBe(true);
  });

  // The detection has not vanished — it has moved to where the rendering is
  // actually known: composer fields keeping the Boolean choice control make
  // the same pair genuinely contradictory, reported by the stage-effective
  // overlay (which alone runs the analyser with `stageEffectiveComponents`)
  // and anchored at the field.
  it('still rejects the explicit pair when the NetworkComposer fields keep the Boolean choice control', () => {
    const protocol = protocolWithBooleanPair('Boolean', [
      networkComposerStage('Boolean'),
    ]);

    const result = ProtocolSchemaV8.safeParse(protocol);

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) =>
        candidate.message.includes('must differ but their rules pin both'),
      );
      expect(issue).toBeDefined();
      expect(issue?.path.slice(0, 2)).toEqual(['stages', 0]);
    }
  });

  // With no stage rendering the pair at all, the record level may no longer
  // reject it (it cannot rule out a Toggle-only rendering), and no
  // stage-effective check has a form to anchor at. NOTE the residual
  // accept-direction gap this documents: a pair rendered ONLY by shared
  // (`FormFieldSchema`) form fields — EgoForm, AlterForm, NameGenerator
  // forms, FamilyPedigree's nodeConfig.form — uses the codebook component
  // verbatim, but those surfaces have no stage-effective contradiction pass,
  // so a genuine Boolean-rendered contradiction there goes unreported. The
  // cardinal rule prefers that miss over the false rejection.
  it('accepts an explicit component: Boolean singleton pair with no composer stage at all', () => {
    const protocol = protocolWithBooleanPair('Boolean', undefined);

    const result = ProtocolSchemaV8.safeParse(protocol);

    expect(result.success).toBe(true);
  });

  // Twenty-sixth-wave Finding 1 also relocates `pinnedDifferentFromParity`
  // end-to-end coverage here: options-derived pins only exist in the
  // stage-effective mode, so the class can no longer fire from the record
  // schema (the record-conformance block above asserts that acceptance) and
  // must surface through the composer overlay instead.
  it('rejects a pinned-parity boolean chain through the stage-effective overlay', () => {
    const base = structuredClone(createBaseProtocol()) as BaseProtocol;
    const protocol = {
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
                ...booleanVariable('BoolA', 'Boolean'),
                validation: { differentFrom: 'boolB' },
              },
              boolB: {
                name: 'BoolB',
                type: 'boolean',
                component: 'Boolean',
                validation: { differentFrom: 'boolC' },
              },
              boolC: {
                name: 'BoolC',
                type: 'boolean',
                component: 'Boolean',
                options: [{ label: 'No', value: false }],
              },
            },
          },
        },
      },
      stages: [
        {
          id: 'nc1',
          label: 'Build the network',
          type: 'NetworkComposer',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          layoutVariable: 'layoutPosition',
          background: { concentricCircles: 4 },
          nodeForm: {
            fields: [
              { variable: 'boolA', component: 'Boolean', label: 'A?' },
              { variable: 'boolB', component: 'Boolean', label: 'B?' },
              { variable: 'boolC', component: 'Boolean', label: 'C?' },
            ],
          },
        },
      ],
    };

    const result = ProtocolSchemaV8.safeParse(protocol);

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) =>
        candidate.message.includes('pinned values and differentFrom rules'),
      );
      expect(issue).toBeDefined();
      expect(issue?.path.slice(0, 2)).toEqual(['stages', 0]);
    }
  });
});

describe('findValidationContradictions — Twenty-second-wave Finding 1: propagated bounds inform pinned-equality', () => {
  const number = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'number',
    validation,
  });

  // The reviewer's own report: neither `a` nor `d` is pinned by its OWN
  // rules alone (`a` only carries a `maxValue`; `d`'s own window is [0, 1]),
  // but `d <= a` forces both to exactly 0 once the bounds are combined —
  // detectable only once the chain-propagation pass's tightened bounds feed
  // the pinned-equality check.
  it('rejects a differentFrom pair pinned equal only once propagated bounds combine', () => {
    const result = findValidationContradictions({
      a: number('a', { maxValue: 0, differentFrom: 'd' }),
      d: number('d', {
        minValue: 0,
        maxValue: 1,
        lessThanOrEqualToVariable: 'a',
      }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'd']);
  });

  // The false-positive guard: genuine headroom on `a` means the propagated
  // windows never collapse to a single point, so nothing is pinned.
  it('accepts the same shape with genuine headroom so the propagated windows do not collapse', () => {
    expect(
      findValidationContradictions({
        a: number('a', { maxValue: 2, differentFrom: 'd' }),
        d: number('d', {
          minValue: 0,
          maxValue: 1,
          lessThanOrEqualToVariable: 'a',
        }),
      }),
    ).toEqual([]);
  });

  // The second false-positive guard: a strict hop over `number` never
  // tightens its raw VALUE, only its openness — `number` values are not
  // known to be whole-numbered (the interview runtime coerces a number field
  // with a bare `Number()`), unlike datetime day-numbers. An integer-epsilon
  // reading would (wrongly) bump `b`'s pinned 4 up to a closed 5 and read
  // `a` as pinned there too; `a`'s real domain given `a > b` and `a <= 5` is
  // the open range (4, 5], which is not a single value, so this must stay
  // accepted.
  it('accepts a fractional-domain chain an integer-epsilon reading would wrongly pin', () => {
    expect(
      findValidationContradictions({
        a: number('a', {
          maxValue: 5,
          greaterThanVariable: 'b',
          differentFrom: 'd',
        }),
        b: number('b', { minValue: 4, maxValue: 4 }),
        d: number('d', { minValue: 5, maxValue: 5 }),
      }),
    ).toEqual([]);
  });

  // Scope guard, exercised on RAW (pre-schema) migration input: comparator
  // rules only ever apply to number/datetime/scalar at the schema level
  // (`requireType`), but this analyser also runs before the schema has
  // rejected anything, so a stray comparator on a text pair still reaches
  // the chain-propagation pass. Propagating LENGTH collapses `a` and `d`'s
  // windows to the same length (3) exactly like the numeric case above, but
  // a shared length does not mean a shared STRING — "abc" and "xyz" both
  // satisfy this and genuinely differ — so text (and, by the same
  // token, categorical's selection-count window) must never feed the
  // pinned-equality check.
  it('does not pin text variables by a propagated LENGTH window', () => {
    expect(
      findValidationContradictions({
        a: {
          name: 'a',
          type: 'text',
          validation: { maxLength: 3, differentFrom: 'd' },
        },
        d: {
          name: 'd',
          type: 'text',
          validation: {
            minLength: 3,
            maxLength: 5,
            lessThanOrEqualToVariable: 'a',
          },
        },
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — Twenty-second-wave Finding 2: chain propagation respects coarse emissions', () => {
  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation: { required: true, ...validation },
  });

  // The reviewer's own report: `b` (a year picker) can only ever emit
  // January 1st of some year, so `c <= b` really forces `b` into
  // {2021, 2022} — but propagating the convex day-number bound alone carries
  // March 2020 through `b` as though it were selectable, leaving `a > b`
  // looking satisfiable when no year actually makes it so.
  it('rejects a chain through a year picker whose coarse emissions cannot satisfy both ends', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2020', max: '2021' },
        { greaterThanVariable: 'b' },
      ),
      b: datePicker('b', { type: 'year', min: '2020', max: '2022' }),
      c: datePicker(
        'c',
        { min: '2020-03-01', max: '2020-03-01' },
        { lessThanOrEqualToVariable: 'b' },
      ),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  // The false-positive guard, and the one that matters most: widening `a`
  // and `b`'s own ranges leaves a genuine solution (`b` = 2021, `a` = 2022),
  // so rounding to actual emissions must not invent a rejection.
  it('accepts the same shape once the coarse emissions actually admit a solution', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2020', max: '2022' },
          { greaterThanVariable: 'b' },
        ),
        b: datePicker('b', { type: 'year', min: '2020', max: '2022' }),
        c: datePicker(
          'c',
          { min: '2020-03-01', max: '2020-03-01' },
          { lessThanOrEqualToVariable: 'b' },
        ),
      }),
    ).toEqual([]);
  });

  // A tighter variant of the same guard: `c` is pinned exactly ON one of
  // `b`'s own achievable instants (2020-01-01), so rounding must treat that
  // boundary as INCLUSIVE (`c <= b` is satisfied by `b = 2020` itself, not
  // only by the next later year) and let `a = 2021, b = 2020` through. A
  // rounding bug that always excludes the boundary instant (an off-by-one
  // that treats every candidate as open) would push `b` to 2021 and, from
  // there, find no year for `a`, wrongly rejecting a satisfiable protocol.
  it('accepts a solution that sits exactly on a coarse boundary instant', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2020', max: '2021' },
          { greaterThanVariable: 'b' },
        ),
        b: datePicker('b', { type: 'year', min: '2020', max: '2021' }),
        c: datePicker(
          'c',
          { min: '2020-01-01', max: '2020-01-01' },
          { lessThanOrEqualToVariable: 'b' },
        ),
      }),
    ).toEqual([]);
  });

  // A chain running entirely through full-resolution pickers is unaffected —
  // rounding only ever engages when a propagated bound's TARGET is coarse.
  it('leaves a chain through a full-resolution picker unchanged', () => {
    const result = findValidationContradictions({
      a: datePicker('a', { max: '2020-01-02' }, { greaterThanVariable: 'b' }),
      b: datePicker('b', {}, { greaterThanVariable: 'c' }),
      c: datePicker('c', { min: '2020-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  // Beyond the enumeration cap, rounding falls back to the pre-existing
  // convex propagation rather than reporting — the same DoS-avoidance
  // trade-off `discreteInstantsEmpty` already makes for equality groups.
  it('falls back to convex propagation once a coarse window exceeds the enumeration cap', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2020', max: '2021' },
          { greaterThanVariable: 'b' },
        ),
        b: datePicker('b', { type: 'year', min: '1000', max: '3000' }),
        c: datePicker(
          'c',
          { min: '2020-03-01', max: '2020-03-01' },
          { lessThanOrEqualToVariable: 'b' },
        ),
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — Twenty-third-wave Finding 6: relative date windows clamp at the native date floor', () => {
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

  // The reviewer's own report: a low anchor with a large enough `before`
  // derives a BCE `min` the native date control can never emit — the
  // runtime's own `addDays` renders it as the unpadded, invalid HTML date
  // '-174-03-19', so the control's true floor is 0001-01-01. Before this
  // fix, the analyser reasoned over the raw BCE day number instead, and
  // accepted `a < b` as satisfiable even though `b` is pinned to the
  // runtime's own floor, which nothing can ever be earlier than.
  it('rejects a lessThanVariable a low anchor with a large `before` can never satisfy against a floor-pinned partner', () => {
    const result = findValidationContradictions({
      a: relativePicker(
        'a',
        { anchor: '0100-01-01', before: 100000, after: 0 },
        { lessThanVariable: 'b' },
      ),
      b: datePicker('b', { min: '0001-01-01', max: '0001-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'lessThanVariable' },
    ]);
  });

  // The false-positive guard, and the one that matters most: an ordinary,
  // small `before` never reaches the floor at all — the clamp must leave a
  // window that never needed it exactly as it was.
  it('accepts the same shape once `before` is small enough that the window never reaches the floor', () => {
    expect(
      findValidationContradictions({
        a: relativePicker(
          'a',
          { anchor: '0100-01-01', before: 100, after: 0 },
          { lessThanVariable: 'b' },
        ),
        b: datePicker('b', { min: '0100-06-01', max: '0100-06-01' }),
      }),
    ).toEqual([]);
  });

  // A window genuinely clamped at the floor is still a REAL, satisfiable
  // window: room remains between the floor and a partner pinned later than
  // it, so the comparison stays satisfiable rather than being uniformly
  // rejected just because clamping occurred at all.
  it('accepts a window clamped at the floor when it still overlaps a later-pinned partner', () => {
    expect(
      findValidationContradictions({
        a: relativePicker(
          'a',
          { anchor: '0100-01-01', before: 100000, after: 0 },
          { lessThanVariable: 'b' },
        ),
        b: datePicker('b', { min: '0050-01-01', max: '0050-01-01' }),
      }),
    ).toEqual([]);
  });

  // No matching ceiling: a high anchor with a huge `after` derives a `max`
  // many centuries out, but that stays a syntactically valid date string
  // (an extra digit, never a sign) the control can still honour — nothing
  // narrows it, so a partner pinned exactly on that derived edge still
  // overlaps.
  it('leaves a high anchor with a large `after` unclamped, still satisfiable against its own derived edge', () => {
    expect(
      findValidationContradictions({
        a: relativePicker(
          'a',
          { anchor: '9500-01-01', before: 0, after: 100 },
          { sameAs: 'b' },
        ),
        b: datePicker('b', { min: '9500-04-11', max: '9500-04-11' }),
      }),
    ).toEqual([]);
  });

  // The interview-date origin must not be affected by a calendar floor: an
  // anchorless picker's offsets are symbolic days from an unknown interview
  // date, not calendar day numbers, so even a `before` far larger than the
  // floor's own magnitude leaves two anchorless windows overlapping exactly
  // as they did before this fix (both always contain offset 0 — see the
  // fourteenth-wave Finding 1 block above).
  it('leaves an anchorless RelativeDatePicker unaffected by the calendar floor, however large `before` is', () => {
    expect(
      findValidationContradictions({
        a: relativePicker('a', { before: 900000, after: 0 }, { sameAs: 'b' }),
        b: relativePicker('b'),
      }),
    ).toEqual([]);
  });

  // The fixed-anchor DatePicker path shares the exposure: `min: '0000-01-01'`
  // fails `datePickerParametersSchema` (eleventh-wave Finding 1) and so can
  // never reach the analyser as SCHEMA-VALID input, but the analyser also
  // runs over raw, pre-schema migration input the schema hasn't gated yet —
  // exactly this file's own defensive-reads convention (see the top-of-file
  // comment). A raw `min` that low needs the same floor.
  it('rejects a raw pre-schema DatePicker min below the floor against a floor-pinned partner', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { min: '0000-01-01', max: '0100-01-01' },
        { lessThanVariable: 'b' },
      ),
      b: datePicker('b', { min: '0001-01-01', max: '0001-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });
});

describe('findValidationContradictions — Twenty-fourth-wave Finding 1: sameAs groups propagate pinned values into differentFrom', () => {
  const number = (name: string, validation: Record<string, unknown> = {}) => ({
    name,
    type: 'number',
    validation,
  });

  const monthPicker = (
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

  // The reviewer's own report: `c` carries no bounds of its own, but
  // `a.sameAs = c` forces `c` to store `a`'s only value (stored-value
  // equality, fresco-ui's `isMatchingValue`), and `d`'s own window admits
  // exactly that same value — so `c.differentFrom = d` can never be
  // satisfied. `pinnedValue` reads one variable's OWN rules only, so the pin
  // has to travel the sameAs edge to be seen at all.
  it('rejects a differentFrom whose owner inherits its pin through a sameAs group', () => {
    const result = findValidationContradictions({
      a: number('a', { required: true, minValue: 0, maxValue: 0, sameAs: 'c' }),
      c: number('c', { differentFrom: 'd' }),
      d: number('d', { minValue: 0, maxValue: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.variableIds.toSorted()).toEqual(['c', 'd']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'c', rule: 'differentFrom' },
    ]);
  });

  // The mirror: the inherited pin sits on the TARGET's group instead.
  it('rejects when the differentFrom TARGET inherits its pin through a sameAs group', () => {
    const result = findValidationContradictions({
      a: number('a', { minValue: 3, maxValue: 3, differentFrom: 'd' }),
      d: number('d', { sameAs: 'e' }),
      e: number('e', { minValue: 3, maxValue: 3 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'd']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'differentFrom' },
    ]);
  });

  // The false-positive guard that matters most: the counterpart's own window
  // still admits a second value, so nothing is pinned-equal.
  it('accepts when the counterpart can still hold a second value', () => {
    expect(
      findValidationContradictions({
        a: number('a', { minValue: 0, maxValue: 0, sameAs: 'c' }),
        c: number('c', { differentFrom: 'd' }),
        d: number('d', { minValue: 0, maxValue: 1 }),
      }),
    ).toEqual([]);
  });

  // A group whose pinned members disagree is the existing group-conflict
  // machinery's to report (its repair strips the sameAs edges), so no pin may
  // be inherited from it — whichever candidate were chosen, stripping the
  // differentFrom would not restore satisfiability, only lose a rule the
  // group repair rescues.
  it('does not emit this class from a group whose pinned members disagree', () => {
    const result = findValidationContradictions({
      a: number('a', { minValue: 0, maxValue: 0, sameAs: 'c' }),
      b: number('b', { minValue: 1, maxValue: 1, sameAs: 'c' }),
      c: number('c', { differentFrom: 'd' }),
      d: number('d', { minValue: 0, maxValue: 0 }),
    });
    expect(result.map((item) => item.class)).not.toContain(
      'pinnedEqualDifferentFrom',
    );
    expect(result.map((item) => item.class)).toContain('disjointBounds');
  });

  // A pin travels sameAs edges ONLY — never a non-strict comparator cycle.
  // `sameAs` forces stored-value equality, while a comparator SCC forces only
  // `compareVariables` equality (for datetime, two stored-distinct strings
  // can compare equal through `new Date(...)`), and `differentFrom` compares
  // stored values — so this check stays scoped to what it can prove.
  it('does not carry a pin across a comparator-forced equality', () => {
    expect(
      findValidationContradictions({
        a: number('a', {
          minValue: 0,
          maxValue: 0,
          greaterThanOrEqualToVariable: 'c',
        }),
        c: number('c', {
          greaterThanOrEqualToVariable: 'a',
          differentFrom: 'd',
        }),
        d: number('d', { minValue: 0, maxValue: 0 }),
      }),
    ).toEqual([]);
  });

  // Categorical pins propagate as their full JSON-framed composite set key,
  // never re-derived at the inheriting member: `c` is forced to store `a`'s
  // only possible selection {x}, which is also `d`'s only possible selection.
  it('propagates a categorical pinned set with its full composite key', () => {
    const result = findValidationContradictions({
      a: {
        name: 'a',
        type: 'categorical',
        options: [{ label: 'X', value: 'x' }],
        validation: { sameAs: 'c' },
      },
      c: {
        name: 'c',
        type: 'categorical',
        options: [
          { label: 'X', value: 'x' },
          { label: 'Y', value: 'y' },
        ],
        validation: { differentFrom: 'd' },
      },
      d: {
        name: 'd',
        type: 'categorical',
        options: [{ label: 'X', value: 'x' }],
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.strips).toEqual([
      { variableId: 'c', rule: 'differentFrom' },
    ]);
  });

  // A coarse datetime pin propagates at its stored-string key
  // (`datetime:month:2020-05`), so it still matches a partner pinned to the
  // same stored string at the same resolution.
  it('propagates a coarse datetime pin at its stored-string key', () => {
    const result = findValidationContradictions({
      a: monthPicker(
        'a',
        { type: 'month', min: '2020-05', max: '2020-05' },
        { sameAs: 'c' },
      ),
      c: monthPicker('c', { type: 'month' }, { differentFrom: 'd' }),
      d: monthPicker('d', { type: 'month', min: '2020-05', max: '2020-05' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('pinnedEqualDifferentFrom');
    expect(result[0]?.strips).toEqual([
      { variableId: 'c', rule: 'differentFrom' },
    ]);
  });

  // Datetime pin keys stay origin-tagged through inheritance: `a` pins the
  // CALENDAR day 1970-01-01 (fixed-origin day number 0), while `d` pins the
  // symbolic interview-date offset 0 — numerically identical, semantically
  // unrelated, so the pair must stay accepted.
  it('keeps origin-tagged datetime pin keys distinct when propagated', () => {
    expect(
      findValidationContradictions({
        a: {
          name: 'a',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '1970-01-01', before: 0, after: 0 },
          validation: { sameAs: 'c' },
        },
        c: {
          name: 'c',
          type: 'datetime',
          component: 'DatePicker',
          parameters: {},
          validation: { differentFrom: 'd' },
        },
        d: {
          name: 'd',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { before: 0, after: 0 },
        },
      }),
    ).toEqual([]);
  });

  // A mixed-resolution sameAs component is the mixed-resolution check's to
  // report (its repair strips the cross-resolution sameAs edge, freeing `c`),
  // so the coarse pin must not be inherited into the full-resolution member —
  // without the guard, `c` would inherit `datetime:month:2020-05` and falsely
  // match `d`'s own coarse pin.
  it('does not carry a coarse pin into a member at a different resolution', () => {
    const result = findValidationContradictions({
      a: monthPicker(
        'a',
        { type: 'month', min: '2020-05', max: '2020-05' },
        { sameAs: 'c' },
      ),
      c: {
        name: 'c',
        type: 'datetime',
        component: 'DatePicker',
        parameters: {},
        validation: { differentFrom: 'd' },
      },
      d: monthPicker('d', { type: 'month', min: '2020-05', max: '2020-05' }),
    });
    expect(result.map((item) => item.class)).not.toContain(
      'pinnedEqualDifferentFrom',
    );
    expect(result.map((item) => item.class)).toContain('disjointBounds');
  });
});

describe('findValidationContradictions — Twenty-fourth-wave Finding 2: an absent RelativeDatePicker parameters record models the runtime default window', () => {
  // Deliberately NOT defaulting `parameters` in this helper: the block's
  // subject is the difference between an absent record and a present one.
  const relativePicker = (
    name: string,
    parameters: Record<string, unknown> | undefined,
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'RelativeDatePicker',
    ...(parameters !== undefined ? { parameters } : {}),
    validation,
  });

  // The reviewer's own report: `a` legally omits `parameters`
  // (`dateTimeRelativeDatePickerSchema` marks the record optional), but the
  // control it renders is identical to an empty record's — fresco-ui's
  // RelativeDatePickerField destructures `before = 180, after = 0` and
  // resolves a missing anchor to the interview date — so `a`'s window caps at
  // the interview date, `b` is pinned to it, and `a` can never exceed `b`.
  // Before this fix the early return treated absent parameters as unbounded
  // and accepted the pair.
  it('rejects greaterThanVariable between an absent-parameters picker and a partner pinned to the interview date', () => {
    const result = findValidationContradictions({
      a: relativePicker('a', undefined, {
        required: true,
        greaterThanVariable: 'b',
      }),
      b: relativePicker('b', { before: 0, after: 0 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'greaterThanVariable' },
    ]);
  });

  // The false-positive guard that matters most: the partner window has
  // genuine headroom below the interview date, so `a` can exceed it.
  it('accepts the same shape once the partner window has headroom below the interview date', () => {
    expect(
      findValidationContradictions({
        a: relativePicker('a', undefined, { greaterThanVariable: 'b' }),
        b: relativePicker('b', { before: 5, after: 0 }),
      }),
    ).toEqual([]);
  });

  // The default window's UPPER edge sits exactly at the interview date
  // (after = 0): a NON-strict comparator against a partner pinned there is
  // satisfiable at that shared instant, so it must stay accepted — together
  // with the strict rejection above this brackets the modelled `after`
  // default at exactly 0.
  it('accepts a non-strict comparator sitting exactly on the default upper edge', () => {
    expect(
      findValidationContradictions({
        a: relativePicker('a', undefined, {
          greaterThanOrEqualToVariable: 'b',
        }),
        b: relativePicker('b', { before: 0, after: 0 }),
      }),
    ).toEqual([]);
  });

  // A COMPONENTLESS datetime with absent parameters identifies no control at
  // all (component inference needs a parameter shape), so it stays unjudged.
  it('leaves a componentless datetime with no parameters unjudged', () => {
    expect(
      findValidationContradictions({
        a: {
          name: 'a',
          type: 'datetime',
          validation: { greaterThanVariable: 'b' },
        },
        b: relativePicker('b', { before: 0, after: 0 }),
      }),
    ).toEqual([]);
  });

  // The default window's LOWER edge sits exactly 180 days before the
  // interview date (fresco-ui RelativeDatePickerField: `before = 180`). The
  // partner pins single-day offset windows via a raw negative `after` — the
  // schema rejects a negative offset, but the analyser also runs over raw
  // pre-schema migration input (this file's own defensive-reads convention),
  // and it is the only way to place an anchorless single-day window anywhere
  // but offset 0. A partner pinned AT -180 is reachable (satisfiable exactly
  // on the edge); one day earlier is not.
  it('models the default lower edge at exactly 180 days before the interview date', () => {
    expect(
      findValidationContradictions({
        a: relativePicker('a', undefined, {
          lessThanOrEqualToVariable: 'b',
        }),
        b: relativePicker('b', { before: 180, after: -180 }),
      }),
    ).toEqual([]);

    const result = findValidationContradictions({
      a: relativePicker('a', undefined, {
        lessThanOrEqualToVariable: 'b',
      }),
      b: relativePicker('b', { before: 181, after: -181 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'lessThanOrEqualToVariable' },
    ]);
  });
});

describe('findValidationContradictions — Twenty-fifth wave: one-sided out-of-window coarse windows model the runtime-synthesized far bound', () => {
  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation: { required: true, ...validation },
  });

  // The reviewer's own report: a year picker with only `max: '1800'` is not
  // half-open at runtime — fresco-ui's DatePicker synthesizes the missing
  // lower bound a full default-window span below the authored max (roughly
  // 1694 on a 2026 interview date; 1600 at the model's 2120 horizon), and the
  // year dropdown offers nothing below it. No offered year is ever strictly
  // less than a partner pinned to 1600-01-01.
  it('rejects lessThanVariable from a year picker with only an out-of-window max against a partner pinned below the synthesized window', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', max: '1800' },
        { lessThanVariable: 'b' },
      ),
      b: datePicker('b', { min: '1600-01-01', max: '1600-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'lessThanVariable' },
    ]);
  });

  // The mirror direction: a far-future one-sided `min` gets a synthesized
  // ceiling (min.year + span, through December), so a strict comparator
  // demanding a value above that ceiling can never be satisfied.
  it('rejects greaterThanVariable from a year picker with only a far-future min against a partner pinned above the synthesized ceiling', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '3000' },
        { greaterThanVariable: 'b' },
      ),
      b: datePicker('b', { min: '3500-01-01', max: '3500-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'greaterThanVariable' },
    ]);
  });

  // The false-positive guard that matters most: the synthesized window still
  // reaches below the partner (1600 < 1750 in the model; 1694 < 1750 even on
  // a present-day interview), so the comparison is genuinely satisfiable.
  it('accepts a one-sided out-of-window max whose synthesized window still reaches below the partner', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', max: '1800' },
          { lessThanVariable: 'b' },
        ),
        b: datePicker('b', { min: '1750-01-01', max: '1750-01-01' }),
      }),
    ).toEqual([]);
  });

  // A one-sided IN-window coarse bound keeps its half-open reading: the
  // runtime falls back to the default window's own 1920-01-01 edge there, but
  // this file has never modelled the coarse default window (a neither-bound
  // picker contributes no interval at all), and an unbounded side is a strict
  // superset of the default edge — it can only accept, never falsely reject.
  // This pairing is therefore a DELIBERATE accept-direction gap (the runtime
  // offers no year below 1920), asserted here so any future change to it is a
  // conscious one.
  it('still accepts a one-sided in-window coarse bound against a partner below the default window', () => {
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', max: '2000' },
          { lessThanVariable: 'b' },
        ),
        b: datePicker('b', { min: '1900-01-01', max: '1900-01-01' }),
      }),
    ).toEqual([]);
  });

  // A coarse picker with NEITHER bound authored stays unmodelled (no interval
  // at all), exactly as before — the runtime's plain default window has never
  // been modelled for a DatePicker, and this change must not disturb that.
  it('still accepts a coarse picker with no authored bounds at all', () => {
    expect(
      findValidationContradictions({
        a: datePicker('a', { type: 'year' }, { lessThanVariable: 'b' }),
        b: datePicker('b', { min: '1800-01-01', max: '1800-01-01' }),
      }),
    ).toEqual([]);
  });

  // FULL resolution stays unmodelled on the missing side even out-of-window:
  // the runtime's derivation does emit synthesized native `min`/`max`
  // attributes there too, but a native date input enforces them over a TYPED
  // value rather than through a closed option list, so modelling them as hard
  // domain edges could falsely reject an entry the control still accepts.
  it('leaves a full-resolution one-sided out-of-window bound unmodelled', () => {
    expect(
      findValidationContradictions({
        a: datePicker('a', { max: '1800-06-15' }, { lessThanVariable: 'b' }),
        b: datePicker('b', { min: '1600-01-01', max: '1600-01-01' }),
      }),
    ).toEqual([]);
  });

  // Month resolution synthesizes too, and its ceiling runs through DECEMBER
  // of the extended year (the runtime's `month: 12, day: 31` far edge, read
  // at its stored instant): 3000-05 + the 200-year horizon span ends at the
  // period '3200-12', stored instant 3200-12-01. A partner pinned there is
  // unreachable under a strict comparator; one pinned a day earlier is not.
  it('rejects a month picker with only a far-future min against a partner pinned at its synthesized December ceiling', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'month', min: '3000-05' },
        { greaterThanVariable: 'b' },
      ),
      b: datePicker('b', { min: '3200-12-01', max: '3200-12-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'greaterThanVariable' },
    ]);

    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'month', min: '3000-05' },
          { greaterThanVariable: 'b' },
        ),
        b: datePicker('b', { min: '3200-11-30', max: '3200-11-30' }),
      }),
    ).toEqual([]);
  });

  // The out-of-window gate on the max side is date-independent and mirrored
  // exactly: the runtime synthesizes only when the authored max is strictly
  // earlier than 1920-01-01, so '1919' synthesizes (lower edge 1719 at the
  // horizon span) and '1920' does not.
  it('brackets the lower-edge synthesis gate at exactly the default window minimum', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', max: '1919' },
        { lessThanVariable: 'b' },
      ),
      b: datePicker('b', { min: '1719-01-01', max: '1719-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');

    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', max: '1920' },
          { lessThanVariable: 'b' },
        ),
        b: datePicker('b', { min: '1719-01-01', max: '1719-01-01' }),
      }),
    ).toEqual([]);
  });

  // The min side's gate is date-DEPENDENT at runtime (`authoredMin > today`),
  // so the model synthesizes only when the condition holds on every
  // in-horizon interview date: a min in 2121 is later than any plausible
  // "today" and synthesizes, while a min at the 2120 horizon itself could
  // still flip to the runtime's default today-edge branch on a late-enough
  // interview date, so it stays half-open — an accept-direction gap forced by
  // the today-dependence, not an oversight.
  it('brackets the upper-edge synthesis gate at the plausibility horizon', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', min: '2121' },
        { greaterThanVariable: 'b' },
      ),
      b: datePicker('b', { min: '2500-01-01', max: '2500-01-01' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');

    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '2120' },
          { greaterThanVariable: 'b' },
        ),
        b: datePicker('b', { min: '2500-01-01', max: '2500-01-01' }),
      }),
    ).toEqual([]);
  });

  // The synthesized side flows into the discrete emission-set machinery too:
  // with only `max: '1800'` the year picker's window used to be unenumerable
  // (an open bound), silently skipping the exact-instant check for its whole
  // group. Closed at the synthesized 1600 lower edge it enumerates to the
  // 1600-1800 January instants, which overlap the month picker's convex
  // interval while sharing no instant with its February-November emissions.
  it('rejects a comparator-forced equality whose synthesized year window shares no instant with a month picker', () => {
    const result = findValidationContradictions({
      a: datePicker(
        'a',
        { type: 'year', max: '1800' },
        { greaterThanOrEqualToVariable: 'b' },
      ),
      b: datePicker(
        'b',
        { type: 'month', min: '1700-02', max: '1700-11' },
        { greaterThanOrEqualToVariable: 'a' },
      ),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
    expect(result[0]?.message).toContain(
      'the exact dates their pickers can ever emit share no instant',
    );
    expect(
      result[0]?.strips.toSorted((a, b) =>
        a.variableId.localeCompare(b.variableId),
      ),
    ).toEqual([
      { variableId: 'a', rule: 'greaterThanOrEqualToVariable' },
      { variableId: 'b', rule: 'greaterThanOrEqualToVariable' },
    ]);

    // Widening the month window to include a January restores a genuinely
    // shared instant (1700-01-01) inside the synthesized year window.
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', max: '1800' },
          { greaterThanOrEqualToVariable: 'b' },
        ),
        b: datePicker(
          'b',
          { type: 'month', min: '1700-01', max: '1700-06' },
          { greaterThanOrEqualToVariable: 'a' },
        ),
      }),
    ).toEqual([]);
  });
});

describe('findValidationContradictions — Twenty-fifth wave: derivation fidelity against fresco-ui DatePicker.tsx', () => {
  const datePicker = (
    name: string,
    parameters: Record<string, unknown> = {},
    validation: Record<string, unknown> = {},
  ) => ({
    name,
    type: 'datetime',
    component: 'DatePicker',
    parameters,
    validation: { required: true, ...validation },
  });

  // A line-for-line mirror of the combined min/max derivation in fresco-ui's
  // DatePicker.tsx (`parseYmd`, `compareYmd`, `DEFAULT_MIN`, and the
  // `defaultWindowSpanYears = today.year - DEFAULT_MIN.year` synthesis inside
  // its `minYmd`/`maxYmd` useMemo). The analyser models the runtime's
  // "today" at its conservative 2120 horizon, so running THIS mirror with
  // today pinned there must land on exactly the bounds the analyser uses —
  // the probes below bracket the analyser's modelled edges to the day. If
  // fresco-ui's arithmetic ever changes shape (span, rounding, branch
  // conditions), this mirror and `synthesizedCoarseFarBound` must change
  // together.
  type MirrorYmd = { year: number; month: number; day: number };

  const mirrorParseYmd = (value: string): MirrorYmd | null => {
    const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
    if (!match?.[1]) return null;
    const year = Number(match[1]);
    const month = match[2] ? Number(match[2]) : 1;
    const day = match[3] ? Number(match[3]) : 1;
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    return { year, month, day };
  };

  const mirrorCompareYmd = (a: MirrorYmd, b: MirrorYmd): number => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  };

  const MIRROR_DEFAULT_MIN: MirrorYmd = { year: 1920, month: 1, day: 1 };

  const mirrorRuntimeWindow = (
    bounds: { min?: string; max?: string },
    today: MirrorYmd,
  ): { min: MirrorYmd; max: MirrorYmd } => {
    const authoredMin = bounds.min ? mirrorParseYmd(bounds.min) : null;
    const authoredMax = bounds.max ? mirrorParseYmd(bounds.max) : null;
    const defaultWindowSpanYears = today.year - MIRROR_DEFAULT_MIN.year;
    const resolvedMin =
      authoredMin ??
      (authoredMax && mirrorCompareYmd(authoredMax, MIRROR_DEFAULT_MIN) < 0
        ? { year: authoredMax.year - defaultWindowSpanYears, month: 1, day: 1 }
        : MIRROR_DEFAULT_MIN);
    const resolvedMax =
      authoredMax ??
      (authoredMin && mirrorCompareYmd(authoredMin, today) > 0
        ? {
            year: authoredMin.year + defaultWindowSpanYears,
            month: 12,
            day: 31,
          }
        : today);
    return { min: resolvedMin, max: resolvedMax };
  };

  const mirrorFormatYmd = ({ year, month, day }: MirrorYmd): string =>
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // The latest in-horizon interview date. No wall clock: the fixture is a
  // constant, and the analyser's own model is date-independent by design.
  const HORIZON_TODAY: MirrorYmd = { year: 2120, month: 12, day: 31 };

  it('synthesizes exactly the runtime lower bound at the horizon span', () => {
    const window = mirrorRuntimeWindow({ max: '1800' }, HORIZON_TODAY);
    expect(window.min).toEqual({ year: 1600, month: 1, day: 1 });

    // Bracket the analyser's modelled lower edge at exactly that day: a
    // strict lessThanVariable against a partner pinned ON it is infeasible
    // (no offered instant lies strictly below the window's own floor) ...
    const pinnedAtSynthesizedMin = mirrorFormatYmd(window.min);
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', max: '1800' },
          { lessThanVariable: 'b' },
        ),
        b: datePicker('b', {
          min: pinnedAtSynthesizedMin,
          max: pinnedAtSynthesizedMin,
        }),
      }),
    ).toHaveLength(1);

    // ... while one day above it is satisfiable: the synthesized floor's own
    // stored instant lies strictly below the partner.
    const pinnedJustAbove = mirrorFormatYmd({ ...window.min, day: 2 });
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', max: '1800' },
          { lessThanVariable: 'b' },
        ),
        b: datePicker('b', { min: pinnedJustAbove, max: pinnedJustAbove }),
      }),
    ).toEqual([]);
  });

  it('synthesizes exactly the runtime upper bound at the horizon span', () => {
    const window = mirrorRuntimeWindow({ min: '3000' }, HORIZON_TODAY);
    expect(window.max).toEqual({ year: 3200, month: 12, day: 31 });

    // A YEAR picker's latest STORED instant inside that window is 1 January
    // of the ceiling year (twentieth-wave Finding 1's stored-instant
    // reading of the displayed range): a strict greaterThanVariable against
    // a partner pinned there is infeasible ...
    const ceilingStoredInstant = mirrorFormatYmd({
      year: window.max.year,
      month: 1,
      day: 1,
    });
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '3000' },
          { greaterThanVariable: 'b' },
        ),
        b: datePicker('b', {
          min: ceilingStoredInstant,
          max: ceilingStoredInstant,
        }),
      }),
    ).toHaveLength(1);

    // ... while a partner one day below it is exceeded by that very instant.
    const pinnedJustBelow = mirrorFormatYmd({
      year: window.max.year - 1,
      month: 12,
      day: 31,
    });
    expect(
      findValidationContradictions({
        a: datePicker(
          'a',
          { type: 'year', min: '3000' },
          { greaterThanVariable: 'b' },
        ),
        b: datePicker('b', { min: pinnedJustBelow, max: pinnedJustBelow }),
      }),
    ).toEqual([]);
  });
});
