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

/**
 * Canonical gamete-role values for the FamilyPedigree interface — which
 * reproductive cell (gamete) a parent contributed to a child.
 *
 * Stored on the `gameteRole` categorical edge variable of genetic parent
 * edges. Shared so that Architect (which locks them onto the variable) and
 * the interview interface (which writes and branches on them) cannot drift
 * apart.
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
 * Stored on the `biologicalSex` node variable. Shared so Architect and the
 * interview interface cannot drift apart. Only `female`/`male` drive
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
 * Participant-facing copy for the biological-sex question. Framing-invariant
 * (the mother/father vs egg/sperm framing never changes *this* question); only
 * the grammatical subject differs — the participant themselves, or a relative.
 */
export const BIOLOGICAL_SEX_QUESTION = {
  self: 'What sex were you recorded as at birth?',
  other: 'What sex was this person recorded as at birth?',
} as const;

export const BIOLOGICAL_SEX_HINT =
  'If you’re not sure, choose “Don’t know” — please don’t guess.';

/**
 * One-time explanation shown before the sex question is first asked, so the
 * participant understands it is about inheritance, not gender identity.
 */
export const BIOLOGICAL_SEX_LEAD_IN =
  'To understand how conditions can be passed down a family, we need the sex each person was recorded as at birth — not how they describe their gender.';
