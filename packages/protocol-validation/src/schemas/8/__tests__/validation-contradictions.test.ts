import { describe, expect, it } from 'vitest';

import { findValidationContradictions } from '../variables/validation-contradictions.ts';

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
