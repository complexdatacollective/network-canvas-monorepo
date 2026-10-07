import type { Family } from '../../FamilyPedigree/model';
import { type Gamete, isGeneticKind } from './geneticGraph';

type Sex = 'female' | 'male' | 'unknown';

const linkKey = (parentId: string, childId: string) => `${parentId}>${childId}`;

/**
 * The gamete each genetic parent (biological parent or donor) gave each child,
 * as far as the family's recorded sexes assigned at birth tell it.
 *
 * The Family Pedigree records no gametes. It records each person's sex
 * assigned at birth, and allows a child at most one genetic parent recorded
 * female at birth and one recorded male, because one gave the egg and the
 * other the sperm. So:
 *
 * - a genetic parent recorded female at birth gave the egg, and one recorded
 *   male gave the sperm;
 * - otherwise (intersex, not known, preferred not to say, or not answered),
 *   when the child's other genetic parent is recorded female or male, this
 *   one gave the other gamete. This is how the Family Pedigree itself records
 *   an unnamed parent added to complete a pair: it gives them the sex of the
 *   gamete the known parent did not give.
 * - anything else is not known.
 *
 * Keyed by `parent>child`.
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

/** Looks up a gamete from `inferGametes`, in the shape `buildGeneticGraph`
 * takes. */
export function gameteLookup(gametes: ReadonlyMap<string, Gamete>) {
  return (parentId: string, childId: string) =>
    gametes.get(linkKey(parentId, childId));
}

/**
 * Each person's sex for the sex-linked rules (X-linked, Y-linked and the
 * female line mtDNA follows when no egg is known).
 *
 * - Recorded female or male at birth: that.
 * - Recorded intersex: unknown. Intersex variations include chromosome
 *   patterns other than XX and XY, so neither one X nor two can be assumed,
 *   whichever gamete they gave; the sex-linked rules treat them as uncertain
 *   rather than guess.
 * - Not known, preferred not to say, or not answered: the sex of the gamete
 *   they gave a child (`inferGametes`), egg as female and sperm as male, when
 *   that is known and consistent; otherwise unknown.
 *
 * Gender identity has no bearing on it.
 */
export function geneticSexResolver(
  family: Family,
  gametes: ReadonlyMap<string, Gamete> = inferGametes(family),
): (id: string) => Sex {
  const fromGametes = new Map<string, Set<Gamete>>();
  for (const [key, gamete] of gametes) {
    const parentId = key.slice(0, key.indexOf('>'));
    const given = fromGametes.get(parentId) ?? new Set<Gamete>();
    given.add(gamete);
    fromGametes.set(parentId, given);
  }

  const sexes = new Map<string, Sex>();
  for (const person of family.people) {
    const recorded = person.sexAssignedAtBirth;
    if (recorded === 'female' || recorded === 'male') {
      sexes.set(person.id, recorded);
      continue;
    }
    if (recorded === 'intersex') {
      sexes.set(person.id, 'unknown');
      continue;
    }
    const given = fromGametes.get(person.id);
    if (given?.size === 1) {
      sexes.set(person.id, given.has('egg') ? 'female' : 'male');
    } else {
      sexes.set(person.id, 'unknown');
    }
  }
  return (id) => sexes.get(id) ?? 'unknown';
}
