import type { GeneticGraph } from '../geneticGraph';
import { mergeStatus, type Status } from '../status';

type Sex = 'female' | 'male' | 'unknown';

/**
 * Merge `value` into `result[id]`, respecting status precedence
 * (`affected > obligateAffected > obligateCarrier > atRiskAffected >
 * atRiskCarrier > unknown`). A rule only ever writes a non-`unknown` status, so
 * omission from the map IS `unknown` (including the sex-blocked case).
 */
function assign(result: Map<string, Status>, id: string, value: Status): void {
  if (value === 'unknown') {
    return;
  }
  const existing = result.get(id) ?? 'unknown';
  result.set(id, mergeStatus(existing, value));
}

/**
 * Y-linked status computation (spec §3).
 *
 * The Y chromosome passes father → son in an unbroken male line, never through a
 * female. Transmission is obligate and ~fully penetrant, so the whole male line
 * connected to an affected male shares his Y → `obligateAffected` (NOT `atRisk`).
 *
 * Rules:
 * - Affected nodes → `affected` (boolean nomination is preserved even for a
 *   female, who cannot present a Y-linked trait under this model).
 * - For every affected MALE: every male in unbroken male-line DESCENT (his sons,
 *   sons' sons, …) AND every male-line ANCESTOR (his father, father's father, …)
 *   → `obligateAffected`. Both walks pass only through males.
 * - Females confer and receive nothing: the Y line never passes through a female,
 *   so an affected male's daughters (and anyone reached via a female) get nothing.
 * - Recursion uses a visited-set so consanguinity loops terminate.
 */
export function computeYLinked(
  graph: GeneticGraph,
  affected: Set<string>,
  resolveSex: (id: string) => Sex,
): Map<string, Status> {
  const result = new Map<string, Status>();

  for (const id of affected) {
    assign(result, id, 'affected');
  }

  const affectedMales = [...affected].filter((id) => resolveSex(id) === 'male');

  // Descent: only sons continue the Y line; daughters terminate it. The
  // visited-set is shared across all seeds so a cycle cannot loop forever.
  const descendantVisited = new Set<string>(affectedMales);
  const maleLineDescendants = graph.propagate(
    affectedMales,
    (maleId) =>
      graph
        .childrenOf(maleId)
        .filter((childId) => resolveSex(childId) === 'male'),
    descendantVisited,
  );

  // Ascent: only the male (paternal) parent continues the Y line upward.
  const ancestorVisited = new Set<string>(affectedMales);
  const maleLineAncestors = graph.propagate(
    affectedMales,
    (maleId) =>
      graph
        .parentsOf(maleId)
        .filter((parent) => parent.sex === 'male')
        .map((parent) => parent.id),
    ancestorVisited,
  );

  for (const id of [...maleLineDescendants, ...maleLineAncestors]) {
    if (!affected.has(id)) {
      assign(result, id, 'obligateAffected');
    }
  }

  return result;
}

/**
 * Mitochondrial status computation (spec §3).
 *
 * mtDNA is maternally inherited: a mother passes her mitochondria to ALL of her
 * children, but only daughters transmit onward; a male never transmits. Because
 * of heteroplasmy the penetrance is variable, so inferred relatives are
 * `atRiskAffected` (NOT upgraded to `affected`).
 *
 * Rules:
 * - Affected nodes → `affected`.
 * - From every affected/transmitting FEMALE, every child (both sexes) →
 *   `atRiskAffected`. Recursion continues DOWN through DAUGHTERS ONLY (a daughter
 *   transmits mtDNA even when clinically unaffected), STOPPING at every male (his
 *   children get nothing from him).
 * - Up the maternal line: an affected person's mtDNA came from the mother, so the
 *   maternal-line ancestors (mother, mother's mother, …) are the mt source and at
 *   risk. Each such maternal ancestor is then re-seeded as a transmitting female,
 *   so her other daughters and their daughter-descent (the affected person's
 *   maternal aunts, sisters, cousins on the maternal line) are reached too.
 * - A male transmits nothing: an affected male's children get nothing from him.
 * - Recursion uses a visited-set so consanguinity loops terminate.
 */
export function computeMitochondrial(
  graph: GeneticGraph,
  affected: Set<string>,
  resolveSex: (id: string) => Sex,
): Map<string, Status> {
  const result = new Map<string, Status>();

  for (const id of affected) {
    assign(result, id, 'affected');
  }

  // (1) Walk UP the maternal line from every affected person. Only the FEMALE
  // (maternal) parent carries the mtDNA upward; a male ancestor is not the mt
  // source and terminates the walk. These maternal ancestors are themselves at
  // risk AND become transmitting-female seeds for the downward pass.
  const maternalAncestorVisited = new Set<string>(affected);
  const maternalAncestors = graph.propagate(
    [...affected],
    (id) =>
      graph
        .parentsOf(id)
        .filter((parent) => parent.sex === 'female')
        .map((parent) => parent.id),
    maternalAncestorVisited,
  );

  // (2) Transmitting-female seeds: every affected female plus every maternal-line
  // ancestor reached above. From each, mtDNA flows DOWN to all children, but only
  // DAUGHTERS carry it further (stop at every male).
  const transmittingFemaleSeeds = new Set<string>();
  for (const id of affected) {
    if (resolveSex(id) === 'female') {
      transmittingFemaleSeeds.add(id);
    }
  }
  for (const id of maternalAncestors) {
    if (resolveSex(id) === 'female') {
      transmittingFemaleSeeds.add(id);
    }
  }

  // Downward pass: a transmitting female confers atRiskAffected on every child;
  // daughters (regardless of clinical status) continue the line, males stop it.
  // The visited-set is seeded with the transmitting females themselves so an
  // affected mother is not overwritten and cycles terminate.
  const downwardVisited = new Set<string>(transmittingFemaleSeeds);
  graph.propagate(
    [...transmittingFemaleSeeds],
    (femaleId) => {
      const daughters: string[] = [];
      for (const childId of graph.childrenOf(femaleId)) {
        if (!affected.has(childId)) {
          assign(result, childId, 'atRiskAffected');
        }
        // Only daughters transmit mtDNA onward; recursion stops at every male.
        if (resolveSex(childId) === 'female') {
          daughters.push(childId);
        }
      }
      return daughters;
    },
    downwardVisited,
  );

  // (3) The maternal-line ancestors themselves (the mt source line) are at risk.
  // Assigned after the downward pass; precedence keeps an affected ancestor
  // `affected`.
  for (const id of maternalAncestors) {
    if (!affected.has(id)) {
      assign(result, id, 'atRiskAffected');
    }
  }

  return result;
}
