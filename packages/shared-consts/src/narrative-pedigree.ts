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
