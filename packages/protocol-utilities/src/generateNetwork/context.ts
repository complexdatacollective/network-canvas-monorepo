import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import type { VariableValue, NcEdge, NcNode } from '@codaco/shared-consts';

import type { ValueGenerator } from '../ValueGenerator';
import type { ResolvedGenerationConfig } from './config';
import type { EntityConstraints } from './constraints/types';
import type { UniqueRegistry } from './constraints/uniqueRegistry';

/**
 * The concrete member of the {@link Stage} discriminated union for a given
 * `type` literal (or union of literals), for typing per-stage handlers.
 */
export type StageOfType<T extends Stage['type']> = Extract<Stage, { type: T }>;

/**
 * Read-mostly inputs threaded through every generation helper, so utility
 * functions read the resolved config and shared roster state without long
 * positional parameter lists.
 */
export type GenerationContext = {
  codebook: StructuralCodebook;
  valueGen: ValueGenerator;
  config: ResolvedGenerationConfig;
  /** Roster rows already drawn into the network, shared across stages. */
  usedRosterUids: Set<string>;
  /** Pre-parsed roster rows keyed by stage id (see `generateNetwork`). */
  externalData: Record<string, NcNode[]> | undefined;
  respectSkipLogicAndFiltering: boolean;
  /** Values already issued for `unique` variables, keyed by entity scope. */
  uniqueRegistry: UniqueRegistry;
  /**
   * Each entity type's constraint descriptors, built once per run. Resolving
   * them per entity would rebuild the same descriptors for every node drawn.
   */
  entityConstraints: {
    ego: EntityConstraints;
    node: Map<string, EntityConstraints>;
    edge: Map<string, EntityConstraints>;
  };
};

/**
 * The network accumulated as stages run. Handlers mutate it in place.
 */
export type NetworkDraft = {
  egoUid: string;
  egoAttributes: Record<string, VariableValue>;
  nodes: NcNode[];
  edges: NcEdge[];
  /** Stage metadata keyed by stage index. */
  stageMetadata: Record<string, unknown>;
};
