/**
 * Value sets the FamilyPedigree interface owns, and the vocabulary it offers
 * researchers for the one it does not.
 *
 * The interface both writes and reads sex assigned at birth, the relationship
 * kind and the relatives-not-recorded answers, so the codebook variables bound
 * to those slots must carry exactly these members; Architect locks them onto
 * the variable. Their labels are localized copy, and the ones here are only
 * the defaults. A person's symbol is not decided here: it is the person type's
 * codebook shape, which the researcher may map to any attribute.
 *
 * These value sets are the schema 9 contract. They live inside the version
 * directory, not in a shared constants package, so that editing shared code
 * can never silently redefine the contract of a schema version that has
 * already shipped.
 *
 * Gender identity is the researcher's. The interface only needs to know which
 * kinship words each of the researcher's options takes, so the stage carries a
 * mapping from option to `PEDIGREE_GENDER_WORDS`.
 */

/**
 * Which kinship words a gender identity option takes in the gendered framing.
 *
 * - `feminine`: mother, sister, daughter, grandmother, aunt, niece.
 * - `masculine`: father, brother, son, grandfather, uncle, nephew.
 * - `neutral`: parent, sibling, child, grandparent, parent's sibling.
 * - `unknown`: the person's gender is not known, so a biological parent is
 *   named from their sex assigned at birth ("biological mother") and every
 *   other relative with neutral words.
 */
export const PEDIGREE_GENDER_WORDS = [
  'feminine',
  'masculine',
  'neutral',
  'unknown',
] as const;

export type PedigreeGenderWords = (typeof PEDIGREE_GENDER_WORDS)[number];

/**
 * The gender identity options Architect offers to seed a new attribute with,
 * each with the words it takes by default. Architect supplies the translated
 * label for each value; the researcher may then edit, add or remove options,
 * so nothing reads these values back as the only possible ones.
 */
export const PEDIGREE_DEFAULT_GENDER_IDENTITIES = [
  { value: 'woman', words: 'feminine' },
  { value: 'man', words: 'masculine' },
  { value: 'nonBinary', words: 'neutral' },
  { value: 'differentIdentity', words: 'neutral' },
  { value: 'unknown', words: 'unknown' },
  { value: 'preferNotToSay', words: 'neutral' },
] as const satisfies readonly { value: string; words: PedigreeGenderWords }[];

export type PedigreeDefaultGenderIdentityValue =
  (typeof PEDIGREE_DEFAULT_GENDER_IDENTITIES)[number]['value'];

/**
 * Sex assigned at birth. The interface reads it to name biological parents
 * and donors by the gamete they gave, to know who could have carried a
 * pregnancy, to check that a child's two genetic parents are possible, to
 * choose the gendered framing's words when gender identity is not asked, and
 * to limit a nomination prompt to one sex.
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
  donor: 'Egg or sperm donor',
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
 * A person's relationship to the participant, which a Family Pedigree stage
 * may record in a categorical attribute so that later stages can filter and
 * skip on it (a filter tests only a person's own attributes). The interface
 * works it out from the family the participant drew, and owns the values:
 * they are language-independent and neutral, naming neither gender nor the
 * side of the family. Their labels are the researcher's codebook copy;
 * Architect seeds them in the researcher's language.
 *
 * - Parents: `parent` (a biological parent), `adoptiveParent`, `stepParent`
 *   (a step or social parent, or the current partner of a parent who raises
 *   them), `donor`, `surrogate`.
 * - Children: `child` (a biological child), `adoptiveChild`, `stepChild`,
 *   `donorConceivedChild`, `surrogacyChild`.
 * - Siblings: `sibling` (the same genetic parents: biological parents and
 *   donors), `halfSibling`, `adoptiveSibling` (sharing an adoptive parent but
 *   no genetic parent), `stepSibling`.
 * - Partners: `partner`, `formerPartner`.
 * - Further along the family: `grandparent`, `greatGrandparent`,
 *   `grandchild`, `greatGrandchild`, `parentsSibling`, `grandparentsSibling`,
 *   `siblingsChild`, `cousin`.
 * - In-laws: `parentInLaw`, `siblingInLaw`, `childInLaw`.
 * - `otherRelative`: connected to the participant, but by none of these.
 *
 * The participant themselves has no value, nor does anyone not connected to
 * them.
 */
export const PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT = [
  'parent',
  'adoptiveParent',
  'stepParent',
  'donor',
  'surrogate',
  'child',
  'adoptiveChild',
  'stepChild',
  'donorConceivedChild',
  'surrogacyChild',
  'sibling',
  'halfSibling',
  'adoptiveSibling',
  'stepSibling',
  'partner',
  'formerPartner',
  'grandparent',
  'greatGrandparent',
  'grandchild',
  'greatGrandchild',
  'parentsSibling',
  'grandparentsSibling',
  'siblingsChild',
  'cousin',
  'parentInLaw',
  'siblingInLaw',
  'childInLaw',
  'otherRelative',
] as const;

export type PedigreeRelationshipToParticipant =
  (typeof PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT)[number];

/**
 * The relationship values as an interface-owned option set. They carry no
 * labels: unlike the older sets, whose English labels a migrated schema 8
 * protocol is written with, these are only ever created in Architect, which
 * labels them through its translations.
 */
export const PEDIGREE_RELATIONSHIP_TO_PARTICIPANT_OPTIONS: {
  value: PedigreeRelationshipToParticipant;
}[] = PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT.map((value) => ({ value }));

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
 * - `gendered`: the usual kinship words — mother, father, grandmother, aunt,
 *   nephew — and neutral words (parent, sibling, cousin) for anyone whose
 *   words are neutral. A person's words come from their gender identity
 *   option (see `PEDIGREE_GENDER_WORDS`) when the stage asks about gender
 *   identity, and otherwise from their sex assigned at birth: female takes
 *   feminine words, male masculine, and anything else or unanswered neutral.
 * - `gamete`: words that make no assumption about gender. Biological parents
 *   are described by the gamete they gave (egg parent, sperm parent, read
 *   from their recorded sex at birth, and a plain parent when it is neither
 *   female nor male), and every other relative by a neutral word
 *   (grandparent, parent's sibling, sibling's child).
 *
 * The framing changes only what is shown, and nothing it produces is
 * exported. When the participant chooses the framing, the choice is kept in
 * the session's stage metadata so they are asked only once.
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
