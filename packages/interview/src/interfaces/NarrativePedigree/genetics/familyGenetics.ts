import { type Gamete, inferGametes } from '../../FamilyPedigree/gametes';
import type { Family } from '../../FamilyPedigree/model';

type Sex = 'female' | 'male' | 'unknown';

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
