import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CategoricalColorSequence,
  ColorReferenceSchema,
  EdgeColorSequence,
  NodeColorSequence,
  OrdinalColorSequence,
  type CategoricalColorReference,
  type ColorReference,
  type EdgeColorReference,
  type NodeColorReference,
  type OrdinalColorReference,
} from './color-reference.ts';

describe('color references', () => {
  it('combines every defined protocol color reference type', () => {
    expectTypeOf<ColorReference>().toEqualTypeOf<
      | NodeColorReference
      | EdgeColorReference
      | OrdinalColorReference
      | CategoricalColorReference
    >();
  });

  it('accepts every reference of the four sequences', () => {
    const references = [
      ...NodeColorSequence,
      ...EdgeColorSequence,
      ...OrdinalColorSequence,
      ...CategoricalColorSequence,
    ];
    expect(references).toHaveLength(36);
    for (const reference of references) {
      expect(ColorReferenceSchema.parse(reference)).toBe(reference);
    }
  });

  it.each([
    '#ff0000',
    'node-color-seq-9',
    'primary-color-seq-1',
    'custom-color',
  ])('rejects non-reference value %s', (value) => {
    expect(ColorReferenceSchema.safeParse(value).error?.issues).toEqual([
      expect.objectContaining({ code: 'invalid_union', path: [] }),
    ]);
  });
});
