import type {
  CurrentProtocol,
  InterfaceImpliedRules,
  Stage,
} from '@codaco/protocol-validation';
import type { NcNode } from '@codaco/shared-consts';

import type { SessionEngine } from '../session-engine/engine';
import type { SessionStreams } from '../session-engine/streams';

/**
 * Host-resolved asset content the engine cannot fetch itself: roster rows
 * (pre-transformed through `collectRosterExternalData`, keyed by STAGE id,
 * with the three-way key contract the spec defines) and Geospatial
 * feature-property candidates (via `collectGeospatialPropertyValues`).
 */
export type AssetData = {
  rosterNodes?: Record<string, NcNode[]>;
  geojsonPropertyValues?: Record<string, string[]>;
};

/**
 * Everything a simulator may read. Simulators WRITE only through
 * `context.engine`'s primitives (spec rule 3).
 *
 * The constraint machinery's handles (the descriptor-driven value generator
 * and the cross-entity unique registry) join this type with the Phase-2
 * simulator port; the walk itself needs none of them.
 */
export type SimulationContext = {
  engine: SessionEngine;
  streams: SessionStreams;
  protocol: CurrentProtocol;
  assetData: AssetData;
  /** The session's own date (its startTime's day), for relative windows. */
  today: string;
  interfaceRules: InterfaceImpliedRules;
};

/**
 * Simulate one stage the participant reached. `promptBound`, when present,
 * is a `stopAt.promptIndex`: apply only prompts strictly below it (0 means
 * the participant arrived but has done nothing) — this is what replaces the
 * old engine's delete-values-afterwards post-pass.
 */
export type StageSimulator<T extends Stage = Stage> = (
  stage: T,
  context: SimulationContext,
  promptBound?: number,
) => void;

export type SimulatorRegistry = Partial<Record<Stage['type'], StageSimulator>>;
