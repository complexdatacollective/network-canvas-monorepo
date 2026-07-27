import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variables,
} from '@codaco/protocol-validation';

import { buildEntityConstraints } from '../buildConstraints';
import type { DateResolution } from '../dateWindow';
import { resolveGenerationOrder } from '../dependencyOrder';
import {
  comparatorBound,
  emptyGroupBounds,
  groupComparatorEdges,
  intersectGroupConstraints,
  propagateComparatorBounds,
} from '../groupConstraints';
import type { ConstrainedVariable, EntityConstraints } from '../types';

const TODAY = '2026-07-27';

function propagate(entity: EntityConstraints) {
  const { order, membersOf, groupOf } = resolveGenerationOrder(entity);

  return propagateComparatorBounds(
    intersectGroupConstraints(entity, membersOf),
    order,
    groupComparatorEdges(entity, groupOf),
  );
}

function chain(minValue: number, maxValue: number): EntityConstraints {
  return buildEntityConstraints(
    {
      a: { name: 'A', type: 'number', validation: { minValue, maxValue } },
      b: {
        name: 'B',
        type: 'number',
        validation: {
          minValue,
          maxValue,
          greaterThanVariable: asEntityAttributeReference('a'),
        },
      },
      c: {
        name: 'C',
        type: 'number',
        validation: {
          minValue,
          maxValue,
          greaterThanVariable: asEntityAttributeReference('b'),
        },
      },
    },
    TODAY,
  );
}

/** Datetime variables over one window, each strictly after the one before. */
function dateChain(
  ids: readonly string[],
  parameters: { type: 'full' | 'month' | 'year'; min: string; max: string },
): EntityConstraints {
  const variables: Variables = {};

  ids.forEach((id, index) => {
    const previous = ids[index - 1];
    variables[id] = {
      name: id.toUpperCase(),
      type: 'datetime',
      parameters,
      ...(previous === undefined
        ? {}
        : {
            validation: {
              greaterThanVariable: asEntityAttributeReference(previous),
            },
          }),
    };
  });

  return buildEntityConstraints(variables, TODAY);
}

function labelled(values: number[]) {
  return values.map((value) => ({ label: `Option ${value}`, value }));
}

function groupsOf(entity: EntityConstraints) {
  return intersectGroupConstraints(
    entity,
    resolveGenerationOrder(entity).membersOf,
  );
}

/** Every crossing the entity's multi-member groups leave nothing between. */
function crossings(entity: EntityConstraints) {
  const { membersOf } = resolveGenerationOrder(entity);
  const groups = intersectGroupConstraints(entity, membersOf);

  return [...membersOf].flatMap(([group, memberIds]) => {
    const intersected = groups.get(group);
    if (intersected === undefined || memberIds.length < 2) return [];

    const members = memberIds.flatMap((id) => {
      const member = entity.get(id);
      return member === undefined ? [] : [member];
    });

    return emptyGroupBounds(members, intersected.constraints);
  });
}

/** Two ordinals held equal, each offering the values it is given. */
function heldEqualOrdinals(a: number[], b: number[]): EntityConstraints {
  return buildEntityConstraints(
    {
      a: { name: 'Rating A', type: 'ordinal', options: labelled(a) },
      b: {
        name: 'Rating B',
        type: 'ordinal',
        options: labelled(b),
        validation: { sameAs: asEntityAttributeReference('a') },
      },
    },
    TODAY,
  );
}

function optionValues(variable: ConstrainedVariable | undefined) {
  return variable?.entry.options?.map((option) => option.value);
}

