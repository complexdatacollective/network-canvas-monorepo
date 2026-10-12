import {
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  type PedigreeRelationshipKind,
} from '@codaco/protocol-validation';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import {
  type Family,
  familyWithPlan,
  isFamilyLinkKind,
  type PedigreeConfig,
  type PlannedLink,
  type PlannedPerson,
  type PlannedTwin,
  planStandIns,
  readFamily,
} from '../FamilyPedigree/model';

/**
 * The participant's family: the participant, and everyone connected to them
 * through family relationships, however indirectly — through parents,
 * children, partners (current or not), donors, surrogates and twins alike.
 *
 * The interview network is one shared graph, and other stages can add people
 * of the same type who are not family (a friend, a colleague) and are not
 * connected to the participant by any family relationship. They are left out,
 * along with anyone whose family relationships do not reach the participant.
 * With no participant, the family is empty. Only the participant is marked
 * as them, even if another person's participant attribute is also set.
 *
 * The Family Pedigree draws, labels and asks about this family alone, and the
 * stages after it read the same family, so both agree on who is in it.
 */
export function participantsFamily(family: Family): Family {
  const { egoId } = family;
  if (egoId === undefined) {
    return {
      people: [],
      byId: new Map(),
      links: [],
      twins: [],
      egoId: undefined,
    };
  }

  const neighbours = new Map<string, string[]>();
  const connect = (from: string, to: string) => {
    const list = neighbours.get(from) ?? [];
    list.push(to);
    neighbours.set(from, list);
  };
  // Twins are family to each other, even recorded with no parent between
  // them.
  for (const link of [...family.links, ...family.twins]) {
    connect(link.source, link.target);
    connect(link.target, link.source);
  }

  const members = new Set<string>([egoId]);
  const queue = [egoId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const next of neighbours.get(current) ?? []) {
      if (members.has(next)) continue;
      members.add(next);
      queue.push(next);
    }
  }

  const people = family.people
    .filter((person) => members.has(person.id))
    .map((person) =>
      person.isEgo === (person.id === egoId)
        ? person
        : { ...person, isEgo: person.id === egoId },
    );
  return {
    people,
    byId: new Map(people.map((person) => [person.id, person])),
    links: family.links.filter(
      (link) => members.has(link.source) && members.has(link.target),
    ),
    twins: family.twins.filter(
      (twin) => members.has(twin.source) && members.has(twin.target),
    ),
    egoId,
  };
}

/**
 * Who would leave the participant's family if this person, or these links
 * (parent, partner or twin links), were removed from it: everyone connected to the participant only through
 * them. `family` is the participant's family (`participantsFamily`); the
 * person removed is not counted among those cut off.
 *
 * The Family Pedigree draws only the participant's family, so someone cut off
 * from it would vanish from the pedigree while staying in the interview. It
 * asks this before a removal, so that nobody drops out unannounced.
 */
export function peopleCutOff(
  family: Family,
  removal: Readonly<{ personId?: string; linkIds?: readonly string[] }>,
): string[] {
  const { personId } = removal;
  const linkIds = new Set(removal.linkIds ?? []);
  const remaining = participantsFamily({
    ...family,
    people: family.people.filter((person) => person.id !== personId),
    links: family.links.filter(
      (link) =>
        !linkIds.has(link.id) &&
        link.source !== personId &&
        link.target !== personId,
    ),
    twins: family.twins.filter(
      (twin) =>
        !linkIds.has(twin.id) &&
        twin.source !== personId &&
        twin.target !== personId,
    ),
    egoId: family.egoId === personId ? undefined : family.egoId,
  });
  return family.people
    .map((person) => person.id)
    .filter((id) => id !== personId && !remaining.byId.has(id));
}

/** A change to the family, as planned before it is written. */
export type FamilyChange = {
  people?: readonly PlannedPerson[];
  links?: readonly PlannedLink[];
  twins?: readonly PlannedTwin[];
  /** Links recorded again as another kind, by id. A twin link is never a
   * parent or partner link, so is not recorded as one. */
  linkKinds?: ReadonlyMap<string, PedigreeRelationshipKind>;
  /** People whose sex at birth changes, by id. */
  sexes?: ReadonlyMap<string, string | undefined>;
  /** Links and twin links removed, by id. */
  removedLinkIds?: readonly string[];
  removedPersonIds?: readonly string[];
};

