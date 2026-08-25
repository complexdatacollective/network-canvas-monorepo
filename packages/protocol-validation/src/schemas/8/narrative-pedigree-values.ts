/**
 * Version-local schema contract definitions for the NarrativePedigree
 * interface.
 *
 * These values ARE the schema 8 contract: a protocol's disease definitions are
 * admissible only if their inheritance patterns come from this set. They live
 * inside the version directory — not in a shared constants package — so that
 * editing shared code can never silently redefine the contract of a schema
 * version that has already shipped.
 *
 * When a future schema version directory is created, COPY this file into it and
 * edit the copy. Never import it from another version's directory, and never
 * move it back out into cross-version shared code.
 */

/**
 * Canonical inheritance-pattern values for narrative pedigree disease
 * visualization.
 *
 * These values describe the genetic inheritance pattern of a disease trait.
 * Architect locks them onto the inheritance-pattern field and the interview
 * interface displays and filters on them, so schema 8 pins them here.
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
