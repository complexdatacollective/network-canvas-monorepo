import { hash } from 'ohash';
import { v4 as uuid } from 'uuid';

import {
  PEDIGREE_RELATIONSHIP_KINDS,
  PEDIGREE_RELATIVES_NOT_RECORDED,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  PEDIGREE_TWIN_KINDS,
  type FamilyPedigreeStageDefinition,
  type PedigreeGenderWords,
  type PedigreeParentKind,
  type PedigreeRelationshipKind,
  type PedigreeRelativesNotRecorded,
  type PedigreeSexAssignedAtBirth,
  type PedigreeTwinKind,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { readOwnProperty } from '../../utils/ownProperty';

/**
 * The codebook bindings a FamilyPedigree stage writes through, flattened out of
 * the stage definition.
 */
export type PedigreeConfig = {
  personType: string;
  nameAttribute: string;
  /**
   * The gender identity question. Absent when the stage does not ask about
   * gender identity: no question is shown, and the gendered framing's words
   * follow sex assigned at birth instead.
   */
  genderIdentity:
    | {
        attribute: string;
        /**
         * Which kinship words each option of the attribute takes. An option
         * not listed (or no longer an option) takes neutral words.
         */
        terms: readonly {
          value: string | number;
          words: PedigreeGenderWords;
        }[];
      }
    | undefined;
  sexAssignedAtBirthAttribute: string;
  egoAttribute: string;
  relationshipType: string;
  kindAttribute: string;
  gestationalCarrierAttribute: string;
  currentPartnerAttribute: string;
  /** Set when the stage has a completeness requirement. */
  relativesNotRecordedAttribute: string | undefined;
  /** Set when the stage records each person's relationship to the
   * participant. */
  relationshipToParticipantAttribute: string | undefined;
};

export function pedigreeConfigFromStage(
  stage: Pick<
    FamilyPedigreeStageDefinition,
    'subject' | 'nodeConfiguration' | 'edgeConfiguration' | 'completeness'
  >,
): PedigreeConfig {
  return {
    personType: stage.subject.type,
    nameAttribute: stage.nodeConfiguration.nameAttribute,
    genderIdentity: stage.nodeConfiguration.genderIdentity,
    sexAssignedAtBirthAttribute:
      stage.nodeConfiguration.sexAssignedAtBirthAttribute,
    egoAttribute: stage.nodeConfiguration.egoAttribute,
    relationshipType: stage.edgeConfiguration.type,
    kindAttribute: stage.edgeConfiguration.kindAttribute,
    gestationalCarrierAttribute:
      stage.edgeConfiguration.gestationalCarrierAttribute,
    currentPartnerAttribute: stage.edgeConfiguration.currentPartnerAttribute,
    relativesNotRecordedAttribute:
      stage.completeness?.relativesNotRecordedAttribute,
    relationshipToParticipantAttribute:
      stage.nodeConfiguration.relationshipToParticipantAttribute,
  };
}

export type Person = {
  id: string;
  isEgo: boolean;
  /** The name they were given, when there is one the stage can read. A label
   * the stage generated for them is not a name. */
  name: string | undefined;
  /**
   * They hold a name the stage cannot read: an encrypted name not yet
   * decrypted (before the passphrase is entered, or while it is being
   * decrypted), one the passphrase could not decrypt, or ciphertext on a
   * protocol that no longer encrypts. Nobody else is labelled after it, they
   * are never given a label to save or offered the name question, and the
   * canvas shows them by a label of their own until the name can be read.
   */
  hasUnreadableName: boolean;
  /**
   * Something is recorded about them beyond a name and a sex at birth: a
   * gender identity, an answer to one of the researcher's questions or
   * nominations, or an answer about their siblings or children. Someone with
   * none of these, and no name, may be a stand-in (`isStandIn`).
   */
  hasOtherDetails: boolean;
  /** The stage generated them as a stand-in (its metadata's `standIns`);
   * only someone it generated can be one (`isStandIn`). */
  markedStandIn: boolean;
  /** An edge of a type other than the family relationship's touches them:
   * something outside the pedigree refers to them, so they are never removed
   * as a stand-in, only their family links. */
  referencedElsewhere: boolean;
  /** The value of the gender identity option the person was given, whatever
   * the researcher defined it to be. Undefined when not yet answered. */
  genderIdentity: string | number | undefined;
  /**
   * The kinship words the gendered framing uses for them. With gender identity
   * collected, the words their option takes, undefined until it is answered.
   * Without it, the words their sex assigned at birth gives: feminine for
   * female, masculine for male, neutral for anything else or unanswered.
   */
  genderWords: PedigreeGenderWords | undefined;
  sexAssignedAtBirth: PedigreeSexAssignedAtBirth | undefined;
  /** Siblings or children the participant has said there are none of, or
   * doesn't know about. */
  relativesNotRecorded: PedigreeRelativesNotRecorded[];
  attributes: NcNode[typeof entityAttributesProperty];
};

/** The kind of a parent or partner link: any relationship kind but a twin
 * kind, since twins are recorded apart (`Family.twins`). */
export type FamilyLinkKind = Exclude<
  PedigreeRelationshipKind,
  PedigreeTwinKind
>;

export type FamilyLink = {
  id: string;
  /** The parent, for a parent link; either partner, for a partner link. */
  source: string;
  /** The child, for a parent link; the other partner, for a partner link. */
  target: string;
  kind: FamilyLinkKind;
  /** This parent carried the child's pregnancy. Any kind of parent may have
   * (a surrogate always did); a child has at most one. */
  isGestationalCarrier: boolean;
  isCurrentPartner: boolean;
};

/** Whether twins are identical (monozygotic), fraternal (dizygotic), or not
 * known to be either. */
export type TwinZygosity = 'identical' | 'fraternal' | 'unknown';

const ZYGOSITY_BY_KIND: Record<PedigreeTwinKind, TwinZygosity> = {
  identicalTwin: 'identical',
  fraternalTwin: 'fraternal',
  unknownZygosityTwin: 'unknown',
};

/** The relationship kind that records twins of this zygosity. */
export const TWIN_KIND_BY_ZYGOSITY: Record<TwinZygosity, PedigreeTwinKind> = {
  identical: 'identicalTwin',
  fraternal: 'fraternalTwin',
  unknown: 'unknownZygosityTwin',
};

/** Two people recorded as twins, in either order. */
export type TwinLink = {
  id: string;
  source: string;
  target: string;
  zygosity: TwinZygosity;
};

const isTwinKind = (kind: string): kind is PedigreeTwinKind =>
  PEDIGREE_TWIN_KINDS.some((twinKind) => twinKind === kind);

/** Whether a relationship kind is a parent or partner link's, not twins'. */
export const isFamilyLinkKind = (
  kind: PedigreeRelationshipKind,
): kind is FamilyLinkKind => !isTwinKind(kind);

export type Family = {
  /** In the order they were added. */
  people: Person[];
  byId: ReadonlyMap<string, Person>;
  /** Parent and partner links. */
  links: FamilyLink[];
  /** Pairs recorded as twins. */
  twins: TwinLink[];
  egoId: string | undefined;
};

/** Categorical values are stored as arrays; read the first known member. */
function readCategorical<T extends string>(
  value: VariableValue | undefined,
  allowed: readonly T[],
): T | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return allowed.find((member) => member === candidate);
}

/**
 * The option a categorical attribute holds, whatever the researcher defined
 * it to be: the first value of the stored array.
 */
function readOption(
  value: VariableValue | undefined,
): string | number | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate === 'number') return candidate;
  return typeof candidate === 'string' && candidate !== ''
    ? candidate
    : undefined;
}

/** Every known member of a multi-valued categorical value. */
function readCategoricalSet<T extends string>(
  value: VariableValue | undefined,
  allowed: readonly T[],
): T[] {
  const values: unknown[] = Array.isArray(value) ? value : [];
  return allowed.filter((member) => values.includes(member));
}

/** The words used for a person when gender identity is not collected. */
function wordsFromSexAssignedAtBirth(
  sex: PedigreeSexAssignedAtBirth | undefined,
): PedigreeGenderWords {
  if (sex === 'female') return 'feminine';
  if (sex === 'male') return 'masculine';
  return 'neutral';
}

/**
 * The fingerprint of a name attribute value, as recorded in the stage
 * metadata's `generatedLabels` for each person the stage gave a label. It is
 * taken from the value as stored, which is ciphertext when the attribute is
 * encrypted, so it identifies the write without the label's text, and any
 * later write (even of the same words, which encrypt differently each time)
 * no longer matches it.
 */
export const nameFingerprint = (value: VariableValue): string => hash(value);

/**
 * Whether the person still holds the label the stage generated for them: they
 * are recorded in `generatedLabels`, and their name attribute holds the very
 * value the stage wrote. A name written since, by the participant here or on
 * another stage, is theirs.
 */
export function holdsGeneratedLabel(
  generatedLabels: Readonly<Record<string, string>>,
  personId: string,
  recorded: VariableValue | undefined,
): boolean {
  return (
    recorded !== undefined &&
    Object.hasOwn(generatedLabels, personId) &&
    generatedLabels[personId] === nameFingerprint(recorded)
  );
}

