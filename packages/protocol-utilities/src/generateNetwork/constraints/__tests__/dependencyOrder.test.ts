import { describe, expect, it } from 'vitest';

import { asEntityAttributeReference } from '@codaco/protocol-validation';

import { buildEntityConstraints } from '../buildConstraints';
import { resolveGenerationOrder } from '../dependencyOrder';

const TODAY = '2026-07-27';

describe('resolveGenerationOrder', () => {
  it('puts a sameAs target before nothing, because the pair becomes one group', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'A', type: 'text' },
        b: {
          name: 'B',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toEqual([]);
    expect(result.order).toHaveLength(1);
    const representative = result.order[0]!;
    expect(result.membersOf.get(representative)?.toSorted()).toEqual([
      'a',
      'b',
    ]);
    expect(result.groupOf.get('a')).toBe(representative);
    expect(result.groupOf.get('b')).toBe(representative);
  });

  it('orders a comparator target before its dependent', () => {
    const entity = buildEntityConstraints(
      {
        later: {
          name: 'Later',
          type: 'number',
          validation: {
            greaterThanVariable: asEntityAttributeReference('earlier'),
          },
        },
        earlier: { name: 'Earlier', type: 'number' },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toEqual([]);
    expect(result.order.indexOf('earlier')).toBeLessThan(
      result.order.indexOf('later'),
    );
  });

  it('orders a differentFrom target before its dependent', () => {
    const entity = buildEntityConstraints(
      {
        b: {
          name: 'B',
          type: 'text',
          validation: { differentFrom: asEntityAttributeReference('a') },
        },
        a: { name: 'A', type: 'text' },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.order.indexOf('a')).toBeLessThan(result.order.indexOf('b'));
  });

  it('reports a strict comparator cycle as unsatisfiable', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { greaterThanVariable: asEntityAttributeReference('b') },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: { greaterThanVariable: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]?.toSorted()).toEqual(['a', 'b']);
  });

  it('reports a mixed sameAs and comparator cycle as unsatisfiable', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { sameAs: asEntityAttributeReference('b') },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: { greaterThanVariable: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(resolveGenerationOrder(entity).cycles).toHaveLength(1);
  });

  it('ignores references to variables outside the entity', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('missing') },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toEqual([]);
    expect(result.order).toEqual(['a']);
  });

  it('orders independent variables deterministically by codebook order', () => {
    const entity = buildEntityConstraints(
      {
        z: { name: 'Z', type: 'text' },
        a: { name: 'A', type: 'text' },
      },
      TODAY,
    );

    expect(resolveGenerationOrder(entity).order).toEqual(['z', 'a']);
  });
});
