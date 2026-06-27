import { describe, expect, it } from 'vitest';
import { type z } from 'zod';
import type * as core from 'zod/v4/core';

import { CurrentProtocolSchema } from '../../schemas';
import { getEntityAttributeReferenceDescriptor } from '../../schemas/8/entity-attribute-reference';

// Count every meta-tagged node reachable by the same traversal the extractor uses.
const countTagged = (
  schema: z.ZodType,
  seen = new Set<z.ZodType>(),
): number => {
  if (seen.has(schema)) return 0;
  seen.add(schema);
  const def = schema._zod.def;
  let count = getEntityAttributeReferenceDescriptor(schema) ? 1 : 0;
  if (
    def.type === 'optional' ||
    def.type === 'nullable' ||
    def.type === 'default'
  ) {
    count += countTagged(
      (def as core.$ZodOptionalDef).innerType as z.ZodType,
      seen,
    );
  } else if (def.type === 'object') {
    for (const child of Object.values(
      (def as core.$ZodObjectDef).shape,
    ) as z.ZodType[]) {
      count += countTagged(child, seen);
    }
  } else if (def.type === 'array') {
    count += countTagged((def as core.$ZodArrayDef).element as z.ZodType, seen);
  } else if (def.type === 'record') {
    count += countTagged(
      (def as core.$ZodRecordDef).valueType as z.ZodType,
      seen,
    );
  } else if (def.type === 'union') {
    for (const opt of (def as core.$ZodUnionDef).options as z.ZodType[])
      count += countTagged(opt, seen);
  }
  return count;
};

// Update this number deliberately when adding/removing a tagged field.
// (31 after main removed FamilyPedigree biologicalSexVariable during merge.)
// (29 after adding NetworkComposer quickAdd + layoutVariable references; its
//  node/edge forms reuse the shared TitlelessFormSchema, which is already counted.)
const EXPECTED_TAGGED_FIELD_COUNT = 29;

describe('entity-attribute reference coverage', () => {
  it('has tagged the expected number of reference fields', () => {
    expect(countTagged(CurrentProtocolSchema as unknown as z.ZodType)).toBe(
      EXPECTED_TAGGED_FIELD_COUNT,
    );
  });
});