/**
 * The family as recorded. `generatedLabels` records, by person id, the
 * fingerprint of each label the stage saved as the name of someone the
 * participant left unnamed: someone who still holds that label is read as
 * unnamed, so their label is worked out afresh from the family as it stands.
 * `decryptedNames` holds, by person id, the text of each encrypted name the
 * stage has decrypted; any other encrypted name cannot be read. `standIns`
 * holds the ids of the stand-ins the stage generated (its metadata's
 * `standIns`).
 */
export function readFamily(
  nodes: readonly NcNode[],
  edges: readonly NcEdge[],
  config: PedigreeConfig,
  generatedLabels: Readonly<Record<string, string>> = {},
  decryptedNames: ReadonlyMap<string, string> = new Map(),
  standIns: ReadonlySet<string> = new Set(),
): Family {
  const referencedElsewhere = new Set(
    edges
      .filter((edge) => edge.type !== config.relationshipType)
      .flatMap((edge) => [edge.from, edge.to]),
  );
  const people: Person[] = nodes
    .filter((node) => node.type === config.personType)
    .map((node) => {
      const attributes = node[entityAttributesProperty];
      const attribute = (key: string) => readOwnProperty(attributes, key);
      const recorded = attribute(config.nameAttribute);
      const id = node[entityPrimaryKeyProperty];
      const isGenerated = holdsGeneratedLabel(generatedLabels, id, recorded);
      // Anything but text in a text attribute is ciphertext: an encrypted
      // name, read only once it is decrypted.
      const text =
        typeof recorded === 'string' ? recorded : decryptedNames.get(id);
      const name =
        !isGenerated && text !== undefined && text.trim() !== ''
          ? text
          : undefined;
      const hasUnreadableName =
        !isGenerated && recorded !== undefined && text === undefined;
      const genderIdentityConfig = config.genderIdentity;
      const genderIdentity = genderIdentityConfig
        ? readOption(attribute(genderIdentityConfig.attribute))
        : undefined;
      const sexAssignedAtBirth = readCategorical(
        attribute(config.sexAssignedAtBirthAttribute),
        PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
      );
      // The attributes the interface itself writes, which say nothing the
      // participant told it about the person: a name and a sex at birth are
      // judged on their own.
      const ownAttributes = new Set([
        config.nameAttribute,
        config.sexAssignedAtBirthAttribute,
        config.egoAttribute,
        config.relationshipToParticipantAttribute,
      ]);
      const hasOtherDetails = Object.entries(attributes).some(
        ([key, value]) => !ownAttributes.has(key) && !isEmpty(value),
      );
      return {
        id,
        isEgo: attribute(config.egoAttribute) === true,
        name,
        hasUnreadableName,
        hasOtherDetails,
        markedStandIn: standIns.has(id),
        referencedElsewhere: referencedElsewhere.has(id),
        genderIdentity,
        genderWords: genderIdentityConfig
          ? genderIdentity === undefined
            ? undefined
            : (genderIdentityConfig.terms.find(
                (term) => term.value === genderIdentity,
              )?.words ?? 'neutral')
          : wordsFromSexAssignedAtBirth(sexAssignedAtBirth),
        sexAssignedAtBirth,
        relativesNotRecorded: readCategoricalSet(
          config.relativesNotRecordedAttribute
            ? attribute(config.relativesNotRecordedAttribute)
            : undefined,
          PEDIGREE_RELATIVES_NOT_RECORDED,
        ),
        attributes,
      };
    });
  const byId = new Map(people.map((person) => [person.id, person]));

  const links: FamilyLink[] = [];
  const twins: TwinLink[] = [];
  for (const edge of edges) {
    if (edge.type !== config.relationshipType) continue;
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    const attributes = edge[entityAttributesProperty];
    const attribute = (key: string) => readOwnProperty(attributes, key);
    const kind = readCategorical(
      attribute(config.kindAttribute),
      PEDIGREE_RELATIONSHIP_KINDS,
    );
    if (!kind) continue;
    if (isTwinKind(kind)) {
      twins.push({
        id: edge[entityPrimaryKeyProperty],
        source: edge.from,
        target: edge.to,
        zygosity: ZYGOSITY_BY_KIND[kind],
      });
      continue;
    }
    links.push({
      id: edge[entityPrimaryKeyProperty],
      source: edge.from,
      target: edge.to,
      kind,
      isGestationalCarrier:
        attribute(config.gestationalCarrierAttribute) === true,
      // A partnership is current unless recorded otherwise.
      isCurrentPartner: attribute(config.currentPartnerAttribute) !== false,
    });
  }

  return {
    people,
    byId,
    links,
    twins,
    egoId: people.find((person) => person.isEgo)?.id,
  };
}

const PRIMARY_PARENT_KINDS: ReadonlySet<PedigreeRelationshipKind> =
  new Set<PedigreeRelationshipKind>(['biological', 'adoptive', 'social']);

function parentLinksOf(family: Family, personId: string) {
  return family.links.filter(
    (link) => link.kind !== 'partner' && link.target === personId,
  );
}

/** Whether someone is recorded as having carried the person's pregnancy. */
export function hasCarrier(family: Family, personId: string): boolean {
  return parentLinksOf(family, personId).some(
    (link) => link.isGestationalCarrier,
  );
}

/** Parents who raise or are related to the person — not donors or surrogates. */
export function primaryParentsOf(family: Family, personId: string): string[] {
  return parentLinksOf(family, personId)
    .filter((link) => PRIMARY_PARENT_KINDS.has(link.kind))
    .map((link) => link.source);
}

export function partnersOf(family: Family, personId: string): string[] {
  return family.links
    .filter(
      (link) =>
        link.kind === 'partner' &&
        (link.source === personId || link.target === personId),
    )
    .map((link) => (link.source === personId ? link.target : link.source));
}

/** The person's genetic parents: their biological parents and gamete
 * donors, who each gave them an egg or a sperm. */
function geneticParentsOf(family: Family, personId: string): string[] {
  return parentLinksOf(family, personId)
    .filter((link) => isGeneticKind(link.kind))
    .map((link) => link.source);
}

/** A person's primary parents and genetic parents together. */
const primaryOrGeneticParentsOf = (family: Family, personId: string) =>
  new Set([
    ...primaryParentsOf(family, personId),
    ...geneticParentsOf(family, personId),
  ]);

/**
 * The other parents of the person's children who are not their partners:
 * someone they had a child with, recorded as the child's parent alone, as an
 * unnamed parent added for a child is. Every child counts, whatever kind of
 * parent the person is to them: the parent of a child they were the donor or
 * surrogate for is someone they may have another child with.
 */
function coParentsOf(family: Family, personId: string): string[] {
  const partners = new Set(partnersOf(family, personId));
  const children = new Set(
    family.links
      .filter((link) => link.source === personId && link.kind !== 'partner')
      .map((link) => link.target),
  );
  const coParents = new Set<string>();
  for (const childId of children) {
    for (const parentId of primaryParentsOf(family, childId)) {
      if (parentId !== personId && !partners.has(parentId)) {
        coParents.add(parentId);
      }
    }
  }
  return [...coParents];
}

/**
 * Who could be the other parent of a child the person has: their current
 * partners, then their former partners, then anyone else they already have
 * a child with (`coParentsOf`). `preferred` is the one to assume until the
 * participant answers: their only current partner, and nobody while the
 * child could as well be another's.
 */
export function otherParentChoices(
  family: Family,
  personId: string,
): { choices: string[]; preferred: string | undefined } {
  const partnerships = family.links.filter(
    (link) =>
      link.kind === 'partner' &&
      (link.source === personId || link.target === personId),
  );
  const partnerOf = (link: FamilyLink) =>
    link.source === personId ? link.target : link.source;
  const current = partnerships
    .filter((link) => link.isCurrentPartner)
    .map(partnerOf);
  const former = partnerships
    .filter((link) => !link.isCurrentPartner)
    .map(partnerOf);
  return {
    choices: [...current, ...former, ...coParentsOf(family, personId)],
    preferred: current.length === 1 ? current[0] : undefined,
  };
}

/** Everyone who shares at least one primary or genetic parent with the
 * person: a donor's other children are their siblings too. */
export function siblingsOf(family: Family, personId: string): string[] {
  const parents = primaryOrGeneticParentsOf(family, personId);
  if (parents.size === 0) return [];
  return family.people
    .filter(
      (person) =>
        person.id !== personId &&
        [...primaryOrGeneticParentsOf(family, person.id)].some((parent) =>
          parents.has(parent),
        ),
    )
    .map((person) => person.id);
}

/**
 * The person's full siblings: those with exactly the same primary parents.
 * While the person's parents are incomplete, a sibling who shares their one
 * known parent but has another as well is a half sibling, because the
 * person's own second parent, when added, is not that other parent (each pair
 * of people has one link at most). The kinship words and the genetics engine
 * compare parent sets the same way.
 */
