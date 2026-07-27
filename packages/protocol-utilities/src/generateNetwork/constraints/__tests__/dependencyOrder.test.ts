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

  it('accepts one comparison stated from both sides', () => {
    const entity = buildEntityConstraints(
      {
        end: {
          name: 'End',
          type: 'number',
          validation: {
            greaterThanVariable: asEntityAttributeReference('start'),
          },
        },
        start: {
          name: 'Start',
          type: 'number',
          validation: { lessThanVariable: asEntityAttributeReference('end') },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toEqual([]);
    expect(result.order.indexOf('start')).toBeLessThan(
      result.order.indexOf('end'),
    );
  });

  it('accepts a mutually declared differentFrom pair', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'text',
          validation: { differentFrom: asEntityAttributeReference('b') },
        },
        b: {
          name: 'B',
          type: 'text',
          validation: { differentFrom: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    expect(resolveGenerationOrder(entity).cycles).toEqual([]);
  });

  it('accepts a mutual non-strict comparison, which equality satisfies', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('b'),
          },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    // Only one shared value satisfies the pair, so they must generate as one
    // group rather than merely be accepted.
    expect(result.cycles).toEqual([]);
    expect(result.order).toHaveLength(1);
    const representative = result.order[0]!;
    expect(result.membersOf.get(representative)?.toSorted()).toEqual([
      'a',
      'b',
    ]);
  });

  it('merges a three-variable all-non-strict cycle into one group', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('b'),
          },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('c'),
          },
        },
        c: {
          name: 'C',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('a'),
          },
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
      'c',
    ]);
  });

  it('reports a strict comparison contradicting a comparator equality class', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('b'),
          },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('a'),
          },
        },
        c: {
          name: 'C',
          type: 'number',
          validation: {
            lessThanVariable: asEntityAttributeReference('a'),
            greaterThanOrEqualToVariable: asEntityAttributeReference('b'),
          },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]?.toSorted()).toEqual(['a', 'b', 'c']);
  });

  it('reports a strict comparison reaching a comparator equality class indirectly', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('b'),
          },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('c'),
          },
        },
        c: {
          name: 'C',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('a'),
          },
        },
        d: {
          name: 'D',
          type: 'number',
          validation: {
            lessThanVariable: asEntityAttributeReference('a'),
            greaterThanOrEqualToVariable: asEntityAttributeReference('c'),
          },
        },
      },
      TODAY,
    );

    expect(resolveGenerationOrder(entity).cycles.length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('reports a differentFrom across a comparator equality class', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('b'),
            differentFrom: asEntityAttributeReference('b'),
          },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]?.toSorted()).toEqual(['a', 'b']);
  });

  it('orders a satisfiable strict comparison against a comparator equality class', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('b'),
          },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('a'),
          },
        },
        c: {
          name: 'C',
          type: 'number',
          validation: { greaterThanVariable: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toEqual([]);
    expect(result.groupOf.get('a')).toBe(result.groupOf.get('b'));

    const equalityClass = result.groupOf.get('a')!;
    const dependent = result.groupOf.get('c')!;
    expect(equalityClass).not.toBe(dependent);
    expect(result.order.indexOf(equalityClass)).toBeLessThan(
      result.order.indexOf(dependent),
    );
  });

  it('accepts one non-strict comparison stated from both sides', () => {
    const entity = buildEntityConstraints(
      {
        end: {
          name: 'End',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('start'),
          },
        },
        start: {
          name: 'Start',
          type: 'number',
          validation: {
            lessThanOrEqualToVariable: asEntityAttributeReference('end'),
          },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toEqual([]);
    expect(result.order.indexOf('start')).toBeLessThan(
      result.order.indexOf('end'),
    );
  });

  it('accepts a non-strict comparison inside a sameAs group', () => {
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
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    expect(resolveGenerationOrder(entity).cycles).toEqual([]);
  });

  it('reports a three-variable strict comparator cycle', () => {
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
          validation: { greaterThanVariable: asEntityAttributeReference('c') },
        },
        c: {
          name: 'C',
          type: 'number',
          validation: { greaterThanVariable: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]?.toSorted()).toEqual(['a', 'b', 'c']);
  });

  it('reports a differentFrom inside a sameAs group', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'text',
          validation: { sameAs: asEntityAttributeReference('b') },
        },
        b: {
          name: 'B',
          type: 'text',
          validation: { differentFrom: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]?.toSorted()).toEqual(['a', 'b']);
  });

  it('reports a cycle mixing strict and non-strict comparisons', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            greaterThanOrEqualToVariable: asEntityAttributeReference('b'),
          },
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

  it('reports one group at most once, however many rules contradict it', () => {
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
          validation: {
            greaterThanVariable: asEntityAttributeReference('a'),
            lessThanVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    const result = resolveGenerationOrder(entity);

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]?.toSorted()).toEqual(['a', 'b']);
  });

  it('does not alias membersOf into a reported cycle', () => {
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

    const result = resolveGenerationOrder(entity);
    const representative = result.groupOf.get('a')!;
    const membersBefore = [...result.membersOf.get(representative)!];

    result.cycles[0]?.reverse();

    expect(result.membersOf.get(representative)).toEqual(membersBefore);
  });
});
