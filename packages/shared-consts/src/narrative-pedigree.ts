/**
 * Canonical inheritance-pattern values for narrative pedigree disease visualization.
 *
 * These values describe the genetic inheritance pattern of a disease trait.
 * They are shared so that Architect (which locks them onto the inheritance-pattern
 * variable) and the interview interface (which displays and filters on them) cannot drift apart.
 */
export const INHERITANCE_PATTERNS = [
  'autosomalDominant',
  'autosomalRecessive',
  'xLinkedDominant',
  'xLinkedRecessive',
  'yLinked',
  'mitochondrial',
  'multifactorial',
  'unknown',
] as const;

export type InheritancePattern = (typeof INHERITANCE_PATTERNS)[number];

/**
 * Canonical focal-position values for narrative pedigree focus.
 *
 * These values describe which family members are the primary focus of attention
 * in the pedigree. They are shared so that Architect (which locks them onto the
 * focal-position variable) and the interview interface (which uses them for display
 * and filtering) cannot drift apart.
 */
export const FOCAL_POSITIONS = [
  'ego',
  'egoChildren',
  'egoParents',
  'egoSiblings',
  'everyone',
] as const;

export type FocalPosition = (typeof FOCAL_POSITIONS)[number];