describe('intersectGroupConstraints', () => {
  it('offers a group only the option values every member of it can hold', () => {
    const groups = groupsOf(heldEqualOrdinals([1, 2, 3], [2, 3, 4]));

    expect(optionValues(groups.get('a'))).toEqual([2, 3]);
  });

  it('leaves the options alone when a member has no options of its own', () => {
    // `emptyGroupBounds` refuses this group for its types; the intersection
    // still has to leave the ordinal something rather than emptying its list
    // over a member that was never going to contribute one.
    const entity = buildEntityConstraints(
      {
        a: { name: 'Rating A', type: 'ordinal', options: labelled([1, 2]) },
        b: {
          name: 'Note',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(optionValues(groupsOf(entity).get('a'))).toEqual([1, 2]);
  });

  it('keeps the options it was given when the members share none', () => {
    // The feasibility pass refuses this protocol; until it does, a value one
    // member can hold beats the empty option list that draws nothing at all.
    const groups = groupsOf(heldEqualOrdinals([1, 2], [3, 4]));

    expect(optionValues(groups.get('a'))).toEqual([1, 2]);
  });
});

describe('emptyGroupBounds', () => {
  it('reports options the members of a group share none of', () => {
    expect(crossings(heldEqualOrdinals([1, 2], [3, 4]))).toEqual([
      {
        rules: ['options'],
        detail:
          'the options offered by "Rating A" (1, 2) and by "Rating B" (3, 4) have no value in common',
      },
    ]);
  });

  it('reports nothing when the members share an option', () => {
    expect(crossings(heldEqualOrdinals([1, 2], [2, 3]))).toEqual([]);
  });

  it('reports nothing about options when only one member has any', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'Rating A', type: 'ordinal', options: labelled([1, 2]) },
        b: {
          name: 'Note',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    // The types are what is wrong with this pairing, and the only thing
    // reported: an ordinal's option list is not narrowed by a member that has
    // none, so there is no options conflict to name alongside it.
    expect(crossings(entity).map(({ rules }) => rules)).toEqual([['type']]);
  });

  it('leaves a lone member falling short of its own to the per-variable check', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'Foods A',
          type: 'categorical',
          options: labelled([1, 2]),
          validation: { minSelected: 3 },
        },
        b: {
          name: 'Note',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity).map(({ rules }) => rules)).toEqual([['type']]);
  });

  it('reports a minSelected the options left to the group cannot fill', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'Foods A',
          type: 'categorical',
          options: labelled([1, 2, 3]),
          validation: { minSelected: 2 },
        },
        b: {
          name: 'Foods B',
          type: 'categorical',
          options: labelled([3, 4, 5]),
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['minSelected', 'options'],
        detail:
          'minSelected 2 exceeds the 1 option shared by "Foods A" (1, 2, 3) and by "Foods B" (3, 4, 5)',
      },
    ]);
  });

  it('says when a member already falls short of its own minSelected', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'Foods A',
          type: 'categorical',
          options: labelled([1, 2]),
          validation: { minSelected: 3 },
        },
        b: {
          name: 'Foods B',
          type: 'categorical',
          options: labelled([1, 2]),
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['minSelected', 'options'],
        detail:
          'minSelected 3 exceeds the 2 options shared by "Foods A" (1, 2) and by "Foods B" (1, 2), which one of these variables already declares on its own',
      },
    ]);
  });

  it('reports the types of a group whose members hold different ones', () => {
    // `sameAs` names a variable id and the schema asks nothing of the type it
    // names, so this is a protocol a researcher can write today. Drawn, it
    // leaves the boolean's attribute holding the text value.
    const entity = buildEntityConstraints(
      {
        a: { name: 'Note', type: 'text' },
        b: {
          name: 'Flag',
          type: 'boolean',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['type'],
        detail:
          'the types of "Note" (text) and "Flag" (boolean) have no value in common',
      },
    ]);
  });

  it('reports the types of an ordinal held equal to a categorical', () => {
    // Drawing from options is not enough to share a value: a categorical value
    // is an array of option values and an ordinal value is a single one.
    const entity = buildEntityConstraints(
      {
        a: { name: 'Rating', type: 'ordinal', options: labelled([1, 2]) },
        b: {
          name: 'Foods',
          type: 'categorical',
          options: labelled([1, 2]),
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['type'],
        detail:
          'the types of "Rating" (ordinal) and "Foods" (categorical) have no value in common',
      },
    ]);
  });

  it('reports nothing about the types of a group that shares one', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'Note A', type: 'text' },
        b: {
          name: 'Note B',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([]);
  });

  it('leaves a number held equal to a scalar to its bounds', () => {
    // Both are drawn as plain numbers, and the scalar's 0-1 scale reaches the
    // group as minValue/maxValue, so the bounds already say whatever there is
    // to say about which values the two can share. The number declares the
    // rule because the schema gives `scalar` no `sameAs` of its own.
    const entity = buildEntityConstraints(
      {
        a: { name: 'Weight', type: 'scalar' },
        b: {
          name: 'Count',
          type: 'number',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([]);
  });

  it('reports a number whose declared range the scalar scale excludes', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'Weight', type: 'scalar' },
        b: {
          name: 'Count',
          type: 'number',
          validation: {
            minValue: 5,
            maxValue: 10,
            sameAs: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    expect(crossings(entity)).toEqual([
      {
        rules: ['minValue', 'maxValue'],
        detail: 'minValue 5 exceeds maxValue 1',
      },
    ]);
  });
});

describe('propagateComparatorBounds', () => {
  it('raises floors along the chain and lowers ceilings back down it', () => {
    const { groups, inverted } = propagate(chain(0, 3));

    expect(groups.get('a')?.constraints.minValue).toBe(0);
    expect(groups.get('a')?.constraints.maxValue).toBe(1);
    expect(groups.get('b')?.constraints.minValue).toBe(1);
    expect(groups.get('b')?.constraints.maxValue).toBe(2);
    expect(groups.get('c')?.constraints.minValue).toBe(2);
    expect(groups.get('c')?.constraints.maxValue).toBe(3);
    expect([...inverted]).toEqual([]);
  });

  it('gives a variable that declares no bounds the ceiling its comparison implies', () => {
    const entity = buildEntityConstraints(
      {
        score: {
          name: 'Score',
          type: 'number',
          validation: { minValue: 0, maxValue: 10 },
        },
        baseline: {
          name: 'Baseline',
          type: 'number',
          validation: { lessThanVariable: asEntityAttributeReference('score') },
        },
      },
      TODAY,
    );

    const { groups, inverted } = propagate(entity);

    expect(groups.get('baseline')?.constraints.maxValue).toBe(9);
    expect(groups.get('baseline')?.constraints.minValue).toBeUndefined();
    expect([...inverted]).toEqual([]);
  });

  it('reports every group a chain too long for its range leaves nothing for', () => {
    const { groups, inverted } = propagate(chain(0, 1));

    expect([...inverted].toSorted()).toEqual(['a', 'b', 'c']);
    // The declared bounds are kept, so a draw made before the feasibility pass
    // refuses the protocol still lands inside them.
    expect(groups.get('a')?.constraints).toMatchObject({
      minValue: 0,
      maxValue: 1,
    });
  });

  it('leaves a group inverted by its own bounds out of the report', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 50, maxValue: 20 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 100,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    expect([...propagate(entity).inverted]).toEqual([]);
  });

  it('steps a day off each end of a comparison between two dates', () => {
    const { groups, inverted } = propagate(
      dateChain(['start', 'end'], {
        type: 'full',
        min: '2026-01-01',
        max: '2026-01-31',
      }),
    );

    expect(groups.get('end')?.constraints.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-01-02',
      max: '2026-01-31',
    });
    expect(groups.get('start')?.constraints.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-01-01',
      max: '2026-01-30',
    });
    expect([...inverted]).toEqual([]);
  });

  it('steps in the unit of the resolution the two dates are written at', () => {
    const { groups } = propagate(
      dateChain(['start', 'end'], {
        type: 'month',
        min: '2026-01',
        max: '2026-06',
      }),
    );

    expect(groups.get('end')?.constraints.dateWindow?.min).toBe('2026-02');
    expect(groups.get('start')?.constraints.dateWindow?.max).toBe('2026-05');
  });

  it('reports a chain of dates too long for the years it has', () => {
    const { groups, inverted } = propagate(
      dateChain(['a', 'b', 'c'], { type: 'year', min: '2026', max: '2027' }),
    );

    expect([...inverted].toSorted()).toEqual(['a', 'b', 'c']);
    expect(groups.get('a')?.constraints.dateWindow).toEqual({
      resolution: 'year',
      min: '2026',
      max: '2027',
    });
  });

  it('rewrites a bound crossing between two resolutions into the units it lands in', () => {
    // The runtime parses both ends with `new Date(...)`, which puts a partial
    // date at the first instant of its period: `2026-01` is `2026-01-01`. So
    // the earliest month after `2026-01-15` is `2026-02`, January having begun
    // before the day it must follow; and the latest day before `2026-12` is
    // `2026-11-30`, the two coinciding on the first of December.
    const entity = buildEntityConstraints(
      {
        start: {
          name: 'Start',
          type: 'datetime',
          parameters: { type: 'full', min: '2026-01-15', max: '2026-12-31' },
        },
        end: {
          name: 'End',
          type: 'datetime',
          parameters: { type: 'month', min: '2026-01', max: '2026-12' },
          validation: {
            greaterThanVariable: asEntityAttributeReference('start'),
          },
        },
      },
      TODAY,
    );

    const { groups, inverted } = propagate(entity);

    expect(groups.get('end')?.constraints.dateWindow).toEqual({
      resolution: 'month',
      min: '2026-02',
      max: '2026-12',
    });
    expect(groups.get('start')?.constraints.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-01-15',
      max: '2026-11-30',
    });
    expect([...inverted]).toEqual([]);
  });

  it('steps a strict scalar-below-number comparison by the scalar grid', () => {
    // `s < n` with `n` pinned to 1: the largest grid value below 1 is 0.99.
    // Stepping by the number's whole-unit gap instead would empty the scalar's
    // range and falsely refuse a protocol `s = 0.5, n = 1` satisfies.
    const entity = buildEntityConstraints(
      {
        s: {
          name: 'S',
          type: 'scalar',
          component: 'VisualAnalogScale',
          validation: { lessThanVariable: asEntityAttributeReference('n') },
        },
        n: {
          name: 'N',
          type: 'number',
          validation: { minValue: 1, maxValue: 1 },
        },
      },
      TODAY,
    );

    const { groups, inverted } = propagate(entity);

    expect(groups.get('s')?.constraints.maxValue).toBe(0.99);
    expect([...inverted]).toEqual([]);
  });

  it('keeps a scalar ceiling stepped down from a number on the scalar grid', () => {
    // 3 - 0.01 lands beside the grid in binary floating point; the stored
    // bound must be the grid value itself or every draw would clamp oddly.
    const entity = buildEntityConstraints(
      {
        s: {
          name: 'S',
          type: 'scalar',
          component: 'VisualAnalogScale',
          validation: { lessThanVariable: asEntityAttributeReference('n') },
        },
        n: {
          name: 'N',
          type: 'number',
          validation: { minValue: 0, maxValue: 3 },
        },
      },
      TODAY,
    );

    const { groups } = propagate(entity);

    // The scalar's own domain caps it at 1 before the comparator's 2.99 could.
    expect(groups.get('s')?.constraints.maxValue).toBe(1);
    expect(groups.get('n')?.constraints.minValue).toBe(0.01);
  });
});

