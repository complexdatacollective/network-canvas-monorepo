import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variables,
} from '@codaco/protocol-validation';

import { buildEntityConstraints } from '../buildConstraints';
import { resolveGenerationOrder } from '../dependencyOrder';
import {
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

    expect(crossings(entity)).toEqual([]);
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

    expect(crossings(entity)).toEqual([]);
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

  it('propagates nothing between dates written at different resolutions', () => {
    // '2026-01' and '2026-01-15' do not compare as strings, so a bound carried
    // across this comparison would leave each end holding the other's units.
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

    expect(groups.get('end')?.constraints.dateWindow?.min).toBe('2026-01');
    expect(groups.get('start')?.constraints.dateWindow?.max).toBe('2026-12-31');
    expect([...inverted]).toEqual([]);
  });
});
