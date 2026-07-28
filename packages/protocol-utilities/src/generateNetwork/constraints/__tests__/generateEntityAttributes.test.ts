import { describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  type Stage,
  type Variables,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../../generateNetwork';
import { ValueGenerator } from '../../../ValueGenerator';
import { resolveGenerationConfig } from '../../config';
import type { GenerationContext } from '../../context';
import { buildEntityConstraints } from '../buildConstraints';
import { SyntheticDataConstraintError } from '../error';
import {
  completionCheckFor,
  generateEntityAttributes,
} from '../generateEntityAttributes';
import type { EntityConstraints } from '../types';
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
    // These tests pass their constraints to `generateEntityAttributes`
    // directly, so the context's per-type maps are never read.
    entityConstraints: { ego: new Map(), node: new Map(), edge: new Map() },
  };
}

/**
 * Every draw across `seeds` runs that `rule` rejects. Returned rather than
 * asserted one at a time so a failure names the values that broke the rule and
 * says how rare they are.
 */
function breaches(
  entity: EntityConstraints,
  seeds: number,
  rule: (attributes: Record<string, VariableValue>) => boolean,
): Record<string, VariableValue>[] {
  const failures: Record<string, VariableValue>[] = [];

  for (let seed = 0; seed < seeds; seed++) {
    const attributes = generateEntityAttributes(
      entity,
      makeContext(seed),
      { entity: 'node', type: 'person' },
      seed,
    );
    if (!rule(attributes)) failures.push(attributes);
  }

  return failures;
}

/**
 * Whether every value a draw produced stayed inside the bounds its own
 * variable declares. Checked alongside each comparator, because a value that
 * satisfies the comparison by escaping its own range is just as unsubmittable
 * as one that satisfies its range by breaking the comparison.
 */