export function fullSiblingsOf(family: Family, personId: string): string[] {
  const parents = new Set(primaryParentsOf(family, personId));
  // Someone with no primary parent shares none, whoever their donors are.
  if (parents.size === 0) return [];
  return siblingsOf(family, personId).filter((siblingId) => {
    const siblingParents = new Set(primaryParentsOf(family, siblingId));
    return (
      siblingParents.size === parents.size &&
      [...parents].every((parent) => siblingParents.has(parent))
    );
  });
}

const adoptiveParentsOf = (family: Family, personId: string) =>
  family.links
    .filter((link) => link.target === personId && link.kind === 'adoptive')
    .map((link) => link.source);

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((item) => b.has(item));

/**
 * How two people are siblings, if they are: the one definition the canvas
 * labels, the saved relationship to the participant and twins all follow.
 *
 * It is decided from their genetic parents first (biological parents and
 * donors): full siblings have the same genetic parents, and half siblings
 * share some. Only two people who share no genetic parent are adoptive
 * siblings, when one has adopted either of them and is a parent to both;
 * they are half adoptive siblings unless their genetic and adoptive parents
 * are the same. An adoptive parent never makes full genetic siblings half
 * siblings. Someone who shares only a step-parent is not a sibling here, and
 * is reached through that parent instead.
 */
export function siblingTie(
  family: Family,
  a: string,
  b: string,
): { half: boolean; adoptive: boolean } | undefined {
  const aGenetic = new Set(geneticParentsOf(family, a));
  const bGenetic = new Set(geneticParentsOf(family, b));
  if ([...aGenetic].some((parent) => bGenetic.has(parent))) {
    return { half: !sameSet(aGenetic, bGenetic), adoptive: false };
  }
  const aParents = new Set([...aGenetic, ...adoptiveParentsOf(family, a)]);
  const bParents = new Set([...bGenetic, ...adoptiveParentsOf(family, b)]);
  if (![...aParents].some((parent) => bParents.has(parent))) return undefined;
  return { half: !sameSet(aParents, bParents), adoptive: true };
}

export type MissingDetail =
  | 'genderIdentity'
  | 'sexAssignedAtBirth'
  | { variable: string };

const isEmpty = (value: VariableValue | undefined) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

/**
 * The required details not yet given for a person: the interface's own
 * person attributes (gender identity only where the stage collects it), then
 * every researcher field whose attribute the codebook marks required. A name
 * is never missing, even when the name attribute is required: a participant
 * may not know it, and anyone left unnamed is given a label from how they
 * are related to the participant when the participant leaves the stage.
 */
export function missingDetailsFor(
  person: Person,
  requiredFormVariables: readonly string[],
  config: Pick<PedigreeConfig, 'genderIdentity'>,
): MissingDetail[] {
  const missing: MissingDetail[] = [];
  if (config.genderIdentity && person.genderIdentity === undefined) {
    missing.push('genderIdentity');
  }
  if (person.sexAssignedAtBirth === undefined) {
    missing.push('sexAssignedAtBirth');
  }
  for (const variable of requiredFormVariables) {
    if (isEmpty(readOwnProperty(person.attributes, variable))) {
      missing.push({ variable });
    }
  }
  return missing;
}

export type Relation = 'parent' | 'sibling' | 'partner' | 'child';

export type PersonDetails = Record<string, VariableValue>;

/**
 * What the participant asked for in the side panel, beyond the new person's
 * own details.
 */
export type AddRelativeRequest =
  | {
      relation: 'parent';
      parentKind: PedigreeParentKind;
      /** The new parent carried the pregnancy of the anchor and of each
       * sibling chosen, among those with nobody else recorded as carrying
       * theirs. Any kind of parent may have; a surrogate always did. */
      carriedPregnancy: boolean;
      /** An existing parent of the anchor who is this parent's partner. */
      partnerId: string | null;
      partnershipCurrent: boolean;
      /** Anchor's siblings who share this new parent. */
      alsoParentOf: readonly string[];
    }
  | { relation: 'partner'; partnershipCurrent: boolean }
  | {
      relation: 'child';
      /** A partner of the anchor, `'unknown'` for someone not shown, or null. */
      otherParent: string | 'unknown' | null;
      /** The anchor's kind of parent to the child. A child conceived with
       * the anchor's donated egg or sperm, or carried by the anchor as a
       * surrogate, is the other parent's biological child. */
      parentKind: PedigreeParentKind;
      /** For a biological child with another parent, which of them is a
       * biological parent; the other is a social parent. */
      biologicalParent: 'both' | 'anchor' | 'otherParent';
      /** Which of the child's parents carried the pregnancy, whatever kind
       * of parent they are, or null when neither did or it is not known. A
       * surrogate carried a child they are the surrogate of, so is never
       * asked. */
      carrier: 'anchor' | 'otherParent' | null;
    }
  | {
      relation: 'sibling';
      /** The anchor's parents the sibling shares. */
      sharedParentIds: readonly string[];
      /**
       * For someone with no parents, who is given an unnamed egg parent and
       * sperm parent for the sibling to hang from: the one of them the
       * sibling shares, when only one. Absent, the sibling shares both.
       * Anyone with a genetic parent recorded already has two (the stand-in
       * rule, `planStandIns`), so is never given another.
       */
      sharesOnly?: 'eggParent' | 'spermParent';
      /** The sibling's own relationship to the parents they share, which
       * need not be the anchor's: one may be adopted and the other not. */
      parentKind: 'biological' | 'adoptive' | 'social';
      /**
       * For a biological sibling, which of the parents they share is their
       * biological parent, when only one of them could be (ruling 26): two
       * mothers, say. Absent, the anchor's biological parents are taken
       * first.
       */
      biologicalParentId?: string;
      /** The sibling is the anchor's twin, of this zygosity (ruling 16). */
      twin?: TwinZygosity;
      /**
       * Who carried the pregnancy, for a biological sibling: one of the
       * parents the sibling is planned to have (`possibleCarriers`), by id,
       * which for an unnamed parent the addition gives them is the id the
       * plan creates for that parent. Null when not known.
       */
      carrier: string | null;
    };

export type PlannedPerson = { id: string; details: PersonDetails };

/** A change to someone already recorded: the details to set, and the
 * attributes to unset. */
export type PlannedUpdate = PlannedPerson & { unset?: string[] };

/** Twins recorded as of another zygosity, by the link recording them. */
export type TwinZygosityChange = { linkId: string; zygosity: TwinZygosity };

export type PlannedLink = {
  source: string;
  target: string;
  kind: FamilyLinkKind;
  isGestationalCarrier?: boolean;
  isCurrentPartner?: boolean;
};

export type AdditionPlan = {
  people: PlannedPerson[];
  links: PlannedLink[];
  /** Stand-ins whose sex at birth the addition changes (`planStandIns`). */
  updatedPeople?: PlannedUpdate[];
  /** Links of stand-ins who give way to someone the addition records in
   * their place. */
  removedLinkIds?: string[];
  /** Stand-ins the addition leaves standing in for nobody. */
  removedPersonIds?: string[];
  /** The people among `people` who are stand-ins the addition generates,
   * to be recorded as the stage's stand-ins. */
  standInIds?: string[];
  /** Twins the addition records. */
  twins?: PlannedTwin[];
  /** Twins recorded as identical whose genetic parents the addition makes
   * differ, recorded as not known to be identical (`planStandIns`). */
  changedTwins?: TwinZygosityChange[];
};

/** Two people to record as twins. */
export type PlannedTwin = {
  source: string;
  target: string;
  zygosity: TwinZygosity;
};

/**
 * Everything to create when adding a relative: the new person, any unnamed
 * placeholder people the relationship needs (a sibling of someone without
 * parents needs parents to hang from), and the links between them.
 */
