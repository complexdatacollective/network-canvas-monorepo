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
 */
export function participantsFamily(family: Family): Family {
  const { egoId } = family;
  if (egoId === undefined) {
    return { people: [], byId: new Map(), links: [], egoId: undefined };
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
    egoId,
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
