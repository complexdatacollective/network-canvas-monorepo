import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import type { NcEdge, NcNode, VariableValue } from '@codaco/shared-consts';

import type { ValueGenerator } from '../ValueGenerator';
import type { GenerationConfig } from './config';

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
  config: GenerationConfig;
  /** Roster rows already drawn into the network, shared across stages. */
  usedRosterUids: Set<string>;
  /** Pre-parsed roster rows keyed by stage id (see `generateNetwork`). */
  externalData: Record<string, NcNode[]> | undefined;
  respectSkipLogicAndFiltering: boolean;
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
