import { describe, expect, it } from 'vitest';

import type {
  Stage,
  StructuralCodebook,
  Variables,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../../generateNetwork.ts';
import { ValueGenerator } from '../../../ValueGenerator.ts';
import { resolveGenerationConfig } from '../../config.ts';
import { CONTENT_STAGE_TYPES } from '../../contentStages.ts';
import type { GenerationContext } from '../../context.ts';
import { buildEntityConstraints } from '../buildConstraints.ts';
import { SyntheticDataConstraintError } from '../error.ts';
import { analyseFeasibility } from '../feasibility.ts';
import { generateEntityAttributes } from '../generateEntityAttributes.ts';
import { UniqueRegistry } from '../uniqueRegistry.ts';
import { MAX_TEXT_DRAW_LENGTH } from '../valueSpace.ts';

const config = resolveGenerationConfig({ today: '2026-07-27' });

/**
 * Enough context to run one draw directly, for the guards that assert what the
 * generator does with a set of rules this pass judges. The per-type maps stay
 * empty: those guards hand their constraints to `generateEntityAttributes`.
 */
function makeDrawContext(seed = 1): GenerationContext {
  return {
    codebook: {},
    valueGen: new ValueGenerator(seed, config.today),
    config,
    usedRosterUids: new Set(),
    externalData: undefined,
    respectSkipLogicAndFiltering: false,
    uniqueRegistry: new UniqueRegistry(),
    entityConstraints: { ego: new Map(), node: new Map(), edge: new Map() },
  };
}

const nameGenerator = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { maxNodes: 8 },
} as unknown as Stage;

// Ego's attributes stay empty until an ego-subject stage writes them, so a
// codebook's ego variables are only analysed when the stage list has one.
const egoForm = {
  id: 'stage-ef',
  type: 'EgoForm',
  label: 'About you',
  form: { fields: [{ variable: 'name', prompt: 'Your name' }] },
  introductionPanel: { title: 'About you', text: 'Tell us about yourself.' },
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
      'these attributes are required to be both equal and different',
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
      'minLength 10 exceeds maxLength 2, which one of these attributes already ' +
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

    const conflicts = analyseFeasibility(codebook, [egoForm], config);

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
    // The stage has to name the same key: a codebook type no stage names
    // carries no entity, and is not analysed at all.
    const generator = {
      ...nameGenerator,
      subject: { entity: 'node', type: key },
    } as unknown as Stage;

    const conflicts = analyseFeasibility(codebook, [generator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityType).toBe(key);
    expect(conflicts[0]?.entityTypeName).toBe('Person');

    const { message } = new SyntheticDataConstraintError(conflicts);

    expect(message).toContain('node "Person"');
    expect(message).not.toContain(key);
  });
});

/**
 * The members of an equality group share one value and one `unique` slot, so
 * each of them bounds the whole group: a roster row is turned away by any
 * member's value the network already holds. Reading the members one at a time
 * and taking the widest counted rows the draw never reaches.
 */
