import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getEntityTypeReferenceDescriptor } from '../../schemas/8/entity-type-reference.ts';
import { CurrentProtocolSchema } from '../../schemas/index.ts';

// Count every meta-tagged node reachable by the same traversal the extractor
// uses (mirrors entity-attribute-reference-coverage).
const countTagged = (
  schema: z.ZodType,
  seen = new Set<z.ZodType>(),
): number => {
  if (seen.has(schema)) return 0;
  seen.add(schema);
  let count = getEntityTypeReferenceDescriptor(schema) ? 1 : 0;
  const countChild = (child: unknown): number =>
    child instanceof z.ZodType ? countTagged(child, seen) : 0;
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  ) {
    count += countChild(schema.unwrap());
  } else if (schema instanceof z.ZodPipe) {
    // Mirror the extractor: a pipe is peeled to its input side, so tags in a
    // pipe's narrowing output union are intentionally not counted.
    count += countChild(schema.in);
  } else if (schema instanceof z.ZodObject) {
    for (const child of Object.values(schema.shape)) {
      count += countChild(child);
    }
  } else if (schema instanceof z.ZodArray) {
    count += countChild(schema.element);
  } else if (schema instanceof z.ZodRecord) {
    count += countChild(schema.valueType);
  } else if (schema instanceof z.ZodUnion) {
    for (const opt of schema.options) count += countChild(opt);
  }
  return count;
};

// Update this number deliberately when adding/removing a tagged field.
// (12: node + edge stage subjects; sociogram prompt edges.create +
//  edges.display element; DyadCensus / TieStrengthCensus /
//  OneToManyDyadCensus createEdge; Narrative preset edges.display element;
//  FamilyPedigree nodeConfig.type + edgeConfig.type; filter rule options.type
//  on the type-level and attribute-level rule branches.)
const EXPECTED_TAGGED_FIELD_COUNT = 12;

describe('entity-type reference coverage', () => {
  it('has tagged the expected number of reference fields', () => {
    expect(countTagged(CurrentProtocolSchema)).toBe(
      EXPECTED_TAGGED_FIELD_COUNT,
    );
  });
});
