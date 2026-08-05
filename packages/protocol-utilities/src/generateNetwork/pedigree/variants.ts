/**
 * Applies non-standard parentage to a finished kinship skeleton: donated
 * gametes, gestational carriers, and adoption.
 *
 * These are layered on afterwards rather than drawn inline so the skeleton
 * stays a single always-correct base case, and so the rates can be turned up
 * for `showcase` without perturbing the demography.
 *
 * The encodings follow the interface's data model exactly:
 *
 * - `biological` — a genetic parent, carrying a gamete role.
 * - `donor` — also genetic, also carrying a gamete role, but donor-conceived.
 * - `surrogate` — carried the pregnancy without contributing a gamete. Takes
 *   `isGestationalCarrier`, never a gamete role.
 * - `adoptive` — no genetic contribution and no pregnancy.
 *
 * Where the egg contributor also carried the pregnancy — the ordinary case —
 * the single egg edge is flagged rather than a second carrier edge added,
 * matching how the interface collapses the two.
 */

import { chance, type PedigreeDemography, type Rng } from './demography.ts';
import type {
  AbstractPedigree,
  AbstractPerson,
  ParentLink,
} from './kinship.ts';

type VariantContext = {
  rng: Rng;
  demography: PedigreeDemography;
  pedigree: AbstractPedigree;
  counter: { value: number };
  /**
   * Marks the namespace a person's id was allocated from.
   *
   * The skeleton has already issued ids of the form `carrier-4`, and a variant
   * counter starting from zero reissues them — an ego born to a carrier and a
   * fourth appended carrier both become `carrier-4`. The render keys its
   * network-id map by this id, so one mapping overwrites the other and parent
   * edges are routed to the wrong rendered person.
   */
  namespace: string;
};

function addDonorPerson(
  context: VariantContext,
  sex: 'female' | 'male',
  generation: number,
  prefix: string,
): AbstractPerson {
  context.counter.value += 1;
  const person: AbstractPerson = {
    id: `${prefix}-${context.namespace}${context.counter.value}`,
    generation,
    sex,
    isEgo: false,
    isFounder: true,
  };
  context.pedigree.people.push(person);
  return person;
}

/**
 * The people whose parentage may be varied without disturbing ego's own descent
 * or anything a required completeness boundary reaches.
 *
 * `protect` carries the second of those: a co-parent whose two generations
 * `requireChildrenContributors` inspects cannot be quietly adopted, or the
 * pedigree stops satisfying the boundary it was built to satisfy.
 */
function variableChildren(
  pedigree: AbstractPedigree,
  protect: ReadonlySet<string>,
): AbstractPerson[] {
  const byId = new Map(pedigree.people.map((person) => [person.id, person]));
  const egoAncestors = new Set<string>();

  const walkUp = (id: string): void => {
    for (const link of pedigree.parents.get(id) ?? []) {
      if (egoAncestors.has(link.parent)) continue;
      egoAncestors.add(link.parent);
      walkUp(link.parent);
    }
  };
  walkUp(pedigree.egoId);

  return [...pedigree.parents.keys()]
    .filter(
      (id) =>
        id !== pedigree.egoId && !egoAncestors.has(id) && !protect.has(id),
    )
    .map((id) => byId.get(id))
    .filter((person): person is AbstractPerson => person !== undefined);
}

function applyDonorEgg(context: VariantContext, child: AbstractPerson): void {
  const links = context.pedigree.parents.get(child.id);
  if (!links) return;
  const eggLink = links.find((link) => link.gameteRole === 'egg');
  if (!eggLink) return;

  const donor = addDonorPerson(
    context,
    'female',
    child.generation - 1,
    'donor',
  );
  const intendedMother = eggLink.parent;

  context.pedigree.parents.set(child.id, [
    ...links.filter((link) => link !== eggLink),
    { parent: donor.id, relationshipType: 'donor', gameteRole: 'egg' },
    // The intended mother carried but contributed no gamete, which is exactly
    // what `surrogate` encodes — the label is about the genetic relationship,
    // not about whose pregnancy it was socially.
    {
      parent: intendedMother,
      relationshipType: 'surrogate',
      isGestationalCarrier: true,
    },
  ]);
}

function applyDonorSperm(context: VariantContext, child: AbstractPerson): void {
  const links = context.pedigree.parents.get(child.id);
  if (!links) return;
  const spermLink = links.find((link) => link.gameteRole === 'sperm');
  if (!spermLink) return;

  const donor = addDonorPerson(context, 'male', child.generation - 1, 'donor');
  context.pedigree.parents.set(child.id, [
    ...links.filter((link) => link !== spermLink),
    { parent: donor.id, relationshipType: 'donor', gameteRole: 'sperm' },
  ]);
}

