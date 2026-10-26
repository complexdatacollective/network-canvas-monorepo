import { type Family, isGeneticKind } from './model';

/** Which gamete a genetic parent gave a child. */
export type Gamete = 'egg' | 'sperm';

const linkKey = (parentId: string, childId: string) => `${parentId}>${childId}`;

/**
 * Which gamete each genetic parent (biological parent or donor) gave each
 * child. This is the one rule for it: the kinship words, the Narrative
 * Pedigree's genetics and anything else that needs to know who gave the egg
 * and who gave the sperm read it from here.
 *
 * The Family Pedigree never asks which gamete someone gave. It is derived from
 * sex assigned at birth, so that there is no second answer that could
 * contradict it. A child has at most two genetic parents, at most one recorded
 * female at birth and at most one recorded male, because one gave the egg and
 * the other the sperm. So, for each genetic parent of a child:
 *
 * - recorded female at birth: they gave the egg; recorded male: the sperm.
 *   Sex at birth governs, whatever the person's gender identity;
 * - otherwise (intersex, don't know, prefer not to say, or not answered), when
 *   the child's one other genetic parent is recorded female or male, they gave
 *   the other gamete, by elimination;
 * - anything else is not known: a single genetic parent who is neither female
 *   nor male, or two who are both neither.
 *
 * Keyed by `parent>child`; a link whose gamete is not known has no entry.
 */
export function inferGametes(family: Family): Map<string, Gamete> {
  const geneticParents = new Map<string, string[]>();
  for (const link of family.links) {
    if (!isGeneticKind(link.kind)) continue;
    const parents = geneticParents.get(link.target) ?? [];
    if (!parents.includes(link.source)) parents.push(link.source);
    geneticParents.set(link.target, parents);
  }

  const gameteOfSex = (parentId: string): Gamete | undefined => {
    const sex = family.byId.get(parentId)?.sexAssignedAtBirth;
    if (sex === 'female') return 'egg';
    if (sex === 'male') return 'sperm';
    return undefined;
  };

  const gametes = new Map<string, Gamete>();
  for (const [childId, parents] of geneticParents) {
    for (const parentId of parents) {
      const own = gameteOfSex(parentId);
      if (own) {
        gametes.set(linkKey(parentId, childId), own);
        continue;
      }
      const [other, ...rest] = parents.filter((id) => id !== parentId);
      if (other === undefined || rest.length > 0) continue;
      const otherGamete = gameteOfSex(other);
      if (otherGamete) {
        gametes.set(
          linkKey(parentId, childId),
          otherGamete === 'egg' ? 'sperm' : 'egg',
        );
      }
    }
  }
  return gametes;
}

/** Looks up a gamete from `inferGametes`: the one `parentId` gave `childId`,
 * when it is known. */
export function gameteLookup(gametes: ReadonlyMap<string, Gamete>) {
  return (parentId: string, childId: string): Gamete | undefined =>
    gametes.get(linkKey(parentId, childId));
}
