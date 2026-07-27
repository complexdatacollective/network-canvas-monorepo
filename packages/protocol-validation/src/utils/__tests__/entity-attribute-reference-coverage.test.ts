import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getEntityAttributeReferenceDescriptor } from '../../schemas/8/entity-attribute-reference.ts';
import { CurrentProtocolSchema } from '../../schemas/index.ts';

// Count every meta-tagged node reachable by the same traversal the extractor uses.
const countTagged = (
  schema: z.ZodType,
  seen = new Set<z.ZodType>(),
): number => {
  if (seen.has(schema)) return 0;
  seen.add(schema);
  let count = getEntityAttributeReferenceDescriptor(schema) ? 1 : 0;
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
// Merged total: main's NetworkComposer reference fields, plus this branch's
// pedigree fields — biologicalSexVariable (NodeConfigSchema), gameteRoleVariable
// (EdgeConfigSchema), and NarrativePedigree diseases[].variable — plus the two
// node shape-mapping `variable` fields (discrete and breakpoints arms). The
// value is verified against the runtime count computed below.
const EXPECTED_TAGGED_FIELD_COUNT = 36;

describe('entity-attribute reference coverage', () => {
  it('has tagged the expected number of reference fields', () => {
    expect(countTagged(CurrentProtocolSchema)).toBe(
      EXPECTED_TAGGED_FIELD_COUNT,
    );
  });
});
