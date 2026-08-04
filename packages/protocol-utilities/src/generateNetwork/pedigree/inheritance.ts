/**
 * Propagates a condition down the pedigree by descent, then derives who is
 * affected.
 *
 * The point is that `NarrativePedigree` exists to show an inheritance pathway.
 * Flipping the nomination boolean independently per person — which is what
 * happened before — produces noise the interface then dutifully renders as if
 * it meant something, and makes focal-person tracing highlight a contributor
 * set that bears no relation to the data.
 *
 * So genotypes are simulated under the real Mendelian rules for the declared
 * pattern, and the boolean is written only where the phenotype is affected.
 * The interface's own engine then infers carriers and at-risk status from the
 * same structure, and agrees with itself.
 *
 * Only genetic links transmit — `biological` and `donor`. An adopted child
 * inherits nothing, which is a fact worth showing rather than a case to avoid.
 */

import { chance, type Rng } from './demography.ts';
import type { AbstractPedigree, AbstractPerson } from './kinship.ts';

export const INHERITANCE_PATTERNS = [
  'autosomalDominant',
  'autosomalRecessive',
  'xLinkedDominant',
  'xLinkedRecessive',
  'yLinked',
  'mitochondrial',
  'multifactorial',
  'unknown',
] as const;

export type InheritancePattern = (typeof INHERITANCE_PATTERNS)[number];

type Genotype = {
  /** Count of variant alleles at an autosomal locus (0–2). */
  autosomal: number;
  /** Count of variant alleles on X chromosomes (0–2 female, 0–1 male). */
  x: number;
  /** Variant on the Y chromosome. Males only. */
  y: boolean;
  /** Variant in mitochondrial DNA, inherited with the egg. */
  mt: boolean;
};

const CLEAR: Genotype = { autosomal: 0, x: 0, y: false, mt: false };

/** Prevalence used for patterns that carry no transmission model. */
const UNMODELLED_PREVALENCE = 0.12;

function topologicalOrder(pedigree: AbstractPedigree): AbstractPerson[] {
  const byId = new Map(pedigree.people.map((person) => [person.id, person]));
  const ordered: AbstractPerson[] = [];
  const placed = new Set<string>();

  const place = (id: string, guard: Set<string>): void => {
    if (placed.has(id) || guard.has(id)) return;
    guard.add(id);
    for (const link of pedigree.parents.get(id) ?? []) {
      place(link.parent, guard);
    }
    guard.delete(id);
    const person = byId.get(id);
    if (person && !placed.has(id)) {
      placed.add(id);
      ordered.push(person);
    }
  };

  for (const person of pedigree.people) place(person.id, new Set());
  return ordered;
}

/**
 * Seeds the founder or founders whose descent the condition follows, chosen so
 * the pattern actually manifests: a recessive condition seeded on one carrier
 * would produce no affected person at all, and a pedigree showing nothing is
 * a poor demonstration of an inheritance view.
 */
function seedFounders(
  rng: Rng,
  pedigree: AbstractPedigree,
  pattern: InheritancePattern,
  genotypes: Map<string, Genotype>,
): void {
  const founders = pedigree.people.filter(
    (person) => person.isFounder && person.generation <= -2,
  );
  if (founders.length === 0) return;

  const females = founders.filter((person) => person.sex === 'female');
  const males = founders.filter((person) => person.sex === 'male');
  const pick = (from: AbstractPerson[]): AbstractPerson | undefined =>
    from.length === 0 ? undefined : from[rng.randomInt(0, from.length - 1)];

  const set = (
    person: AbstractPerson | undefined,
    value: Partial<Genotype>,
  ) => {
    if (!person) return;
    genotypes.set(person.id, { ...CLEAR, ...value });
  };

  switch (pattern) {
    case 'autosomalDominant':
      set(pick(founders), { autosomal: 1 });
      return;
    case 'autosomalRecessive': {
      // Both members of one founder couple carry, so the condition can surface
      // among their children rather than merely lurking.
      const union = pedigree.unions.find((candidate) =>
        founders.some((person) => person.id === candidate.a),
      );
      if (!union) return;
      genotypes.set(union.a, { ...CLEAR, autosomal: 1 });
      genotypes.set(union.b, { ...CLEAR, autosomal: 1 });
      return;
    }
    case 'xLinkedDominant':
      set(pick(males) ?? pick(females), { x: 1 });
      return;
    case 'xLinkedRecessive':
      // A carrier grandmother: her sons are affected and her daughters carry,
      // which is the pattern the interface's notation is designed to show.
      set(pick(females), { x: 1 });
      return;
    case 'yLinked':
      set(pick(males), { y: true });
      return;
    case 'mitochondrial':
      set(pick(females), { mt: true });
      return;
    default:
      return;
  }
}