export function planAddRelative({
  family,
  anchorId,
  newPersonId,
  details,
  request,
  createId,
  sexAttribute,
}: {
  family: Family;
  anchorId: string;
  newPersonId: string;
  details: PersonDetails;
  request: AddRelativeRequest;
  createId: () => string;
  /** Where an unnamed parent's sex at birth is recorded, when it follows
   * from the gamete they gave. */
  sexAttribute: string;
}): AdditionPlan {
  const people: PlannedPerson[] = [{ id: newPersonId, details }];
  const links: PlannedLink[] = [];
  // An unnamed parent, with the sex at birth of the gamete they gave when
  // that is known.
  const addPlaceholder = (sex: 'female' | 'male' | undefined) => {
    const id = createId();
    people.push({ id, details: sex ? { [sexAttribute]: [sex] } : {} });
    return id;
  };

  switch (request.relation) {
    case 'parent': {
      const kind = request.parentKind;
      const carried = carriesAs(kind, request.carriedPregnancy);
      // The new parent is the same parent to the anchor and to each sibling
      // chosen: the same kind, and the same record of carrying the
      // pregnancy, except for anyone who already has someone recorded as
      // carrying theirs (one person carries a pregnancy). The form asks
      // about carrying whenever one of them has nobody recorded, and offers
      // a surrogate only to people with no carrier, since a surrogate
      // carried the pregnancy by definition.
      for (const childId of [anchorId, ...request.alsoParentOf]) {
        links.push({
          source: newPersonId,
          target: childId,
          kind,
          isGestationalCarrier: carried && !hasCarrier(family, childId),
        });
      }
      if (request.partnerId && PRIMARY_PARENT_KINDS.has(kind)) {
        links.push({
          source: request.partnerId,
          target: newPersonId,
          kind: 'partner',
          isCurrentPartner: request.partnershipCurrent,
        });
      }
      break;
    }
    case 'partner': {
      links.push({
        source: anchorId,
        target: newPersonId,
        kind: 'partner',
        isCurrentPartner: request.partnershipCurrent,
      });
      break;
    }
    case 'child': {
      const kind = request.parentKind;
      let otherParentId: string | null = null;
      if (request.otherParent === 'unknown') {
        // The other genetic parent of a biological or donor-conceived child
        // gave the other gamete. They are the child's parent and nothing
        // more: whether they are or were the anchor's partner is not asked,
        // so not recorded.
        otherParentId = addPlaceholder(
          isGeneticKind(kind)
            ? otherGameteSex(family.byId.get(anchorId)?.sexAssignedAtBirth)
            : undefined,
        );
      } else if (request.otherParent) {
        otherParentId = request.otherParent;
      }
      // Any kind of parent may have carried the pregnancy: a surrogate
      // always did, and otherwise the parent the participant chose. The
      // other parent of a child conceived with a donor's gamete, or carried
      // by a surrogate, is its biological parent.
      const kindFor = (parent: 'anchor' | 'otherParent') => {
        if (
          parent === 'otherParent' &&
          (kind === 'donor' || kind === 'surrogate')
        ) {
          return 'biological';
        }
        return kind === 'biological' &&
          request.biologicalParent !== 'both' &&
          request.biologicalParent !== parent
          ? 'social'
          : kind;
      };
      const anchorKind = kindFor('anchor');
      links.push({
        source: anchorId,
        target: newPersonId,
        kind: anchorKind,
        isGestationalCarrier: carriesAs(
          anchorKind,
          request.carrier === 'anchor',
        ),
      });
      if (otherParentId) {
        const otherKind = kindFor('otherParent');
        links.push({
          source: otherParentId,
          target: newPersonId,
          kind: otherKind,
          isGestationalCarrier:
            kind !== 'surrogate' && request.carrier === 'otherParent',
        });
      }
      break;
    }
    case 'sibling': {
      const anchorParents = primaryParentsOf(family, anchorId);
      // The anchor's donors are offered too, so that a sibling who shares
      // only a donor can be added (ruling 20).
      const anchorDonors = parentLinksOf(family, anchorId)
        .filter((link) => link.kind === 'donor')
        .map((link) => link.source);
      const shared = request.sharedParentIds.filter((id) =>
        anchorParents.includes(id),
      );
      const sharedDonors = request.sharedParentIds.filter((id) =>
        anchorDonors.includes(id),
      );
      // Siblings hang from the parents they share. Someone without parents
      // is given unnamed ones for the sibling to share, for the participant
      // to fill in later; they are never recorded as anyone's partner.
      // Anyone with a genetic parent has two, a stand-in holding the place of
      // one not yet recorded (the stand-in rule, `planStandIns`), so a
      // sibling who does not share one is given a stand-in of their own by
      // the same rule below, and nobody else is added for them.
      const placeholders: { id: string; kind: 'biological' | 'adoptive' }[] =
        [];
      let sharedPlaceholders: string[] = [];
      if (anchorParents.length === 0) {
        // Someone with no genetic parent is given an egg parent and a sperm
        // parent. Someone with no parents to hang the sibling from has no
        // genetic parent, or else only donors (who are not stood in for
        // beside each other): donors do not conceive children, so someone
        // used them and raised the anchor, taken to be adoptive parents
        // (ruling 23).
        const gametes: ('female' | 'male')[] =
          geneticParentsOf(family, anchorId).length === 0
            ? ['female', 'male']
            : [];
        const added =
          gametes.length > 0
            ? gametes.map((sex) => {
                const id = addPlaceholder(sex);
                placeholders.push({ id, kind: 'biological' });
                return id;
              })
            : [0, 1].map(() => {
                const id = addPlaceholder(undefined);
                placeholders.push({ id, kind: 'adoptive' });
                return id;
              });
        // Sharing one of them names the one who gave that gamete; with no
        // such parent added, the sibling shares all of them.
        const giver =
          request.sharesOnly === 'eggParent'
            ? 'female'
            : request.sharesOnly === 'spermParent'
              ? 'male'
              : undefined;
        const chosen = added.filter(
          (_, index) => giver !== undefined && gametes[index] === giver,
        );
        sharedPlaceholders = chosen.length > 0 ? chosen : added;
      }
      for (const { id, kind } of placeholders) {
        links.push({ source: id, target: anchorId, kind });
      }
      // A sibling shares at least one parent; with none chosen, all of them.
      // Their relationship to those parents is their own. A biological
      // sibling is the biological child of the parent named as their
      // biological parent (ruling 26), then of the anchor's biological
      // parents they share, then of the others while they could have given a
      // gamete beside them; a shared parent who could not stays the kind of
      // parent they are to the anchor (a step-parent beside two mothers,
      // say). A donor they share is their donor.
      const sharesNone =
        shared.length === 0 &&
        sharedPlaceholders.length === 0 &&
        sharedDonors.length === 0;
      const anchorKindOf = (parentId: string) =>
        placeholders.find((placeholder) => placeholder.id === parentId)?.kind ??
        parentLinksOf(family, anchorId).find((link) => link.source === parentId)
          ?.kind;
      const siblingParents = [
        ...(sharesNone ? anchorParents : shared),
        ...sharedPlaceholders,
      ];
      const named = request.biologicalParentId;
      const ordered =
        request.parentKind === 'biological'
          ? [
              ...siblingParents.filter((id) => id === named),
              ...siblingParents.filter(
                (id) => id !== named && anchorKindOf(id) === 'biological',
              ),
              ...siblingParents.filter(
                (id) => id !== named && anchorKindOf(id) !== 'biological',
              ),
            ]
          : siblingParents;
      const geneticSexes: (string | undefined)[] = [];
      for (const donorId of sharedDonors) {
        const sex = family.byId.get(donorId)?.sexAssignedAtBirth;
        if (!geneticParentsPossible([...geneticSexes, sex])) continue;
        geneticSexes.push(sex);
        links.push({ source: donorId, target: newPersonId, kind: 'donor' });
      }
      for (const parentId of ordered) {
        let kind: FamilyLinkKind = request.parentKind;
        if (kind === 'biological') {
          const sex = plannedSexOf(
            family,
            { people, links },
            parentId,
            sexAttribute,
          );
          if (geneticParentsPossible([...geneticSexes, sex])) {
            geneticSexes.push(sex);
          } else {
            const anchorKind = anchorKindOf(parentId);
            kind = anchorKind === 'adoptive' ? 'adoptive' : 'social';
          }
        }
        links.push({ source: parentId, target: newPersonId, kind });
      }
      break;
    }
  }

  const kept = keepWithinGeneticLimit(family, people, links, sexAttribute);
  // The family as the addition leaves it keeps the stand-in rule: anyone it
  // leaves with one genetic parent is given a stand-in for the other, and a
  // stand-in whose place the addition fills gives way.
  const standIns = planStandIns(
    familyWithPlan(family, people, kept, sexAttribute),
    createId,
    sexAttribute,
  );
  const isPlanned = (linkId: string) =>
    linkId.startsWith(plannedLinkId(0).slice(0, -1));
  const plan: AdditionPlan = {
    people: [
      ...people.filter(
        (planned) => !standIns.removedPersonIds.includes(planned.id),
      ),
      ...standIns.people,
    ],
    links: [
      ...kept.filter(
        (_, index) => !standIns.removedLinkIds.includes(plannedLinkId(index)),
      ),
      ...standIns.links,
    ],
    updatedPeople: standIns.updatedPeople,
    removedLinkIds: standIns.removedLinkIds.filter((id) => !isPlanned(id)),
    removedPersonIds: standIns.removedPersonIds,
    standInIds: standIns.people.map((person) => person.id),
    changedTwins: standIns.changedTwins,
  };
  if (request.relation === 'sibling' && request.twin !== undefined) {
    plan.twins = twinsForNewSibling(
      family,
      familyWithPlan(family, plan.people, plan.links, sexAttribute),
      anchorId,
      newPersonId,
      request.twin,
    );
  }
  if (request.relation !== 'sibling' || request.carrier === null) {
    return plan;
  }
  // The sibling's carrier is one of the parents they are planned to have
  // who could have carried the pregnancy; any other answer, which a later
  // one has made impossible, records nobody.
  const carrier = possibleCarriers(
    family,
    plan,
    newPersonId,
    sexAttribute,
  ).find((id) => id === request.carrier);
  return {
    ...plan,
    links: plan.links.map((link) =>
      carrier !== undefined &&
      link.source === carrier &&
      link.target === newPersonId
        ? { ...link, isGestationalCarrier: true }
        : link,
    ),
  };
}