describe('a unique group whose members a roster populates unevenly', () => {
  const heldEqual = codebookWith({
    a: { name: 'A', type: 'boolean', validation: { unique: true } },
    b: { name: 'B', type: 'boolean', validation: { sameAs: 'a' } },
  });

  const roster = {
    id: 'stage-roster',
    type: 'NameGeneratorRoster',
    label: 'Roster',
    subject: { entity: 'node', type: 'person' },
    dataSource: 'roster-asset',
    prompts: [{ id: 'p1', text: 'Pick people' }],
    behaviours: { maxNodes: 3 },
  } as unknown as Stage;

  function row(id: string, attributes: Record<string, unknown>): NcNode {
    return {
      [entityPrimaryKeyProperty]: id,
      type: 'person',
      [entityAttributesProperty]: attributes,
    } as unknown as NcNode;
  }

  it('accepts rows that all carry one value of the group', () => {
    // The draw takes the first row and passes the other two over, so one
    // person is built and one of the two booleans is spent.
    expect(
      analyseFeasibility(heldEqual, [roster], config, {
        'stage-roster': [
          row('r1', { a: true }),
          row('r2', { a: true }),
          row('r3', { a: true }),
        ],
      }),
    ).toEqual([]);
  });

  it('reports the group when its rows really do exhaust the space', () => {
    // Two rows spend both booleans, and the third leaves the group unset — so
    // the draw is asked for a value neither of them left.
    const conflicts = analyseFeasibility(heldEqual, [roster], config, {
      'stage-roster': [
        row('r1', { a: true }),
        row('r2', { a: false }),
        row('r3', {}),
      ],
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique']);
    expect(conflicts[0]?.variableNames).toEqual(['A', 'B']);
    expect(conflicts[0]?.reason).toContain('up to 3 nodes');
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

  it('accepts a unique value fixed only by a later prompt with one slot left', () => {
    const codebook = codebookWith({
      firstFlag: { name: 'First flag', type: 'boolean' },
      secondFlag: { name: 'Second flag', type: 'boolean' },
      flagged: {
        name: 'Flagged',
        type: 'boolean',
        validation: { unique: true },
      },
    });
    const stage = {
      ...fixingGenerator(5),
      prompts: [
        {
          id: 'p1',
          text: 'First prompt',
          additionalAttributes: [{ variable: 'firstFlag', value: true }],
        },
        {
          id: 'p2',
          text: 'Second prompt',
          additionalAttributes: [{ variable: 'secondFlag', value: true }],
        },
        {
          id: 'p3',
          text: 'Third prompt',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
      ],
      behaviours: { minNodes: 2, maxNodes: 5 },
    } as unknown as Stage;

    expect(analyseFeasibility(codebook, [stage], config)).toEqual([]);
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
 * A roster row and a prompt can want the same value, and the draw settles only
 * which node ends up carrying it. Where the prompt's stage may fabricate, the
 * row being passed over buys nothing: the stage builds a person of its own and
 * writes the value onto them, so the row's node and the prompt's both hold it.
 * Two writers, no draw between either of them and the network, and a refusal
 * rather than a draw that fails on some seeds and not others.
 */
describe('a value a prompt fixes and a roster row carries', () => {
  const uniqueFlag = codebookWith({
    flagged: { name: 'Flagged', type: 'boolean', validation: { unique: true } },
  });

  function row(id: string, attributes: Record<string, unknown>): NcNode {
    return {
      [entityPrimaryKeyProperty]: id,
      type: 'person',
      [entityAttributesProperty]: attributes,
    } as unknown as NcNode;
  }

  /** A one-person roster stage, whose rows are given per test. */
  const rosterStage = {
    id: 'stage-roster',
    type: 'NameGeneratorRoster',
    label: 'Roster',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'r-p1', text: 'Pick people' }],
    behaviours: { minNodes: 1, maxNodes: 1 },
  } as unknown as Stage;

  /** A one-person panel stage whose prompt fixes `flagged`. */
  function panelStage(value: boolean): Stage {
    return {
      id: 'stage-panel',
      type: 'NameGenerator',
      label: 'Panel',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p-p1',
          text: 'Name people',
          additionalAttributes: [{ variable: 'flagged', value }],
        },
      ],
      behaviours: { minNodes: 1, maxNodes: 1 },
    } as unknown as Stage;
  }

  const carried = {
    'stage-roster': [row('r1', { flagged: true })],
    'stage-panel': [row('p1', { flagged: true })],
  };

  it('reports the roster stage the panel follows', () => {
    const conflicts = analyseFeasibility(
      uniqueFlag,
      [rosterStage, panelStage(true)],
      config,
      carried,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique', 'additionalAttributes']);
    expect(conflicts[0]?.variableNames).toEqual(['Flagged']);
    expect(conflicts[0]?.reason).toBe(
      'a prompt and a roster row fix this to true on up to 2 nodes, but unique allows one node to hold a value',
    );
  });

  it('generates the same protocol with the panel first', () => {
    // The panel's node claims the value before the roster stage runs, so the
    // row carrying it is passed over and the network holds it once. A roster is
    // a pool of candidates rather than a list of people the run must add, so
    // that stage simply draws nobody — nothing the protocol declares is broken.
    const stages = [panelStage(true), rosterStage];

    expect(analyseFeasibility(uniqueFlag, stages, config, carried)).toEqual([]);

    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({
        codebook: uniqueFlag,
        stages,
        seed,
        externalData: carried,
      });
      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].flagged,
      );

      expect(flags, `seed ${seed}`).toEqual([true]);
    }
  });

  it('generates a fixed value no roster row carries', () => {
    const stages = [rosterStage, panelStage(true)];
    const unset = { 'stage-roster': [row('r1', {})] };

    expect(analyseFeasibility(uniqueFlag, stages, config, unset)).toEqual([]);

    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({
        codebook: uniqueFlag,
        stages,
        seed,
        externalData: unset,
      });
      const flags = network.nodes
        .map((node) => node[entityAttributesProperty].flagged)
        .toSorted((left, right) => String(left).localeCompare(String(right)));

      expect(flags, `seed ${seed}`).toEqual([false, true]);
    }
  });

  it('generates a fixed value the roster rows differ from', () => {
    const stages = [rosterStage, panelStage(true)];
    const differing = { 'stage-roster': [row('r1', { flagged: false })] };

    expect(analyseFeasibility(uniqueFlag, stages, config, differing)).toEqual(
      [],
    );

    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({
        codebook: uniqueFlag,
        stages,
        seed,
        externalData: differing,
      });
      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].flagged,
      );

      expect(flags, `seed ${seed}`).toEqual([false, true]);
    }
  });

  it('reports the value a roster row shares with a prompt of another stage', () => {
    // The panel that carries the row and the panel that fixes the value need
    // not be the same stage, and neither need be a roster stage: what matters
    // is that a row holding the value is offered before something writes it
    // onto a person of its own.
    const carrying = {
      id: 'stage-carry',
      type: 'NameGenerator',
      label: 'Carrying panel',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'c-p1', text: 'Name people' }],
      behaviours: { minNodes: 1, maxNodes: 1 },
    } as unknown as Stage;

    const conflicts = analyseFeasibility(
      uniqueFlag,
      [carrying, panelStage(true)],
      config,
      { 'stage-carry': [row('c1', { flagged: true })] },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('a prompt and a roster row fix');
  });

  it('accepts a roster stage fixing a value its own rows carry', () => {
    // Every node this stage builds comes from a row the registry judged, and it
    // judges the assignment the node will hold — the prompt's value included —
    // so the second person holding the value is never built.
    const fixing = {
      ...rosterStage,
      prompts: [
        {
          id: 'r-p1',
          text: 'Pick people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
      ],
      behaviours: { minNodes: 2, maxNodes: 2 },
    } as unknown as Stage;

    expect(
      analyseFeasibility(uniqueFlag, [fixing], config, {
        'stage-roster': [row('r1', { flagged: true }), row('r2', {})],
      }),
    ).toEqual([]);
  });

  it('accepts a panel whose every prompt overwrites what its rows carry', () => {
    // The row's own value is never written where the prompt fixes the same
    // variable, so the row and the prompt are one writer between them.
    expect(
      analyseFeasibility(uniqueFlag, [panelStage(true)], config, {
        'stage-panel': [row('p1', { flagged: true })],
      }),
    ).toEqual([]);
  });

  it('folds a roster row onto the unique group its variable belongs to', () => {
    // The members share a single `unique` slot, so a row carrying one member's
    // value collides with a prompt fixing the other's.
    const conflicts = analyseFeasibility(
      codebookWith({
        token: { name: 'Token', type: 'boolean', validation: { unique: true } },
        flagged: {
          name: 'Flagged',
          type: 'boolean',
          validation: { sameAs: 'token' },
        },
      }),
      [rosterStage, panelStage(true)],
      config,
      { 'stage-roster': [row('r1', { token: true })] },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames.toSorted()).toEqual([
      'Flagged',
      'Token',
    ]);
    expect(conflicts[0]?.reason).toContain('a prompt and a roster row fix');
  });

  it('counts rows repeating one value as the single node they build', () => {
    // Three rows carrying `true` are one person holding it: the rest are passed
    // over. Without the prompt they collide with nothing at all.
    expect(
      analyseFeasibility(uniqueFlag, [rosterStage], config, {
        'stage-roster': ['r1', 'r2', 'r3'].map((id) =>
          row(id, { flagged: true }),
        ),
      }),
    ).toEqual([]);

    const conflicts = analyseFeasibility(
      uniqueFlag,
      [rosterStage, panelStage(true)],
      config,
      {
        'stage-roster': ['r1', 'r2', 'r3'].map((id) =>
          row(id, { flagged: true }),
        ),
      },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('on up to 2 nodes');
  });

  /**
   * A row no seed can draw carries nothing into the network, so the value it
   * holds collides with nothing either. The two ways a row dies are the two the
   * draw's own pass-over reads: a value its own variable's rules reject, and a
   * set of values leaving the draw no way to complete the node around them.
   */
  describe('a row the rules leave dead', () => {
    /** The flag, plus an age floor a row can be written below. */
    const flagAndAge = codebookWith({
      flagged: {
        name: 'Flagged',
        type: 'boolean',
        validation: { unique: true },
      },
      age: { name: 'Age', type: 'number', validation: { minValue: 18 } },
    });

    /**
     * The flag, plus a comparator inside a range with no room above 1: a row
     * carrying `age: 1` breaks no rule of its own and leaves `retired` nowhere
     * to go, so only the completability half of the verdict turns it away.
     */
    const flagAndComparator = codebookWith({
      flagged: {
        name: 'Flagged',
        type: 'boolean',
        validation: { unique: true },
      },
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 1 },
      },
      retired: {
        name: 'Retired at',
        type: 'number',
        validation: { minValue: 0, maxValue: 1, greaterThanVariable: 'age' },
      },
    });

    const stages = [rosterStage, panelStage(true)];

    /** Every value `flagged` holds across the network one seed builds. */
    function flagsDrawn(
      codebook: StructuralCodebook,
      externalData: Record<string, NcNode[]>,
      seed: number,
    ) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages,
        externalData,
      });
      return network.nodes.map(
        (node) => node[entityAttributesProperty].flagged,
      );
    }

    it('carries no value its own rules reject', () => {
      // The row is one no participant's form would have accepted, so the roster
      // stage draws nobody and the panel's node is the only holder of `true`.
      const dead = { 'stage-roster': [row('r1', { flagged: true, age: 5 })] };

      expect(analyseFeasibility(flagAndAge, stages, config, dead)).toEqual([]);

      for (let seed = 1; seed <= 20; seed++) {
        expect(flagsDrawn(flagAndAge, dead, seed), `seed ${seed}`).toEqual([
          true,
        ]);
      }
    });

    it('still refuses where the same row is one the draw can build', () => {
      // The other direction: an age the floor admits leaves a live row, and its
      // value and the prompt's are then two writers of one `unique` value.
      const live = { 'stage-roster': [row('r1', { flagged: true, age: 21 })] };
      const conflicts = analyseFeasibility(flagAndAge, stages, config, live);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.reason).toBe(
        'a prompt and a roster row fix this to true on up to 2 nodes, but unique allows one node to hold a value',
      );
    });

    it('carries no value the draw cannot complete a node around', () => {
      const dead = { 'stage-roster': [row('r1', { flagged: true, age: 1 })] };

      expect(
        analyseFeasibility(flagAndComparator, stages, config, dead),
      ).toEqual([]);

      for (let seed = 1; seed <= 20; seed++) {
        expect(
          flagsDrawn(flagAndComparator, dead, seed),
          `seed ${seed}`,
        ).toEqual([true]);
      }
    });

    it('still refuses where the completion the draw needs is there', () => {
      const live = { 'stage-roster': [row('r1', { flagged: true, age: 0 })] };
      const conflicts = analyseFeasibility(
        flagAndComparator,
        stages,
        config,
        live,
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.reason).toBe(
        'a prompt and a roster row fix this to true on up to 2 nodes, but unique allows one node to hold a value',
      );
    });

    it('reads a panel of a fabricating stage the same way', () => {
      // A name generator handed a panel draws its rows too, and the same rows
      // die the same way there. What differs is the merge the row is judged by:
      // the prompt's value wins a collision on this interface, and the roster's
      // wins on the other.
      const carrying = {
        id: 'stage-carry',
        type: 'NameGenerator',
        label: 'Carrying panel',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'c-p1', text: 'Name people' }],
        behaviours: { minNodes: 1, maxNodes: 1 },
      } as unknown as Stage;

      const dead = { 'stage-carry': [row('c1', { flagged: true, age: 5 })] };
      const live = { 'stage-carry': [row('c1', { flagged: true, age: 21 })] };

      expect(
        analyseFeasibility(
          flagAndAge,
          [carrying, panelStage(true)],
          config,
          dead,
        ),
      ).toEqual([]);
      expect(
        analyseFeasibility(
          flagAndAge,
          [carrying, panelStage(true)],
          config,
          live,
        ),
      ).toHaveLength(1);
    });
  });
});

