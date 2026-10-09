import { hash } from 'ohash';
import { v4 as uuid } from 'uuid';

import {
  PEDIGREE_RELATIONSHIP_KINDS,
  PEDIGREE_RELATIVES_NOT_RECORDED,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  type FamilyPedigreeStageDefinition,
  type PedigreeGenderWords,
  type PedigreeParentKind,
  type PedigreeRelationshipKind,
  type PedigreeRelativesNotRecorded,
  type PedigreeSexAssignedAtBirth,
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

export type FamilyLink = {
  id: string;
  /** The parent, for a parent link; either partner, for a partner link. */
  source: string;
  /** The child, for a parent link; the other partner, for a partner link. */
  target: string;
  kind: PedigreeRelationshipKind;
  isGestationalCarrier: boolean;
  isCurrentPartner: boolean;
};

export type Family = {
  /** In the order they were added. */
  people: Person[];
  byId: ReadonlyMap<string, Person>;
  links: FamilyLink[];
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
 * stage has decrypted; any other encrypted name cannot be read.
 */
export function readFamily(
  nodes: readonly NcNode[],
  edges: readonly NcEdge[],
  config: PedigreeConfig,
  generatedLabels: Readonly<Record<string, string>> = {},
  decryptedNames: ReadonlyMap<string, string> = new Map(),
): Family {
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
      return {
        id,
        isEgo: attribute(config.egoAttribute) === true,
        name,
        hasUnreadableName,
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

/**
 * The other parents of the person's children who are not their partners:
 * someone they had a child with, recorded as the child's parent alone, as an
 * unnamed parent added for a child is.
 */
export function coParentsOf(family: Family, personId: string): string[] {
  const partners = new Set(partnersOf(family, personId));
  const children = new Set(
    family.links
      .filter(
        (link) =>
          link.source === personId && PRIMARY_PARENT_KINDS.has(link.kind),
      )
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

/** Everyone who shares at least one primary parent with the person. */
export function siblingsOf(family: Family, personId: string): string[] {
  const parents = new Set(primaryParentsOf(family, personId));
  if (parents.size === 0) return [];
  return family.people
    .filter(
      (person) =>
        person.id !== personId &&
        primaryParentsOf(family, person.id).some((parent) =>
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
  return siblingsOf(family, personId).filter((siblingId) => {
    const siblingParents = new Set(primaryParentsOf(family, siblingId));
    return (
      siblingParents.size === parents.size &&
      [...parents].every((parent) => siblingParents.has(parent))
    );
  });
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
      /** A biological parent carried the pregnancy of the anchor and of each
       * sibling chosen, among those with nobody else recorded as carrying
       * theirs. */
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
      parentKind: 'biological' | 'adoptive' | 'social';
      /** For a biological child with another parent, which of them is a
       * biological parent; the other is a social parent. */
      biologicalParent: 'both' | 'anchor' | 'otherParent';
      /** Who carried the pregnancy, for a biological child. */
      carrier: 'anchor' | 'otherParent' | null;
    }
  | {
      relation: 'sibling';
      /** The anchor's parents the sibling shares. */
      sharedParentIds: readonly string[];
      /**
       * The anchor's parents not yet shown whom the sibling shares, each
       * added unnamed as a parent of both. With no parents shown, the anchor
       * is given an egg parent and a sperm parent, and the sibling shares
       * both or one of them; with one shown, `other` is the anchor's second
       * parent.
       */
      sharesUnshown: 'both' | 'eggParent' | 'spermParent' | 'other' | 'none';
      /** The sibling's own relationship to the parents they share, which
       * need not be the anchor's: one may be adopted and the other not. */
      parentKind: 'biological' | 'adoptive' | 'social';
      /**
       * Who carried the pregnancy, for a biological sibling: one of the
       * parents the sibling is planned to have (`possibleCarriers`), by id,
       * which for an unnamed parent the addition gives them is the id the
       * plan creates for that parent. Null when not known.
       */
      carrier: string | null;
    };

export type PlannedPerson = { id: string; details: PersonDetails };

export type PlannedLink = {
  source: string;
  target: string;
  kind: PedigreeRelationshipKind;
  isGestationalCarrier?: boolean;
  isCurrentPartner?: boolean;
};

export type AdditionPlan = {
  people: PlannedPerson[];
  links: PlannedLink[];
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
      const carried =
        kind === 'surrogate' ||
        (kind === 'biological' && request.carriedPregnancy);
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
        // The other genetic parent of a biological child gave the other
        // gamete. They are the child's parent and nothing more: whether they
        // are or were the anchor's partner is not asked, so not recorded.
        otherParentId = addPlaceholder(
          kind === 'biological'
            ? otherGameteSex(family.byId.get(anchorId)?.sexAssignedAtBirth)
            : undefined,
        );
      } else if (request.otherParent) {
        otherParentId = request.otherParent;
      }
      // Only a biological parent is recorded as having carried the
      // pregnancy.
      const kindFor = (parent: 'anchor' | 'otherParent') =>
        kind === 'biological' &&
        request.biologicalParent !== 'both' &&
        request.biologicalParent !== parent
          ? 'social'
          : kind;
      const anchorKind = kindFor('anchor');
      links.push({
        source: anchorId,
        target: newPersonId,
        kind: anchorKind,
        isGestationalCarrier:
          anchorKind === 'biological' && request.carrier === 'anchor',
      });
      if (otherParentId) {
        const otherKind = kindFor('otherParent');
        links.push({
          source: otherParentId,
          target: newPersonId,
          kind: otherKind,
          isGestationalCarrier:
            otherKind === 'biological' && request.carrier === 'otherParent',
        });
      }
      break;
    }
    case 'sibling': {
      const anchorParents = primaryParentsOf(family, anchorId);
      const shared = request.sharedParentIds.filter((id) =>
        anchorParents.includes(id),
      );
      // Siblings hang from the parents they share. An unnamed parent the
      // addition gives the anchor stands for a genetic parent not yet shown,
      // giving a gamete not yet given (`openGeneticParentSlots`): someone
      // without parents is given one for each gamete still to give, for the
      // participant to fill in later, and someone with one parent is given
      // their second while there is room for one. Once the anchor's genetic
      // parents (donors included) are all recorded, nobody is added to stand
      // in for one. Unnamed parents are never recorded as anyone's partner:
      // the participant is not asked about it.
      const open = openGeneticParentSlots(family, anchorId);
      const placeholders: { id: string; kind: 'biological' | 'adoptive' }[] =
        [];
      const addParentPlaceholder = (
        kind: 'biological' | 'adoptive',
        sex: 'female' | 'male' | undefined,
      ) => {
        const id = addPlaceholder(kind === 'biological' ? sex : undefined);
        placeholders.push({ id, kind });
        return id;
      };
      let sharedPlaceholders: string[] = [];
      if (anchorParents.length === 0) {
        // With no gamete left to give, someone recorded with only donors
        // still needs parents to hang the sibling from: they are taken to be
        // parents who raised the anchor, as adoptive parents.
        const added =
          open.length > 0
            ? open.map((sex) => addParentPlaceholder('biological', sex))
            : [0, 1].map(() => addParentPlaceholder('adoptive', undefined));
        // Sharing one of them names the one who gave that gamete; with no
        // such parent added, the sibling shares all of them.
        const giver =
          request.sharesUnshown === 'eggParent'
            ? 'female'
            : request.sharesUnshown === 'spermParent'
              ? 'male'
              : undefined;
        const chosen = added.filter(
          (id, index) => giver !== undefined && open[index] === giver,
        );
        sharedPlaceholders = chosen.length > 0 ? chosen : added;
      } else if (anchorParents.length === 1) {
        const [known] = parentLinksOf(family, anchorId).filter((link) =>
          anchorParents.includes(link.source),
        );
        const secondSex = open.length === 1 ? open[0] : undefined;
        if (request.sharesUnshown === 'none') {
          // A sibling who does not share the anchor's second genetic parent
          // has another: the anchor's is added for the anchor alone, so the
          // two are recorded with different genetic parents, as half
          // siblings, rather than with the one parent each that would make
          // them full siblings.
          if (known?.kind === 'biological' && open.length > 0) {
            addParentPlaceholder('biological', secondSex);
          }
        } else if (known?.kind === 'adoptive') {
          // The other parent of someone adopted was most likely an adoptive
          // parent too.
          sharedPlaceholders = [addParentPlaceholder('adoptive', undefined)];
        } else if (open.length > 0) {
          // Otherwise they are a biological parent, who gave the other
          // gamete when that is known.
          sharedPlaceholders = [addParentPlaceholder('biological', secondSex)];
        }
      }
      for (const { id, kind } of placeholders) {
        links.push({ source: id, target: anchorId, kind });
      }
      // A sibling shares at least one parent; with none chosen, all of them.
      // Their relationship to those parents is their own.
      const sharesNone = shared.length === 0 && sharedPlaceholders.length === 0;
      for (const parentId of [
        ...(sharesNone ? anchorParents : shared),
        ...sharedPlaceholders,
      ]) {
        links.push({
          source: parentId,
          target: newPersonId,
          kind: request.parentKind,
        });
      }
      break;
    }
  }

  const kept = keepWithinGeneticLimit(family, people, links, sexAttribute);
  if (request.relation !== 'sibling' || request.carrier === null) {
    return { people, links: kept };
  }
  // The sibling's carrier is one of the parents they are planned to have
  // who could have carried the pregnancy; any other answer, which a later
  // one has made impossible, records nobody.
  const plan = { people, links: kept };
  const carrier = possibleCarriers(
    family,
    plan,
    newPersonId,
    sexAttribute,
  ).find((id) => id === request.carrier);
  return {
    people,
    links: kept.map((link) =>
      carrier !== undefined &&
      link.source === carrier &&
      link.target === newPersonId
        ? { ...link, isGestationalCarrier: true }
        : link,
    ),
  };
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
 * pregnancy: their biological parents, as planned, except anyone recorded (or
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
        link.kind === 'biological' &&
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
 * The places still open among a person's genetic parents (biological parents
 * and donors), each as the sex at birth an unnamed parent added there takes:
 * that of the gamete still to give, when it follows. A person has two genetic
 * parents, one giving the egg and one the sperm, so someone with none has two
 * open places (female and male), someone with two has none, and someone with
 * one has a place for whoever gave the other gamete. With a single genetic
 * parent the shared gamete rule (`inferGametes`) reads their gamete from
 * their sex at birth alone, so it is not known when they are neither female
 * nor male.
 */
export function openGeneticParentSlots(
  family: Family,
  personId: string,
): ('female' | 'male' | undefined)[] {
  const sexes = geneticParentSexes(family, personId);
  if (sexes.length === 0) return ['female', 'male'];
  if (sexes.length >= 2) return [];
  return [otherGameteSex(sexes[0])];
}

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
      (family.byId.has(childId) ? geneticParentSexes(family, childId) : []);
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
    return { ...link, kind: 'social', isGestationalCarrier: false };
  });
}

/** A relationship the participant draws between two people already shown. */
export type Connection =
  | { kind: 'partner'; firstId: string; secondId: string; current: boolean }
  | ({ kind: 'parent'; parentId: string; childId: string } & ParentChoice);

/** A kind of parent, and — for a biological parent — whether they carried
 * the pregnancy. */
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
 * The sexes at birth that would contradict how a person is recorded as a
 * parent: as the genetic parent of someone whose other genetic parent
 * provided the same kind of gamete, or as having carried a pregnancy.
 */
export function sexesRuledOut(
  family: Family,
  personId: string,
): Set<PedigreeSexAssignedAtBirth> {
  const asParent = family.links.filter(
    (link) => link.kind !== 'partner' && link.source === personId,
  );
  return new Set(
    PEDIGREE_SEX_ASSIGNED_AT_BIRTH.filter((sex) =>
      asParent.some(
        (link) =>
          (isGeneticKind(link.kind) &&
            !geneticParentsPossible([
              ...geneticParentSexes(family, link.target, personId),
              sex,
            ])) ||
          (link.isGestationalCarrier && !couldCarryPregnancy(sex)),
      ),
    ),
  );
}

/** The sexes at birth of the person's genetic parents, as recorded, leaving
 * out `exceptParentId`. */
export function geneticParentSexes(
  family: Family,
  personId: string,
  exceptParentId?: string,
): (string | undefined)[] {
  return parentLinksOf(family, personId)
    .filter(
      (link) => isGeneticKind(link.kind) && link.source !== exceptParentId,
    )
    .map((link) => family.byId.get(link.source)?.sexAssignedAtBirth);
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

/** Whether two people are already linked, as partners or parent and child.
 * A pair has at most one link, so they cannot be connected again. */
export function areConnected(family: Family, a: string, b: string): boolean {
  return family.links.some(
    (link) =>
      (link.source === a && link.target === b) ||
      (link.source === b && link.target === a),
  );
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
 * The kinds of parent one person can be made of another. None when they are
 * already linked, or when the would-be parent descends from the child. A
 * person has at most two genetic parents (biological or donor) — one who
 * provided the egg and one the sperm, as `geneticParentsPossible` — and one
 * person who carried the pregnancy (a biological parent or a surrogate) —
 * never someone recorded as male at birth.
 */
export function availableParentChoices(
  family: Family,
  parentId: string,
  childId: string,
): ParentChoice[] {
  if (
    parentId === childId ||
    areConnected(family, parentId, childId) ||
    isAncestor(family, childId, parentId)
  ) {
    return [];
  }
  const parentSex = family.byId.get(parentId)?.sexAssignedAtBirth;
  const canBeGenetic = geneticParentsPossible([
    ...geneticParentSexes(family, childId),
    parentSex,
  ]);
  const canCarry =
    !hasCarrier(family, childId) && couldCarryPregnancy(parentSex);
  const choices: ParentChoice[] = [];
  for (const kind of PEDIGREE_RELATIONSHIP_KINDS) {
    if (kind === 'partner') continue;
    if (isGeneticKind(kind) && !canBeGenetic) continue;
    if (kind === 'surrogate' && !canCarry) continue;
    choices.push({ parentKind: kind, carriedPregnancy: kind === 'surrogate' });
    if (kind === 'biological' && canCarry) {
      choices.push({ parentKind: kind, carriedPregnancy: true });
    }
  }
  return choices;
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
    isGestationalCarrier:
      connection.parentKind === 'surrogate' ||
      (connection.parentKind === 'biological' && connection.carriedPregnancy),
  };
}
