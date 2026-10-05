/**
 * Value sets the FamilyPedigree interface owns.
 *
 * The interface both writes and reads these values — it draws a person's
 * symbol from their gender identity, annotates it with their sex assigned at
 * birth, and lays the family out from each relationship's kind — so the
 * codebook variables bound to those slots must carry exactly these members and
 * labels. Architect locks them onto the variable.
 */

/**
 * Gender identity, which decides the person's pedigree symbol: a square for a
 * man, a circle for a woman, and a diamond for everyone else (non-binary, a
 * different identity, or not known).
 */
export const PEDIGREE_GENDER_IDENTITIES = [
  'woman',
  'man',
  'nonBinary',
  'differentIdentity',
  'unknown',
  'preferNotToSay',
] as const;

export type PedigreeGenderIdentity =
  (typeof PEDIGREE_GENDER_IDENTITIES)[number];

const GENDER_IDENTITY_LABELS: Record<PedigreeGenderIdentity, string> = {
  woman: 'Woman',
  man: 'Man',
  nonBinary: 'Non-binary',
  differentIdentity: 'A different identity',
  unknown: 'Don’t know',
  preferNotToSay: 'Prefer not to say',
};

export const PEDIGREE_GENDER_IDENTITY_OPTIONS: {
  value: PedigreeGenderIdentity;
  label: string;
}[] = PEDIGREE_GENDER_IDENTITIES.map((value) => ({
  value,
  label: GENDER_IDENTITY_LABELS[value],
}));

/**
 * Sex assigned at birth, shown beneath the symbol as AFAB, AMAB or UAAB.
 */
export const PEDIGREE_SEX_ASSIGNED_AT_BIRTH = [
  'female',
  'male',
  'intersex',
  'unknown',
  'preferNotToSay',
] as const;

export type PedigreeSexAssignedAtBirth =
  (typeof PEDIGREE_SEX_ASSIGNED_AT_BIRTH)[number];

const SEX_ASSIGNED_AT_BIRTH_LABELS: Record<PedigreeSexAssignedAtBirth, string> =
  {
    female: 'Female',
    male: 'Male',
    intersex: 'Intersex',
    unknown: 'Don’t know',
    preferNotToSay: 'Prefer not to say',
  };

export const PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS: {
  value: PedigreeSexAssignedAtBirth;
  label: string;
}[] = PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
  value,
  label: SEX_ASSIGNED_AT_BIRTH_LABELS[value],
}));

/**
 * The kind of a relationship edge. A `partner` edge joins two partners in
 * either direction; every other kind is a parent edge, directed from the
 * parent to the child. Siblings are never stored: two people are siblings when
 * they share a parent.
 */
export const PEDIGREE_RELATIONSHIP_KINDS = [
  'partner',
  'biological',
  'adoptive',
  'social',
  'donor',
  'surrogate',
] as const;

export type PedigreeRelationshipKind =
  (typeof PEDIGREE_RELATIONSHIP_KINDS)[number];

export type PedigreeParentKind = Exclude<PedigreeRelationshipKind, 'partner'>;

const RELATIONSHIP_KIND_LABELS: Record<PedigreeRelationshipKind, string> = {
  partner: 'Partner',
  biological: 'Biological parent',
  adoptive: 'Adoptive parent',
  social: 'Step or social parent',
  donor: 'Donor',
  surrogate: 'Surrogate',
};

export const PEDIGREE_RELATIONSHIP_KIND_OPTIONS: {
  value: PedigreeRelationshipKind;
  label: string;
}[] = PEDIGREE_RELATIONSHIP_KINDS.map((value) => ({
  value,
  label: RELATIONSHIP_KIND_LABELS[value],
}));