/** The complete pedigree pins one ego flag and several non-ego flags. */
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

  const compactConfig = resolveGenerationConfig({
    today: '2026-07-27',
    familyPedigreeNodeCount: { min: 7, max: 7 },
  });

  const uniqueFlag = codebookWith({
    isEgo: { name: 'Is ego', type: 'boolean', validation: { unique: true } },
  });

  it('reports both the finite value space and the repeated fixed flag', () => {
    const conflicts = analyseFeasibility(
      uniqueFlag,
      [pedigree()],
      compactConfig,
    );

    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rules: ['unique'] }),
        expect.objectContaining({ rules: ['unique', 'egoVariable'] }),
      ]),
    );
  });

  it('reports repeated false even when the declared domain is wide enough', () => {
    const conflicts = analyseFeasibility(
      codebookWith({
        isEgo: {
          name: 'Is ego',
          type: 'number',
          validation: { unique: true, minValue: 0, maxValue: 20 },
        },
      }),
      [pedigree()],
      compactConfig,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique', 'egoVariable']);
    expect(conflicts[0]?.reason).toMatch(/false on up to 9 nodes/);
  });

  it('counts fixed values for every externally introduced contributor branch', () => {
    const shared = {
      nodeConfig: { type: 'person', egoVariable: 'isEgo' },
      edgeConfig: {
        type: 'kin',
        relationshipTypeVariable: 'relationshipType',
      },
    };
    const first = {
      ...pedigree('first-pedigree'),
      ...shared,
      boundaries: { requireChildrenContributors: 'off' },
    } as unknown as Stage;
    const pairing = {
      id: 'pair-relatives',
      type: 'Sociogram',
      label: 'Pair relatives',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'pair-prompt',
          text: 'Connect relatives',
          edges: { create: 'kin' },
        },
      ],
    } as unknown as Stage;
    const second = {
      ...pedigree('second-pedigree'),
      ...shared,
      boundaries: { requireChildrenContributors: 'required' },
    } as unknown as Stage;

    const conflicts = analyseFeasibility(
      codebookWith({
        isEgo: {
          name: 'Is ego',
          type: 'number',
          validation: { unique: true, minValue: 0, maxValue: 1000 },
        },
      }),
      [first, pairing, second],
      compactConfig,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique', 'egoVariable']);
    expect(conflicts[0]?.reason).toMatch(/false on up to 98 nodes/);
  });

  it('accepts an ego flag no rule holds unique', () => {
    const codebook = codebookWith({
      isEgo: { name: 'Is ego', type: 'boolean' },
    });

    expect(analyseFeasibility(codebook, [pedigree()], compactConfig)).toEqual(
      [],
    );
  });

  it('ignores a unique codebook variable no stage writes', () => {
    const stage = {
      ...pedigree(),
      nodeConfig: { type: 'person' },
    } as unknown as Stage;

    const conflicts = analyseFeasibility(uniqueFlag, [stage], compactConfig);
    expect(conflicts).toEqual([]);
  });

  it('names both protocol writers when a prompt and pedigree pin true', () => {
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
      codebookWith({
        isEgo: {
          name: 'Is ego',
          type: 'number',
          validation: { unique: true, minValue: 0, maxValue: 30 },
        },
      }),
      [fixingGenerator, pedigree()],
      compactConfig,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules.toSorted()).toEqual([
      'additionalAttributes',
      'egoVariable',
      'unique',
    ]);
    expect(conflicts[0]?.reason).toMatch(
      /true on up to 2 nodes and to false on up to 9 nodes/,
    );
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
      'a prompt fixes these attributes to false and true, which sameAs cannot hold',
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
      'a prompt fixes these attributes to true and true, which differentFrom cannot hold',
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
      'a prompt fixes this attribute to true, which options does not allow',
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
      'a prompt fixes this attribute to true, which minValue does not allow',
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

/**
 * A prompt fixing one end of a rule leaves the other end to the draw, and the
 * draw can be left nothing to satisfy it with: `applyComparatorBounds` keeps a
 * value inside its own bounds when a fixed counterpart pushes it past them, so
 * the stage emits an entity holding a pair the rule rejects rather than failing.
 *
 * Refused rather than skipped, which is where this parts company with a roster
 * row: a row is one candidate among many the draw passes over, while a prompt's
 * values are stated by the protocol and every entity the stage creates carries
 * them. And refused only where the complete search proves no completion exists,
 * since a false refusal here blocks a protocol nothing is wrong with.
 */
describe('a value one prompt fixes that the draw cannot complete', () => {
  function pinning(
    values: Record<string, boolean>[],
    type = 'NameGenerator',
  ): Stage {
    return {
      id: 'stage-pin',
      type,
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: values.map((set, index) => ({
        id: `p${index + 1}`,
        text: 'Name people',
        additionalAttributes: Object.entries(set).map(([variable, value]) => ({
          variable,
          value,
        })),
      })),
      // A floor below the ceiling, so the second prompt is one the stage can
      // still have capacity for: prompts share `maxNodes` and spend it in
      // order, and a prompt the ceiling leaves nothing for creates no node on
      // any seed and fixes nothing to judge.
      behaviours: { minNodes: 1, maxNodes: 2 },
    } as unknown as Stage;
  }

  /** `age` and `retired` on [0, ceiling], with `retired` strictly above `age`. */
  function agePair(ceiling: number): StructuralCodebook {
    return codebookWith({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: ceiling },
      },
      retired: {
        name: 'Retired',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: ceiling,
          greaterThanVariable: 'age',
        },
      },
    });
  }

  it('reports a fixed value that leaves its comparator nothing to satisfy it', () => {
    // `true` reads as 1, which is inside `age`'s own bounds — so nothing about
    // the value on its own is wrong. What no seed can supply is a `retired`
    // above it that is still at or under 1.
    const conflicts = analyseFeasibility(
      agePair(1),
      [pinning([{ age: true }])],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['Age', 'Retired']);
    expect(conflicts[0]?.rules).toContain('greaterThanVariable');
    expect(conflicts[0]?.rules).toContain('additionalAttributes');
    expect(conflicts[0]?.reason).toBe(
      'a prompt fixes "Age" to true, and no combination of values these rules allow can complete the rest around it',
    );
  });

  it('names the variable the protocol fixed rather than its codebook key', () => {
    // An Architect-authored protocol keys its variables by UUID, so a message
    // built from the key names nothing its author would recognise.
    const uuidKey = '5e2ba0a2-4e15-4b3b-8a3f-0a4a7a4e0b6f';
    const codebook = codebookWith({
      [uuidKey]: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 1 },
      },
      retired: {
        name: 'Retired',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 1,
          greaterThanVariable: uuidKey,
        },
      },
    });

    const conflicts = analyseFeasibility(
      codebook,
      [pinning([{ [uuidKey]: true }])],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('"Age"');
    expect(conflicts[0]?.reason).not.toContain(uuidKey);
    expect(conflicts[0]?.variableNames).toEqual(['Age', 'Retired']);
  });

  it('accepts a fixed value the rest of the entity can be drawn around', () => {
    // The same shape with room above the fixed value: `retired` has 2 to 5 to
    // draw from, so the protocol generates and must not be refused.
    expect(
      analyseFeasibility(agePair(5), [pinning([{ age: true }])], config),
    ).toEqual([]);
  });

  // A component the search declines to analyse is not thereby a component
  // nothing is known about. The search declining says only that no proof was
  // found; the draw still has to produce a value, and its own arithmetic says
  // outright what it can produce. These two hold that line from both sides — an
  // undecidable component whose fold the pin empties is refused, and one whose
  // fold survives is accepted — and only the pair states it. Either alone reads
  // as a rule that could be applied everywhere.
  //
  // The codebooks differ in one rule. `retired` carries a ceiling of 0 in the
  // first and none in the second; `age` is unbounded in both, which is what
  // keeps the domain unenumerable and the search silent either way.
  const unenumerable = (
    validation: Record<string, unknown>,
  ): StructuralCodebook =>
    codebookWith({
      age: { name: 'Age', type: 'number' },
      retired: { name: 'Retired', type: 'number', validation },
    });

  it('refuses a component the search declines to analyse whose fold the pin empties', () => {
    // Nothing is proven here and nothing needs to be. Folding `retired`'s
    // comparator against the pinned `age` puts its floor at 2 while its own
    // ceiling holds at 0, so the range handed to the draw is empty before the
    // clamp pulls it back — and the clamped value is one the comparison has
    // already been pushed past. Confirmed before this refusal existed: every
    // seed emitted `{ age: true, retired: 0 }` on every node, which the
    // interview's own `greaterThanVariable` validator rejects. No seed reaches
    // anything else and no roster row stands to be skipped, so the protocol is
    // turned away rather than left to generate data it cannot use.
    const codebook = unenumerable({
      maxValue: 0,
      greaterThanVariable: 'age',
    });
    const stages = [
      {
        id: 'stage-pin',
        type: 'NameGenerator',
        label: 'Name generator',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: 'p1',
            text: 'Name people',
            additionalAttributes: [{ variable: 'age', value: true }],
          },
        ],
        behaviours: { minNodes: 2, maxNodes: 2 },
      } as unknown as Stage,
    ];

    const conflicts = analyseFeasibility(codebook, stages, config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['Age', 'Retired']);
    expect(conflicts[0]?.rules).toContain('greaterThanVariable');
    expect(conflicts[0]?.rules).toContain('maxValue');
    expect(conflicts[0]?.rules).toContain('additionalAttributes');
    expect(conflicts[0]?.reason).toBe(
      'a prompt fixes "Age" to true, and every value the draw can give "Retired" breaks a comparison against it',
    );

    expect(() => generateNetwork({ codebook, stages, seed: 1 })).toThrow(
      SyntheticDataConstraintError,
    );
  });

  it('accepts a component the search declines to analyse whose fold survives', () => {
    // The same unenumerable pair without the ceiling. The pin puts `retired`'s
    // floor at 2 and leaves its ceiling open, so the fold is a range with
    // values in it and the draw has somewhere to go. Refusing here would block
    // a protocol that generates, which is the failure this pass has to avoid
    // more than any other — so the emitted network is read back to show the
    // acceptance was earned rather than lucky.
    const codebook = unenumerable({ greaterThanVariable: 'age' });
    const stages = [pinning([{ age: true }])];

    expect(analyseFeasibility(codebook, stages, config)).toEqual([]);

    const { network } = generateNetwork({ codebook, stages, seed: 1 });
    expect(network.nodes.length).toBeGreaterThan(0);
    for (const node of network.nodes) {
      const attributes = node[entityAttributesProperty];
      expect(attributes.age).toBe(true);
      expect(Number(attributes.retired)).toBeGreaterThan(1);
    }
  });

  it('judges each prompt of a stage on its own', () => {
    // `createNodesForStage` writes one prompt's `additionalAttributes` onto the
    // nodes that prompt creates and no others, so two prompts' values never meet
    // on one entity. Each of these is completable alone — the node carrying
    // `a` draws `b` false, and the node carrying `b` draws `a` false — and
    // reading them as one assignment would refuse a protocol that generates.
    const codebook = codebookWith({
      a: { name: 'A', type: 'boolean' },
      b: { name: 'B', type: 'boolean', validation: { differentFrom: 'a' } },
    });

    expect(
      analyseFeasibility(
        codebook,
        [pinning([{ a: true }, { b: true }])],
        config,
      ),
    ).toEqual([]);
  });

  it('still reports the one prompt of a stage whose own values cannot be completed', () => {
    // The first prompt is fine — `retired` at 1 leaves `age` 0 to draw — and the
    // second is the reviewer's case, so every prompt has to be judged, not just
    // the first.
    const conflicts = analyseFeasibility(
      agePair(1),
      [pinning([{ retired: true }, { age: true }])],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('a prompt fixes "Age" to true');
  });

  it('leaves a roster stage holding rows to the draw', () => {
    // A row's own value wins over the prompt's, so whether the prompt's value
    // reaches a node depends on the row. The draw passes over the rows it
    // cannot complete instead.
    expect(
      analyseFeasibility(
        agePair(1),
        [pinning([{ age: true }], 'NameGeneratorRoster')],
        config,
        {
          'stage-pin': [
            {
              [entityPrimaryKeyProperty]: 'r1',
              type: 'person',
              [entityAttributesProperty]: { age: 0 },
            } as unknown as NcNode,
          ],
        },
      ),
    ).toEqual([]);
  });

  it('accepts the same comparator pair on an edge type', () => {
    // Nothing fixes an edge value. `additionalAttributes` belongs to a
    // name-generator prompt, whose subject is always a node, and a census
    // prompt's `edgeVariable` names an edge variable without supplying a value
    // for it — `handleDyadCensus` draws it like any other attribute. So the
    // edge scope has nothing to complete around, and the pair that is refused
    // on a node stands here.
    const census = {
      id: 'stage-ts',
      type: 'TieStrengthCensus',
      label: 'Tie strength',
      subject: { entity: 'node', type: 'person' },
      createEdge: 'friend',
      prompts: [
        {
          id: 'p1',
          text: 'How close?',
          createEdge: 'friend',
          edgeVariable: 'closeness',
          negativeLabel: 'Not close',
        },
      ],
      introductionPanel: { title: 'Tie strength', text: 'How close?' },
    } as unknown as Stage;

    const codebook = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: { name: { name: 'Name', type: 'text' } },
        },
      },
      edge: {
        friend: {
          name: 'Friend',
          color: 'edge-color-seq-1',
          variables: {
            closeness: {
              name: 'Closeness',
              type: 'ordinal',
              options: [
                { label: 'Low', value: 1 },
                { label: 'High', value: 2 },
              ],
            },
            since: {
              name: 'Since',
              type: 'number',
              validation: { minValue: 0, maxValue: 1 },
            },
            until: {
              name: 'Until',
              type: 'number',
              validation: {
                minValue: 0,
                maxValue: 1,
                greaterThanVariable: 'since',
              },
            },
          },
        },
      },
    } as unknown as StructuralCodebook;

    expect(
      analyseFeasibility(codebook, [nameGenerator, census], config),
    ).toEqual([]);
  });
});