/**
 * The bound one end of a date comparison puts on the other, which is the whole
 * of what makes a cross-resolution comparison enforceable rather than skipped.
 * Tabulated directly because the two resolutions and the two strictnesses
 * interact: a floor steps whenever the ends fail to coincide, strict or not,
 * while a ceiling steps only when they do coincide and the rule is strict.
 */
describe('comparatorBound', () => {
  const floor = (target: string, resolution: DateResolution, strict: boolean) =>
    comparatorBound(target, resolution, { boundsUpper: true, strict });
  const ceiling = (
    target: string,
    resolution: DateResolution,
    strict: boolean,
  ) => comparatorBound(target, resolution, { boundsUpper: false, strict });

  it('steps a coinciding bound only where the comparison is strict', () => {
    expect(floor('2026-06-17', 'full', true)).toBe('2026-06-18');
    expect(floor('2026-06-17', 'full', false)).toBe('2026-06-17');
    expect(ceiling('2026-06-17', 'full', true)).toBe('2026-06-16');
    expect(ceiling('2026-06-17', 'full', false)).toBe('2026-06-17');
  });

  it('reads a coarser target at the first instant of its period', () => {
    // `2026-06` is `2026-06-01`, so a strictly later day is the second and the
    // latest earlier day is the last of May. A non-strict floor may sit on the
    // first itself, the two being the same instant.
    expect(floor('2026-06', 'full', true)).toBe('2026-06-02');
    expect(floor('2026-06', 'full', false)).toBe('2026-06-01');
    expect(ceiling('2026-06', 'full', true)).toBe('2026-05-31');
    expect(ceiling('2026-06', 'full', false)).toBe('2026-06-01');
    expect(floor('2026', 'full', true)).toBe('2026-01-02');
    expect(floor('2026', 'month', false)).toBe('2026-01');
  });

  it('clears the whole period when the coarser end is the one being bounded', () => {
    // `2026-06` starts before `2026-06-17`, so it satisfies neither `>` nor
    // `>=` and the floor is July either way. The ceiling is June either way,
    // for the same reason: it already sits earlier.
    expect(floor('2026-06-17', 'month', true)).toBe('2026-07');
    expect(floor('2026-06-17', 'month', false)).toBe('2026-07');
    expect(ceiling('2026-06-17', 'month', true)).toBe('2026-06');
    expect(ceiling('2026-06-17', 'month', false)).toBe('2026-06');
    expect(floor('2026-06-17', 'year', false)).toBe('2027');
    expect(ceiling('2026-06-17', 'year', true)).toBe('2026');
  });

  it('leaves a value that is no date at all unbounded', () => {
    expect(
      comparatorBound('', 'full', { boundsUpper: true, strict: true }),
    ).toBe(undefined);
    expect(
      comparatorBound('not a date', 'full', {
        boundsUpper: true,
        strict: true,
      }),
    ).toBe(undefined);
    expect(
      comparatorBound('2026-06-17T09:00:00Z', 'full', {
        boundsUpper: true,
        strict: true,
      }),
    ).toBe(undefined);
  });
});
