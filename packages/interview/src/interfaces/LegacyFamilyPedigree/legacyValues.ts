// TODO(narrative-pedigree-rebuild): the value sets of the pre-redesign Family
// Pedigree, which schema 9 no longer defines. Only the Narrative Pedigree's
// copy of the old pedigree reads them.

export const RELATIONSHIP_TYPES = [
  'biological',
  'social',
  'donor',
  'surrogate',
  'adoptive',
  'partner',
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const GAMETE_ROLES = ['egg', 'sperm'] as const;

export type GameteRole = (typeof GAMETE_ROLES)[number];
