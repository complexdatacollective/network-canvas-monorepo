import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variables,
} from '@codaco/protocol-validation';

import { ValueGenerator } from '../../ValueGenerator';
import { resolveGenerationConfig } from '../config';
import { buildEntityConstraints } from '../constraints/buildConstraints';
import { generateEntityAttributes } from '../constraints/generateEntityAttributes';
import { UniqueRegistry } from '../constraints/uniqueRegistry';
import type { GenerationContext } from '../context';

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
    entityConstraints: { ego: new Map(), node: new Map(), edge: new Map() },
  };
}

/** A tractable two-variable component: `high` must exceed `low`. */
const pair = (low: string, high: string): Variables => ({
  [low]: {
    name: `Low ${low}`,
    type: 'number',
    validation: { minValue: 0, maxValue: 99 },
  },
  [high]: {
    name: `High ${high}`,
    type: 'number',
    validation: {
      minValue: 0,
      maxValue: 99,
      greaterThanVariable: asEntityAttributeReference(low),
    },
  },
});

describe('component-solver shuffle stream identity', () => {
  // Component X has groups {'a', 'b,c'}; component Y has groups {'a,b', 'c'}.
  // Sorted and comma-joined, both name the segment 'a,b,c'. A correctly
  // scoped address keeps the two components on distinct streams, so each
  // component's assignment for a given seed and entity index is the same
  // whether or not the other component exists in the codebook.
  it("a component's assignment is untouched by an aliasing sibling component", () => {
    const componentX = pair('a', 'b,c');
    const componentY = pair('a,b', 'c');

    const seed = 23;

    const xAlone = generateEntityAttributes(
      buildEntityConstraints(componentX, TODAY),
      makeContext(seed),
      { entity: 'node', type: 'person' },
      0,
    );
    const yAlone = generateEntityAttributes(
      buildEntityConstraints(componentY, TODAY),
      makeContext(seed),
      { entity: 'node', type: 'person' },
      0,
    );

    const together = generateEntityAttributes(
      buildEntityConstraints({ ...componentX, ...componentY }, TODAY),
      makeContext(seed),
      { entity: 'node', type: 'person' },
      0,
    );

    expect({
      'a': together.a,
      'b,c': together['b,c'],
    }).toEqual({ 'a': xAlone.a, 'b,c': xAlone['b,c'] });
    expect({
      'a,b': together['a,b'],
      'c': together.c,
    }).toEqual({ 'a,b': yAlone['a,b'], 'c': yAlone.c });
  });
});
