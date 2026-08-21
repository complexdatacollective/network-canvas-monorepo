import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import type { NcEdge, NcNode, VariableValue } from '@codaco/shared-consts';

import type { EntityConstraintCache } from '../../constraints/entityConstraintCache';
import {
  type EntityScopeRef,
  generateEntityAttributes,
} from '../../constraints/generateEntityAttributes';
import type { UniqueRegistry } from '../../constraints/uniqueRegistry';
import type { ValueGenerator } from '../../constraints/ValueGenerator';

/**
 * The concrete member of the {@link Stage} discriminated union for a given
 * `type` literal, for typing the pedigree's per-stage reads.
 */
export type StageOfType<T extends Stage['type']> = Extract<Stage, { type: T }>;

/**
 * What the pedigree materializer draws through: the session's own constraint
 * analysis and value machinery, plus the two things the pedigree keeps to
 * itself — a family-seeded value generator (so changing a pedigree cannot
 * move any other stage's stream) and a private unique registry (so its
 * internal reservations never leak into the session's; see the wrapper in
 * `../FamilyPedigree.ts` for how the two registries are reconciled).
 *
 * This replaces the deleted G2 engine's `GenerationContext`, which the
 * materializer was written against. `today` stands where `config.today` stood;
 * the rest of that config's tuning lives in the v8 schema's resolved
 * descriptors now.
 */
export type PedigreeGenerationContext = {
  codebook: StructuralCodebook;
  valueGen: ValueGenerator;
  /** The session's date (its startTime's day), for relative date windows. */
  today: string;
  uniqueRegistry: UniqueRegistry;
  entityConstraints: EntityConstraintCache;
};

/**
 * The network the materializer assembles a family into, committed back into
 * the session by the wrapper. Relocated from the deleted engine's context —
 * the shape is the materializer's working copy, not the session's.
 */
export type NetworkDraft = {
  egoUid: string;
  egoAttributes: Record<string, VariableValue>;
  nodes: NcNode[];
  edges: NcEdge[];
  /** Stage metadata keyed by stage index. */
  stageMetadata: Record<string, unknown>;
};

/**
 * One entity's attributes, drawn against the scope's constraints in the shape
 * the materializer was written to call — the old engine's entry point, now a
 * rename over the session machinery's own draw.
 */
export function generateAttributesForEntity(
  ctx: PedigreeGenerationContext,
  ref: EntityScopeRef,
  index: number,
  options?: {
    existing?: Record<string, VariableValue>;
    only?: Set<string>;
    preferRealisticNameVariables?: ReadonlySet<string>;
  },
): Record<string, VariableValue> {
  return generateEntityAttributes(
    ctx.entityConstraints.forScope(ref),
    ctx,
    ref,
    index,
    options,
  );
}