/**
 * A codebook may declare scopes the stage list never touches. Nothing draws a
 * value for such a scope's variables and nothing submits one, so a rule on them
 * is never applied — and refusing the whole protocol for it blocks interviews
 * the rules it declares are perfectly satisfiable for.
 *
 * The zeroes this pass sees are not the same zero, so these cover each in turn:
 * a node type nothing creates, an edge type whose edges exist while a variable
 * of theirs is never filled, and ego, which the network always carries while
 * its attributes stay empty until an ego-subject stage writes them.
 */
describe('a codebook scope no stage names', () => {
  const contradiction = {
    name: 'Code',
    type: 'text',
    validation: { minLength: 10, maxLength: 5 },
  };

  const person = {
    name: 'Person',
    color: 'node-color-seq-1',
    variables: { name: { name: 'Name', type: 'text' } },
  };

  const artefact = {
    name: 'Artefact',
    color: 'node-color-seq-2',
    variables: { code: contradiction },
  };

  it('accepts a contradiction on a node type no stage can create', () => {
    const codebook = {
      node: { person, artefact },
    } as unknown as StructuralCodebook;

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('accepts a contradiction on an edge type no stage can create', () => {
    const codebook = {
      node: { person },
      edge: {
        kin: {
          name: 'Kin',
          color: 'edge-color-seq-1',
          variables: { code: contradiction },
        },
      },
    } as unknown as StructuralCodebook;

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('still refuses the same contradiction on the type its stage creates', () => {
    const codebook = {
      node: {
        person: { ...person, variables: { code: contradiction } },
        artefact,
      },
    } as unknown as StructuralCodebook;

    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityTypeName).toBe('Person');
    expect(conflicts[0]?.reason).toBe('minLength 10 exceeds maxLength 5');
  });

  function artefactForm(): Stage {
    return {
      id: 'stage-af',
      type: 'AlterForm',
      label: 'Alter form',
      subject: { entity: 'node', type: 'artefact' },
      form: { fields: [{ variable: 'code', prompt: 'Code' }] },
    } as unknown as Stage;
  }

  const withArtefactContradiction = {
    node: { person, artefact },
  } as unknown as StructuralCodebook;

  it('drops a node type only an alter form names', () => {
    // Nothing fabricates an artefact, so the form writes onto nobody:
    // `handleAlterForm` walks `getStageFilteredNodes`, which is empty, and its
    // loop body never runs. The interview matches it — `AlterForm.tsx` computes
    // `mode === 'form' && items.length === 0`, calls `moveForward()` from an
    // effect and returns null, so no SlidesForm mounts and no Field renders.
    // A rule nothing applies must not refuse the protocol.
    expect(
      analyseFeasibility(
        withArtefactContradiction,
        [nameGenerator, artefactForm()],
        config,
      ),
    ).toEqual([]);
  });

  it('generates that protocol rather than moving the refusal to the draw', () => {
    // The premise the acceptance rests on: the form really does reach nobody.
    const { network } = generateNetwork({
      seed: 1,
      codebook: withArtefactContradiction,
      stages: [nameGenerator, artefactForm()],
    });

    expect(network.nodes.length).toBeGreaterThan(0);
    expect(network.nodes.some((node) => node.type === 'artefact')).toBe(false);
  });

  it('still refuses once any stage creates the type the form names', () => {
    // The drop is gated on the count, not on the form: give the artefacts a
    // maker and every one of them is born holding a `code`.
    const conflicts = analyseFeasibility(
      withArtefactContradiction,
      [
        nameGenerator,
        {
          ...nameGenerator,
          id: 'stage-ng-artefact',
          subject: { entity: 'node', type: 'artefact' },
        } as unknown as Stage,
        artefactForm(),
      ],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityTypeName).toBe('Artefact');
  });

  it('still keeps a zero-count type another kind of stage names', () => {
    // The fallback the two readers exist to give each other is untouched. Only
    // the two stages whose handlers provably write onto a population they did
    // not create are read this way; every other naming — a Sociogram's subject
    // here — keeps its type analysed, so a creating stage this counter fails to
    // model still cannot delete a refusal on its own.
    const sociogram = {
      id: 'stage-socio',
      type: 'Sociogram',
      label: 'Place them',
      subject: { entity: 'node', type: 'artefact' },
      prompts: [{ id: 'p1', text: 'Place them' }],
    } as unknown as Stage;

    const conflicts = analyseFeasibility(
      withArtefactContradiction,
      [nameGenerator, sociogram],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityTypeName).toBe('Artefact');
  });

  const egoCodebook = {
    ego: {
      variables: {
        code: contradiction,
        name: { name: 'Name', type: 'text' },
      },
    },
    node: { person },
  } as unknown as StructuralCodebook;

  it('accepts a contradiction on ego when no stage writes it', () => {
    // `generateNetwork` leaves `egoAttributes` empty for a stage list with no
    // ego-subject stage, so no value of `code` is drawn and none submitted.
    expect(analyseFeasibility(egoCodebook, [nameGenerator], config)).toEqual(
      [],
    );
  });

  it('still refuses the same contradiction once an EgoForm writes ego', () => {
    const conflicts = analyseFeasibility(
      egoCodebook,
      [nameGenerator, egoForm],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('ego');
    expect(conflicts[0]?.reason).toBe('minLength 10 exceeds maxLength 5');
  });

  it('keeps ego for an EgoForm whose fields name no ego variable', () => {
    // `handleEgoForm` draws the codebook's whole ego attribute set rather than
    // the fields its form declares, so a form still empty mid-edit — or one
    // naming other variables — draws `code` all the same. Read from the stage
    // rather than from the references its fields carry for exactly this case:
    // with the scope wrongly dropped the draw does not fail, it emits a value
    // the rule rejects.
    const emptyForm = { ...egoForm, form: { fields: [] } } as unknown as Stage;

    const conflicts = analyseFeasibility(
      egoCodebook,
      [nameGenerator, emptyForm],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('ego');
  });

  it('keeps ego for a stage the schema gives an ego subject', () => {
    // The other reader: the schema's own attribute tags resolve a form field's
    // `variable` against its stage's subject, so a stage type given the ego
    // subject the schema already defines keeps the scope analysed without this
    // pass learning its key. No shipped stage type carries that subject yet, so
    // one is built here by giving a stage an ego subject.
    const egoSubjectStage = {
      id: 'stage-es',
      type: 'AlterForm',
      label: 'Ego-subject stage',
      subject: { entity: 'ego' },
      form: { fields: [{ variable: 'code', prompt: 'Code' }] },
    } as unknown as Stage;

    const conflicts = analyseFeasibility(
      egoCodebook,
      [nameGenerator, egoSubjectStage],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('ego');
  });
});

/**
 * The edge half of the same question, one level finer. A pedigree edge is the
 * one entity born with no attributes, so its type is created while a variable
 * of it may never be written at all — and a rule is applied where a value is
 * written, not where a type exists. These cover the acceptance and, for each
 * way a writer can reach the variable, the refusal that has to keep standing.
 */
describe('a pedigree edge variable no stage writes', () => {
  const contradiction = {
    name: 'Code',
    type: 'text',
    validation: { minLength: 10, maxLength: 5 },
  };

  const person = {
    name: 'Person',
    color: 'node-color-seq-1',
    variables: { name: { name: 'Name', type: 'text' } },
  };

  const pedigree = {
    id: 'stage-fp',
    type: 'FamilyPedigree',
    label: 'Pedigree',
    nodeConfig: { type: 'person' },
    edgeConfig: { type: 'kin' },
    prompts: [],
  } as unknown as Stage;

  function edgeForm(...variables: string[]): Stage {
    return {
      id: 'stage-aef',
      type: 'AlterEdgeForm',
      label: 'About this tie',
      subject: { entity: 'edge', type: 'kin' },
      form: {
        fields: variables.map((variable) => ({ variable, prompt: 'Tell us' })),
      },
    } as unknown as Stage;
  }

  function codebookWithEdgeVariables(
    variables: Record<string, unknown>,
  ): StructuralCodebook {
    return {
      node: { person },
      edge: {
        kin: { name: 'Kin', color: 'edge-color-seq-1', variables },
      },
    } as unknown as StructuralCodebook;
  }

  const codeOnly = codebookWithEdgeVariables({ code: contradiction });

  it('accepts a contradiction nothing writes', () => {
    // This partial fixture names no semantic edge variable, so no value of
    // `code` is ever drawn or submitted and its rules are never applied.
    expect(analyseFeasibility(codeOnly, [pedigree], config)).toEqual([]);
  });

  it('generates that protocol rather than moving the refusal to the draw', () => {
    // The premise the acceptance rests on: the edges really do exist, and
    // really do hold nothing.
    const { network } = generateNetwork({
      seed: 1,
      codebook: codeOnly,
      stages: [pedigree],
    });

    expect(network.edges.length).toBeGreaterThan(0);
    expect(
      network.edges.every(
        (edge) => edge[entityAttributesProperty].code === undefined,
      ),
    ).toBe(true);
  });

  it('still refuses where a form after the pedigree renders it', () => {
    const conflicts = analyseFeasibility(
      codeOnly,
      [pedigree, edgeForm('code')],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('edge');
    expect(conflicts[0]?.entityTypeName).toBe('Kin');
    expect(conflicts[0]?.reason).toBe('minLength 10 exceeds maxLength 5');
  });

  it('exempts only the variables the form leaves out', () => {
    // `handleAlterEdgeForm` passes its field list to `generateEntityAttributes`
    // as `only`, so the exemption is per variable and not per type: the same
    // edges carry `note` and no `code`.
    const bothContradict = codebookWithEdgeVariables({
      code: contradiction,
      note: { name: 'Note', type: 'text', validation: { minLength: 9 } },
    });

    const conflicts = analyseFeasibility(
      bothContradict,
      [pedigree, edgeForm('note')],
      config,
    );

    expect(conflicts).toEqual([]);

    const both = analyseFeasibility(
      codebookWithEdgeVariables({
        code: contradiction,
        note: { ...contradiction, name: 'Note' },
      }),
      [pedigree, edgeForm('note')],
      config,
    );

    expect(both).toHaveLength(1);
    expect(both[0]?.variableNames).toEqual(['Note']);
  });

  it('still refuses where the form renders a variable held equal to it', () => {
    // The members share one value, so writing `mirror` writes the group's
    // value: reading the exemption per variable would exempt the very member
    // carrying the contradiction.
    const heldEqual = codebookWithEdgeVariables({
      code: contradiction,
      mirror: { name: 'Mirror', type: 'text', validation: { sameAs: 'code' } },
    });

    const conflicts = analyseFeasibility(
      heldEqual,
      [pedigree, edgeForm('mirror')],
      config,
    );

    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]?.variableNames).toEqual(['Code']);
    expect(conflicts[1]?.variableNames).toEqual(['Code', 'Mirror']);
  });

  it('still refuses where a TieStrengthCensus writes it onto reused edges', () => {
    // The second writer of edges it did not create: its `edgeVariable` is
    // filled over the pedigree's edges as well as its own new ones.
    const census = {
      id: 'stage-tsc',
      type: 'TieStrengthCensus',
      label: 'How close?',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'How close are they?',
          createEdge: 'kin',
          edgeVariable: 'closeness',
          negativeLabel: 'Not close',
        },
      ],
    } as unknown as Stage;

    const conflicts = analyseFeasibility(
      codebookWithEdgeVariables({
        closeness: {
          name: 'Closeness',
          type: 'ordinal',
          options: [{ label: 'Close', value: 1 }],
          validation: { minSelected: 2 },
        },
      }),
      [pedigree, census],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityTypeName).toBe('Kin');
  });

  it('still refuses where another stage creates edges of the type filled', () => {
    // Only a pedigree's edges are born empty. A Sociogram generates the whole
    // attribute set of every edge it creates, so `code` is on all of them
    // whether or not a form ever mentions it.
    const sociogram = {
      id: 'stage-sociogram',
      type: 'Sociogram',
      label: 'Link them',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Who knows who?',
          layout: { layoutVariable: 'layout' },
          edges: { create: 'kin' },
        },
      ],
    } as unknown as Stage;

    const conflicts = analyseFeasibility(
      codeOnly,
      [nameGenerator, sociogram],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityTypeName).toBe('Kin');
  });

  it('drops an edge type only an alter form names', () => {
    // The node half's rule: with the pedigree gone nothing builds a `kin` edge,
    // so `handleAlterEdgeForm` walks an empty `getStageFilteredEdges` and
    // writes onto nobody — and `AlterEdgeForm.tsx` advances past an empty item
    // list without mounting a SlidesForm, so no Field renders either.
    expect(analyseFeasibility(codeOnly, [edgeForm('code')], config)).toEqual(
      [],
    );
  });

  it('still refuses where a census creates the edges that form fills', () => {
    // The drop is gated on the count: a stage that creates `kin` edges puts
    // every variable of the type back in play.
    const census = {
      id: 'stage-dc',
      type: 'DyadCensus',
      label: 'Related?',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Are they related?', createEdge: 'kin' }],
    } as unknown as Stage;

    const conflicts = analyseFeasibility(
      codeOnly,
      [nameGenerator, census, edgeForm('code')],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityTypeName).toBe('Kin');
  });

  it('accepts it where the only form runs before the pedigree', () => {
    // A form fills the edges standing when it runs, and the pedigree's do not
    // exist yet — so its edges reach nobody and stay as they were built.
    expect(
      analyseFeasibility(codeOnly, [edgeForm('code'), pedigree], config),
    ).toEqual([]);
  });

  /**
   * Why the exemption above is all-or-nothing across an equality group, stated
   * as the property that decides it: the value a form's field ends up holding
   * is drawn against every member's bounds, including members the form never
   * renders and the draw never emits.
   *
   * `handleAlterEdgeForm` passes only its field ids to
   * `generateEntityAttributes` as `only`, and that set decides what is EMITTED:
   * a group with any member in it is drawn, and `produced[id]` is written only
   * for the members `only` holds. What the group is drawn AGAINST is settled
   * elsewhere — `plan.groups` comes from `intersectGroupConstraints` over the
   * whole entity, which folds every member's bounds into one range. So an
   * unrendered sibling's floor is applied to the rendered member's value, and a
   * group whose members' bounds do not overlap has no value the draw can give
   * the field the participant actually sees.
   */
  describe('a group only one of whose members a form renders', () => {
    const pair = {
      source: {
        name: 'Source',
        type: 'text',
        validation: { minLength: 10 },
      },
      confirm: {
        name: 'Confirm',
        type: 'text',
        validation: { maxLength: 5, sameAs: 'source' },
      },
    };

    it('refuses bounds the rendered member alone would satisfy', () => {
      // Neither variable contradicts itself, and no writer ever populates
      // `source`. Held equal, they leave the draw no value at all.
      const conflicts = analyseFeasibility(
        codebookWithEdgeVariables(pair),
        [pedigree, edgeForm('confirm')],
        config,
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.variableNames).toEqual(['Source', 'Confirm']);
      expect(conflicts[0]?.reason).toBe(
        'these attributes are held to a single value, but their bounds do not ' +
          'overlap: minLength 10 exceeds maxLength 5',
      );
    });

    it('is what the draw does with that group, not a stricter reading of it', () => {
      // The refusal's premise, run: `only` keeps `source` out of the emitted
      // attributes, and `source`'s floor still lands on the value `confirm`
      // holds — ten characters, which `confirm`'s own maxLength rejects. The
      // interview would refuse that submission, which is the defect this pass
      // exists to remove rather than a protocol it should have generated.
      const attributes = generateEntityAttributes(
        buildEntityConstraints(pair as unknown as Variables, config.today),
        makeDrawContext(),
        { entity: 'edge', type: 'kin' },
        0,
        { only: new Set(['confirm']) },
      );

      expect(attributes.source).toBeUndefined();
      expect(typeof attributes.confirm).toBe('string');
      expect(attributes.confirm).toHaveLength(10);
    });

    it('exempts the group where the form renders neither member', () => {
      // The other direction: with nothing of the group named, no writer reaches
      // it, every edge leaves both undefined, and the same bounds are accepted.
      const withNote = codebookWithEdgeVariables({
        ...pair,
        note: { name: 'Note', type: 'text' },
      });

      expect(
        analyseFeasibility(withNote, [pedigree, edgeForm('note')], config),
      ).toEqual([]);

      const { network } = generateNetwork({
        seed: 1,
        codebook: withNote,
        stages: [pedigree, edgeForm('note')],
      });

      expect(network.edges.length).toBeGreaterThan(0);
      expect(
        network.edges.every((edge) => {
          const attributes = edge[entityAttributesProperty];
          return (
            attributes.source === undefined && attributes.confirm === undefined
          );
        }),
      ).toBe(true);
    });
  });
});

/**
 * The same question one step coarser: not which variable of a type is written,
 * but whether the stage naming the type does anything at all. A content stage
 * names its subject through the very tags a name generator does while
 * `generateNetwork` runs no handler for it, so a type only such a stage names
 * has no entity to carry a value — and the reading has to come from the
 * dispatch, which is why each acceptance below is paired with what the
 * generator actually builds.
 */
describe('a codebook scope only a content stage names', () => {
  const contradiction = {
    name: 'Code',
    type: 'text',
    validation: { minLength: 10, maxLength: 5 },
  };

  const plainPerson = {
    name: 'Person',
    color: 'node-color-seq-1',
    variables: { name: { name: 'Name', type: 'text' } },
  };

  const person = { ...plainPerson, variables: { code: contradiction } };

  function narrative(displayed?: string[]): Stage {
    return {
      id: 'stage-nr',
      type: 'Narrative',
      label: 'Narrative',
      subject: { entity: 'node', type: 'person' },
      presets: [
        {
          id: 'preset-1',
          label: 'Ties',
          layoutVariable: 'layout',
          ...(displayed ? { edges: { display: displayed } } : {}),
        },
      ],
    } as unknown as Stage;
  }

  const nodeCodebook = { node: { person } } as unknown as StructuralCodebook;

  it('accepts a contradiction on a node type only a Narrative displays', () => {
    expect(analyseFeasibility(nodeCodebook, [narrative()], config)).toEqual([]);
  });

  it('builds no node of that type, which is what the acceptance rests on', () => {
    const { network } = generateNetwork({
      codebook: nodeCodebook,
      stages: [narrative()],
      seed: 1,
    });

    expect(network.nodes).toEqual([]);
    expect(network.edges).toEqual([]);
  });

  it('runs no handler for any content stage type', () => {
    // The ground the classification stands on, read from the dispatch rather
    // than from intuition about stage names: a lone stage of each listed type
    // leaves the network exactly as `generateNetwork` starts it. A handler
    // taught to create or write for one of these would fail here first.
    const codebook = {
      node: { person: plainPerson },
    } as unknown as StructuralCodebook;

    for (const type of CONTENT_STAGE_TYPES) {
      const stage = {
        id: `stage-${type}`,
        type,
        label: type,
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p1', text: 'Read this' }],
      } as unknown as Stage;

      const { network } = generateNetwork({
        codebook,
        stages: [stage],
        seed: 1,
      });

      expect(network.nodes, `${type} built nodes`).toEqual([]);
      expect(network.edges, `${type} built edges`).toEqual([]);
      expect(
        network.ego[entityAttributesProperty],
        `${type} wrote ego`,
      ).toEqual({});
    }
  });

  it('refuses a stage type neither the dispatch nor the list knows', () => {
    // The other half of the same switch: what keeps the content list honest is
    // that removing a type from it lands the stage here. An unrecognised type
    // is read as a writer above, so its scopes stay analysed — which costs
    // nothing, since the run refuses outright either way.
    const unknownStage = {
      id: 'stage-unknown',
      type: 'SomeNewStageType',
      label: 'Unknown',
    } as unknown as Stage;

    expect(() =>
      generateNetwork({
        codebook: {
          node: { person: plainPerson },
        } as unknown as StructuralCodebook,
        stages: [unknownStage],
        seed: 1,
      }),
    ).toThrow(/Unsupported stage type "SomeNewStageType"/);
  });

  it('still refuses the contradiction where a name generator creates the type', () => {
    const conflicts = analyseFeasibility(
      nodeCodebook,
      [nameGenerator, narrative()],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityTypeName).toBe('Person');
    expect(conflicts[0]?.reason).toBe('minLength 10 exceeds maxLength 5');
  });

  const edgeCodebook = {
    node: { person: plainPerson },
    edge: {
      kin: {
        name: 'Kin',
        color: 'edge-color-seq-1',
        variables: { code: contradiction },
      },
    },
  } as unknown as StructuralCodebook;

  it('accepts a contradiction on an edge type only a Narrative preset displays', () => {
    expect(
      analyseFeasibility(
        edgeCodebook,
        [nameGenerator, narrative(['kin'])],
        config,
      ),
    ).toEqual([]);
  });

  it('still refuses it for every stage that can create the edge', () => {
    const sociogram = {
      id: 'stage-sg',
      type: 'Sociogram',
      label: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Draw ties', edges: { create: 'kin' } }],
    } as unknown as Stage;

    const dyadCensus = {
      id: 'stage-dc',
      type: 'DyadCensus',
      label: 'Dyad census',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Do these two know each other?', createEdge: 'kin' },
      ],
    } as unknown as Stage;

    const composer = {
      id: 'stage-nc',
      type: 'NetworkComposer',
      label: 'Composer',
      subject: { entity: 'node', type: 'person' },
      edges: [{ subject: { entity: 'edge', type: 'kin' } }],
    } as unknown as Stage;

    for (const creator of [sociogram, dyadCensus, composer]) {
      const conflicts = analyseFeasibility(
        edgeCodebook,
        [nameGenerator, creator, narrative(['kin'])],
        config,
      );

      expect(conflicts, `${creator.type} lost its edge scope`).toHaveLength(1);
      expect(conflicts[0]?.entityTypeName).toBe('Kin');
    }
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

/**
 * The schema bounds neither length rule, so an imported protocol can declare a
 * text floor no run can materialise. Refused from the declared rule alone —
 * before a seed is consulted, and before anything builds, pads or measures a
 * string of that length.
 */
describe('a text length beyond what a generated value can hold', () => {
  const overCap = {
    name: 'Bio',
    type: 'text',
    validation: { minLength: 1_000_000_000 },
  };

  it('refuses it without allocating a value of that length', () => {
    const codebook = codebookWith({ bio: overCap });

    const started = performance.now();
    const conflicts = analyseFeasibility(codebook, [nameGenerator], config);
    const elapsed = performance.now() - started;

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['Bio']);
    expect(conflicts[0]?.rules).toEqual(['minLength']);
    expect(conflicts[0]?.reason).toBe(
      `minLength 1000000000 exceeds the ${MAX_TEXT_DRAW_LENGTH} characters a generated value can hold`,
    );
    // A billion-character `padEnd` throws `RangeError: Invalid string length`,
    // and the merely-huge floors below it allocate hundreds of megabytes. This
    // pass reads the number and stops, so neither is on its path.
    expect(elapsed).toBeLessThan(1000);
  });

  it('names the variable rather than its codebook key', () => {
    // An Architect-authored protocol keys its variables by UUID, which names
    // nothing the researcher reading the refusal would recognise.
    const key = '3f2b81c6-5a4d-42e9-9a17-6c8de4b0f512';
    const conflicts = analyseFeasibility(
      codebookWith({ [key]: overCap }),
      [nameGenerator],
      config,
    );

    expect(conflicts[0]?.variableNames).toEqual(['Bio']);
    expect(conflicts[0]?.variableIds).toEqual([key]);
  });

  it('refuses it on ego', () => {
    const codebook = {
      ego: { variables: { bio: overCap } },
    } as unknown as StructuralCodebook;

    const conflicts = analyseFeasibility(codebook, [egoForm], config);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('ego');
    expect(conflicts[0]?.variableNames).toEqual(['Bio']);
  });

  it('refuses it on an edge type', () => {
    const pedigree = {
      id: 'stage-fp',
      type: 'FamilyPedigree',
      label: 'Pedigree',
      nodeConfig: { type: 'person' },
      edgeConfig: { type: 'kin' },
      prompts: [],
    } as unknown as Stage;

    // A pedigree edge is born empty, so the floor is only ever asked of one
    // whose value some later stage writes — see `unwrittenEdgeVariables`.
    const edgeForm = {
      id: 'stage-aef',
      type: 'AlterEdgeForm',
      label: 'About this tie',
      subject: { entity: 'edge', type: 'kin' },
      form: { fields: [{ variable: 'bio', prompt: 'Bio' }] },
    } as unknown as Stage;

    const codebook = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: { name: { name: 'Name', type: 'text' } },
        },
      },
      edge: {
        kin: {
          name: 'Kin',
          color: 'edge-color-seq-1',
          variables: { bio: overCap },
        },
      },
    } as unknown as StructuralCodebook;

    const conflicts = analyseFeasibility(
      codebook,
      [pedigree, edgeForm],
      config,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('edge');
    expect(conflicts[0]?.entityTypeName).toBe('Kin');
    expect(conflicts[0]?.variableNames).toEqual(['Bio']);
  });

  it('accepts a floor at the cap', () => {
    const codebook = codebookWith({
      bio: {
        name: 'Bio',
        type: 'text',
        validation: { minLength: MAX_TEXT_DRAW_LENGTH },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });

  it('accepts a ceiling above the cap, which a shorter draw satisfies', () => {
    // Only `minLength` forces a length. A `maxLength` past the cap is met by
    // drawing shorter, so refusing it would turn away a protocol whose data is
    // perfectly generatable.
    const codebook = codebookWith({
      bio: {
        name: 'Bio',
        type: 'text',
        validation: { maxLength: 1_000_000_000, unique: true },
      },
    });

    expect(analyseFeasibility(codebook, [nameGenerator], config)).toEqual([]);
  });
});

describe('roster rows the rules turn away, at the seam the counts feed', () => {
  // The collector excludes a row whose merged values its own rules reject —
  // statically dead on every seed — and this is the wiring that hands it the
  // constraints the draw judges by. Without the lookup the counter reads the
  // whole pool, and this protocol was refused for three edges the run never
  // creates.
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          age: { name: 'Age', type: 'number', validation: { minValue: 18 } },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          strength: {
            name: 'Strength',
            type: 'boolean',
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as StructuralCodebook;

  const roster = {
    id: 'stage-roster',
    type: 'NameGeneratorRoster',
    label: 'Roster',
    subject: { entity: 'node', type: 'person' },
    dataSource: 'roster-asset',
    prompts: [{ id: 'p1', text: 'Pick people' }],
    behaviours: { maxNodes: 3 },
  } as unknown as Stage;

  const census = {
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
    ],
  } as unknown as Stage;

  function ages(...values: number[]): Record<string, NcNode[]> {
    return {
      'stage-roster': values.map(
        (age, index) =>
          ({
            [entityPrimaryKeyProperty]: `r${index}`,
            type: 'person',
            [entityAttributesProperty]: { age },
          }) as unknown as NcNode,
      ),
    };
  }

  it('accepts a census over people no row can become', () => {
    const externalData = ages(5, 6, 7);

    expect(
      analyseFeasibility(codebook, [roster, census], config, externalData),
    ).toEqual([]);
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: codebook as Parameters<typeof generateNetwork>[0]['codebook'],
        stages: [roster, census],
        externalData,
      }),
    ).not.toThrow();
  });

  it('still refuses when the rows really do become people', () => {
    // Three admitted rows make three pairs, and a two-value unique domain
    // cannot cover them — the refusal the shape above must not lose.
    const conflicts = analyseFeasibility(
      codebook,
      [roster, census],
      config,
      ages(21, 22, 23),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toMatch(
      /up to 3 edges of this type can be generated/,
    );
  });
});