/** The person's twins, each with their zygosity and the link recording it. */
export function twinsOf(
  family: Family,
  personId: string,
): { twinId: string; zygosity: TwinZygosity; linkId: string }[] {
  return family.twins.flatMap((twin) =>
    twin.source === personId || twin.target === personId
      ? [
          {
            twinId: twin.source === personId ? twin.target : twin.source,
            zygosity: twin.zygosity,
            linkId: twin.id,
          },
        ]
      : [],
  );
}

/**
 * The person's twin set: everyone born of the same pregnancy as them, them
 * included. Twins form a set, with a twin link between every pair, so this
 * is everyone their twin links reach, however indirectly; a set recorded
 * with a pair missing is still one set.
 */
export function twinSetOf(family: Family, personId: string): string[] {
  const set = [personId];
  for (let index = 0; index < set.length; index += 1) {
    for (const { twinId } of twinsOf(family, set[index]!)) {
      if (!set.includes(twinId)) set.push(twinId);
    }
  }
  return set;
}

/** The twin link between two people, if there is one. */
function twinLinkBetween(family: Family, a: string, b: string) {
  return family.twins.find(
    (twin) =>
      (twin.source === a && twin.target === b) ||
      (twin.source === b && twin.target === a),
  );
}

/**
 * The zygosity of `a` and `c`, from those of `a` and `b` and of `b` and
 * `c`. Identical twins come from one egg, so someone identical to `b` is to
 * `c` what `b` is; two twins are identical only when both pairs are, and
 * fraternal when either pair is.
 */
function zygosityThrough(ab: TwinZygosity, bc: TwinZygosity): TwinZygosity {
  if (ab === 'identical') return bc;
  if (bc === 'identical') return ab;
  return ab === 'fraternal' || bc === 'fraternal' ? 'fraternal' : 'unknown';
}

/**
 * Who could be recorded as the person's twins: their siblings by the
 * kinship model's own test (`siblingTie`: genetic or adoptive siblings, never
 * step or social-only siblings), whose own twin set the person could join —
 * each of its members is the person's sibling too — and everyone already in
 * the person's twin set.
 */
export function twinCandidatesOf(family: Family, personId: string): string[] {
  const own = twinSetOf(family, personId);
  const isSibling = (id: string) =>
    id !== personId && siblingTie(family, personId, id) !== undefined;
  const candidates = family.people
    .map((person) => person.id)
    .filter(
      (id) =>
        !own.includes(id) &&
        isSibling(id) &&
        twinSetOf(family, id).every(isSibling),
    );
  return [...own.filter((id) => id !== personId), ...candidates];
}

/** Whether two people could be identical twins: identical twins come from
 * one egg and one sperm, so they have the same genetic parents. */
export function identicalTwinsPossible(
  family: Family,
  a: string,
  b: string,
): boolean {
  const first = new Set(geneticParentsOf(family, a));
  const second = geneticParentsOf(family, b);
  return first.size === second.length && second.every((id) => first.has(id));
}

/**
 * The twins a new sibling, recorded as the anchor's twin of `zygosity`, is
 * given: everyone in the anchor's twin set, the anchor included, born of the
 * same pregnancy. Twins are identical only while they would have the same
 * genetic parents, and otherwise not known to be; each of the anchor's twins
 * is to the sibling as `zygosityThrough` the anchor works out.
 */
function twinsForNewSibling(
  family: Family,
  planned: Family,
  anchorId: string,
  siblingId: string,
  zygosity: TwinZygosity,
): PlannedTwin[] {
  const possible = (a: string, b: string, wanted: TwinZygosity) =>
    wanted === 'identical' && !identicalTwinsPossible(planned, a, b)
      ? 'unknown'
      : wanted;
  const withAnchor = possible(anchorId, siblingId, zygosity);
  return [
    { source: anchorId, target: siblingId, zygosity: withAnchor },
    ...twinSetOf(family, anchorId)
      .filter((twinId) => twinId !== anchorId)
      .map((twinId) => ({
        source: twinId,
        target: siblingId,
        zygosity: possible(
          twinId,
          siblingId,
          zygosityThrough(
            twinLinkBetween(family, anchorId, twinId)?.zygosity ?? 'unknown',
            withAnchor,
          ),
        ),
      })),
  ];
}

/**
 * What to change so that the person's twins are the siblings answered, each
 * of the zygosity answered, keeping every twin set whole: a link between
 * every pair in a set, and none between sets.
 *
 * - A sibling answered who is in another twin set brings their whole set
 *   into the person's, each of its members as `zygosityThrough` that sibling
 *   works out.
 * - Someone in the person's set who is not answered leaves it: their links to
 *   everyone staying are removed, and their links to anyone else leaving are
 *   kept, so a person unticking every twin leaves the others twins.
 * - The person's own pairs take the answers. Anyone identical to the person
 *   is to everyone else what the person is; any other pair keeps what is
 *   recorded, and a pair the change newly forms takes `zygosityThrough` the
 *   person. A worked-out pair is identical only while the two would have the
 *   same genetic parents, and otherwise not known to be: identical twins
 *   always have the same genetic parents (`planStandIns` keeps them so after
 *   every change to anyone's parents).
 */
export function planTwinChanges(
  family: Family,
  personId: string,
  answers: ReadonlyMap<string, TwinZygosity>,
): {
  added: PlannedTwin[];
  changed: TwinZygosityChange[];
  removedLinkIds: string[];
} {
  const current = twinSetOf(family, personId);
  const recorded = (a: string, b: string) =>
    twinLinkBetween(family, a, b)?.zygosity;
  const possible = (a: string, b: string, wanted: TwinZygosity) =>
    wanted === 'identical' && !identicalTwinsPossible(family, a, b)
      ? 'unknown'
      : wanted;

  // Each twin's zygosity with the person, as answered or as brought in.
  const withPerson = new Map(answers);
  for (const [twinId, zygosity] of answers) {
    if (current.includes(twinId)) continue;
    for (const memberId of twinSetOf(family, twinId)) {
      if (memberId === personId || withPerson.has(memberId)) continue;
      withPerson.set(
        memberId,
        possible(
          personId,
          memberId,
          zygosityThrough(zygosity, recorded(twinId, memberId) ?? 'unknown'),
        ),
      );
    }
  }
  const staying = [personId, ...withPerson.keys()];

  const zygosityOf = (a: string, b: string): TwinZygosity => {
    if (a === personId) return withPerson.get(b) ?? 'unknown';
    const withA = withPerson.get(a) ?? 'unknown';
    const withB = withPerson.get(b) ?? 'unknown';
    const kept =
      withA === 'identical' || withB === 'identical'
        ? zygosityThrough(withA, withB)
        : (recorded(a, b) ?? zygosityThrough(withA, withB));
    return possible(a, b, kept);
  };

  const added: PlannedTwin[] = [];
  const changed: TwinZygosityChange[] = [];
  staying.forEach((a, index) => {
    for (const b of staying.slice(index + 1)) {
      const zygosity = zygosityOf(a, b);
      const link = twinLinkBetween(family, a, b);
      if (!link) added.push({ source: a, target: b, zygosity });
      else if (link.zygosity !== zygosity) {
        changed.push({ linkId: link.id, zygosity });
      }
    }
  });

  const leaving = new Set(current.filter((id) => !staying.includes(id)));
  const stayingSet = new Set(staying);
  const removedLinkIds = family.twins
    .filter(
      (twin) =>
        (leaving.has(twin.source) && stayingSet.has(twin.target)) ||
        (leaving.has(twin.target) && stayingSet.has(twin.source)),
    )
    .map((twin) => twin.id);

  return { added, changed, removedLinkIds };
}

/** The sex at birth a planned addition gives a person, or that they are
 * recorded with. */
function plannedSexOf(
  family: Family,
  plan: AdditionPlan,
  personId: string,
  sexAttribute: string,
): string | undefined {
  const planned = plan.people.find((person) => person.id === personId);
  if (!planned) return family.byId.get(personId)?.sexAssignedAtBirth;
  const value = readOwnProperty(planned.details, sexAttribute);
  const sex = Array.isArray(value) ? value[0] : value;
  return typeof sex === 'string' ? sex : undefined;
}

/**
 * The parents a planned addition gives `childId` who could have carried their
 * pregnancy: any of their parents, as planned, except anyone recorded (or
 * planned) as male at birth. Unnamed parents the addition creates are
 * included, by the ids the plan gives them.
 */
export function possibleCarriers(
  family: Family,
  plan: AdditionPlan,
  childId: string,
  sexAttribute: string,
): string[] {
  return plan.links
    .filter(
      (link) =>
        link.target === childId &&
        mayHaveCarried(link.kind) &&
        couldCarryPregnancy(
          plannedSexOf(family, plan, link.source, sexAttribute),
        ),
    )
    .map((link) => link.source);
}

/**
 * Everything to create to add a relative, under ids fixed in advance: the new
 * person's first, then one for each unnamed parent the relationship needs, in
 * the order the plan adds them. The same answers always plan the same people
 * under the same ids, so the person drawn while the form is filled in, and the
 * unnamed parents it offers as having carried the pregnancy, are the ones
 * added.
 */
