import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';

import { countCeiling } from '../plan/distributions';
import { resolveNodeCount } from '../plan/resolveSynthetic';

/**
 * How large an undeclared family may grow. A pedigree sizes itself from its
 * population profile rather than from a count, so this only caps its optional
 * branches.
 */
export const DEFAULT_PEDIGREE_NODE_CEILING = 32;

/**
 * The largest family ONE FamilyPedigree stage may build, from the declared
 * count of the node type that stage names — or `undefined` where the stage
 * names no type this codebook defines, which is the draft Architect previews.
 *
 * Per stage rather than shared. Maximised across the protocol, a type capped
 * at seven could grow optional relatives up to another type's ceiling of
 * forty while per-type feasibility still counted seven — an under-count, and
 * that is the direction that lets a run exhaust a value space preflight had
 * accepted.
 *
 * This is a DEFAULT, not an override: a caller that passes its own `maxNodes`
 * still wins, which is what `resolveFamilyPedigreeGenerationOptions` decides.
 *
 * Only a DECLARED count applies. The generic node default (1-8) describes how
 * many people a name generator elicits, which says nothing about a family, so
 * defaulting to it would cap every undeclared pedigree below its own minimum.
 */
export function pedigreeCeilingForStage(
  codebook: StructuralCodebook,
  stage: Stage,
): number | undefined {
  if (stage.type !== 'FamilyPedigree') return undefined;
  const type = stage.nodeConfig?.type;
  const definition = type === undefined ? undefined : codebook.node?.[type];
  if (definition === undefined) return undefined;

  return definition.synthetic?.count !== undefined
    ? countCeiling(resolveNodeCount(definition, { creatable: true }))
    : DEFAULT_PEDIGREE_NODE_CEILING;
}
