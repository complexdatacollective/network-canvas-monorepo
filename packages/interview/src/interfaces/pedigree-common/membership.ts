import type { NcEdge, NcNode } from '@codaco/shared-consts';

import {
  type Family,
  type PedigreeConfig,
  readFamily,
} from '../FamilyPedigree/model';

/**
 * The participant's family: the participant, and everyone connected to them
 * through family relationships, however indirectly — through parents,
 * children, partners (current or not), donors and surrogates alike.
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
  for (const link of family.links) {
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
 * Who would leave the participant's family if this person, or these links,
 * were removed from it: everyone connected to the participant only through
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
    egoId: family.egoId === personId ? undefined : family.egoId,
  });
  return family.people
    .map((person) => person.id)
    .filter((id) => id !== personId && !remaining.byId.has(id));
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
