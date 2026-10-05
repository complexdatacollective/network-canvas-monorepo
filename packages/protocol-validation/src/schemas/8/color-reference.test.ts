import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CategoricalColorReferenceSchema,
  CategoricalColorSequence,
  ColorReferenceSchema,
  EdgeColorReferenceSchema,
  EdgeColorSequence,
  NodeColorReferenceSchema,
  NodeColorSequence,
  OrdinalColorReferenceSchema,
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

  it.each(NodeColorSequence)('accepts node reference %s', (reference) => {
    expect(NodeColorReferenceSchema.parse(reference)).toBe(reference);
    expect(ColorReferenceSchema.parse(reference)).toBe(reference);
  });

  it.each(EdgeColorSequence)('accepts edge reference %s', (reference) => {
    expect(EdgeColorReferenceSchema.parse(reference)).toBe(reference);
    expect(ColorReferenceSchema.parse(reference)).toBe(reference);
  });

  it.each(OrdinalColorSequence)('accepts ordinal reference %s', (reference) => {
    expect(OrdinalColorReferenceSchema.parse(reference)).toBe(reference);
    expect(ColorReferenceSchema.parse(reference)).toBe(reference);
  });

  it.each(CategoricalColorSequence)(
    'accepts categorical reference %s',
    (reference) => {
      expect(CategoricalColorReferenceSchema.parse(reference)).toBe(reference);
      expect(ColorReferenceSchema.parse(reference)).toBe(reference);
    },
  );

  it.each([
    '#ff0000',
    'node-color-seq-9',
    'primary-color-seq-1',
    'custom-color',
  ])('rejects non-reference value %s', (value) => {
    expect(ColorReferenceSchema.safeParse(value).success).toBe(false);
  });
});