function allWithin(
  attributes: Record<string, VariableValue>,
  min: number | string,
  max: number | string,
): boolean {
  return Object.values(attributes).every((value) =>
    typeof min === 'string' && typeof max === 'string'
      ? String(value) >= min && String(value) <= max
      : Number(value) >= Number(min) && Number(value) <= Number(max),
  );
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

    const attrs = generateEntityAttributes(
      entity,
      makeContext(),
      { entity: 'ego' },
      0,
    );

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

    const attrs = generateEntityAttributes(
      entity,
      makeContext(),
      { entity: 'ego' },
      0,
    );

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

    const attrs = generateEntityAttributes(
      entity,
      makeContext(),
      { entity: 'ego' },
      0,
      {
        existing: { a: 'Persisted' },
        only: new Set(['b']),
      },
    );

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
        { entity: 'ego' },
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
      generateEntityAttributes(
        entity,
        makeContext(),
        { entity: 'node', type: 'person' },
        0,
      ),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('refuses an exhausted draw with the exported error, naming the variable', () => {
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
          name: 'Second Choice',
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

    const ctx: GenerationContext = {
      ...makeContext(),
      codebook: { node: { person: { name: 'Person' } } },
    };

    let thrown: unknown;
    try {
      generateEntityAttributes(
        entity,
        ctx,
        { entity: 'node', type: 'person' },
        0,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SyntheticDataConstraintError);
    // The expectation above has already failed the test if this is some other
    // error; the guard is only what narrows `thrown` for the assertions below.
    if (!(thrown instanceof SyntheticDataConstraintError)) return;

    expect(thrown.message).toContain('"Second Choice"');
    expect(thrown.message).toContain('node "Person"');
    expect(thrown.message).toContain(
      'this protocol declares validation rules that cannot all be satisfied together',
    );
    expect(thrown.conflicts).toEqual([
      {
        entity: 'node',
        entityType: 'person',
        entityTypeName: 'Person',
        variableIds: ['b'],
        variableNames: ['Second Choice'],
        rules: ['minSelected', 'maxSelected', 'differentFrom'],
        reason:
          'no value satisfies these rules alongside the values chosen for the variables they refer to',
      },
    ]);
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
        { entity: 'node', type: 'person' },
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
        { entity: 'node', type: 'person' },
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
        { entity: 'node', type: 'person' },
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
        { entity: 'node', type: 'person' },
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
      const attrs = generateEntityAttributes(
        entity,
        ctx,
        { entity: 'node', type: 'person' },
        index,
      );
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
    const first = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'person' },
      0,
    );
    const second = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'place' },
      0,
    );

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
      { entity: 'node', type: 'person' },
      0,
      {
        existing: { low: 42 },
        only: new Set(['high']),
      },
    );

    expect(Object.keys(attrs)).toEqual(['high']);
    expect(Number(attrs.high)).toBeGreaterThan(42);
  });

  it('satisfies every comparator declared on one variable, not only the first', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 100 },
        },
        x: {
          name: 'X',
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
            greaterThanOrEqualToVariable: asEntityAttributeReference('x'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.b) > Number(attrs.a) &&
          Number(attrs.b) >= Number(attrs.x) &&
          allWithin(attrs, 0, 100),
      ),
    ).toEqual([]);
  });

  it('satisfies comparators aimed at one variable from two declarers', () => {
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
        c: {
          name: 'C',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 100,
            lessThanVariable: asEntityAttributeReference('b'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.b) > Number(attrs.a) &&
          Number(attrs.c) < Number(attrs.b) &&
          allWithin(attrs, 0, 100),
      ),
    ).toEqual([]);
  });

  it('honours differentFrom on a variable that also carries a comparator', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 10 },
        },
        d: {
          name: 'D',
          type: 'number',
          validation: { minValue: 0, maxValue: 10 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 10,
            greaterThanVariable: asEntityAttributeReference('a'),
            differentFrom: asEntityAttributeReference('d'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.b) > Number(attrs.a) &&
          Number(attrs.b) !== Number(attrs.d) &&
          allWithin(attrs, 0, 10),
      ),
    ).toEqual([]);
  });

  it('satisfies a three-variable chain whose range is only three values wide', () => {
    // The middle of the chain gives ground at both ends, so the room the first
    // variable has to leave is the room the second has after leaving its own.
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 2 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 2,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
        c: {
          name: 'C',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 2,
            greaterThanVariable: asEntityAttributeReference('b'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.b) > Number(attrs.a) &&
          Number(attrs.c) > Number(attrs.b) &&
          allWithin(attrs, 0, 2),
      ),
    ).toEqual([]);
  });

  it('keeps a variable that declares no bounds under the ceiling a comparator gives it', () => {
    // `baseline` has no rules of its own, so nothing but the comparison bounds
    // it. Drawing it from the generator's realistic default range would put it
    // above everything `score` can reach, and `score` would then have to leave
    // its own maximum to stay above it.
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

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.baseline) < Number(attrs.score) &&
          Number(attrs.score) >= 0 &&
          Number(attrs.score) <= 10,
      ),
    ).toEqual([]);
  });

  it('satisfies a four-variable chain whose range is exactly four values wide', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 3 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 3,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
        c: {
          name: 'C',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 3,
            greaterThanVariable: asEntityAttributeReference('b'),
          },
        },
        d: {
          name: 'D',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 3,
            greaterThanVariable: asEntityAttributeReference('c'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.b) > Number(attrs.a) &&
          Number(attrs.c) > Number(attrs.b) &&
          Number(attrs.d) > Number(attrs.c) &&
          allWithin(attrs, 0, 3),
      ),
    ).toEqual([]);
  });

  it('keeps every value inside its own bounds when the chain cannot be satisfied', () => {
    // Three strictly increasing values do not fit two. The feasibility pass
    // refuses this protocol; until it is consulted the draw still has to stay
    // inside the bounds a participant's form would enforce, because a value
    // outside them fails a validator the broken comparison does not.
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
        c: {
          name: 'C',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 1,
            greaterThanVariable: asEntityAttributeReference('b'),
          },
        },
      },
      TODAY,
    );

    expect(breaches(entity, 500, (attrs) => allWithin(attrs, 0, 1))).toEqual(
      [],
    );
  });

  it('reserves nothing for a differentFrom target that cannot collide', () => {
    // `far` shares no value with `b`, so it can never take one away. Reserving
    // room for it anyway would leave `a` a range with nothing in it.
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 1 },
        },
        far: {
          name: 'Far',
          type: 'number',
          validation: { minValue: 50, maxValue: 60 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 1,
            greaterThanVariable: asEntityAttributeReference('a'),
            differentFrom: asEntityAttributeReference('far'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.b) > Number(attrs.a) &&
          Number(attrs.b) !== Number(attrs.far) &&
          Number(attrs.a) >= 0 &&
          Number(attrs.a) <= 1 &&
          Number(attrs.b) >= 0 &&
          Number(attrs.b) <= 1 &&
          Number(attrs.far) >= 50 &&
          Number(attrs.far) <= 60,
      ),
    ).toEqual([]);

    // Widened, so what was reserved can be seen rather than inferred: `b > a`
    // alone leaves `a` everything below `b`'s ceiling, and a step held back for
    // `far` would take the top of that away for a value `far` cannot hold.
    const roomy = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 5 },
        },
        far: {
          name: 'Far',
          type: 'number',
          validation: { minValue: 50, maxValue: 60 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 5,
            greaterThanVariable: asEntityAttributeReference('a'),
            differentFrom: asEntityAttributeReference('far'),
          },
        },
      },
      TODAY,
    );

    const drawn = new Set<number>();
    for (let seed = 0; seed < 500; seed++) {
      drawn.add(
        Number(
          generateEntityAttributes(
            roomy,
            makeContext(seed),
            { entity: 'node', type: 'person' },
            seed,
          ).a,
        ),
      );
    }

    expect(Math.max(...drawn)).toBe(4);
  });

  it('leaves a dependent its last value when a comparator has used up the rest', () => {
    // `b > a` on a two-value range leaves `b` one value, and `d` is drawn
    // before it: taking that value would strand `b`, which no redraw of `b`
    // could recover from. `a = 0, b = 1, d = 0` is the only assignment.
    //
    // Declared both ways round, because the two put `d` on opposite sides of
    // `a`: with `d` first, what `b` is left is known only from the propagated
    // bounds, since `a` has not been drawn yet.
    const bounds = { minValue: 0, maxValue: 1 };
    const a = { name: 'A', type: 'number', validation: bounds } as const;
    const d = { name: 'D', type: 'number', validation: bounds } as const;
    const b = {
      name: 'B',
      type: 'number',
      validation: {
        ...bounds,
        greaterThanVariable: asEntityAttributeReference('a'),
        differentFrom: asEntityAttributeReference('d'),
      },
    } as const;

    for (const variables of [
      { a, d, b },
      { d, a, b },
    ]) {
      expect(
        breaches(
          buildEntityConstraints(variables, TODAY),
          500,
          (attrs) =>
            Number(attrs.b) > Number(attrs.a) &&
            Number(attrs.b) !== Number(attrs.d) &&
            allWithin(attrs, 0, 1),
        ),
      ).toEqual([]);
    }
  });

  it('draws a counterpart the reservation has only made look single-valued', () => {
    // `y` reserves a step for its own exclusion, which takes `x`'s reserved
    // ceiling down to 8 and makes `x` look pinned there. It is not: what the
    // comparators leave `x` is `[8, 9]`, and `w = 8, x = 9, y = 10` satisfies
    // everything. Forbidding `w` its only value would give that up.
    const variables = {
      w: {
        name: 'W',
        type: 'number',
        validation: { minValue: 8, maxValue: 8 },
      },
      x: {
        name: 'X',
        type: 'number',
        validation: {
          minValue: 8,
          maxValue: 10,
          lessThanVariable: asEntityAttributeReference('y'),
          differentFrom: asEntityAttributeReference('w'),
        },
      },
      y: {
        name: 'Y',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 10,
          differentFrom: asEntityAttributeReference('z'),
        },
      },
      z: {
        name: 'Z',
        type: 'number',
        validation: { minValue: 0, maxValue: 10 },
      },
    } as const;

    const satisfies = (attrs: Record<string, VariableValue>): boolean =>
      Number(attrs.x) < Number(attrs.y) &&
      Number(attrs.x) !== Number(attrs.w) &&
      Number(attrs.y) !== Number(attrs.z) &&
      Number(attrs.w) >= 8 &&
      Number(attrs.w) <= 9 &&
      Number(attrs.x) >= 8 &&
      Number(attrs.x) <= 10 &&
      Number(attrs.y) >= 0 &&
      Number(attrs.y) <= 10 &&
      Number(attrs.z) >= 0 &&
      Number(attrs.z) <= 10;

    expect(
      breaches(buildEntityConstraints(variables, TODAY), 500, satisfies),
    ).toEqual([]);

    // Widened by one, so the value the unsound forbid took away can be seen
    // rather than inferred: `w = 8` is legal and was drawn 0 times in 500.
    const roomy = buildEntityConstraints(
      {
        ...variables,
        w: {
          name: 'W',
          type: 'number',
          validation: { minValue: 8, maxValue: 9 },
        },
      },
      TODAY,
    );

    expect(breaches(roomy, 500, satisfies)).toEqual([]);

    const drawn = new Set<number>();
    for (let seed = 0; seed < 500; seed++) {
      drawn.add(
        Number(
          generateEntityAttributes(
            roomy,
            makeContext(seed),
            { entity: 'node', type: 'person' },
            seed,
          ).w,
        ),
      );
    }

    expect(drawn).toContain(8);
  });

  it('draws a sameAs group inside the overlap of its members bounds', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            minValue: 1,
            maxValue: 5,
            sameAs: asEntityAttributeReference('b'),
          },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: { minValue: 3, maxValue: 8 },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.a) === Number(attrs.b) && allWithin(attrs, 3, 5),
      ),
    ).toEqual([]);
  });

  it('honours differentFrom when its ordering edge was dropped', () => {
    // `d >= b` already orders the pair, so the `differentFrom` edge would close
    // a cycle and is dropped: `b` is drawn first, where its own declaration has
    // nothing to point at. The rule binds both ends, so `d` avoids `b`.
    const entity = buildEntityConstraints(
      {
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 2,
            differentFrom: asEntityAttributeReference('d'),
          },
        },
        d: {
          name: 'D',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 2,
            greaterThanOrEqualToVariable: asEntityAttributeReference('b'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.d) >= Number(attrs.b) &&
          Number(attrs.b) !== Number(attrs.d) &&
          allWithin(attrs, 0, 2),
      ),
    ).toEqual([]);
  });

  it('satisfies a date chain inside a five-day window', () => {
    const window = {
      component: 'DatePicker',
      parameters: {
        type: 'full',
        min: '2020-01-01',
        max: '2020-01-05',
      },
    } as const;

    const entity = buildEntityConstraints(
      {
        born: { name: 'Born', type: 'datetime', ...window },
        diagnosed: {
          name: 'Diagnosed',
          type: 'datetime',
          ...window,
          validation: {
            greaterThanVariable: asEntityAttributeReference('born'),
          },
        },
        died: {
          name: 'Died',
          type: 'datetime',
          ...window,
          validation: {
            greaterThanVariable: asEntityAttributeReference('diagnosed'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          String(attrs.diagnosed) > String(attrs.born) &&
          String(attrs.died) > String(attrs.diagnosed) &&
          allWithin(attrs, '2020-01-01', '2020-01-05'),
      ),
    ).toEqual([]);
  });

  it('satisfies a date chain between two pickers written in months', () => {
    const window = {
      component: 'DatePicker',
      parameters: { type: 'month', min: '2026-01', max: '2026-06' },
    } as const;

    const entity = buildEntityConstraints(
      {
        start: { name: 'Start', type: 'datetime', ...window },
        finish: {
          name: 'Finish',
          type: 'datetime',
          ...window,
          validation: {
            greaterThanVariable: asEntityAttributeReference('start'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          String(attrs.finish) > String(attrs.start) &&
          allWithin(attrs, '2026-01', '2026-06'),
      ),
    ).toEqual([]);
  });

  it('satisfies a date comparison between two pickers written at different resolutions', () => {
    const entity = buildEntityConstraints(
      {
        start: {
          name: 'Start',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'month', min: '2026-01', max: '2026-12' },
        },
        finish: {
          name: 'Finish',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'full', min: '2026-01-15', max: '2026-12-31' },
          validation: {
            greaterThanVariable: asEntityAttributeReference('start'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(entity, 500, (attrs) => {
        const start = String(attrs.start);
        const finish = String(attrs.finish);
        return (
          // Each value written in its own picker's units. The comparison was
          // once folded at the wrong resolution, which left `finish` holding a
          // 'YYYY-MM' string its own field could not show.
          /^\d{4}-\d{2}$/.test(start) &&
          start >= '2026-01' &&
          start <= '2026-12' &&
          /^\d{4}-\d{2}-\d{2}$/.test(finish) &&
          finish >= '2026-01-15' &&
          finish <= '2026-12-31' &&
          // And the comparison itself, judged the way the runtime judges it:
          // by parsing both, which puts '2026-07' at '2026-07-01'.
          new Date(finish).valueOf() > new Date(start).valueOf()
        );
      }),
    ).toEqual([]);
  });

  it('satisfies a variable bounded from both sides by other variables', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 2 },
        },
        c: {
          name: 'C',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 2,
            greaterThanVariable: asEntityAttributeReference('a'),
            lessThanVariable: asEntityAttributeReference('d'),
          },
        },
        d: {
          name: 'D',
          type: 'number',
          validation: { minValue: 0, maxValue: 2 },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.c) > Number(attrs.a) &&
          Number(attrs.c) < Number(attrs.d) &&
          allWithin(attrs, 0, 2),
      ),
    ).toEqual([]);
  });

  it('issues distinct values for a unique variable that also carries a comparator', () => {
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
            unique: true,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    const ctx = makeContext();
    const issued: VariableValue[] = [];
    for (let index = 0; index < 40; index++) {
      const attrs = generateEntityAttributes(
        entity,
        ctx,
        { entity: 'node', type: 'person' },
        index,
      );
      expect(Number(attrs.b)).toBeGreaterThan(Number(attrs.a));
      issued.push(attrs.b ?? null);
    }

    expect(new Set(issued).size).toBe(issued.length);
  });

  it('refuses rather than reissuing a unique value once the comparator has used the range up', () => {
    // `b > a` puts b in [1, 3], so the fourth entity has nothing distinct left.
    // Refusing is the honest answer; reissuing a value would produce a form the
    // runtime's unique validator rejects.
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 3 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 3,
            unique: true,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    const ctx = makeContext(7);
    const issued: VariableValue[] = [];
    let refused = false;

    for (let index = 0; index < 20 && !refused; index++) {
      try {
        issued.push(
          generateEntityAttributes(
            entity,
            ctx,
            { entity: 'node', type: 'person' },
            index,
          ).b ?? null,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(SyntheticDataConstraintError);
        refused = true;
      }
    }

    expect(new Set(issued).size).toBe(issued.length);
    expect(refused).toBe(true);
  });

  it('draws past a run of fixed claims longer than the redraw limit', () => {
    // A roster row's value is claimed without the sequence advancing over it,
    // so a large roster can leave the sequence's early positions occupied for
    // longer than the redraw limit allows. Feasibility counted the space and
    // found room; the draw must find it too rather than reporting a conflict
    // the protocol does not have.
    const entity = buildEntityConstraints(
      {
        badge: {
          name: 'Badge',
          type: 'number',
          validation: { minValue: 0, maxValue: 99_999, unique: true },
        },
      },
      TODAY,
    );

    const ctx = makeContext(5);
    for (let value = 0; value < 20_000; value++) {
      ctx.uniqueRegistry.claim('node:person', 'badge', value);
    }

    const attrs = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'person' },
      0,
    );

    expect(Number(attrs.badge)).toBeGreaterThanOrEqual(20_000);
    expect(Number(attrs.badge)).toBeLessThanOrEqual(99_999);
  });

  it('refuses a genuinely full space in work bounded by what it holds', () => {
    // The allowance for walking past occupied positions is the slot's claim
    // count, so a space with nothing left runs out of it instead of searching
    // on. Counted rather than timed: a limit that grew with the sequence
    // rather than with the claims would turn this refusal into a hang.
    const size = 5000;
    const entity = buildEntityConstraints(
      {
        badge: {
          name: 'Badge',
          type: 'number',
          validation: { minValue: 0, maxValue: size - 1, unique: true },
        },
      },
      TODAY,
    );

    const ctx = makeContext(5);
    for (let value = 0; value < size; value++) {
      ctx.uniqueRegistry.claim('node:person', 'badge', value);
    }

    // Four bounded draws — own bounds and propagated bounds, each tried once
    // avoiding reserved values and once not — is the most `drawGroup` makes,
    // and none of them may walk further than the slot holds. Enforced from
    // inside the generator rather than counted afterwards, because a limit
    // that grew with the sequence would never return for a count to be read.
    const ceiling = 4 * (size + 1);
    const generate = ctx.valueGen.generateConstrained.bind(ctx.valueGen);
    let drawn = 0;
    vi.spyOn(ctx.valueGen, 'generateConstrained').mockImplementation(
      (...args) => {
        drawn += 1;
        if (drawn > ceiling) throw new Error(`searched past ${ceiling} draws`);
        return generate(...args);
      },
    );

    expect(() =>
      generateEntityAttributes(
        entity,
        ctx,
        { entity: 'node', type: 'person' },
        0,
      ),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('claims a pinned value, so a later entity is not issued it again', () => {
    const options = [
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
      { label: 'C', value: 3 },
    ];
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'ordinal',
          options,
          validation: { unique: true },
        },
        b: {
          name: 'B',
          type: 'ordinal',
          options,
          validation: { sameAs: asEntityAttributeReference('a') },
        },
      },
      TODAY,
    );

    const ctx = makeContext();
    const pinned = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'person' },
      0,
      {
        existing: { a: 2 },
        only: new Set(['b']),
      },
    );
    const second = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'person' },
      1,
    );
    const third = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'person' },
      2,
    );

    expect(pinned.b).toBe(2);
    expect(new Set([pinned.b, second.a, third.a]).size).toBe(3);
  });

  it('leaves a regenerated value claimed when the redraw lands back on it', () => {
    // One option, so the redraw can only land on the value the entity already
    // holds. Giving the slot back without reclaiming it would leave the
    // registry believing nothing is taken, and the next entity would be
    // issued the value this one is still holding.
    const entity = buildEntityConstraints(
      {
        band: {
          name: 'Band',
          type: 'ordinal',
          options: [{ label: 'A', value: 1 }],
          validation: { unique: true },
        },
      },
      TODAY,
    );

    const ctx = makeContext();
    expect(
      generateEntityAttributes(
        entity,
        ctx,
        { entity: 'node', type: 'person' },
        0,
      ).band,
    ).toBe(1);

    const again = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'person' },
      0,
      {
        existing: { band: 1 },
        only: new Set(['band']),
      },
    );

    expect(again.band).toBe(1);
    expect(() =>
      generateEntityAttributes(
        entity,
        ctx,
        { entity: 'node', type: 'person' },
        1,
      ),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('releases only the value the regenerating entity itself held', () => {
    // Two scopes hold the same two values, so a person and a place legitimately
    // hold equal ones. Regenerating the place must give back the place's slot
    // and leave the person's alone — which is why no holder is recorded: within
    // one slot a value is only ever issued once, so its holder is the only
    // entity that can be handing it back.
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
    const first = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'person' },
      0,
    );
    const second = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'person' },
      1,
    );
    const place = generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'place' },
      0,
    );

    expect(new Set([first.band, second.band]).size).toBe(2);
    expect(place.band).toBe(first.band);

    generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'place' },
      0,
      {
        existing: { band: place.band ?? null },
        only: new Set(['band']),
      },
    );

    // Both of the person scope's values are still held by the two entities
    // that were issued them, so a third has nothing distinct left.
    expect(() =>
      generateEntityAttributes(
        entity,
        ctx,
        { entity: 'node', type: 'person' },
        2,
      ),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('is deterministic for a given seed', () => {
    const entity = buildEntityConstraints(
      { a: { name: 'A', type: 'text' }, b: { name: 'B', type: 'number' } },
      TODAY,
    );

    const first = generateEntityAttributes(
      entity,
      makeContext(9),
      { entity: 'ego' },
      0,
    );
    const second = generateEntityAttributes(
      entity,
      makeContext(9),
      { entity: 'ego' },
      0,
    );

    expect(first).toEqual(second);
  });

  it('satisfies the corner shape greedy drawing painted itself into, on every seed', () => {
    // B drawn 4 leaves D and A nothing that satisfies every rule at once, so
    // a draw that never reconsiders fails half its seeds. B=3, A=4, D∈{3,4}
    // always exists; finding it is what the complete search is for.
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            minValue: 3,
            maxValue: 4,
            differentFrom: asEntityAttributeReference('b'),
          },
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
            lessThanOrEqualToVariable: asEntityAttributeReference('a'),
            greaterThanOrEqualToVariable: asEntityAttributeReference('b'),
          },
        },
      },
      TODAY,
    );

    expect(
      breaches(
        entity,
        500,
        (attrs) =>
          Number(attrs.a) !== Number(attrs.b) &&
          Number(attrs.d) <= Number(attrs.a) &&
          Number(attrs.d) >= Number(attrs.b) &&
          Number(attrs.a) >= 3 &&
          Number(attrs.a) <= 4 &&
          Number(attrs.b) >= 3 &&
          Number(attrs.b) <= 4 &&
          Number(attrs.d) >= 2 &&
          Number(attrs.d) <= 4,
      ),
    ).toEqual([]);
  });

  it('varies the assignment a solved component takes across entities', () => {
    // 45 assignments satisfy a < b over [0, 9]. A search that always returned
    // the lexicographically-first one would hand every entity identical
    // values, which is exactly what synthetic data must not do.
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 9 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 9,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    const ctx = makeContext(11);
    const seen = new Map<string, number>();
    for (let index = 0; index < 200; index++) {
      const attrs = generateEntityAttributes(
        entity,
        ctx,
        { entity: 'node', type: 'person' },
        index,
      );
      expect(Number(attrs.b)).toBeGreaterThan(Number(attrs.a));
      const key = `${String(attrs.a)}|${String(attrs.b)}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    expect(seen.size).toBeGreaterThanOrEqual(20);
    expect(Math.max(...seen.values())).toBeLessThanOrEqual(80);
  });

  it('issues distinct unique values through a solved component', () => {
    const entity = buildEntityConstraints(
      {
        u: {
          name: 'U',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 9,
            unique: true,
            differentFrom: asEntityAttributeReference('v'),
          },
        },
        v: {
          name: 'V',
          type: 'number',
          validation: { minValue: 0, maxValue: 9 },
        },
      },
      TODAY,
    );

    const ctx = makeContext(3);
    const drawn = new Set<number>();
    for (let index = 0; index < 8; index++) {
      const attrs = generateEntityAttributes(
        entity,
        ctx,
        { entity: 'node', type: 'person' },
        index,
      );
      expect(attrs.u).not.toBe(attrs.v);
      drawn.add(Number(attrs.u));
    }

    expect(drawn.size).toBe(8);
  });

  it('prefers unreserved values in a solved component, taking reserved ones only at need', () => {
    // Values a roster row reserved are held back the way the greedy draw
    // holds them back: taken last, never refused outright.
    const entity = buildEntityConstraints(
      {
        u: {
          name: 'U',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 2,
            unique: true,
            differentFrom: asEntityAttributeReference('v'),
          },
        },
        v: {
          name: 'V',
          type: 'number',
          validation: { minValue: 5, maxValue: 9 },
        },
      },
      TODAY,
    );

    for (let seed = 0; seed < 10; seed++) {
      const preferring = makeContext(seed);
      preferring.uniqueRegistry.reserve('node:person', 'u', 0);
      preferring.uniqueRegistry.reserve('node:person', 'u', 1);

      const attrs = generateEntityAttributes(
        entity,
        preferring,
        { entity: 'node', type: 'person' },
        0,
      );
      expect(attrs.u).toBe(2);
    }

    const cornered = makeContext(7);
    cornered.uniqueRegistry.reserve('node:person', 'u', 0);
    cornered.uniqueRegistry.reserve('node:person', 'u', 1);
    cornered.uniqueRegistry.reserve('node:person', 'u', 2);

    const forced = generateEntityAttributes(
      entity,
      cornered,
      { entity: 'node', type: 'person' },
      0,
    );
    expect([0, 1, 2]).toContain(Number(forced.u));
  });

  it('allocates overlapping unique ranges so later entities keep a value', () => {
    // u over [0,1] and v over [1,2] with v > u leave exactly one allocation
    // for two entities: (0,1) then (1,2). A shuffled first solve could take
    // (0,2) and strand the second entity — unique groups must consume their
    // values bottom-up, the way the distinct-sequence draw always did.
    const entity = buildEntityConstraints(
      {
        u: {
          name: 'U',
          type: 'number',
          validation: { minValue: 0, maxValue: 1, unique: true },
        },
        v: {
          name: 'V',
          type: 'number',
          validation: {
            minValue: 1,
            maxValue: 2,
            unique: true,
            greaterThanVariable: asEntityAttributeReference('u'),
          },
        },
      },
      TODAY,
    );

    for (let seed = 0; seed < 100; seed++) {
      const ctx = makeContext(seed);
      for (let index = 0; index < 2; index++) {
        const attrs = generateEntityAttributes(
          entity,
          ctx,
          { entity: 'node', type: 'person' },
          index,
        );
        expect(Number(attrs.v)).toBeGreaterThan(Number(attrs.u));
      }
    }
  });

  it('leaves interacting unique groups to the sequence ladder', () => {
    // Two unique slots inside one component cannot be allocated safely one
    // entity at a time: a and b unique over [0,2] with a differentFrom b
    // admit the complete allocation (1,0), (2,1), (0,2), but any per-entity
    // ordering can pair the slots so the third entity is left (2,2). The
    // greedy draw's per-slot monotonic sequences reach it, so such
    // components must fall back rather than be solved.
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 2,
            unique: true,
            differentFrom: asEntityAttributeReference('b'),
          },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: { minValue: 0, maxValue: 2, unique: true },
        },
      },
      TODAY,
    );

    for (let seed = 0; seed < 60; seed++) {
      const ctx = makeContext(seed);
      const seenA = new Set<number>();
      const seenB = new Set<number>();
      for (let index = 0; index < 3; index++) {
        const attrs = generateEntityAttributes(
          entity,
          ctx,
          { entity: 'node', type: 'person' },
          index,
        );
        expect(attrs.a).not.toBe(attrs.b);
        seenA.add(Number(attrs.a));
        seenB.add(Number(attrs.b));
      }
      expect(seenA.size).toBe(3);
      expect(seenB.size).toBe(3);
    }
  });

  it('consumes exactly one seeded draw for a solved component', () => {
    // The solve seeds a local shuffle from a single draw, so the shared
    // stream advances by the same amount whatever the search does — a capped
    // or failed solve cannot shift every draw that follows it.
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: { minValue: 0, maxValue: 9 },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 9,
            greaterThanVariable: asEntityAttributeReference('a'),
          },
        },
      },
      TODAY,
    );

    const ctx = makeContext(5);
    const spy = vi.spyOn(ctx.valueGen, 'randomInt');
    generateEntityAttributes(
      entity,
      ctx,
      { entity: 'node', type: 'person' },
      0,
    );

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('remains deterministic for a seed when a component is solved', () => {
    const entity = buildEntityConstraints(
      {
        a: {
          name: 'A',
          type: 'number',
          validation: {
            minValue: 3,
            maxValue: 4,
            differentFrom: asEntityAttributeReference('b'),
          },
        },
        b: {
          name: 'B',
          type: 'number',
          validation: { minValue: 3, maxValue: 4 },
        },
      },
      TODAY,
    );

    const run = (): Record<string, VariableValue>[] => {
      const ctx = makeContext(5);
      const results: Record<string, VariableValue>[] = [];
      for (let index = 0; index < 5; index++) {
        results.push(
          generateEntityAttributes(
            entity,
            ctx,
            { entity: 'node', type: 'person' },
            index,
          ),
        );
      }
      return results;
    };

    expect(run()).toEqual(run());
  });
});

/**
 * A fixed value whose comparator the draw can only meet by leaving the drawn
 * variable's own bounds.
 *
 * The complete search settles this wherever it can enumerate the component's
 * domains. Where it cannot — an unbounded `number` has no domain to walk — it
 * declines, and declining accepts, so the assignment falls through to the
 * greedy draw. `applyComparatorBounds` then clamps the drawn value back inside
 * its own range and the entity is emitted holding a pair the comparison
 * rejects.
 *
 * The codebook below is the smallest shape that reaches it: `age` declares no
 * bounds at all, so neither it nor `retired` can be enumerated, while `retired`
 * is required both to stay at or under 0 and to exceed `age`. A row fixing
 * `age` to 1 leaves `retired` a floor of 2 and a ceiling of 0.
 */
describe('a fixed value the greedy draw can only complete by breaking a rule', () => {
  type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

  const unboundedPair: Variables = {
    age: { name: 'Age', type: 'number' },
    retired: {
      name: 'Retired',
      type: 'number',
      validation: {
        maxValue: 0,
        greaterThanVariable: asEntityAttributeReference('age'),
      },
    },
  };

  function personCodebook(variables: Record<string, unknown>): Codebook {
    return {
      node: {
        person: { name: 'Person', color: 'node-color-seq-1', variables },
      },
    } as unknown as Codebook;
  }

  function rosterStage(nodes: number): Stage {
    return {
      id: 'stage-roster',
      type: 'NameGeneratorRoster',
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Pick people' }],
      behaviours: { minNodes: nodes, maxNodes: nodes },
    } as unknown as Stage;
  }

  function rows(attributes: Record<string, VariableValue>[]): NcNode[] {
    return attributes.map(
      (values, index) =>
        ({
          [entityPrimaryKeyProperty]: `roster-${index}`,
          type: 'person',
          [entityAttributesProperty]: { ...values },
        }) as unknown as NcNode,
    );
  }

  function run(
    seed: number,
    codebook: Codebook,
    stage: Stage,
    pool: NcNode[],
  ): Record<string, VariableValue>[] {
    const { network } = generateNetwork({
      seed,
      codebook,
      stages: [stage],
      externalData: { 'stage-roster': pool },
    });
    return network.nodes.map((node) => node[entityAttributesProperty]);
  }

  /** Every emitted entity whose drawn `retired` failed to exceed its `age`. */
  function invalid(
    attributes: Record<string, VariableValue>[],
  ): Record<string, VariableValue>[] {
    return attributes.filter(
      (values) => !(Number(values.retired) > Number(values.age)),
    );
  }

  it('rejects the pin whose completion the draw can only clamp', () => {
    const entity = buildEntityConstraints(unboundedPair, TODAY);

    expect(completionCheckFor(entity)({ age: 1 })).toBe(false);
  });

  it('accepts a pin the same unenumerable component leaves room under', () => {
    // `retired` may be anything above -5 and at or under 0, so four values are
    // available and the row is one the run can use. Rejecting it would be the
    // false refusal this check must never make.
    const entity = buildEntityConstraints(unboundedPair, TODAY);

    expect(completionCheckFor(entity)({ age: -5 })).toBe(true);
  });

  it('accepts a pin in an unenumerable component with no ceiling to cross', () => {
    const entity = buildEntityConstraints(
      {
        age: { name: 'Age', type: 'number' },
        retired: {
          name: 'Retired',
          type: 'number',
          validation: {
            greaterThanVariable: asEntityAttributeReference('age'),
          },
        },
      },
      TODAY,
    );

    expect(completionCheckFor(entity)({ age: 1 })).toBe(true);
  });

  it('emits no entity whose drawn value fails its comparator', () => {
    const codebook = personCodebook(unboundedPair);
    const failures: string[] = [];

    for (let seed = 1; seed <= 50; seed++) {
      const attributes = run(
        seed,
        codebook,
        rosterStage(1),
        rows([{ age: 1 }]),
      );
      const broken = invalid(attributes);
      if (broken.length > 0) {
        failures.push(`seed ${seed}: ${JSON.stringify(broken)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('draws nothing and completes when every row fails the same way', () => {
    // The degradation a roster whose rows all break their own rules already
    // has: the stage produces no nodes and the run finishes.
    const codebook = personCodebook(unboundedPair);

    for (let seed = 1; seed <= 25; seed++) {
      expect(
        run(seed, codebook, rosterStage(2), rows([{ age: 1 }, { age: 2 }])),
      ).toEqual([]);
    }
  });

  it('fills the stage from the rows that remain', () => {
    const codebook = personCodebook(unboundedPair);
    const failures: string[] = [];

    for (let seed = 1; seed <= 50; seed++) {
      const attributes = run(
        seed,
        codebook,
        rosterStage(2),
        rows([{ age: 1 }, { age: -5 }, { age: 2 }, { age: -6 }]),
      );
      if (attributes.length !== 2 || invalid(attributes).length > 0) {
        failures.push(`seed ${seed}: ${JSON.stringify(attributes)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('leaves a passed-over row unique value available to the rows it draws', () => {
    // `tag` offers exactly two values for exactly two nodes, and the row the
    // check turns away carries the same one as a row that can be drawn. A row
    // passed over before anything is drawn claims nothing, so the value it
    // named is still the drawable row's to take and the pair draws to
    // exhaustion.
    const codebook = personCodebook({
      ...unboundedPair,
      tag: {
        name: 'Tag',
        type: 'number',
        validation: { unique: true, minValue: 1, maxValue: 2 },
      },
    });
    const failures: string[] = [];

    for (let seed = 1; seed <= 50; seed++) {
      const attributes = run(
        seed,
        codebook,
        rosterStage(2),
        rows([
          { age: 1, tag: 1 },
          { age: -5, tag: 1 },
          { age: -6, tag: 2 },
        ]),
      );
      const tags = attributes.map((values) => values.tag);
      if (
        attributes.length !== 2 ||
        invalid(attributes).length > 0 ||
        new Set(tags).size !== 2
      ) {
        failures.push(`seed ${seed}: ${JSON.stringify(attributes)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('still draws a satisfiable row the search declined to analyse', () => {
    // The guard against over-refusing: nothing here can be enumerated either,
    // and every row leaves the draw somewhere to go, so all of them must be
    // usable.
    const codebook = personCodebook(unboundedPair);
    const failures: string[] = [];

    for (let seed = 1; seed <= 50; seed++) {
      const attributes = run(
        seed,
        codebook,
        rosterStage(2),
        rows([{ age: -5 }, { age: -6 }]),
      );
      if (attributes.length !== 2 || invalid(attributes).length > 0) {
        failures.push(`seed ${seed}: ${JSON.stringify(attributes)}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
