import { describe, expect, it } from 'vitest';

import { asEntityAttributeReference } from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import { ValueGenerator } from '../../../ValueGenerator';
import { resolveGenerationConfig } from '../../config';
import type { GenerationContext } from '../../context';
import { buildEntityConstraints } from '../buildConstraints';
import { SyntheticDataConstraintError } from '../error';
import { generateEntityAttributes } from '../generateEntityAttributes';
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
      } catch {
        refused = true;
      }
    }

    expect(new Set(issued).size).toBe(issued.length);
    expect(refused).toBe(true);
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
});
