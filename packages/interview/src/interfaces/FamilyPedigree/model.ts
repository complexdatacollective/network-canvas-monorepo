import {
  PEDIGREE_GENDER_IDENTITIES,
  PEDIGREE_RELATIONSHIP_KINDS,
  PEDIGREE_RELATIVES_NOT_RECORDED,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  type FamilyPedigreeStageDefinition,
  type PedigreeGenderIdentity,
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

/**
 * The codebook bindings a FamilyPedigree stage writes through, flattened out of
 * the stage definition.
 */
export type PedigreeConfig = {
  personType: string;
  nameVariable: string;
  genderIdentityVariable: string;
  sexAssignedAtBirthVariable: string;
  egoVariable: string;
  relationshipType: string;
  kindVariable: string;
  gestationalCarrierVariable: string;
  currentPartnerVariable: string;
  /** Set when the stage has a completeness requirement. */
  relativesNotRecordedVariable: string | undefined;
};

export function pedigreeConfigFromStage(
  stage: Pick<
    FamilyPedigreeStageDefinition,
    'subject' | 'personAttributes' | 'relationship' | 'completeness'
  >,
): PedigreeConfig {
  return {
    personType: stage.subject.type,
    nameVariable: stage.personAttributes.nameVariable,
    genderIdentityVariable: stage.personAttributes.genderIdentityVariable,
    sexAssignedAtBirthVariable:
      stage.personAttributes.sexAssignedAtBirthVariable,
    egoVariable: stage.personAttributes.egoVariable,
    relationshipType: stage.relationship.type,
    kindVariable: stage.relationship.kindVariable,
    gestationalCarrierVariable: stage.relationship.gestationalCarrierVariable,
    currentPartnerVariable: stage.relationship.currentPartnerVariable,
    relativesNotRecordedVariable:
      stage.completeness?.relativesNotRecordedVariable,
  };
}

export type Person = {
  id: string;
  isEgo: boolean;
  name: string | undefined;
  genderIdentity: PedigreeGenderIdentity | undefined;
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

/** Every known member of a multi-valued categorical value. */
function readCategoricalSet<T extends string>(
  value: VariableValue | undefined,
  allowed: readonly T[],
): T[] {
  const values: unknown[] = Array.isArray(value) ? value : [];
  return allowed.filter((member) => values.includes(member));
}

export function readFamily(
  nodes: readonly NcNode[],
  edges: readonly NcEdge[],
  config: PedigreeConfig,
): Family {
  const people: Person[] = nodes
    .filter((node) => node.type === config.personType)
    .map((node) => {
      const attributes = node[entityAttributesProperty];
      const name = attributes[config.nameVariable];
      return {
        id: node[entityPrimaryKeyProperty],
        isEgo: attributes[config.egoVariable] === true,
        name: typeof name === 'string' && name.trim() !== '' ? name : undefined,
        genderIdentity: readCategorical(
          attributes[config.genderIdentityVariable],
          PEDIGREE_GENDER_IDENTITIES,
        ),
        sexAssignedAtBirth: readCategorical(
          attributes[config.sexAssignedAtBirthVariable],
          PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
        ),
        relativesNotRecorded: readCategoricalSet(
          config.relativesNotRecordedVariable
            ? attributes[config.relativesNotRecordedVariable]
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
    const kind = readCategorical(
      attributes[config.kindVariable],
      PEDIGREE_RELATIONSHIP_KINDS,
    );
    if (!kind) continue;
    links.push({
      id: edge[entityPrimaryKeyProperty],
      source: edge.from,
      target: edge.to,
      kind,
      isGestationalCarrier:
        attributes[config.gestationalCarrierVariable] === true,
      // A partnership is current unless recorded otherwise.
      isCurrentPartner: attributes[config.currentPartnerVariable] !== false,
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

/** The person's siblings who share every one of their primary parents. */
export function fullSiblingsOf(family: Family, personId: string): string[] {
  const parents = primaryParentsOf(family, personId);
  return siblingsOf(family, personId).filter((siblingId) => {
    const siblingParents = new Set(primaryParentsOf(family, siblingId));
    return parents.every((parent) => siblingParents.has(parent));
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
 * person attributes, then every researcher field whose attribute the codebook
 * marks required. A name is never required — a participant may not know it,
 * and an unnamed person is shown by how they are related to the participant.
 */
export function missingDetailsFor(
  person: Person,
  requiredFormVariables: readonly string[],
): MissingDetail[] {
  const missing: MissingDetail[] = [];
  if (person.genderIdentity === undefined) missing.push('genderIdentity');
  if (person.sexAssignedAtBirth === undefined) {
    missing.push('sexAssignedAtBirth');
  }
  for (const variable of requiredFormVariables) {
    if (isEmpty(person.attributes[variable])) missing.push({ variable });
  }
  return missing;
}

/** Pedigree symbol: square for a man, circle for a woman, otherwise diamond. */
export function symbolFor(
  genderIdentity: PedigreeGenderIdentity | undefined,
): 'square' | 'circle' | 'diamond' {
  if (genderIdentity === 'man') return 'square';
  if (genderIdentity === 'woman') return 'circle';
  return 'diamond';
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
      /** Who carried the pregnancy, for a biological child. */
      carrier: 'anchor' | 'otherParent' | null;
    }
  | {
      relation: 'sibling';
      /** The anchor's parents the sibling shares. Ignored when they have none. */
      sharedParentIds: readonly string[];
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
}: {
  family: Family;
  anchorId: string;
  newPersonId: string;
  details: PersonDetails;
  request: AddRelativeRequest;
  createId: () => string;
}): AdditionPlan {
  const people: PlannedPerson[] = [{ id: newPersonId, details }];
  const links: PlannedLink[] = [];

  switch (request.relation) {
    case 'parent': {
      const kind = request.parentKind;
      links.push({
        source: newPersonId,
        target: anchorId,
        kind,
        isGestationalCarrier:
          kind === 'surrogate' ||
          (kind === 'biological' && request.carriedPregnancy),
      });
      for (const siblingId of request.alsoParentOf) {
        links.push({ source: newPersonId, target: siblingId, kind });
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
        otherParentId = createId();
        people.push({ id: otherParentId, details: {} });
        links.push({
          source: anchorId,
          target: otherParentId,
          kind: 'partner',
          isCurrentPartner: true,
        });
      } else if (request.otherParent) {
        otherParentId = request.otherParent;
      }
      const biological = kind === 'biological';
      links.push({
        source: anchorId,
        target: newPersonId,
        kind,
        isGestationalCarrier: biological && request.carrier === 'anchor',
      });
      if (otherParentId) {
        links.push({
          source: otherParentId,
          target: newPersonId,
          kind,
          isGestationalCarrier: biological && request.carrier === 'otherParent',
        });
      }
      break;
    }
    case 'sibling': {
      const anchorParents = primaryParentsOf(family, anchorId);
      if (anchorParents.length === 0) {
        // Siblings hang from shared parents; create an unnamed couple for the
        // participant to fill in later.
        const first = createId();
        const second = createId();
        people.push({ id: first, details: {} }, { id: second, details: {} });
        links.push({
          source: first,
          target: second,
          kind: 'partner',
          isCurrentPartner: true,
        });
        for (const parentId of [first, second]) {
          links.push({
            source: parentId,
            target: anchorId,
            kind: 'biological',
          });
          links.push({
            source: parentId,
            target: newPersonId,
            kind: 'biological',
          });
        }
        break;
      }
      const shared = request.sharedParentIds.filter((id) =>
        anchorParents.includes(id),
      );
      for (const parentId of shared.length > 0 ? shared : anchorParents) {
        const anchorLink = parentLinksOf(family, anchorId).find(
          (link) => link.source === parentId,
        );
        links.push({
          source: parentId,
          target: newPersonId,
          kind: anchorLink?.kind ?? 'biological',
        });
      }
      break;
    }
  }

  return { people, links };
}

/** Every person and link to remove along with a person. */
export function planRemovePerson(family: Family, personId: string) {
  return {
    linkIds: family.links
      .filter((link) => link.source === personId || link.target === personId)
      .map((link) => link.id),
  };
}

/** A relationship the participant draws between two people already shown. */
export type Connection =
  | { kind: 'partner'; firstId: string; secondId: string }
  | {
      kind: 'parent';
      parentId: string;
      childId: string;
      parentKind: PedigreeParentKind;
    };

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
 * person has at most two genetic parents (biological or donor) and one
 * surrogate.
 */
export function availableParentKinds(
  family: Family,
  parentId: string,
  childId: string,
): PedigreeParentKind[] {
  if (
    parentId === childId ||
    areConnected(family, parentId, childId) ||
    isAncestor(family, childId, parentId)
  ) {
    return [];
  }
  const parentLinks = parentLinksOf(family, childId);
  const geneticParents = parentLinks.filter(
    (link) => link.kind === 'biological' || link.kind === 'donor',
  ).length;
  const hasSurrogate = parentLinks.some((link) => link.kind === 'surrogate');
  return PEDIGREE_RELATIONSHIP_KINDS.filter(
    (kind): kind is PedigreeParentKind => {
      if (kind === 'partner') return false;
      if (kind === 'biological' || kind === 'donor') return geneticParents < 2;
      if (kind === 'surrogate') return !hasSurrogate;
      return true;
    },
  );
}

/** The link that records a connection. */
export function planConnection(connection: Connection): PlannedLink {
  if (connection.kind === 'partner') {
    return {
      source: connection.firstId,
      target: connection.secondId,
      kind: 'partner',
      isCurrentPartner: true,
    };
  }
  return {
    source: connection.parentId,
    target: connection.childId,
    kind: connection.parentKind,
    isGestationalCarrier: connection.parentKind === 'surrogate',
  };
}