export function planAdditionUnder(
  ids: readonly string[],
  args: Omit<Parameters<typeof planAddRelative>[0], 'newPersonId' | 'createId'>,
): AdditionPlan {
  let next = 1;
  return planAddRelative({
    ...args,
    newPersonId: ids[0] ?? uuid(),
    createId: () => ids[next++] ?? uuid(),
  });
}

/**
 * Whether someone is an unnamed stand-in for a genetic parent (the stand-in
 * rule, `planStandIns`): someone the stage generated as one
 * (`Person.markedStandIn`; an unnamed parent the participant added is never
 * one, however little is recorded about them), whom the participant has
 * neither named nor told
 * the interface anything about but their sex at birth (`hasOtherDetails`),
 * who is a biological parent and nothing else — no parents, partners or
 * twins of their own, and recorded as having carried nobody. A stand-in
 * holds a genetic parent's place until someone is recorded in it, and gives
 * way to them (a genetic parent recorded beside the person's others takes
 * their place). Anyone the participant describes, names or relates further
 * is someone in their own right.
 */
export function isStandIn(family: Family, personId: string): boolean {
  const person = family.byId.get(personId);
  if (
    !person ||
    !person.markedStandIn ||
    person.isEgo ||
    person.name !== undefined ||
    person.hasUnreadableName ||
    person.hasOtherDetails
  ) {
    return false;
  }
  if (
    family.twins.some(
      (twin) => twin.source === personId || twin.target === personId,
    )
  ) {
    return false;
  }
  const links = family.links.filter(
    (link) => link.source === personId || link.target === personId,
  );
  return (
    links.length > 0 &&
    links.every(
      (link) =>
        link.source === personId &&
        link.kind === 'biological' &&
        !link.isGestationalCarrier,
    )
  );
}

/** The person's genetic parents leaving out stand-ins, who give way to
 * anyone recorded in their place. */
export function firmGeneticParentsOf(
  family: Family,
  personId: string,
): string[] {
  return geneticParentsOf(family, personId).filter(
    (parentId) => !isStandIn(family, parentId),
  );
}

/** The sexes at birth of the person's genetic parents leaving out stand-ins
 * (`firmGeneticParentsOf`): the ones a new genetic parent must be possible
 * beside. */
export function firmGeneticParentSexes(
  family: Family,
  personId: string,
): (string | undefined)[] {
  return firmGeneticParentsOf(family, personId).map(
    (parentId) => family.byId.get(parentId)?.sexAssignedAtBirth,
  );
}

/** What keeping the stand-in rule changes in a family. */
export type StandInChanges = {
  /** New stand-ins, with the sex at birth of the gamete they gave when that
   * follows. */
  people: PlannedPerson[];
  /** Their links: each a biological parent of the people they stand in for. */
  links: PlannedLink[];
  /** Stand-ins whose sex at birth changes, to that of the gamete the other
   * genetic parent did not give, or is unset when no single sex follows. */
  updatedPeople: PlannedUpdate[];
  /** Links of stand-ins who gave way to a genetic parent recorded in their
   * place. */
  removedLinkIds: string[];
  /** Stand-ins left standing in for nobody. */
  removedPersonIds: string[];
  /** Twins recorded as identical whose genetic parents, once the rest is
   * changed, differ: recorded as not known to be identical. */
  changedTwins: TwinZygosityChange[];
};

/**
 * The stand-in rule (Josh, 9 Oct 2026, ruling 25): whenever a person has at
 * least one genetic parent recorded (a biological parent or a donor), an
 * unnamed stand-in fills the missing genetic parent, so that a participant's
 * answer about who shares that parent — which tells full siblings from half
 * siblings — is never silently lost, whoever is later added or removed.
 * Asked of the family after every change to it.
 *
 * - Someone with one genetic parent is given a stand-in as a biological
 *   parent, with the sex at birth of the other gamete when that follows.
 *   Full siblings (exactly the same parents, at least one of whom raises
 *   them, as `fullSiblingsOf`) share one stand-in, so people who were full
 *   siblings stay full siblings and half siblings stay half siblings.
 * - Adoptive and social parents are never stood in for, and nobody with no
 *   genetic parent is given one.
 * - A stand-in is never recorded as anyone's partner.
 * - A stand-in gives way to a genetic parent recorded in their place: their
 *   link to anyone with more genetic parents than the rule allows
 *   (`geneticParentsPossible`) is removed, and a stand-in left standing in
 *   for nobody is removed.
 * - A stand-in's sex at birth follows the gamete their children's other
 *   genetic parent gave, when every such child agrees on it, and is unset
 *   when they do not, or the other genetic parent's sex at birth is not
 *   female or male: it is derived, so never outlives what it followed from.
 *
 * The same pass keeps the other fact derived from anyone's parents: identical
 * twins came from one egg and one sperm, so have the same genetic parents.
 * Twins recorded as identical whose genetic parents differ once everything
 * above is changed (a parent added to one of them, a shared parent
 * re-described, a parent removed) are recorded as not known to be identical,
 * as a twin added beside parents they do not share is: the zygosity gives way
 * to the parents, never the parents to the zygosity, so no change to the
 * family is refused or spread to anyone it was not made to.
 */
export function planStandIns(
  family: Family,
  createId: () => string,
  sexAttribute: string,
): StandInChanges {
  const standIns = new Set(
    family.people
      .map((person) => person.id)
      .filter((id) => isStandIn(family, id)),
  );
  const geneticLinksOf = (personId: string) =>
    parentLinksOf(family, personId).filter((link) => isGeneticKind(link.kind));

  const sexes = new Map<string, string | undefined>();
  const sexOf = (personId: string) =>
    sexes.has(personId)
      ? sexes.get(personId)
      : family.byId.get(personId)?.sexAssignedAtBirth;

  // A stand-in's sex at birth follows from the gamete the other genetic
  // parent of each child they share with someone in their own right gave,
  // when the children all agree. Asked first, so that a stand-in whose sex
  // only needs to follow does not give way.
  const updatedPeople: PlannedUpdate[] = [];
  for (const standInId of standIns) {
    const required = new Set<string>();
    for (const link of family.links) {
      if (link.source !== standInId) continue;
      const genetic = geneticLinksOf(link.target);
      const other = genetic.find((each) => each.source !== standInId);
      if (genetic.length !== 2 || !other || standIns.has(other.source)) {
        continue;
      }
      const sex = otherGameteSex(sexOf(other.source));
      if (sex !== undefined) required.add(sex);
    }
    const [sex] = required.size === 1 ? required : [];
    if (sex === sexOf(standInId)) continue;
    sexes.set(standInId, sex);
    updatedPeople.push(
      sex === undefined
        ? { id: standInId, details: {}, unset: [sexAttribute] }
        : { id: standInId, details: { [sexAttribute]: [sex] } },
    );
  }

  // A stand-in gives way to a genetic parent recorded in their place.
  const removedLinkIds = new Set<string>();
  for (const person of family.people) {
    const genetic = geneticLinksOf(person.id);
    const possible = () =>
      geneticParentsPossible(
        genetic
          .filter((link) => !removedLinkIds.has(link.id))
          .map((link) => sexOf(link.source)),
      );
    if (possible()) continue;
    const standInLinks = genetic.filter((link) => standIns.has(link.source));
    // The one whose leaving is enough, or else each in turn until it is.
    const enough = standInLinks.find((link) => {
      removedLinkIds.add(link.id);
      const fits = possible();
      removedLinkIds.delete(link.id);
      return fits;
    });
    if (enough) {
      removedLinkIds.add(enough.id);
      continue;
    }
    for (const link of standInLinks) {
      if (possible()) break;
      removedLinkIds.add(link.id);
    }
  }
  // A stand-in left standing in for nobody is removed, unless something
  // outside the pedigree refers to them: then only their family links go.
  const removedPersonIds = [...standIns].filter(
    (standInId) =>
      !family.byId.get(standInId)?.referencedElsewhere &&
      family.links
        .filter((link) => link.source === standInId)
        .every((link) => removedLinkIds.has(link.id)),
  );

  // Someone with one genetic parent is given a stand-in for the other, one
  // for everyone with exactly the same parents.
  // The first of someone and their identical twins, who stand for them all.
  const identicalRootOf = (personId: string) =>
    twinsOf(family, personId)
      .filter((twin) => twin.zygosity === 'identical')
      .map((twin) => twin.twinId)
      .reduce((first, id) => (id < first ? id : first), personId);
  const groups = new Map<string, { parentId: string; childIds: string[] }>();
  for (const person of family.people) {
    if (removedPersonIds.includes(person.id)) continue;
    const parents = parentLinksOf(family, person.id).filter(
      (link) => !removedLinkIds.has(link.id),
    );
    const genetic = parents.filter((link) => isGeneticKind(link.kind));
    const [only] = genetic;
    if (genetic.length !== 1 || only === undefined) continue;
    // Full siblings — the same primary parents, at least one of them
    // (`fullSiblingsOf`), and so the same genetic parent — share one, as do
    // identical twins with the same genetic parent, who came from one egg
    // and one sperm; anyone else has their own. A surrogate, who neither
    // raises them nor gave them genes, tells nobody apart.
    const raised = parents.some((link) => PRIMARY_PARENT_KINDS.has(link.kind));
    const key = raised
      ? parents
          .filter(
            (link) =>
              PRIMARY_PARENT_KINDS.has(link.kind) || isGeneticKind(link.kind),
          )
          .map((link) => link.source)
          .toSorted()
          .join('\u0000')
      : `\u0000${only.source}\u0000${identicalRootOf(person.id)}`;
    const group = groups.get(key) ?? { parentId: only.source, childIds: [] };
    group.childIds.push(person.id);
    groups.set(key, group);
  }
  const people: PlannedPerson[] = [];
  const links: PlannedLink[] = [];
  for (const { parentId, childIds } of groups.values()) {
    const id = createId();
    const sex = otherGameteSex(sexOf(parentId));
    people.push({ id, details: sex ? { [sexAttribute]: [sex] } : {} });
    for (const childId of childIds) {
      links.push({ source: id, target: childId, kind: 'biological' });
    }
  }

  // Identical twins whose genetic parents, as the rule leaves them, differ.
  const geneticParentsAfter = (personId: string) =>
    new Set([
      ...geneticLinksOf(personId)
        .filter((link) => !removedLinkIds.has(link.id))
        .map((link) => link.source),
      ...links
        .filter((link) => link.target === personId)
        .map((link) => link.source),
    ]);
  const changedTwins = family.twins
    .filter(
      (twin) =>
        twin.zygosity === 'identical' &&
        !sameSet(
          geneticParentsAfter(twin.source),
          geneticParentsAfter(twin.target),
        ),
    )
    .map((twin) => ({ linkId: twin.id, zygosity: 'unknown' as const }));

  return {
    people,
    links,
    updatedPeople: updatedPeople.filter(
      (updated) => !removedPersonIds.includes(updated.id),
    ),
    removedLinkIds: [...removedLinkIds],
    removedPersonIds,
    changedTwins,
  };
}

