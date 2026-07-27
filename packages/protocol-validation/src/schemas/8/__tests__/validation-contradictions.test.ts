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

    // Same year at year resolution: expands to Jan 1 vs Dec 31, so a strict
    // comparison is conservatively considered satisfiable.
    const overlapping = findValidationContradictions({
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
    expect(result[0]?.message).toBe(
      'Variables "a", "b", "c": their differentFrom rules cannot all be satisfied with only two possible values',
    );
    expect(result[0]?.variableIds.toSorted()).toEqual(['a', 'b', 'c']);
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
});
