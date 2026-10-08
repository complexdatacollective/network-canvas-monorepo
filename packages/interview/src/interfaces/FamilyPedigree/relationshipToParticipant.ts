import type {
  PedigreeRelationshipKind,
  PedigreeRelationshipToParticipant,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { readOwnProperty } from '../../utils/ownProperty';
import { type KinTerm, kinTermFor, type Step, stepsFrom } from './kinship';
import type { Family, PedigreeConfig } from './model';

/**
 * Which relationship a person is given when they are related to the
 * participant in more than one way, first first: the closest biological tie,
 * then the closest legal one, then partners, then relatives further out
 * (biological before step and in-law ties), and `otherRelative` last. So a
 * biological parent who is also a parent's partner is a `parent`, a donor
 * who is also a parent's sibling is a `donor`, and a cousin who is also a
 * sibling's partner is a `cousin`.
 */
const RELATIONSHIP_PRECEDENCE: readonly PedigreeRelationshipToParticipant[] = [
  'parent',
  'child',
  'sibling',
  'donor',
  'donorConceivedChild',
  'halfSibling',
  'adoptiveParent',
  'adoptiveChild',
  'adoptiveSibling',
  'partner',
  'formerPartner',
  'grandparent',
  'grandchild',
  'parentsSibling',
  'siblingsChild',
  'greatGrandparent',
  'greatGrandchild',
  'grandparentsSibling',
  'cousin',
  'surrogate',
  'surrogacyChild',
  'stepParent',
  'stepChild',
  'stepSibling',
  'parentInLaw',
  'childInLaw',
  'siblingInLaw',
  'otherRelative',
];

/** The relationship each neutral kinship word beyond one step names. */
const RELATIONSHIP_OF_TERM: Partial<
  Record<KinTerm, PedigreeRelationshipToParticipant>
> = {
  grandparent: 'grandparent',
  greatGrandparent: 'greatGrandparent',
  grandchild: 'grandchild',
  greatGrandchild: 'greatGrandchild',
  parentsSibling: 'parentsSibling',
  grandparentsSibling: 'grandparentsSibling',
  siblingsChild: 'siblingsChild',
  cousin: 'cousin',
  stepparent: 'stepParent',
  stepchild: 'stepChild',
  stepsibling: 'stepSibling',
  parentInLaw: 'parentInLaw',
  siblingInLaw: 'siblingInLaw',
  childInLaw: 'childInLaw',
};

/** The relationship a path of more than one step names, if any, read from
 * its neutral kinship word. */
function relationshipOfPath(
  family: Family,
  path: readonly Step[],
): PedigreeRelationshipToParticipant | undefined {
  const term = kinTermFor(family, path, 'gamete');
  return term === undefined ? undefined : RELATIONSHIP_OF_TERM[term];
}

/** The longest path any relationship but `otherRelative` needs. */
const MAX_PATH = 3;

const biologicalParentsOf = (family: Family, personId: string) =>
  new Set(
    family.links
      .filter((link) => link.target === personId && link.kind === 'biological')
      .map((link) => link.source),
  );

/**
 * Two people who share a biological or adoptive parent (as `stepsFrom` finds
 * siblings): full siblings when they have the same biological parents, half
 * siblings when they share some, and adoptive siblings when they share none,
 * so are related through adoption alone.
 */
function siblingRelationship(
  family: Family,
  a: string,
  b: string,
): PedigreeRelationshipToParticipant {
  const aParents = biologicalParentsOf(family, a);
  const bParents = biologicalParentsOf(family, b);
  const shared = [...aParents].filter((parent) => bParents.has(parent));
  if (shared.length === 0) return 'adoptiveSibling';
  return shared.length === aParents.size && shared.length === bParents.size
    ? 'sibling'
    : 'halfSibling';
}

type ParentKind = Exclude<PedigreeRelationshipKind, 'partner'>;

const PARENT_RELATIONSHIP: Record<
  ParentKind,
  PedigreeRelationshipToParticipant
> = {
  biological: 'parent',
  adoptive: 'adoptiveParent',
  social: 'stepParent',
  donor: 'donor',
  surrogate: 'surrogate',
};

const CHILD_RELATIONSHIP: Record<
  ParentKind,
  PedigreeRelationshipToParticipant
> = {
  biological: 'child',
  adoptive: 'adoptiveChild',
  social: 'stepChild',
  donor: 'donorConceivedChild',
  surrogate: 'surrogacyChild',
};

/** The relationship one step from the participant names. */
function oneStepRelationship(
  family: Family,
  egoId: string,
  step: Step,
): PedigreeRelationshipToParticipant {
  switch (step.type) {
    case 'parent':
      return PARENT_RELATIONSHIP[step.kind];
    case 'child':
      return CHILD_RELATIONSHIP[step.kind];
    case 'sibling':
      return siblingRelationship(family, egoId, step.to);
    case 'partner':
      return step.current ? 'partner' : 'formerPartner';
  }
}

/**
 * Each family member's relationship to the participant, by person id, worked
 * out from the family they drew: for everyone connected to the participant
 * (named or not), never the participant themselves. `family` is the
 * participant's family (`participantsFamily`), so everyone in it but the
 * participant is given one.
 *
 * Every way a person is related along a chain of up to three family ties is
 * found, using the kinship rules the canvas labels follow, and the first in
 * `RELATIONSHIP_PRECEDENCE` is kept. Someone connected only further out, or
 * in a way none of the values names, is an `otherRelative`.
 */
export function relationshipsToParticipant(
  family: Family,
): Map<string, PedigreeRelationshipToParticipant> {
  const result = new Map<string, PedigreeRelationshipToParticipant>();
  const egoId = family.egoId;
  if (egoId === undefined) return result;

  const stepsCache = new Map<string, Step[]>();
  const steps = (personId: string) => {
    let found = stepsCache.get(personId);
    if (!found) {
      found = stepsFrom(family, personId);
      stepsCache.set(personId, found);
    }
    return found;
  };

  const found = new Map<string, Set<PedigreeRelationshipToParticipant>>();
  const note = (
    personId: string,
    relationship: PedigreeRelationshipToParticipant,
  ) => {
    const set = found.get(personId) ?? new Set();
    set.add(relationship);
    found.set(personId, set);
  };

  const walk = (path: Step[], visited: Set<string>) => {
    const from = path.length === 0 ? egoId : path[path.length - 1]!.to;
    for (const step of steps(from)) {
      if (visited.has(step.to)) continue;
      const next = [...path, step];
      const relationship =
        next.length === 1
          ? oneStepRelationship(family, egoId, step)
          : relationshipOfPath(family, next);
      if (relationship) note(step.to, relationship);
      if (next.length < MAX_PATH) {
        visited.add(step.to);
        walk(next, visited);
        visited.delete(step.to);
      }
    }
  };
  walk([], new Set([egoId]));

  for (const person of family.people) {
    if (person.id === egoId) continue;
    const relationships = found.get(person.id);
    result.set(
      person.id,
      RELATIONSHIP_PRECEDENCE.find((relationship) =>
        relationships?.has(relationship),
      ) ?? 'otherRelative',
    );
  }
  return result;
}

/**
 * What saving the relationships to the participant changes: each person of
 * the stage's type whose stored relationship differs from the one worked out
 * from `family` (the participant's family), with the relationship to write,
 * or `undefined` to clear it from someone who holds one but is the
 * participant or no longer connected to them. People whose stored value is
 * already right are left alone.
 */
export function relationshipWrites(
  nodes: readonly NcNode[],
  family: Family,
  config: Pick<PedigreeConfig, 'personType'>,
  attribute: string,
): {
  personId: string;
  relationship: PedigreeRelationshipToParticipant | undefined;
}[] {
  const relationships = relationshipsToParticipant(family);
  const writes: {
    personId: string;
    relationship: PedigreeRelationshipToParticipant | undefined;
  }[] = [];
  for (const node of nodes) {
    if (node.type !== config.personType) continue;
    const personId = node[entityPrimaryKeyProperty];
    const stored = readOwnProperty(node[entityAttributesProperty], attribute);
    const relationship = relationships.get(personId);
    if (relationship === undefined) {
      if (stored !== undefined && stored !== null) {
        writes.push({ personId, relationship: undefined });
      }
    } else if (
      !(
        Array.isArray(stored) &&
        stored.length === 1 &&
        stored[0] === relationship
      )
    ) {
      writes.push({ personId, relationship });
    }
  }
  return writes;
}