/**
 * The family as it would be with a planned addition made: the people it
 * plans, read as someone in their own right (never a stand-in, since they
 * are the ones the participant is adding, or placed for them), and the links
 * it plans under ids of their own.
 */
export function familyWithPlan(
  family: Family,
  people: readonly PlannedPerson[],
  links: readonly PlannedLink[],
  sexAttribute: string,
): Family {
  const planned: Person[] = people.map((each) => ({
    id: each.id,
    isEgo: false,
    name: undefined,
    hasUnreadableName: false,
    hasOtherDetails: true,
    markedStandIn: false,
    referencedElsewhere: false,
    genderIdentity: undefined,
    genderWords: undefined,
    sexAssignedAtBirth: readCategorical(
      readOwnProperty(each.details, sexAttribute),
      PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
    ),
    relativesNotRecorded: [],
    attributes: {},
  }));
  const allPeople = [...family.people, ...planned];
  return {
    ...family,
    people: allPeople,
    byId: new Map(allPeople.map((person) => [person.id, person])),
    links: [
      ...family.links,
      ...links.map((link, index) => ({
        id: plannedLinkId(index),
        source: link.source,
        target: link.target,
        kind: link.kind,
        isGestationalCarrier: link.isGestationalCarrier ?? false,
        isCurrentPartner: link.isCurrentPartner ?? true,
      })),
    ],
  };
}

const plannedLinkId = (index: number) => `\u0000planned-${index}`;

/**
 * The rule every addition keeps: nobody has more than two genetic parents, or
 * two recorded as the same binary sex at birth (`geneticParentsPossible`),
 * counting the genetic parents they already have, donors included, and those
 * planned with them. A planned genetic link that would break it is recorded
 * as a social parent link instead, in the order planned: that person raised
 * the child but cannot have given them a gamete. The forms offer only
 * additions that keep the rule, so this is the model's own guarantee rather
 * than something a participant meets.
 */
function keepWithinGeneticLimit(
  family: Family,
  people: readonly PlannedPerson[],
  links: readonly PlannedLink[],
  sexAttribute: string,
): PlannedLink[] {
  const plannedSex = new Map(
    people.map((planned) => {
      const value = readOwnProperty(planned.details, sexAttribute);
      return [planned.id, Array.isArray(value) ? value[0] : value] as const;
    }),
  );
  const sexOf = (id: string) =>
    plannedSex.has(id)
      ? (plannedSex.get(id) as string | undefined)
      : family.byId.get(id)?.sexAssignedAtBirth;
  const geneticSexes = new Map<string, (string | undefined)[]>();
  const sexesOf = (childId: string) => {
    const known =
      geneticSexes.get(childId) ??
      (family.byId.has(childId) ? firmGeneticParentSexes(family, childId) : []);
    geneticSexes.set(childId, known);
    return known;
  };
  return links.map((link) => {
    if (!isGeneticKind(link.kind)) return link;
    const sexes = sexesOf(link.target);
    const sex = sexOf(link.source);
    if (geneticParentsPossible([...sexes, sex])) {
      sexes.push(sex);
      return link;
    }
    // Recorded as a social parent, they may still have carried the child.
    return { ...link, kind: 'social' };
  });
}

/** A relationship the participant draws between two people already shown. */
export type Connection =
  | { kind: 'partner'; firstId: string; secondId: string; current: boolean }
  | ({ kind: 'parent'; parentId: string; childId: string } & ParentChoice);

/** A kind of parent, and whether they carried the pregnancy: any kind of
 * parent may have, and a surrogate always did. */
export type ParentChoice = {
  parentKind: PedigreeParentKind;
  carriedPregnancy: boolean;
};

/**
 * Whether a nomination prompt limited to one sex assigned at birth applies to
 * someone of this sex at birth: anyone not recorded as the other sex, so
 * people whose sex at birth is intersex, unknown or not recorded can be
 * chosen. A prompt with no limit applies to everyone.
 */
export const nominationAppliesTo = (
  onlyForSexAssignedAtBirth: 'female' | 'male' | undefined,
  sexAssignedAtBirth: string | undefined,
) =>
  !onlyForSexAssignedAtBirth ||
  (sexAssignedAtBirth !== 'female' && sexAssignedAtBirth !== 'male') ||
  sexAssignedAtBirth === onlyForSexAssignedAtBirth;

/**
 * The attributes of the nomination prompts a person stops being nominated
 * for when their sex at birth becomes `sexAssignedAtBirth`: each prompt that
 * nominates them now and no longer applies to them. Their nomination is
 * withdrawn rather than left standing for someone the prompt excludes.
 */
export function nominationsWithdrawnBy(
  prompts: readonly {
    attribute: string;
    onlyForSexAssignedAtBirth?: 'female' | 'male';
  }[],
  attributes: Readonly<Record<string, VariableValue>>,
  sexAssignedAtBirth: string | undefined,
): string[] {
  return prompts
    .filter(
      (prompt) =>
        readOwnProperty(attributes, prompt.attribute) === true &&
        !nominationAppliesTo(
          prompt.onlyForSexAssignedAtBirth,
          sexAssignedAtBirth,
        ),
    )
    .map((prompt) => prompt.attribute);
}

/** Whether someone could have carried a pregnancy: anyone not recorded as
 * male at birth, including people whose sex at birth is not yet known.
 * Gender identity has no bearing on it. */
export const couldCarryPregnancy = (sexAssignedAtBirth: string | undefined) =>
  sexAssignedAtBirth !== 'male';

/** The sex at birth of whoever gave the other gamete to someone of this
 * sex, when that follows. */
const otherGameteSex = (sex: string | undefined) =>
  sex === 'female' ? 'male' : sex === 'male' ? 'female' : undefined;

/** Biological parents and gamete donors each gave the person an egg or a
 * sperm; every other kind of parent did not. */
export const isGeneticKind = (kind: string) =>
  kind === 'biological' || kind === 'donor';

/**
 * Whether a parent of this kind may be recorded as having carried the
 * pregnancy: any kind of parent may. A biological parent who carried is the
 * birth parent; an adoptive or social parent who carried is, for instance, a
 * legal co-mother who gave birth; a donor who carried is a traditional
 * surrogate; and a surrogate (a gestational carrier who neither raises the
 * child nor gave them a gamete) always carried.
 */
export const mayHaveCarried = (kind: string) =>
  kind === 'biological' ||
  kind === 'adoptive' ||
  kind === 'social' ||
  kind === 'donor' ||
  kind === 'surrogate';

/** Whether a parent of this kind, for whom the participant answered
 * `carried`, is recorded as having carried the pregnancy: a surrogate always
 * is. */
export const carriesAs = (kind: string, carried: boolean) =>
  kind === 'surrogate' || (carried && mayHaveCarried(kind));

/**
 * Whether one person could have genetic parents with these sexes assigned at
 * birth: two at most, one providing the egg and the other the sperm, so at
 * most one recorded as female at birth and one as male. Anyone else —
 * intersex, not known, or not yet answered — could have provided either.
 * Gender identity has no bearing on it.
 */
export function geneticParentsPossible(
  sexes: readonly (string | undefined)[],
): boolean {
  const count = (sex: string) => sexes.filter((value) => value === sex).length;
  return sexes.length <= 2 && count('female') <= 1 && count('male') <= 1;
}