/** The family as a change leaves it, before the stand-in rule is kept. */
function familyAfterChange(
  family: Family,
  change: FamilyChange,
  sexAttribute: string,
): Family {
  const planned = familyWithPlan(
    family,
    change.people ?? [],
    change.links ?? [],
    sexAttribute,
  );
  const removedPeople = new Set(change.removedPersonIds ?? []);
  const removedLinks = new Set(change.removedLinkIds ?? []);
  const touchesRemoved = (link: { source: string; target: string }) =>
    removedPeople.has(link.source) || removedPeople.has(link.target);
  const people = planned.people
    .filter((person) => !removedPeople.has(person.id))
    .map((person) =>
      change.sexes?.has(person.id)
        ? {
            ...person,
            sexAssignedAtBirth: PEDIGREE_SEX_ASSIGNED_AT_BIRTH.find(
              (sex) => sex === change.sexes?.get(person.id),
            ),
          }
        : person,
    );
  return {
    people,
    byId: new Map(people.map((person) => [person.id, person])),
    links: planned.links
      .filter((link) => !removedLinks.has(link.id) && !touchesRemoved(link))
      .map((link) => {
        const kind = change.linkKinds?.get(link.id);
        return kind === undefined || !isFamilyLinkKind(kind)
          ? link
          : { ...link, kind };
      }),
    twins: [
      ...planned.twins,
      ...(change.twins ?? []).map((twin, index) => ({
        ...twin,
        id: `\u0000planned-twin-${index}`,
      })),
    ].filter((twin) => !removedLinks.has(twin.id) && !touchesRemoved(twin)),
    egoId: planned.egoId,
  };
}

/**
 * Who a change would leave outside the participant's family: everyone in it
 * (`family` is the participant's family) whom the change, with the stand-in
 * rule kept after it (`planStandIns`: a stand-in gives way to a genetic
 * parent recorded in their place), leaves connected to the participant no
 * longer — other than the people it removes, and stand-ins left standing in
 * for nobody. Every path that removes a relationship asks this first, and
 * applies the same handling as removing a connection does: the change is
 * refused, naming them, so nobody drops out of the pedigree while staying in
 * the interview.
 */
export function peopleCutOffByChange(
  family: Family,
  change: FamilyChange,
  sexAttribute: string,
): string[] {
  const after = familyAfterChange(family, change, sexAttribute);
  let next = 0;
  const standIns = planStandIns(
    after,
    () => `\u0000stand-in-${next++}`,
    sexAttribute,
    family,
  );
  // New stand-ins are connected only to the people they stand in for, so
  // they reconnect nobody; but the genetic parent recorded in a stand-in's
  // place takes it for everyone the stand-in stood in for, which keeps them
  // connected.
  const kept = participantsFamily(
    familyAfterChange(
      familyAfterChange(
        after,
        {
          removedLinkIds: standIns.removedLinkIds,
          removedPersonIds: standIns.removedPersonIds,
        },
        sexAttribute,
      ),
      { links: standIns.links },
      sexAttribute,
    ),
  );
  const removed = new Set([
    ...(change.removedPersonIds ?? []),
    ...standIns.removedPersonIds,
  ]);
  return family.people
    .map((person) => person.id)
    .filter((id) => !removed.has(id) && !kept.byId.has(id));
}

/**
 * Everything to remove along with a person: the people connected to the
 * participant only through them (`peopleCutOff`), who would otherwise drop
 * out of the family unannounced, and every link touching any of them,
 * twin links included.
 */
export function planRemovePerson(
  family: Family,
  personId: string,
): { cutOffIds: string[]; linkIds: string[] } {
  const cutOffIds = peopleCutOff(family, { personId });
  const removed = new Set([personId, ...cutOffIds]);
  return {
    cutOffIds,
    linkIds: [...family.links, ...family.twins]
      .filter((link) => removed.has(link.source) || removed.has(link.target))
      .map((link) => link.id),
  };
}

/**
 * The participant's family (`participantsFamily`) as a stage after the
 * Family Pedigree reads it from the interview network. Every name is read as
 * given: when the participant leaves the Family Pedigree, it saves a label as
 * the name of everyone they left unnamed, so those labels are names here.
 * `decryptedNames` holds, by person id, the text of each encrypted name
 * decrypted so far; any other encrypted name cannot be read yet.
 */
export function readParticipantsFamily(
  nodes: readonly NcNode[],
  edges: readonly NcEdge[],
  config: PedigreeConfig,
  decryptedNames: ReadonlyMap<string, string> = new Map(),
): Family {
  return participantsFamily(
    readFamily(nodes, edges, config, {}, decryptedNames),
  );
}
