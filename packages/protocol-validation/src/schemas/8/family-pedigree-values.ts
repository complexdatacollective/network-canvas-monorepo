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

/**
 * Relatives a participant has said are not in their family, or that they do
 * not know about. Recorded on the person they are relatives of, so that "has
 * no siblings" and "siblings not known" are kept distinct from a question
 * never answered. Siblings and children are the only open-ended groups: every
 * person has exactly two biological parents, so missing parents are added as
 * people (who may be entirely unknown) rather than recorded here.
 */
export const PEDIGREE_RELATIVES_NOT_RECORDED = [
  'noSiblings',
  'siblingsUnknown',
  'noChildren',
  'childrenUnknown',
] as const;

export type PedigreeRelativesNotRecorded =
  (typeof PEDIGREE_RELATIVES_NOT_RECORDED)[number];

const RELATIVES_NOT_RECORDED_LABELS: Record<
  PedigreeRelativesNotRecorded,
  string
> = {
  noSiblings: 'Has no siblings',
  siblingsUnknown: 'Siblings not known',
  noChildren: 'Has no children',
  childrenUnknown: 'Children not known',
};

export const PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS: {
  value: PedigreeRelativesNotRecorded;
  label: string;
}[] = PEDIGREE_RELATIVES_NOT_RECORDED.map((value) => ({
  value,
  label: RELATIVES_NOT_RECORDED_LABELS[value],
}));

/**
 * How much of the family a participant must record before continuing. Each
 * scope includes the ones before it; "biological" parents are those who gave
 * genes, so a gamete donor counts and a gestational carrier does not.
 *
 * - `parents`: both of the participant's biological parents (Bennett et al.
 *   2008 — every person descends from two, so an unknown parent is still
 *   drawn).
 * - `firstDegree`: adds the participant's siblings and children (first-degree
 *   relatives; the minimum for risk assessment in NCCN and ACOG guidance).
 * - `grandparents`: adds both biological parents of each of the participant's
 *   biological parents, and those parents' siblings — three generations on
 *   both sides, the scope of Family Healthware and MeTree.
 * - `secondDegree`: adds nieces and nephews (children of siblings) and
 *   grandchildren, completing the second-degree relatives.
 * - `thirdDegree`: adds first cousins (children of aunts and uncles) — the
 *   three-generation pedigree to third degree that Bennett recommends as the
 *   clinical standard.
 *
 * Siblings and children are satisfied by recording at least one, or by the
 * participant saying there are none or that they do not know.
 */
export const PEDIGREE_COMPLETENESS_SCOPES = [
  'parents',
  'firstDegree',
  'grandparents',
  'secondDegree',
  'thirdDegree',
] as const;

export type PedigreeCompletenessScope =
  (typeof PEDIGREE_COMPLETENESS_SCOPES)[number];

/**
 * How the interface describes family members to the participant.
 *
 * - `gendered`: the usual kinship words, chosen by each person's gender
 *   identity — mother, father, grandmother, aunt, nephew — and neutral words
 *   (parent, sibling, cousin) for anyone who is neither a woman nor a man.
 * - `gamete`: words that make no assumption about gender. Biological parents
 *   are described by the gamete they gave (egg parent, sperm parent, read
 *   from their recorded sex at birth), and every other relative by a neutral
 *   word (grandparent, parent's sibling, sibling's child).
 *
 * The framing changes only what is shown; nothing it produces is stored.
 */
export const FRAMING_IDS = ['gendered', 'gamete'] as const;

export type FramingId = (typeof FRAMING_IDS)[number];

/**
 * The stage's framing setting: one of the framings, or
 * `participantPreference`, which asks the participant to choose between them
 * when they first reach the stage.
 */
export const FRAMING_SETTINGS = [
  ...FRAMING_IDS,
  'participantPreference',
] as const;

export type FramingSetting = (typeof FRAMING_SETTINGS)[number];
