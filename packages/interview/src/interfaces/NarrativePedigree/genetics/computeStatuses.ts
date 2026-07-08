import type { InheritancePattern } from '@codaco/shared-consts';

import type { GeneticGraph } from './geneticGraph';
import {
  computeAutosomalDominant,
  computeAutosomalRecessive,
} from './patterns/autosomal';
import { computeMitochondrial, computeYLinked } from './patterns/uniparental';
import {
  computeXLinkedDominant,
  computeXLinkedRecessive,
} from './patterns/xLinked';
import type { Status } from './status';

type Sex = 'female' | 'male' | 'unknown';

/**
 * Build the result for `multifactorial`/`unknown` patterns: NO carrier/at-risk
 * inference — only the nominated affected nodes are `affected`, everyone else is
 * omitted from the map (= `unknown`).
 */
function affectedOnly(affected: Set<string>): Map<string, Status> {
  const result = new Map<string, Status>();
  for (const id of affected) {
    result.set(id, 'affected');
  }
  return result;
}

/**
 * Orchestrator: dispatch a per-person status computation on the disease's
 * `InheritancePattern` (spec §3).
 *
 * - Autosomal dominant/recessive → the autosomal functions (sex-independent).
 * - X-linked recessive/dominant, Y-linked, mitochondrial → the sex-dependent
 *   functions, passed `resolveSex`.
 * - `multifactorial`/`unknown` → only the affected nodes are `affected`; no
 *   carrier or at-risk inference is made.
 *
 * The `switch` is exhaustive over `INHERITANCE_PATTERNS`; the `never` default
 * makes any unhandled pattern a compile-time error (no `any`/`as`).
 */
export function computeStatuses(
  graph: GeneticGraph,
  affected: Set<string>,
  pattern: InheritancePattern,
  resolveSex: (id: string) => Sex,
): Map<string, Status> {
  switch (pattern) {
    case 'autosomalDominant':
      return computeAutosomalDominant(graph, affected);
    case 'autosomalRecessive':
      return computeAutosomalRecessive(graph, affected);
    case 'xLinkedRecessive':
      return computeXLinkedRecessive(graph, affected, resolveSex);
    case 'xLinkedDominant':
      return computeXLinkedDominant(graph, affected, resolveSex);
    case 'yLinked':
      return computeYLinked(graph, affected, resolveSex);
    case 'mitochondrial':
      return computeMitochondrial(graph, affected, resolveSex);
    case 'multifactorial':
    case 'unknown':
      return affectedOnly(affected);
    default: {
      const exhaustive: never = pattern;
      return exhaustive;
    }
  }
}
