import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getEntityTypeReferenceDescriptor } from '../../schemas/9/entity-type-reference.ts';
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
// (18: node + edge stage subjects; sociogram prompt edges.create +
//  edges.display element; a highlight attribute's node type; DyadCensus / TieStrengthCensus /
//  OneToManyDyadCensus createEdge; Narrative preset edges.display element;
//  FamilyPedigree relationship.type; filter rule options.type
//  on the type-level and attribute-level rule branches; a condition's
//  edge-count rule options.type; an edge type's endpoint rule sourceType
//  and targetType; a typed sort rule's node type and a node type order's
//  element, on Sociogram prompts; a Narrative highlight attribute's node
//  type, a separate instance because `highlightAttributeSchema` builds one
//  per call.)
const EXPECTED_TAGGED_FIELD_COUNT = 18;

describe('entity-type reference coverage', () => {
  it('has tagged the expected number of reference fields', () => {
    expect(countTagged(CurrentProtocolSchema)).toBe(
      EXPECTED_TAGGED_FIELD_COUNT,
    );
  });
});