function inherit(
  rng: Rng,
  child: AbstractPerson,
  eggParent: Genotype | undefined,
  spermParent: Genotype | undefined,
): Genotype {
  const fromEgg = eggParent ?? CLEAR;
  const fromSperm = spermParent ?? CLEAR;

  // One autosomal allele from each genetic contributor.
  let autosomal = 0;
  if (chance(rng, fromEgg.autosomal / 2)) autosomal += 1;
  if (chance(rng, fromSperm.autosomal / 2)) autosomal += 1;

  // The egg contributor is female and carries two X, so passes one at random.
  let x = 0;
  if (chance(rng, fromEgg.x / 2)) x += 1;

  // A daughter takes her father's single X; a son takes his father's Y instead.
  let y = false;
  if (child.sex === 'female') {
    if (fromSperm.x >= 1) x += 1;
  } else {
    y = fromSperm.y;
  }

  return { autosomal, x, y, mt: fromEgg.mt };
}

function isAffected(
  person: AbstractPerson,
  genotype: Genotype,
  pattern: InheritancePattern,
): boolean {
  switch (pattern) {
    case 'autosomalDominant':
      return genotype.autosomal >= 1;
    case 'autosomalRecessive':
      return genotype.autosomal >= 2;
    case 'xLinkedDominant':
      return genotype.x >= 1;
    case 'xLinkedRecessive':
      return person.sex === 'male' ? genotype.x >= 1 : genotype.x >= 2;
    case 'yLinked':
      return person.sex === 'male' && genotype.y;
    case 'mitochondrial':
      return genotype.mt;
    default:
      return false;
  }
}

/**
 * Returns the ids of the people affected by a condition with the given
 * inheritance pattern.
 *
 * `multifactorial` and `unknown` deliberately carry no transmission model —
 * the interface infers nothing from them and shows only who was nominated — so
 * they are sampled independently at a plausible prevalence rather than
 * descended.
 */
export function computeAffected(
  rng: Rng,
  pedigree: AbstractPedigree,
  pattern: InheritancePattern,
): Set<string> {
  if (pattern === 'multifactorial' || pattern === 'unknown') {
    const affected = new Set<string>();
    for (const person of pedigree.people) {
      if (chance(rng, UNMODELLED_PREVALENCE)) affected.add(person.id);
    }
    return affected;
  }

  const genotypes = new Map<string, Genotype>();
  seedFounders(rng, pedigree, pattern, genotypes);

  for (const person of topologicalOrder(pedigree)) {
    if (genotypes.has(person.id)) continue;

    const links = pedigree.parents.get(person.id) ?? [];
    const eggLink = links.find(
      (link) =>
        link.gameteRole === 'egg' &&
        (link.relationshipType === 'biological' ||
          link.relationshipType === 'donor'),
    );
    const spermLink = links.find(
      (link) =>
        link.gameteRole === 'sperm' &&
        (link.relationshipType === 'biological' ||
          link.relationshipType === 'donor'),
    );

    genotypes.set(
      person.id,
      inherit(
        rng,
        person,
        eggLink ? genotypes.get(eggLink.parent) : undefined,
        spermLink ? genotypes.get(spermLink.parent) : undefined,
      ),
    );
  }

  const affected = new Set<string>();
  for (const person of pedigree.people) {
    const genotype = genotypes.get(person.id) ?? CLEAR;
    if (isAffected(person, genotype, pattern)) affected.add(person.id);
  }
  return affected;
}
