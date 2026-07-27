import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { resolveGenerationConfig } from '../../config';
import { SyntheticDataConstraintError } from '../error';
import { analyseFeasibility } from '../feasibility';

const config = resolveGenerationConfig({ today: '2026-07-27' });

const nameGenerator = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { maxNodes: 8 },
} as unknown as Stage;

function codebookWith(variables: Record<string, unknown>): StructuralCodebook {
  return {
    node: {
      person: {
        color: 'node-color-seq-1',
        variables,
      },
    },
  } as unknown as StructuralCodebook;
}

describe('analyseFeasibility', () => {
  it('reports nothing for a satisfiable codebook', () => {
    const codebook = codebookWith({
      name: { name: 'Name', type: 'text', validation: { required: true } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('reports minLength above maxLength', () => {
    const codebook = codebookWith({
      name: {
        name: 'Name',
        type: 'text',
        validation: { minLength: 24, maxLength: 10 },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['Name']);
    expect(conflicts[0]?.rules.toSorted()).toEqual(['maxLength', 'minLength']);
  });

  it('reports minValue above maxValue', () => {
    const codebook = codebookWith({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 50, maxValue: 20 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(
      1,
    );
  });

  it('reports a required variable whose ceiling permits only an empty selection', () => {
    const codebook = codebookWith({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        validation: { required: true, maxSelected: 0 },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['required', 'maxSelected']);
  });

  it('leaves a zero ceiling alone when the variable is not required', () => {
    const codebook = codebookWith({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        validation: { maxSelected: 0 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('reports a required variable whose ceiling permits only an empty string', () => {
    const codebook = codebookWith({
      name: {
        name: 'Name',
        type: 'text',
        validation: { required: true, maxLength: 0 },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['required', 'maxLength']);
  });

  it('leaves a zero length ceiling alone when the variable is not required', () => {
    const codebook = codebookWith({
      name: { name: 'Name', type: 'text', validation: { maxLength: 0 } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('reports a length ceiling below zero without required', () => {
    const codebook = codebookWith({
      name: { name: 'Name', type: 'text', validation: { maxLength: -1 } },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['maxLength']);
    expect(conflicts[0]?.reason).toBe('maxLength -1 permits no string at all');
  });

  it('reports a selection ceiling below zero without required', () => {
    const codebook = codebookWith({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        validation: { maxSelected: -1 },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['maxSelected']);
    expect(conflicts[0]?.reason).toBe(
      'maxSelected -1 permits no selection at all',
    );
  });

  // A floor below zero is vacuous rather than contradictory: no string is
  // shorter and no selection smaller, so both validators pass every value.
  it('leaves a length floor below zero alone', () => {
    const codebook = codebookWith({
      name: { name: 'Name', type: 'text', validation: { minLength: -1 } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('leaves a selection floor below zero alone', () => {
    const codebook = codebookWith({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        validation: { minSelected: -1 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  // Numbers have no floor at zero, so a range entirely below it is ordinary.
  it('leaves value bounds below zero alone', () => {
    const codebook = codebookWith({
      balance: {
        name: 'Balance',
        type: 'number',
        validation: { minValue: -10, maxValue: -1 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('counts a duplicated option value once against minSelected', () => {
    // Two entries carrying one value offer a participant one thing to pick,
    // and the draw collapses them to a single selection. Counting entries
    // would accept this floor and leave the draw emitting `['a']`, which the
    // form rejects as too few selected.
    const codebook = codebookWith({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options: [
          { label: 'A', value: 'a' },
          { label: 'Also A', value: 'a' },
        ],
        validation: { minSelected: 2 },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('exceeds the 1 available options');
  });

  it('leaves a floor its distinct options can meet alone', () => {
    const codebook = codebookWith({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options: [
          { label: 'A', value: 'a' },
          { label: 'Also A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        validation: { minSelected: 2 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('reports minSelected above the option count', () => {
    const codebook = codebookWith({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        validation: { minSelected: 3 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(
      1,
    );
  });

  it('reports sameAs and differentFrom naming the same target', () => {
    const codebook = codebookWith({
      a: { name: 'A', type: 'text' },
      b: {
        name: 'B',
        type: 'text',
        validation: { sameAs: 'a', differentFrom: 'a' },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules.toSorted()).toEqual(['differentFrom', 'sameAs']);
    expect(conflicts[0]?.reason).toBe(
      'these variables are required to be both equal and different',
    );
  });

  it('reports a non-strict comparator cycle whose members cannot overlap', () => {
    // `a >= b` and `b >= a` merge into one equality group. Each variable's own
    // range holds values; the one value they have to share has to be at least 3
    // and at most 0.
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { maxValue: 0, greaterThanOrEqualToVariable: 'b' },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: {
          minValue: 3,
          maxValue: 5,
          greaterThanOrEqualToVariable: 'a',
        },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['A', 'B']);
    expect(conflicts[0]?.rules).toEqual([
      'greaterThanOrEqualToVariable',
      'minValue',
      'maxValue',
    ]);
    expect(conflicts[0]?.reason).toContain('bounds do not overlap');
    expect(conflicts[0]?.reason).toContain('minValue 3 exceeds maxValue 0');
  });

  it('reports a sameAs group closed by a comparator that cannot overlap', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 1, maxValue: 5, sameAs: 'b' },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { maxValue: 0, greaterThanOrEqualToVariable: 'a' },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['A', 'B']);
    expect(conflicts[0]?.reason).toContain('minValue 1 exceeds maxValue 0');
  });

  it('reports a sameAs group whose members cannot overlap, with no comparator', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 1, maxValue: 5, sameAs: 'b' },
      },
      b: { name: 'B', type: 'number', validation: { maxValue: 0 } },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['A', 'B']);
    expect(conflicts[0]?.rules).toEqual(['sameAs', 'minValue', 'maxValue']);
  });

  it('reports a three-variable non-strict cycle that cannot overlap', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: {
          minValue: 4,
          maxValue: 8,
          greaterThanOrEqualToVariable: 'c',
        },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 10,
          greaterThanOrEqualToVariable: 'a',
        },
      },
      c: {
        name: 'C',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 3,
          greaterThanOrEqualToVariable: 'b',
        },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['A', 'B', 'C']);
    expect(conflicts[0]?.reason).toContain('minValue 4 exceeds maxValue 3');
  });

  it('reports a group whose lengths cannot overlap', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'text',
        validation: { maxLength: 4, sameAs: 'b' },
      },
      b: { name: 'B', type: 'text', validation: { minLength: 8 } },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['sameAs', 'minLength', 'maxLength']);
    expect(conflicts[0]?.reason).toContain('minLength 8 exceeds maxLength 4');
  });

  it('reports the group as well where one member crosses its own bounds', () => {
    // Correcting what the per-variable conflict names does not settle the
    // group: A's own pair put right at maxLength 12 still leaves the value the
    // two share needing to be both at least 10 and at most 4.
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'text',
        validation: { minLength: 10, maxLength: 2, sameAs: 'b' },
      },
      b: { name: 'B', type: 'text', validation: { maxLength: 4 } },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]?.variableNames).toEqual(['A']);
    expect(conflicts[0]?.reason).toBe('minLength 10 exceeds maxLength 2');

    expect(conflicts[1]?.variableNames).toEqual(['A', 'B']);
    expect(conflicts[1]?.reason).toContain('bounds do not overlap');
    expect(conflicts[1]?.reason).toContain(
      'minLength 10 exceeds maxLength 2, which one of these variables already ' +
        'declares on its own',
    );
  });

  it('words a group conflict no member declares on its own without that clause', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'text',
        validation: { minLength: 10, sameAs: 'b' },
      },
      b: { name: 'B', type: 'text', validation: { maxLength: 4 } },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('minLength 10 exceeds maxLength 4');
    expect(conflicts[0]?.reason).not.toContain('already declares on its own');
  });

  it('accepts a group whose members bounds do overlap', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 1, maxValue: 5, sameAs: 'b' },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 3, maxValue: 8 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('accepts a variable declared both at least and at most another', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: {
          greaterThanOrEqualToVariable: 'b',
          lessThanOrEqualToVariable: 'b',
        },
      },
      b: { name: 'B', type: 'number' },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('reports a variable declared both above and below another once', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { greaterThanVariable: 'b', lessThanVariable: 'b' },
      },
      b: { name: 'B', type: 'number' },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('cycle');
  });

  it('reports a strict comparator cycle', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { greaterThanVariable: 'b' },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { greaterThanVariable: 'a' },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('cycle');
  });

  it('reports disjoint bounds across a comparator', () => {
    const codebook = codebookWith({
      low: { name: 'Low', type: 'number', validation: { maxValue: 5 } },
      high: {
        name: 'High',
        type: 'number',
        validation: { minValue: 10, lessThanVariable: 'low' },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(
      1,
    );
  });

  it('accepts bounds that touch across a non-strict lower comparator', () => {
    const codebook = codebookWith({
      high: {
        name: 'High',
        type: 'number',
        validation: { maxValue: 10, greaterThanOrEqualToVariable: 'low' },
      },
      low: { name: 'Low', type: 'number', validation: { minValue: 10 } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('accepts bounds that touch across a non-strict upper comparator', () => {
    const codebook = codebookWith({
      low: {
        name: 'Low',
        type: 'number',
        validation: { minValue: 3, lessThanOrEqualToVariable: 'high' },
      },
      high: { name: 'High', type: 'number', validation: { maxValue: 3 } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('accepts bounds that leave one satisfying value across a strict comparator', () => {
    const codebook = codebookWith({
      high: {
        name: 'High',
        type: 'number',
        validation: { maxValue: 6, greaterThanVariable: 'low' },
      },
      low: { name: 'Low', type: 'number', validation: { minValue: 5 } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('reports bounds that cannot reach a non-strict comparator target', () => {
    const codebook = codebookWith({
      high: {
        name: 'High',
        type: 'number',
        validation: { maxValue: 9, greaterThanOrEqualToVariable: 'low' },
      },
      low: { name: 'Low', type: 'number', validation: { minValue: 10 } },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['greaterThanOrEqualToVariable']);
  });

  it('reports a chain of comparisons too long for the range it runs in', () => {
    // Every pair fits: `a < b` and `b < c` each have room in `[0, 1]`. The
    // three together need three distinct values and have two.
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0, maxValue: 1 },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 0, maxValue: 1, greaterThanVariable: 'a' },
      },
      c: {
        name: 'C',
        type: 'number',
        validation: { minValue: 0, maxValue: 1, greaterThanVariable: 'b' },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['A', 'B', 'C']);
    expect(conflicts[0]?.rules).toEqual(['greaterThanVariable']);
    expect(conflicts[0]?.reason).toContain('do not fit inside the bounds');
  });

  it('names the types, not the bounds, for a number compared against a date', () => {
    // The bounds here are fine at any width: `compareVariables` cannot order a
    // number against a date at all. A message about bounds would send the
    // protocol's author to widen a range that was never the problem.
    const codebook = codebookWith({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 1, maxValue: 100 },
      },
      born: {
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2000-01-01', max: '2010-12-31' },
        validation: { greaterThanVariable: 'age' },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames.toSorted()).toEqual(['Age', 'Born']);
    expect(conflicts[0]?.reason).toBe(
      'a number is compared against a date here, which no assignment can satisfy',
    );
  });

  it('reports a four-variable chain that needs one value more than it has', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0, maxValue: 2 },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 0, maxValue: 2, greaterThanVariable: 'a' },
      },
      c: {
        name: 'C',
        type: 'number',
        validation: { minValue: 0, maxValue: 2, greaterThanVariable: 'b' },
      },
      d: {
        name: 'D',
        type: 'number',
        validation: { minValue: 0, maxValue: 2, greaterThanVariable: 'c' },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(
      1,
    );
  });

  it('reports four dates that cannot be ordered inside a three-day window', () => {
    const window = {
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2020-01-03' },
    } as const;

    const codebook = codebookWith({
      w: { name: 'W', ...window },
      x: {
        name: 'X',
        ...window,
        validation: { greaterThanVariable: 'w' },
      },
      y: {
        name: 'Y',
        ...window,
        validation: { greaterThanVariable: 'x' },
      },
      z: {
        name: 'Z',
        ...window,
        validation: { greaterThanVariable: 'y' },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toHaveLength(
      1,
    );
  });

  it('accepts a chain that exactly fills the range it runs in', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0, maxValue: 2 },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 0, maxValue: 2, greaterThanVariable: 'a' },
      },
      c: {
        name: 'C',
        type: 'number',
        validation: { minValue: 0, maxValue: 2, greaterThanVariable: 'b' },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('accepts a four-variable chain that exactly fills its range', () => {
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0, maxValue: 3 },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 0, maxValue: 3, greaterThanVariable: 'a' },
      },
      c: {
        name: 'C',
        type: 'number',
        validation: { minValue: 0, maxValue: 3, greaterThanVariable: 'b' },
      },
      d: {
        name: 'D',
        type: 'number',
        validation: { minValue: 0, maxValue: 3, greaterThanVariable: 'c' },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('reports a differentFrom its comparator pins to a single shared value', () => {
    // Interval reasoning alone accepts this: every bound overlaps. But
    // `b <= a` with these ranges forces both to 4, and 4 cannot differ from 4.
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 3, maxValue: 4, differentFrom: 'b' },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: {
          minValue: 4,
          maxValue: 5,
          lessThanOrEqualToVariable: 'a',
        },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['A', 'B']);
    expect(conflicts[0]?.rules).toContain('differentFrom');
    expect(conflicts[0]?.rules).toContain('lessThanOrEqualToVariable');
    expect(conflicts[0]?.reason).toContain('no combination of values');
  });

  it('accepts the pinned differentFrom shape once the bounds leave an escape', () => {
    // Identical rules, but b's floor is 3: b = 3, a = 4 satisfies everything.
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 3, maxValue: 4, differentFrom: 'b' },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: {
          minValue: 3,
          maxValue: 4,
          lessThanOrEqualToVariable: 'a',
        },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('accepts the corner shape the greedy path cannot always draw', () => {
    // B=3, A=4, D∈{3,4} satisfies every rule; refusing it would trade a
    // draw-order defect for a soundness one.
    const codebook = codebookWith({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 3, maxValue: 4, differentFrom: 'b' },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: { minValue: 3, maxValue: 4 },
      },
      d: {
        name: 'D',
        type: 'number',
        validation: {
          minValue: 2,
          maxValue: 4,
          lessThanOrEqualToVariable: 'a',
          greaterThanOrEqualToVariable: 'b',
        },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('accepts a strict chain from a number through a scalar to a pinned number', () => {
    // m = 0, s = 0.5, n = 1: the scalar grid holds ninety-nine values strictly
    // between the two integers.
    const codebook = codebookWith({
      m: {
        name: 'M',
        type: 'number',
        validation: { minValue: 0, maxValue: 0 },
      },
      s: {
        name: 'S',
        type: 'scalar',
        component: 'VisualAnalogScale',
        validation: { greaterThanVariable: 'm', lessThanVariable: 'n' },
      },
      n: {
        name: 'N',
        type: 'number',
        validation: { minValue: 1, maxValue: 1 },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('reports an odd ring of mutually different booleans', () => {
    // Five booleans in a differentFrom ring form an odd cycle over two
    // values, which no assignment two-colours. Only a complete search can
    // see this; every pair in isolation is satisfiable.
    const variables: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) {
      variables[`v${i}`] = {
        name: `V${i}`,
        type: 'boolean',
        validation: { differentFrom: i > 0 ? `v${i - 1}` : 'v4' },
      };
    }

    const conflicts = analyseFeasibility(
      codebookWith(variables),
      [nameGenerator],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['differentFrom']);
    expect(conflicts[0]?.variableNames).toEqual(['V0', 'V1', 'V2', 'V3', 'V4']);
  });

  it('reports two single-option ordinals required to differ', () => {
    const codebook = codebookWith({
      x: {
        name: 'X',
        type: 'ordinal',
        options: [{ label: 'Only', value: 1 }],
      },
      y: {
        name: 'Y',
        type: 'ordinal',
        options: [{ label: 'Only', value: 1 }],
        validation: { differentFrom: 'x' },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['X', 'Y']);
    expect(conflicts[0]?.rules).toEqual(['differentFrom']);
  });

  it('reports unique against a value space smaller than the worst-case count', () => {
    const codebook = codebookWith({
      band: {
        name: 'Band',
        type: 'ordinal',
        options: [
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
          { label: 'C', value: 3 },
        ],
        validation: { unique: true },
      },
    });

    // maxNodes 8 against a 3-value space.
    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique']);
  });

  it('measures a unique value space against the rules of its whole sameAs group', () => {
    // `p` alone is unbounded, so its own value space is unbounded too. The
    // generator draws the group once against the intersection, where `q` caps
    // it at three values — which the 8 nodes this stage can produce exhaust.
    const codebook = codebookWith({
      p: { name: 'P', type: 'number', validation: { unique: true } },
      q: {
        name: 'Q',
        type: 'number',
        validation: { sameAs: 'p', minValue: 0, maxValue: 2 },
      },
    });

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique']);
    expect(conflicts[0]?.variableNames).toEqual(['P', 'Q']);
    expect(conflicts[0]?.reason).toContain('only 3 distinct values');
  });

  it('accepts unique when the value space is large enough', () => {
    const codebook = codebookWith({
      name: { name: 'Name', type: 'text', validation: { unique: true } },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('analyses ego and edge variables too', () => {
    const codebook = {
      ego: {
        variables: {
          a: {
            name: 'A',
            type: 'text',
            validation: { minLength: 10, maxLength: 2 },
          },
        },
      },
    } as unknown as StructuralCodebook;

    const conflicts = analyseFeasibility(codebook, [], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('ego');
  });

  it('names the entity type rather than its codebook key', () => {
    const key = '0f6a9c14-8b1e-4c77-9c2a-1d3e5f7a9b21';
    const codebook = {
      node: {
        [key]: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            age: {
              name: 'Age',
              type: 'number',
              validation: { minValue: 50, maxValue: 20 },
            },
          },
        },
      },
    } as unknown as StructuralCodebook;

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityType).toBe(key);
    expect(conflicts[0]?.entityTypeName).toBe('Person');

    const { message } = new SyntheticDataConstraintError(conflicts);

    expect(message).toContain('node "Person"');
    expect(message).not.toContain(key);
  });
});

/**
 * A prompt's `additionalAttributes` are written onto every node the prompt
 * creates, so the count of nodes holding one of those values is a property of
 * the protocol rather than of the seed — which makes it decidable here.
 */
describe('values a prompt fixes', () => {
  const uniqueFlag = codebookWith({
    flagged: { name: 'Flagged', type: 'boolean', validation: { unique: true } },
  });

  function fixingGenerator(nodes: number, id = 'stage-fix'): Stage {
    return {
      id,
      type: 'NameGenerator',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: `${id}-p1`,
          text: 'Name people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
      ],
      behaviours: { minNodes: nodes, maxNodes: nodes },
    } as unknown as Stage;
  }

  function rosterRow(id: string, attributes: Record<string, unknown>): NcNode {
    return {
      [entityPrimaryKeyProperty]: id,
      type: 'person',
      [entityAttributesProperty]: attributes,
    } as unknown as NcNode;
  }

  it('reports a unique value fixed on a stage that can create two nodes', () => {
    const conflicts = analyseFeasibility(
      uniqueFlag,
      [fixingGenerator(2)],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique', 'additionalAttributes']);
    expect(conflicts[0]?.variableNames).toEqual(['Flagged']);
    expect(conflicts[0]?.reason).toBe(
      'a prompt fixes this to true on up to 2 nodes, but unique allows one node to hold a value',
    );
  });

  it('sums the nodes every stage fixing one value can create', () => {
    const conflicts = analyseFeasibility(
      uniqueFlag,
      [fixingGenerator(1, 'stage-a'), fixingGenerator(1, 'stage-b')],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('on up to 2 nodes');
  });

  it('folds a fixed value onto the unique group its variable belongs to', () => {
    const conflicts = analyseFeasibility(
      codebookWith({
        token: { name: 'Token', type: 'boolean', validation: { unique: true } },
        flagged: {
          name: 'Flagged',
          type: 'boolean',
          validation: { sameAs: 'token' },
        },
      }),
      [fixingGenerator(2)],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique', 'additionalAttributes']);
    expect(conflicts[0]?.variableNames.toSorted()).toEqual([
      'Flagged',
      'Token',
    ]);
  });

  it('accepts a unique value only one node can be given', () => {
    expect(
      analyseFeasibility(uniqueFlag, [fixingGenerator(1)], config),
    ).toEqual([]);
  });

  it('accepts a fixed value no rule holds unique', () => {
    const codebook = codebookWith({
      flagged: { name: 'Flagged', type: 'boolean' },
    });

    expect(analyseFeasibility(codebook, [fixingGenerator(8)], config)).toEqual(
      [],
    );
  });

  it('accepts a roster stage whose rows all supply the fixed variable', () => {
    // A roster row's own value wins over the prompt's, so the fixed value
    // reaches no node and spends nothing.
    const stage = {
      ...fixingGenerator(2, 'stage-roster'),
      type: 'NameGeneratorRoster',
    } as unknown as Stage;

    expect(
      analyseFeasibility(uniqueFlag, [stage], config, {
        'stage-roster': [
          rosterRow('r1', { flagged: true }),
          rosterRow('r2', { flagged: false }),
        ],
      }),
    ).toEqual([]);
  });

  it('reports a roster stage whose rows leave the fixed variable unset', () => {
    const stage = {
      ...fixingGenerator(2, 'stage-roster'),
      type: 'NameGeneratorRoster',
    } as unknown as Stage;

    const conflicts = analyseFeasibility(uniqueFlag, [stage], config, {
      'stage-roster': [rosterRow('r1', {}), rosterRow('r2', {})],
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('on up to 2 nodes');
  });

  it('accepts a roster stage offering one row for a value it fixes', () => {
    const stage = {
      ...fixingGenerator(8, 'stage-roster'),
      type: 'NameGeneratorRoster',
    } as unknown as Stage;

    expect(
      analyseFeasibility(uniqueFlag, [stage], config, {
        'stage-roster': [rosterRow('r1', {})],
      }),
    ).toEqual([]);
  });

  it('counts a stage whose prompts share its ceiling once', () => {
    // The ceiling is the stage's: `createNodesForStage` counts every prompt
    // against the same `maxNodes`, so a one-node stage puts the value on one
    // node however many of its prompts fix it. Summing each prompt's own
    // maximum would refuse a protocol that generates perfectly well.
    const stage = {
      ...fixingGenerator(1),
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
        {
          id: 'p2',
          text: 'Name more people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
      ],
    } as unknown as Stage;

    expect(analyseFeasibility(uniqueFlag, [stage], config)).toEqual([]);
  });

  it('still reports a ceiling two prompts of one stage can fill twice over', () => {
    // Sharing the ceiling is not the same as under-counting it: two nodes is
    // still two holders, whichever prompt made them.
    const stage = {
      ...fixingGenerator(2),
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
        {
          id: 'p2',
          text: 'Name more people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
      ],
    } as unknown as Stage;

    const conflicts = analyseFeasibility(uniqueFlag, [stage], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('on up to 2 nodes');
  });
});

/**
 * The ego flag a FamilyPedigree stage writes is the same kind of value as a
 * prompt's: the interface pins `true` on its proband and `false` on every other
 * node it builds, so no draw stands between those values and the finished
 * network.
 */
describe('the ego flag a pedigree stage pins', () => {
  function pedigree(id = 'stage-fp', variable = 'isEgo'): Stage {
    return {
      id,
      type: 'FamilyPedigree',
      label: 'Pedigree',
      nodeConfig: { type: 'person', egoVariable: variable },
      edgeConfig: { type: 'kin' },
      prompts: [],
    } as unknown as Stage;
  }

  function sizedConfig(nodes: number): typeof config {
    return resolveGenerationConfig({
      today: '2026-07-27',
      familyPedigreeNodeCount: { min: nodes, max: nodes },
    });
  }

  const uniqueFlag = codebookWith({
    isEgo: { name: 'Is ego', type: 'boolean', validation: { unique: true } },
  });

  it('reports two stages that each pin true on one unique flag', () => {
    // Both stages mark their own proband, and one-node pedigrees put nothing
    // else on the variable — so the count check passes and two nodes still end
    // up holding `true`.
    const conflicts = analyseFeasibility(
      uniqueFlag,
      [pedigree('fp-a'), pedigree('fp-b')],
      sizedConfig(1),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique', 'egoVariable']);
    expect(conflicts[0]?.variableNames).toEqual(['Is ego']);
    expect(conflicts[0]?.reason).toBe(
      'a family pedigree fixes this to true on up to 2 nodes, but unique allows one node to hold a value',
    );
  });

  it('reports the false one stage of three nodes writes twice', () => {
    // A domain wide enough to pass the count check: nine values for three
    // nodes. The pedigree writes `[true, false, false]` all the same.
    const conflicts = analyseFeasibility(
      codebookWith({
        isEgo: {
          name: 'Is ego',
          type: 'number',
          validation: { unique: true, minValue: 1, maxValue: 9 },
        },
      }),
      [pedigree()],
      sizedConfig(3),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toBe(
      'a family pedigree fixes this to false on up to 2 nodes, but unique allows one node to hold a value',
    );
  });

  it('accepts a two-node pedigree, whose two pins differ', () => {
    // One `true` and one `false` spend one value each, which is what unique
    // allows. This is the shape `reserveFamilyPedigreeEgoValues` settles.
    expect(
      analyseFeasibility(uniqueFlag, [pedigree()], sizedConfig(2)),
    ).toEqual([]);
  });

  it('accepts an ego flag no rule holds unique', () => {
    const codebook = codebookWith({
      isEgo: { name: 'Is ego', type: 'boolean' },
    });

    expect(analyseFeasibility(codebook, [pedigree()], sizedConfig(8))).toEqual(
      [],
    );
  });

  it('accepts a pedigree stage naming no ego variable', () => {
    const stage = {
      ...pedigree(),
      nodeConfig: { type: 'person' },
    } as unknown as Stage;

    expect(analyseFeasibility(uniqueFlag, [stage], sizedConfig(2))).toEqual([]);
  });

  it('names the protocol when a prompt and a pedigree pin the same value', () => {
    const fixingGenerator = {
      id: 'stage-fix',
      type: 'NameGenerator',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: [{ variable: 'isEgo', value: true }],
        },
      ],
      behaviours: { minNodes: 1, maxNodes: 1 },
    } as unknown as Stage;

    const conflicts = analyseFeasibility(
      uniqueFlag,
      [fixingGenerator, pedigree()],
      sizedConfig(1),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules.toSorted()).toEqual([
      'additionalAttributes',
      'egoVariable',
      'unique',
    ]);
    expect(conflicts[0]?.reason).toBe(
      'the protocol fixes this to true on up to 2 nodes, but unique allows one node to hold a value',
    );
  });

  it('folds a pedigree pin onto the unique group its variable belongs to', () => {
    const conflicts = analyseFeasibility(
      codebookWith({
        token: { name: 'Token', type: 'boolean', validation: { unique: true } },
        isEgo: {
          name: 'Is ego',
          type: 'boolean',
          validation: { sameAs: 'token' },
        },
      }),
      [pedigree('fp-a'), pedigree('fp-b')],
      sizedConfig(1),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames.toSorted()).toEqual(['Is ego', 'Token']);
  });
});

/**
 * A prompt naming both ends of a rule leaves the draw nothing to choose
 * between them, so whether the pair satisfies the rule is settled by the
 * protocol rather than by the seed.
 */
describe('a rule between two values one prompt fixes', () => {
  function pinningGenerator(
    values: Record<string, boolean>,
    type = 'NameGenerator',
  ): Stage {
    return {
      id: 'stage-pin',
      type,
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: Object.entries(values).map(
            ([variable, value]) => ({ variable, value }),
          ),
        },
      ],
      behaviours: { minNodes: 3, maxNodes: 3 },
    } as unknown as Stage;
  }

  const sameAsPair = codebookWith({
    a: { name: 'A', type: 'boolean' },
    b: { name: 'B', type: 'boolean', validation: { sameAs: 'a' } },
  });
  const differentFromPair = codebookWith({
    a: { name: 'A', type: 'boolean' },
    b: { name: 'B', type: 'boolean', validation: { differentFrom: 'a' } },
  });

  it('reports a sameAs pair fixed to values that disagree', () => {
    const conflicts = analyseFeasibility(
      sameAsPair,
      [pinningGenerator({ a: false, b: true })],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['sameAs', 'additionalAttributes']);
    expect(conflicts[0]?.variableNames).toEqual(['A', 'B']);
    expect(conflicts[0]?.reason).toBe(
      'a prompt fixes these variables to false and true, which sameAs cannot hold',
    );
  });

  it('reports a differentFrom pair fixed to one value', () => {
    const conflicts = analyseFeasibility(
      differentFromPair,
      [pinningGenerator({ a: true, b: true })],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual([
      'differentFrom',
      'additionalAttributes',
    ]);
    expect(conflicts[0]?.reason).toBe(
      'a prompt fixes these variables to true and true, which differentFrom cannot hold',
    );
  });

  it('accepts a sameAs pair fixed to one value', () => {
    expect(
      analyseFeasibility(
        sameAsPair,
        [pinningGenerator({ a: true, b: true })],
        config,
      ),
    ).toEqual([]);
  });

  it('accepts a differentFrom pair fixed to values that differ', () => {
    expect(
      analyseFeasibility(
        differentFromPair,
        [pinningGenerator({ a: true, b: false })],
        config,
      ),
    ).toEqual([]);
  });

  it('accepts a rule with only one of its ends fixed', () => {
    // The other end is still the draw's to choose, and generation resolves it
    // against the value the node ends up holding.
    expect(
      analyseFeasibility(sameAsPair, [pinningGenerator({ a: false })], config),
    ).toEqual([]);
  });

  it('leaves a roster stage holding rows to the draw', () => {
    // A row's own value wins over the prompt's, so which of a prompt's values
    // reach one node depends on the row — passed over at the draw instead.
    expect(
      analyseFeasibility(
        sameAsPair,
        [pinningGenerator({ a: false, b: true }, 'NameGeneratorRoster')],
        config,
        {
          'stage-pin': [
            {
              [entityPrimaryKeyProperty]: 'r1',
              type: 'person',
              [entityAttributesProperty]: { a: false },
            } as unknown as NcNode,
          ],
        },
      ),
    ).toEqual([]);
  });

  it('reports a roster stage with no rows to draw from', () => {
    // Nothing overrides the prompt there: the stage fabricates every node it
    // makes, and each one carries the whole assignment.
    const conflicts = analyseFeasibility(
      sameAsPair,
      [pinningGenerator({ a: false, b: true }, 'NameGeneratorRoster')],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['sameAs', 'additionalAttributes']);
  });
});

/**
 * A prompt's `additionalAttributes` carry a boolean, and the variable they name
 * is any of the stage subject's — the schema puts no type on either end. So a
 * prompt can state a value the variable's own rules reject, and the draw never
 * sees it: the value is settled before generation, which is asked only for the
 * variables it leaves over. Protocol rather than data, and refused on every
 * seed or on none.
 */
describe('a value one prompt fixes against its own rules', () => {
  function pinning(variable: string, value: boolean, type = 'NameGenerator') {
    return {
      id: 'stage-pin',
      type,
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: [{ variable, value }],
        },
      ],
      behaviours: { minNodes: 3, maxNodes: 3 },
    } as unknown as Stage;
  }

  const options = [1, 2, 3].map((value) => ({ label: `Band ${value}`, value }));

  it('reports a value no option offers', () => {
    const codebook = codebookWith({
      rank: { name: 'Rank', type: 'ordinal', options },
    });

    const conflicts = analyseFeasibility(
      codebook,
      [pinning('rank', true)],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['options', 'additionalAttributes']);
    expect(conflicts[0]?.variableNames).toEqual(['Rank']);
    expect(conflicts[0]?.reason).toBe(
      'a prompt fixes this variable to true, which options does not allow',
    );
  });

  it('reports a value below the floor its variable declares', () => {
    const codebook = codebookWith({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 18, maxValue: 100 },
      },
    });

    const conflicts = analyseFeasibility(
      codebook,
      [pinning('age', true)],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['minValue', 'additionalAttributes']);
    expect(conflicts[0]?.reason).toBe(
      'a prompt fixes this variable to true, which minValue does not allow',
    );
  });

  it('reports a selection its variable is not, against a selection rule', () => {
    const codebook = codebookWith({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options,
        validation: { minSelected: 2 },
      },
    });

    const conflicts = analyseFeasibility(
      codebook,
      [pinning('tags', true)],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['options', 'additionalAttributes']);
  });

  it('accepts a value its variable can hold', () => {
    const codebook = codebookWith({
      close: { name: 'Close', type: 'boolean', validation: { required: true } },
    });

    expect(
      analyseFeasibility(codebook, [pinning('close', false)], config),
    ).toEqual([]);
  });

  it('leaves a roster stage holding rows to the draw', () => {
    // The row's own value wins over the prompt's, so whether the prompt's value
    // reaches a node depends on the row — passed over at the draw instead.
    const codebook = codebookWith({
      rank: { name: 'Rank', type: 'ordinal', options },
    });

    expect(
      analyseFeasibility(
        codebook,
        [pinning('rank', true, 'NameGeneratorRoster')],
        config,
        {
          'stage-pin': [
            {
              [entityPrimaryKeyProperty]: 'r1',
              type: 'person',
              [entityAttributesProperty]: { rank: 2 },
            } as unknown as NcNode,
          ],
        },
      ),
    ).toEqual([]);
  });
});

describe('SyntheticDataConstraintError', () => {
  it('names every conflicting variable in its message', () => {
    const error = new SyntheticDataConstraintError([
      {
        entity: 'node',
        entityType: 'person',
        variableIds: ['name'],
        variableNames: ['Name'],
        rules: ['minLength', 'maxLength'],
        reason: 'minLength 24 exceeds maxLength 10',
      },
    ]);

    expect(error.message).toContain('person');
    expect(error.message).toContain('Name');
    expect(error.message).toContain('minLength 24 exceeds maxLength 10');
    expect(error.conflicts).toHaveLength(1);
    expect(error.name).toBe('SyntheticDataConstraintError');
  });
});