/**
 * A sex at birth that would contradict how a person is recorded as a parent,
 * and why: they are a genetic parent of `childId`, whose other genetic
 * parent `coParentId` is recorded with that sex and so provided the same
 * kind of gamete, or they carried `childId`'s pregnancy, which nobody
 * recorded as male at birth did.
 */
export type SexRuledOut = {
  sex: PedigreeSexAssignedAtBirth;
  childId: string;
} & (
  | { rule: 'sameSexGeneticParent'; coParentId: string }
  | { rule: 'carried' }
);

/**
 * The sexes at birth that would contradict how a person is recorded as a
 * parent, each with the record that rules it out (`SexRuledOut`). A sex may
 * be ruled out for several reasons, each listed.
 */
export function sexesRuledOut(family: Family, personId: string): SexRuledOut[] {
  const asParent = family.links.filter(
    (link) => link.kind !== 'partner' && link.source === personId,
  );
  const reasons: SexRuledOut[] = [];
  for (const sex of PEDIGREE_SEX_ASSIGNED_AT_BIRTH) {
    for (const link of asParent) {
      if (isGeneticKind(link.kind)) {
        // A stand-in's sex follows the other genetic parent's, so never
        // rules theirs out.
        const block = geneticParentBlock(
          family,
          link.target,
          firmGeneticParentsOf(family, link.target).filter(
            (id) => id !== personId,
          ),
          sex,
        );
        if (block?.rule === 'sameSexGeneticParent') {
          reasons.push({
            sex,
            childId: link.target,
            rule: 'sameSexGeneticParent',
            coParentId: block.coParentId,
          });
        }
      }
      if (link.isGestationalCarrier && !couldCarryPregnancy(sex)) {
        reasons.push({ sex, childId: link.target, rule: 'carried' });
      }
    }
  }
  return reasons;
}

/**
 * Why someone of this sex at birth could not be another genetic parent of
 * `childId` beside `geneticParentIds` (`geneticParentsPossible`): the child
 * already has two, or one recorded with the same binary sex, who provided
 * the same kind of gamete. Undefined when they could.
 */
export type GeneticParentBlock =
  | { rule: 'geneticParentsFull'; childId: string; parentIds: string[] }
  | {
      rule: 'sameSexGeneticParent';
      childId: string;
      coParentId: string;
      sex: 'female' | 'male';
    };

export function geneticParentBlock(
  family: Family,
  childId: string,
  geneticParentIds: readonly string[],
  sex: string | undefined,
): GeneticParentBlock | undefined {
  if (geneticParentIds.length >= 2) {
    return {
      rule: 'geneticParentsFull',
      childId,
      parentIds: [...geneticParentIds],
    };
  }
  if (sex !== 'female' && sex !== 'male') return undefined;
  const coParentId = geneticParentIds.find(
    (id) => family.byId.get(id)?.sexAssignedAtBirth === sex,
  );
  return coParentId === undefined
    ? undefined
    : { rule: 'sameSexGeneticParent', childId, coParentId, sex };
}

/** Whoever is recorded as having carried the person's pregnancy. */
export function carrierOf(
  family: Family,
  personId: string,
): string | undefined {
  return parentLinksOf(family, personId).find(
    (link) => link.isGestationalCarrier,
  )?.source;
}

/** Whether `ancestorId` is the person's parent, a parent's parent, and so on. */
function isAncestor(family: Family, ancestorId: string, personId: string) {
  const seen = new Set<string>();
  const queue = [personId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    for (const link of parentLinksOf(family, current)) {
      if (link.source === ancestorId) return true;
      queue.push(link.source);
    }
  }
  return false;
}

/** Whether two people are joined by a parent or partner link: the links
 * the connect tool makes and the disconnect tool removes. Twins are siblings,
 * joined through their parents, and are told apart in the person form. */
export function areLinked(family: Family, a: string, b: string): boolean {
  return family.links.some(
    (link) =>
      (link.source === a && link.target === b) ||
      (link.source === b && link.target === a),
  );
}

/** Whether two people are already related directly: linked as partners or
 * parent and child, or recorded as twins. A pair has at most one link, so
 * they cannot be connected again. */
export function areConnected(family: Family, a: string, b: string): boolean {
  const joins = (link: { source: string; target: string }) =>
    (link.source === a && link.target === b) ||
    (link.source === b && link.target === a);
  return family.links.some(joins) || family.twins.some(joins);
}

/**
 * Why one person cannot be made any kind of parent of another
 * (`availableParentChoices` offers nothing): they are the same person, they
 * are already linked, or the would-be parent descends from the child.
 * Undefined while some kind of parent is possible.
 */
export function parentConnectionBlock(
  family: Family,
  parentId: string,
  childId: string,
): 'self' | 'connected' | 'descendant' | undefined {
  if (parentId === childId) return 'self';
  if (areConnected(family, parentId, childId)) return 'connected';
  if (isAncestor(family, childId, parentId)) return 'descendant';
  return undefined;
}

/** Two people can be made partners unless they are already linked. */
export function canConnectPartners(
  family: Family,
  firstId: string,
  secondId: string,
): boolean {
  return firstId !== secondId && !areConnected(family, firstId, secondId);
}

/**
 * Why a kind of parent is unavailable although the two people could be
 * connected: the child already has someone recorded as having carried them,
 * and a child has one carrier at most; or, for the genetic kinds, the would-be
 * parent could not be another genetic parent of the child
 * (`GeneticParentBlock`).
 */
export type ParentChoiceBlock =
  | { rule: 'carrierRecorded'; carrierId: string }
  | GeneticParentBlock;

/**
 * The kinds of parent the connect menu offers for making one person the
 * parent of another, each as it is and as having carried the pregnancy, and
 * each with what makes it unavailable, if anything. Nothing when they are
 * already linked, or when the would-be parent descends from the child. A
 * person has at most two genetic parents (biological or donor) — one who
 * provided the egg and one the sperm, as `geneticParentsPossible` — so the
 * genetic kinds are offered unavailable once that is impossible, saying why
 * (`geneticParentBlock`). Nobody recorded as male
 * at birth carried a pregnancy, so for them the choices that carry are left
 * out. A child has one carrier at most, so while they have one, every choice
 * that carries (a surrogate always does) is offered unavailable, naming the
 * carrier.
 */
export function parentChoiceOptions(
  family: Family,
  parentId: string,
  childId: string,
): { choice: ParentChoice; unavailable?: ParentChoiceBlock }[] {
  if (
    parentId === childId ||
    areConnected(family, parentId, childId) ||
    isAncestor(family, childId, parentId)
  ) {
    return [];
  }
  const parentSex = family.byId.get(parentId)?.sexAssignedAtBirth;
  // A stand-in gives way to a genetic parent recorded in their place.
  const canBeGenetic = geneticParentsPossible([
    ...firmGeneticParentSexes(family, childId),
    parentSex,
  ]);
  const geneticBlock: ParentChoiceBlock | undefined = canBeGenetic
    ? undefined
    : geneticParentBlock(
        family,
        childId,
        firmGeneticParentsOf(family, childId),
        parentSex,
      );
  const couldCarry = couldCarryPregnancy(parentSex);
  const carrierId = carrierOf(family, childId);
  const carrierBlock: ParentChoiceBlock | undefined =
    carrierId === undefined
      ? undefined
      : { rule: 'carrierRecorded', carrierId };
  const options: { choice: ParentChoice; unavailable?: ParentChoiceBlock }[] =
    [];
  for (const kind of PEDIGREE_RELATIONSHIP_KINDS) {
    if (kind === 'partner' || isTwinKind(kind)) continue;
    const kindBlock = isGeneticKind(kind) ? geneticBlock : undefined;
    if (isGeneticKind(kind) && !canBeGenetic && !kindBlock) continue;
    if (kind !== 'surrogate') {
      options.push({
        choice: { parentKind: kind, carriedPregnancy: false },
        ...(kindBlock ? { unavailable: kindBlock } : {}),
      });
    }
    if (couldCarry) {
      const block = kindBlock ?? carrierBlock;
      options.push({
        choice: { parentKind: kind, carriedPregnancy: true },
        ...(block ? { unavailable: block } : {}),
      });
    }
  }
  return options;
}

/** The kinds of parent one person can be made of another, as
 * `parentChoiceOptions` offers them, leaving out those unavailable. */
export function availableParentChoices(
  family: Family,
  parentId: string,
  childId: string,
): ParentChoice[] {
  return parentChoiceOptions(family, parentId, childId)
    .filter((option) => option.unavailable === undefined)
    .map((option) => option.choice);
}

/** The link that records a connection. */
export function planConnection(connection: Connection): PlannedLink {
  if (connection.kind === 'partner') {
    return {
      source: connection.firstId,
      target: connection.secondId,
      kind: 'partner',
      isCurrentPartner: connection.current,
    };
  }
  return {
    source: connection.parentId,
    target: connection.childId,
    kind: connection.parentKind,
    isGestationalCarrier: carriesAs(
      connection.parentKind,
      connection.carriedPregnancy,
    ),
  };
}