function applySurrogacy(context: VariantContext, child: AbstractPerson): void {
  const links = context.pedigree.parents.get(child.id);
  if (!links) return;
  const eggLink = links.find((link) => link.gameteRole === 'egg');
  if (!eggLink) return;

  const carrier = addDonorPerson(
    context,
    'female',
    child.generation - 1,
    'carrier',
  );

  context.pedigree.parents.set(child.id, [
    // The genetic mother did not carry, so her egg edge loses the flag it would
    // otherwise take.
    ...links.map((link) =>
      link === eggLink ? { ...link, isGestationalCarrier: false } : link,
    ),
    {
      parent: carrier.id,
      relationshipType: 'surrogate',
      isGestationalCarrier: true,
    },
  ]);
}

/**
 * Replaces a child's genetic parentage with an adoptive couple.
 *
 * The genetic parents leave the pedigree entirely, which is the point: an
 * adopted person does not inherit the family's conditions, and a pedigree that
 * shows that is doing its job.
 */
function applyAdoption(context: VariantContext, child: AbstractPerson): void {
  const links = context.pedigree.parents.get(child.id);
  if (!links || links.length === 0) return;

  context.pedigree.parents.set(
    child.id,
    links
      .filter((link) => link.gameteRole !== undefined)
      .map(
        (link): ParentLink => ({
          parent: link.parent,
          relationshipType: 'adoptive',
        }),
      ),
  );
}

/**
 * Marks the ordinary case: the egg contributor carried the pregnancy. Applied
 * to every child that no variant has already given a carrier.
 */
function flagOrdinaryCarriers(pedigree: AbstractPedigree): void {
  for (const [childId, links] of pedigree.parents) {
    const hasCarrier = links.some((link) => link.isGestationalCarrier === true);
    if (hasCarrier) continue;

    pedigree.parents.set(
      childId,
      links.map((link) =>
        link.gameteRole === 'egg'
          ? { ...link, isGestationalCarrier: true }
          : link,
      ),
    );
  }
}

export function applyParentageVariants(
  rng: Rng,
  demography: PedigreeDemography,
  pedigree: AbstractPedigree,
  protect: ReadonlySet<string> = new Set(),
): AbstractPedigree {
  const context: VariantContext = {
    rng,
    demography,
    pedigree,
    counter: { value: 0 },
    namespace: 'v',
  };

  for (const child of variableChildren(pedigree, protect)) {
    // At most one variant per child: they are alternative accounts of the same
    // conception, not independent events that can stack.
    if (chance(rng, demography.adoptionRate)) {
      applyAdoption(context, child);
      continue;
    }
    if (chance(rng, demography.donorEggRate)) {
      applyDonorEgg(context, child);
      continue;
    }
    if (chance(rng, demography.donorSpermRate)) {
      applyDonorSperm(context, child);
      continue;
    }
    if (chance(rng, demography.surrogacyRate)) {
      applySurrogacy(context, child);
    }
  }

  flagOrdinaryCarriers(pedigree);
  return pedigree;
}

/**
 * Forces any arrangement a run of `showcase` did not happen to sample.
 *
 * `showcase` exists so a single previewed pedigree exercises the paths that
 * population rates almost never reach. Raising the probabilities alone does not
 * deliver that — an ordinary seed can still come out with nothing but
 * biological parentage — so the promise is kept explicitly.
 *
 * Applied only to children no completeness boundary reaches, like every other
 * variant.
 */
export function ensureShowcaseCoverage(
  rng: Rng,
  demography: PedigreeDemography,
  pedigree: AbstractPedigree,
  protect: ReadonlySet<string>,
): Set<string> {
  const context: VariantContext = {
    rng,
    demography,
    pedigree,
    counter: { value: 0 },
    namespace: 'c',
  };

  const present = new Set<string>();
  for (const links of pedigree.parents.values()) {
    for (const link of links) present.add(link.relationshipType);
  }

  // Only children whose parentage is still plain. Layering an arrangement over
  // one that already has another does not replace it — a donor egg over a
  // surrogate birth leaves the child with two gestational carriers, which the
  // shared validator rightly rejects — so a pedigree without enough plain
  // children simply shows fewer arrangements.
  const eligible = variableChildren(pedigree, protect).filter((child) =>
    (pedigree.parents.get(child.id) ?? []).every(
      (link) => link.relationshipType === 'biological',
    ),
  );

  let next = 0;
  const takeChild = (): AbstractPerson | undefined => eligible[next++];

  // A pedigree with no eligible child — every one of them reached by a
  // boundary, or none born at all — simply cannot show these, and forcing one
  // onto a protected person would break the boundary it was built to satisfy.
  // Returned so the size trim can protect them. Trimming away the very
  // arrangement this just injected would silently break the guarantee.
  const touched = new Set<string>();

  const forceOnto = (
    missing: string,
    apply: (context: VariantContext, child: AbstractPerson) => void,
  ): void => {
    if (present.has(missing)) return;
    const child = takeChild();
    if (!child) return;
    apply(context, child);
    touched.add(child.id);
    for (const link of pedigree.parents.get(child.id) ?? []) {
      touched.add(link.parent);
    }
  };

  forceOnto('adoptive', applyAdoption);
  forceOnto('donor', applyDonorEgg);
  forceOnto('surrogate', applySurrogacy);

  flagOrdinaryCarriers(pedigree);
  return touched;
}
