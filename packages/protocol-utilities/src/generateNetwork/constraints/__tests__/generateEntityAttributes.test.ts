import { describe, expect, it } from 'vitest';

import { asEntityAttributeReference } from '@codaco/protocol-validation';

import { ValueGenerator } from '../../../ValueGenerator';
import { resolveGenerationConfig } from '../../config';
import type { GenerationContext } from '../../context';
import { buildEntityConstraints } from '../buildConstraints';
import { generateEntityAttributes } from '../generateEntityAttributes';
import { UniqueRegistry } from '../uniqueRegistry';

const TODAY = '2026-07-27';

function makeContext(seed = 1): GenerationContext {
  return {
    codebook: {},
    valueGen: new ValueGenerator(seed, TODAY),
    config: resolveGenerationConfig({ today: TODAY }),
    usedRosterUids: new Set(),
    externalData: undefined,
    respectSkipLogicAndFiltering: false,
    uniqueRegistry: new UniqueRegistry(),
  };
}

describe('generateEntityAttributes', () => {
  it('satisfies the motivating ego form: two required 24-character fields, one sameAs the other', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'text',
          validation: { required: true, minLength: 24, maxLength: 24 },
        },
        b: {
          name: 'B',
          type: 'text',
          validation: {
            required: true,
            minLength: 24,
            maxLength: 24,
            sameAs: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    const attrs = generateEntityAttributes(entity, makeContext(), 'ego', 0);

    expect(attrs.a).toHaveLength(24);
    expect(attrs.b).toHaveLength(24);
    expect(attrs.b).toBe(attrs.a);
  });

  it('draws a sameAs group against the intersection of its members bounds', () => {
    // Neither member alone asks for a 24-character value: `a` caps the length
    // and `b` sets the floor. Only their intersection does.
    const entity = buildEntityConstraints(
      {
        a: { name: 'A', type: 'text', validation: { maxLength: 24 } },
        b: {
          name: 'B',
          type: 'text',
          validation: {
            minLength: 24,
            sameAs: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    const attrs = generateEntityAttributes(entity, makeContext(), 'ego', 0);

    expect(attrs.a).toHaveLength(24);
    expect(attrs.b).toBe(attrs.a);
  });

  it('pins a sameAs group to a member it is not regenerating', () => {
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

    const attrs = generateEntityAttributes(entity, makeContext(), 'ego', 0, {
      existing: { a: 'Persisted' },
      only: new Set(['b']),
    });

    expect(attrs).toEqual({ b: 'Persisted' });
  });

  it('satisfies differentFrom', () => {
    const entity = buildEntityConstraints(
      {
        a: { name: 'A', type: 'text' },
        b: {
          name: 'B',
          type: 'text',
          validation: { differentFrom: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    for (let index = 0; index < 25; index++) {
      const attrs = generateEntityAttributes(
        entity,
        makeContext(index),
        'ego',
        index,
      );
      expect(attrs.b).not.toBe(attrs.a);
    }
  });

  it('judges differentFrom on a categorical by multiset, matching the runtime', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'categorical',
          options: [
            { label: 'X', value: 'x' },
            { label: 'Y', value: 'y' },
          ],
          validation: { minSelected: 2, maxSelected: 2 },
        },
        b: {
          name: 'B',
          type: 'categorical',
          options: [
            { label: 'X', value: 'x' },
            { label: 'Y', value: 'y' },
          ],
          validation: {
            minSelected: 2,
            maxSelected: 2,
            differentFrom: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    // Both variables must select both options, so every possible value of `b`
    // is the same multiset as `a`. There is no satisfying assignment, and the
    // redraw bound must be reached rather than a reordered array being
    // accepted as "different" — the runtime would reject that.
    expect(() =>
      generateEntityAttributes(entity, makeContext(), 'node:person', 0),
    ).toThrow(/Could not draw a satisfying value/);
  });

  it('satisfies greaterThanVariable', () => {
    const entity = buildEntityConstraints(
      {
        low: {
          name: 'Low',
          type: 'number',
          validation: { minValue: 0, maxValue: 50 },
        },
        high: {
          name: 'High',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 100,
            greaterThanVariable: asEntityAttributeReference('low'),
          },
        },
      },
      TODAY,
    );

    for (let index = 0; index < 25; index++) {
      const attrs = generateEntityAttributes(
        entity,
        makeContext(index),
        'node:person',
        index,
      );
      expect(Number(attrs.high)).toBeGreaterThan(Number(attrs.low));
    }
  });

  it('satisfies lessThanOrEqualToVariable', () => {
    const entity = buildEntityConstraints(
      {
        cap: {
          name: 'Cap',
          type: 'number',
          validation: { minValue: 10, maxValue: 100 },
        },
        used: {
          name: 'Used',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 100,
            lessThanOrEqualToVariable: asEntityAttributeReference('cap'),
          },
        },
      },
      TODAY,
    );

    for (let index = 0; index < 25; index++) {
      const attrs = generateEntityAttributes(
        entity,
        makeContext(index),
        'node:person',
        index,
      );
      expect(Number(attrs.used)).toBeLessThanOrEqual(Number(attrs.cap));
    }
  });

  it('leaves a comparator target room to be exceeded, on every draw', () => {
    // Both variables share the same bounds, so a target drawn at the top of the
    // range would leave the dependent nowhere to go: its own bounds win over
    // the comparison. The target must be drawn away from that end.
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 100 },
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

    for (let seed = 0; seed < 200; seed++) {
      const attrs = generateEntityAttributes(
        entity,
        makeContext(seed),
        'node:person',
        seed,
      );
      expect(Number(attrs.b)).toBeGreaterThan(Number(attrs.a));
    }
  });

  it('reserves the last step of a two-value range for the dependent', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 1 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 1,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    for (let seed = 0; seed < 25; seed++) {
      const attrs = generateEntityAttributes(
        entity,
        makeContext(seed),
        'node:person',
        seed,
      );
      expect(attrs.a).toBe(0);
      expect(attrs.b).toBe(1);
    }
  });

  it('issues unique values across entities in the same scope', () => {
    const entity = buildEntityConstraints(
      {
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
      },
      TODAY,
    );

    const ctx = makeContext();
    const seen = new Set<unknown>();
    for (let index = 0; index < 3; index++) {
      const attrs = generateEntityAttributes(entity, ctx, 'node:person', index);
      expect(seen.has(attrs.band)).toBe(false);
      seen.add(attrs.band);
    }
  });

  it('keeps unique registries separate per scope', () => {
    const entity = buildEntityConstraints(
      {
        band: {
          name: 'Band',
          type: 'ordinal',
          options: [
            { label: 'A', value: 1 },
            { label: 'B', value: 2 },
          ],
          validation: { unique: true },
        },
      },
      TODAY,
    );

    const ctx = makeContext();
    const first = generateEntityAttributes(entity, ctx, 'node:person', 0);
    const second = generateEntityAttributes(entity, ctx, 'node:place', 0);

    expect(second.band).toBe(first.band);
  });

  it('reads a comparison target from existing attributes when regenerating a subset', () => {
    const entity = buildEntityConstraints(
      {
        low: {
          name: 'Low',
          type: 'number',
          validation: { minValue: 0, maxValue: 100 },
        },
        high: {
          name: 'High',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 100,
            greaterThanVariable: asEntityAttributeReference('low'),
          },
        },
      },
      TODAY,
    );

    const attrs = generateEntityAttributes(
      entity,
      makeContext(),
      'node:person',
      0,
      {
        existing: { low: 42 },
        only: new Set(['high']),
      },
    );

    expect(Object.keys(attrs)).toEqual(['high']);
    expect(Number(attrs.high)).toBeGreaterThan(42);
  });

  it('is deterministic for a given seed', () => {
    const entity = buildEntityConstraints(
      { a: { name: 'A', type: 'text' }, b: { name: 'B', type: 'number' } },
      TODAY,
    );

    const first = generateEntityAttributes(entity, makeContext(9), 'ego', 0);
    const second = generateEntityAttributes(entity, makeContext(9), 'ego', 0);

    expect(first).toEqual(second);
  });
});
