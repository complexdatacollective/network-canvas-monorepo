/**
 * Canonical relationship-type values for the FamilyPedigree interface.
 *
 * These are the option values stored on the `relationshipType` edge variable
 * (the discriminant for the pedigree Edge union). They are shared so that
 * Architect (which locks them onto the categorical edge variable) and the
 * interview interface (which reads and branches on them) cannot drift apart.
 */
export const RELATIONSHIP_TYPES = [
  'biological',
  'social',
  'donor',
  'surrogate',
  'adoptive',
  'partner',
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  biological: 'Biological',
  social: 'Social',
  donor: 'Donor',
  surrogate: 'Surrogate',
  adoptive: 'Adoptive',
  partner: 'Partner',
};

/**
 * The relationship-type options as `{ value, label }` pairs, in canonical
 * order. Architect locks the categorical edge variable to exactly this set.
 */
export const RELATIONSHIP_TYPE_OPTIONS: {
  value: RelationshipType;
  label: string;
}[] = RELATIONSHIP_TYPES.map((value) => ({
  value,
  label: RELATIONSHIP_TYPE_LABELS[value],
}));
