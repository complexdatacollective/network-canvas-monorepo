/**
 * Version-local schema contract definitions for the FamilyPedigree interface.
 *
 * These value sets ARE the schema 8 contract: a protocol is admissible only if
 * its interface-owned variables carry exactly these members and labels, and its
 * framing is one of these ids. They live inside the version directory — not in
 * a shared constants package — so that editing shared code can never silently
 * redefine the contract of a schema version that has already shipped.
 *
 * When a future schema version directory is created, COPY this file into it and
 * edit the copy. Never import it from another version's directory, and never
 * move it back out into cross-version shared code.
 */

/**
 * Canonical relationship-type values for the FamilyPedigree interface.
 *
 * These are the option values stored on the `relationshipType` edge variable
 * (the discriminant for the pedigree Edge union). Architect locks them onto the
 * categorical edge variable and the interview interface reads and branches on
 * them, so schema 8 pins them here.
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

/**
 * Canonical gamete-role values for the FamilyPedigree interface — which
 * reproductive cell (gamete) a parent contributed to a child.
 *
 * Stored on the `gameteRole` categorical edge variable of genetic parent
 * edges.
 */
export const GAMETE_ROLES = ['egg', 'sperm'] as const;

export type GameteRole = (typeof GAMETE_ROLES)[number];

const GAMETE_ROLE_LABELS: Record<GameteRole, string> = {
  egg: 'Egg',
  sperm: 'Sperm',
};

/**
 * The gamete-role options as `{ value, label }` pairs, in canonical order.
 * Architect locks the categorical edge variable to exactly this set.
 */
export const GAMETE_ROLE_OPTIONS: {
  value: GameteRole;
  label: string;
}[] = GAMETE_ROLES.map((value) => ({
  value,
  label: GAMETE_ROLE_LABELS[value],
}));

/**
 * Canonical biological-sex values for pedigree participants — the sex recorded
 * at birth, needed for sex-linked genetic transmission (X-linked, Y-linked,
 * mitochondrial). This is distinct from gender identity.
 *
 * Stored on the `biologicalSex` node variable. Only `female`/`male` drive
 * transmission; `intersex`, `unknown`, and `preferNotToSay` are stored
 * distinctly but all propagate as uncertainty in the genetics engine.
 */
export const BIOLOGICAL_SEX_VALUES = [
  'female',
  'male',
  'intersex',
  'unknown',
  'preferNotToSay',
] as const;

export type BiologicalSex = (typeof BIOLOGICAL_SEX_VALUES)[number];

const BIOLOGICAL_SEX_LABELS: Record<BiologicalSex, string> = {
  female: 'Female',
  male: 'Male',
  intersex: 'Intersex or a variation in sex characteristics',
  unknown: 'Don’t know',
  preferNotToSay: 'Prefer not to say',
};

/**
 * The biological-sex options as `{ value, label }` pairs, in canonical order,
 * with participant-facing labels. The single source of truth for the choices
 * shown to a participant and described to a protocol author.
 */
export const BIOLOGICAL_SEX_OPTIONS: {
  value: BiologicalSex;
  label: string;
}[] = BIOLOGICAL_SEX_VALUES.map((value) => ({
  value,
  label: BIOLOGICAL_SEX_LABELS[value],
}));

/**
 * Framing identifiers for the FamilyPedigree interface.
 *
 * Two framings are supported: 'gamete' (biology-first language) and 'gendered'
 * (mother/father kinship terms). The stage's `framing` config stores one of
 * these ids; the participant-facing terminology each id selects is interview
 * copy and lives in the interview runtime.
 */
export const FRAMING_IDS = ['gamete', 'gendered'] as const;

export type FramingId = (typeof FRAMING_IDS)[number];
