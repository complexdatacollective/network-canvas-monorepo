import { describe, expect, it } from 'vitest';

import { asEntityAttributeReference } from '@codaco/protocol-validation';

import { buildEntityConstraints } from '../buildConstraints';
import { resolveGenerationOrder } from '../dependencyOrder';
import {
  groupComparatorEdges,
  intersectGroupConstraints,
  propagateComparatorBounds,
} from '../groupConstraints';
import type { EntityConstraints } from '../types';

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
});
