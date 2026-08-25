import type {
  CurrentProtocol,
  InterfaceImpliedRules,
  Stage,
} from '@codaco/protocol-validation';
import type { NcNode } from '@codaco/shared-consts';

import type { EntityConstraintCache } from '../constraints/entityConstraintCache';
import type { UniqueRegistry } from '../constraints/uniqueRegistry';
import type { ValueGenerator } from '../constraints/ValueGenerator';
import type { SessionEngine } from '../session-engine/engine';
import type { SessionStreams } from '../session-engine/streams';
import type { FamilyPedigreeOptions } from './familyPedigree/options';

/**
 * Host-resolved asset content the engine cannot fetch itself: roster rows
 * (pre-transformed through `collectRosterExternalData`, keyed by STAGE id,
 * with the three-way key contract the spec defines) and Geospatial
 * feature-property candidates (via `collectGeospatialPropertyValues`).
 */
export type AssetData = {
  rosterNodes?: Record<string, NcNode[]>;
  /**
   * The values a map tap can store, per Geospatial stage. Numbers appear
   * verbatim where the GeoJSON's `targetFeatureProperty` carries them — the
   * live click handler forwards the tapped feature's property value unchanged,
   * so a numeric identifier is an answer real interviews record.
   */
  geojsonPropertyValues?: Record<string, (string | number)[]>;
};

/**
 * Everything a simulator may read. Simulators WRITE only through
 * `context.engine`'s primitives (spec rule 3).
 *
 * The constraint machinery's handles — the descriptor-driven value generator,
 * the cross-entity unique registry, and the per-scope constraint analysis they
 * both read — are session-scoped, so they live here rather than being rebuilt
 * per stage. The walk itself needs none of them.
 */
export type SimulationContext = {
  engine: SessionEngine;
  streams: SessionStreams;
  protocol: CurrentProtocol;
  assetData: AssetData;
  /** The session's own date (its startTime's day), for relative windows. */
  today: string;
  interfaceRules: InterfaceImpliedRules;
  /**
   * Whether stage-level network filters narrow what each stage shows
   * (`stage.filter`). Off, every simulator reads the unfiltered network —
   * the host's "ignore skip logic and filtering" mode, which trades
   * runtime-faithfulness for fuller test data. Panel filters are untouched:
   * they select candidates for a panel, not what a stage displays.
   */
  respectFiltering: boolean;
  /**
   * The descriptor-driven draw, seeded per session. Values are the one thing
   * NOT drawn from `streams`: the constraint machinery needs personas (names,
   * places, occupations) rather than uniform bits.
   */
  valueGen: ValueGenerator;
  /**
   * Values already issued for `unique` variables. Shared across the whole
   * session rather than per entity or per stage: a `unique` variable is unique
   * within its scope for the whole interview.
   */
  uniqueRegistry: UniqueRegistry;
  /**
   * Per-scope constraints, built once per session. The same analysis the
   * pre-walk reservation pass reads, so a hold and the draw it steers can
   * never disagree about which slot a value belongs to.
   */
  entityConstraints: EntityConstraintCache;
  /**
   * Run-level family-pedigree population and scenario options, when the caller
   * gave any. Deliberately not protocol-embedded: a family is a structure, not
   * a population, so the protocol says what a pedigree collects and the caller
   * says which population it stands for.
   */
  familyPedigree?: FamilyPedigreeOptions;
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

/**
 * The one simulator per interface type. Keyed as a mapped type rather than a
 * `Record` so each entry is typed against ITS OWN stage: a simulator declared
 * `StageSimulator<EgoFormStage>` may only be filed under `EgoForm`, and one
 * written against the whole union (the content stages' shared no-op) still
 * fits everywhere.
 */
export type SimulatorRegistry = {
  [K in Stage['type']]?: StageSimulator<Extract<Stage, { type: K }>>;
};
