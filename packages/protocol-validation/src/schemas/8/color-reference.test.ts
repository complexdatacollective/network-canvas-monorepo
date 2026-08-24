import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  ColorReferenceSchema,
  EdgeColorReferenceSchema,
  EdgeColorSequence,
  NodeColorReferenceSchema,
  NodeColorSequence,
  OrdinalColorReferenceSchema,
  OrdinalColorSequence,
  type ColorReference,
  type EdgeColorReference,
  type NodeColorReference,
  type OrdinalColorReference,
} from './color-reference.ts';

describe('color references', () => {
  it('combines the node, edge, and ordinal reference types', () => {
    expectTypeOf<ColorReference>().toEqualTypeOf<
      NodeColorReference | EdgeColorReference | OrdinalColorReference
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

  it.each(['#ff0000', 'node-color-seq-9', 'custom-color'])(
    'rejects non-reference value %s',
    (value) => {
      expect(ColorReferenceSchema.safeParse(value).success).toBe(false);
    },
  );
});
