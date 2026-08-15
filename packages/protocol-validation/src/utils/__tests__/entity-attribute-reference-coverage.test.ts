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
// node shape-mapping `variable` fields (discrete and breakpoints arms), plus
// #1392's four existence-unchecked sites: the shared sort rule `property`
// (SortRuleSchema, reached by every prompt-level sort order and the roster's
// stage-level one) and the roster's three data-source column fields
// (cardOptions.additionalProperties[].variable,
// sortOptions.sortableProperties[].variable, searchOptions.matchProperties[]).
// The value is verified against the runtime count computed below.
const EXPECTED_TAGGED_FIELD_COUNT = 40;

// Every slot an interface owns outright, and every slot whose OPTION SET it
// owns. Both drive protocol-level rules and Architect's pickers/option
// editors, so adding a structural slot without listing it here — or listing
// one that no longer exists — fails.
const EXPECTED_EXCLUSIVE_SLOTS = [
  'familyPedigree.edgeConfig.gameteRoleVariable',
  'familyPedigree.edgeConfig.isActiveVariable',
  'familyPedigree.edgeConfig.isGestationalCarrierVariable',
  'familyPedigree.edgeConfig.relationshipTypeVariable',
  'familyPedigree.nodeConfig.egoVariable',
  'familyPedigree.nodeConfig.relationshipVariable',
];

const EXPECTED_OWNED_OPTION_SETS = [
  'biologicalSex',
  'gameteRole',
  'relationshipType',
];

// The descriptors themselves, by the same traversal as countTagged.
const collectDescriptors = (
  schema: z.ZodType,
  seen = new Set<z.ZodType>(),
): NonNullable<ReturnType<typeof getEntityAttributeReferenceDescriptor>>[] => {
  if (seen.has(schema)) return [];
  seen.add(schema);
  const descriptor = getEntityAttributeReferenceDescriptor(schema);
  const found = descriptor ? [descriptor] : [];
  const fromChild = (child: unknown) =>
    child instanceof z.ZodType ? collectDescriptors(child, seen) : [];
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  ) {
    found.push(...fromChild(schema.unwrap()));
  } else if (schema instanceof z.ZodPipe) {
    found.push(...fromChild(schema.in));
  } else if (schema instanceof z.ZodObject) {
    for (const child of Object.values(schema.shape)) {
      found.push(...fromChild(child));
    }
  } else if (schema instanceof z.ZodArray) {
    found.push(...fromChild(schema.element));
  } else if (schema instanceof z.ZodRecord) {
    found.push(...fromChild(schema.valueType));
  } else if (schema instanceof z.ZodUnion) {
    for (const opt of schema.options) found.push(...fromChild(opt));
  }
  return found;
};

describe('entity-attribute reference coverage', () => {
  it('has tagged the expected number of reference fields', () => {
    expect(countTagged(CurrentProtocolSchema)).toBe(
      EXPECTED_TAGGED_FIELD_COUNT,
    );
  });

  it('declares exactly the expected interface-owned structural slots', () => {
    const slots = collectDescriptors(CurrentProtocolSchema)
      .map((descriptor) => descriptor.exclusive?.slot)
      .filter((slot): slot is string => slot !== undefined);
    expect([...new Set(slots)].toSorted()).toEqual(EXPECTED_EXCLUSIVE_SLOTS);
  });

  it('gives every exclusive slot a researcher-facing owner description', () => {
    for (const descriptor of collectDescriptors(CurrentProtocolSchema)) {
      if (!descriptor.exclusive) continue;
      expect(descriptor.exclusive.owner.length).toBeGreaterThan(0);
    }
  });

  // `existence: 'unchecked'` buys usage detection at the price of validation:
  // a reference tagged this way can name a variable that does not exist and
  // nothing will say so. It is correct for exactly two things — a roster
  // data-source column and a sort key — and downgrading a real reference to it
  // would silently disable existence checking for that field.
  it('leaves existence checking on for all but the known data-source sites', () => {
    const unchecked = collectDescriptors(CurrentProtocolSchema).filter(
      (descriptor) => descriptor.existence === 'unchecked',
    );
    // The shared sort rule `property`, and the roster's three column fields.
    expect(unchecked).toHaveLength(4);
    // Only the sort rule admits a magic key, and `'*'` is the only one.
    expect(
      unchecked
        .map((descriptor) => descriptor.ignoreValues)
        .filter((values) => values !== undefined),
    ).toEqual([['*']]);
  });

  it('declares exactly the expected interface-owned option sets', () => {
    const sets = collectDescriptors(CurrentProtocolSchema)
      .map((descriptor) => descriptor.ownedOptions)
      .filter((set) => set !== undefined);
    expect([...new Set(sets)].toSorted()).toEqual(EXPECTED_OWNED_OPTION_SETS);
  });
});
