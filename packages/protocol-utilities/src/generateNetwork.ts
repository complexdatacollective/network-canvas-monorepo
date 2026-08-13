import { resolveSkipLogicDestinationIndex } from '@codaco/network-query';
import type {
  EdgeTopology,
  Stage,
  StructuralCodebook,
  SyntheticCount,
} from '@codaco/protocol-validation';
import {
  MAX_SYNTHETIC_POPULATION,
  syntheticCountSupport,
  syntheticTopologySupport,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import {
  analyseStageEffects,
  type StageEffects,
} from './generateNetwork/analyse/stageEffects';
import { definedAttributesOf } from './generateNetwork/attributes';
import {
  type FeasibilityConfig,
  type GenerationConfig,
  resolveGenerationConfig,
} from './generateNetwork/config';
import { collectBinOnlyVariables } from './generateNetwork/constraints/binOnlyVariables';
import { buildEntityConstraints } from './generateNetwork/constraints/buildConstraints';
import {
  applyComposerRenderings,
  COMPOSER_RENDERING_CONFLICT,
} from './generateNetwork/constraints/composerRenderings';
import { SyntheticDataConstraintError } from './generateNetwork/constraints/error';
import { analyseFeasibility } from './generateNetwork/constraints/feasibility';
import {
  reachableStagesForFeasibility,
  settledEgoValues,
} from './generateNetwork/constraints/reachableStages';
import type { EntityConstraints } from './generateNetwork/constraints/types';
import { UniqueRegistry } from './generateNetwork/constraints/uniqueRegistry';
import type { GenerationContext } from './generateNetwork/context';
import { resolveFamilyPedigreeGenerationOptions } from './generateNetwork/familyPedigree/referencePopulation';
import { reserveFamilyPedigreeFixedValues } from './generateNetwork/familyPedigree/reservations';
import { DEFAULT_PEDIGREE_NODE_CEILING } from './generateNetwork/familyPedigree/stageCeiling';
import type { FamilyPedigreeGenerationOptions } from './generateNetwork/familyPedigree/types';
import { materialiseSession } from './generateNetwork/materialise/materialiseSession';
import { planNetwork, topologyKey } from './generateNetwork/plan/networkPlan';
import {
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_NODE_COUNT,
} from './generateNetwork/plan/resolveSynthetic';
import { ValueGenerator } from './ValueGenerator';

export type GenerateNetworkParams = {
  codebook: StructuralCodebook;
  stages: Stage[];
  /**
   * Pre-parsed roster rows keyed by **stage id**. Applies to node-subject
   * name-generator stages that source people from external data — roster stages
   * (`NameGeneratorRoster`) and name generators with roster panels. Rows are
   * drawn **without replacement across all prompts and stages** via a shared
   * used-set, mirroring the runtime's exclusion of rows already in the network.
   *
   * A key's presence is three-way. An **absent** key means "no roster known":
   * a roster stage fabricates people, a name generator fabricates as usual. An
   * **empty array** means "roster known to be empty" (the asset resolved but had
   * no rows, or a panel filtered them all out): a roster stage adds nobody,
   * while a name generator still fabricates to its planned counts. A
   * **non-empty** array draws from those rows (a roster stage only from them).
   */
  externalData?: Record<string, NcNode[]>;
  /** Seed for deterministic output. A random seed is used when omitted. */
  seed?: number;
  simulateDropOut?: boolean;
  respectSkipLogicAndFiltering?: boolean;
  /**
   * Index of a stage to treat as in progress rather than complete. For
   * interaction-driven stages (OrdinalBin, CategoricalBin, Sociogram), a subset
   * of subject nodes is left without a value for the stage's prompt variables,
   * so the stage's interaction can still be exercised. Has no effect on stage
   * types where complete data is preferable (e.g. forms).
   */
  inProgressStageIndex?: number;
  /** Overrides for run-level session controls. See {@link GenerationConfig}. */
  config?: Partial<GenerationConfig>;
  /** Family-specific demographic, scenario, and disease-generation settings. */
  familyPedigree?: FamilyPedigreeGenerationOptions;
};

export type GenerateNetworkResult = {
  network: NcNetwork;
  stageMetadata: Record<string, unknown> | null;
  currentStep: number;
  droppedOut: boolean;
};

/**
 * The people every pedigree holds before any optional branch: ego, two
 * parents, and four grandparents. `generateFamilyPedigree` adds them
 * unconditionally to satisfy the interface's hard minimum and its grandparent
 * boundary, so no declared count can produce a smaller family.
 */
const MINIMUM_PEDIGREE_CORE = 7;

/**
 * The people a pedigree can put on the canvas, per node type it builds.
 *
 * Kept per type and summed across stages rather than maximised, because a
 * topology ceiling
 * is about the pairs one subject type reaches and every pedigree over that
 * type adds its own family to the ones before it. A pedigree's population is not in `effectivePopulation`
 * at all — that map is built from the stage creations, and pedigree creations
 * are deliberately skipped — so without this a type a pedigree builds is
 * counted at nothing at all. That bounds a census over the family at zero
 * pairs, which is not a loose ceiling but an under-count: it hides the real
 * pair count from the value-space check, and a unique edge variable can pass
 * preflight and run out mid-materialisation.
 */
function familyPedigreePopulationByType(
  codebook: StructuralCodebook,
  stages: Stage[],
  /** The most people one family can reach, already resolved. */
  attainable: number,
): Map<string, number> {
  const populations = new Map<string, number>();
  for (const stage of stages) {
    if (stage.type !== 'FamilyPedigree') continue;
    const type = stage.nodeConfig?.type;
    if (type === undefined || codebook.node?.[type] === undefined) continue;
    // Accumulated, not maximised. A second pedigree over the same type does
    // not replace the first family: materialisation keeps the earlier people
    // and appends the new ones, reusing at most the ego between them. Two
    // core-sized families are therefore thirteen or fourteen subjects, and
    // keeping only the larger counted seven. The reused ego is deliberately
    // not deducted — reuse is "at most", so subtracting it would put the
    // ceiling below the population of a run that reuses nothing.
    populations.set(type, (populations.get(type) ?? 0) + attainable);
  }
  return populations;
}

/** Unordered pairs among `count` entities. */
const pairsAmong = (count: number): number =>
  count < 2 ? 0 : (count * (count - 1)) / 2;

/**
 * The largest value a topology distribution can draw, for every seed.
 *
 * A declared topology is a draw, and a refusal must not depend on what a draw
 * happens to produce — the same protocol has to fail on every seed or none.
 * So this is the distribution's ceiling rather than its centre: a constant is
 * exact, a bounded family gives its bound, and an unbounded one gives the
 * domain the sampler clamps it into. Six sigma is deliberately NOT used here,
 * unlike the count ceiling: nothing clamps a topology draw to it, so a rare
 * tail would exceed the bound feasibility had counted, and an under-count is
 * how a protocol passes preflight and then exhausts its values mid-plan.
 * Density is clamped into 0–1 by the sampler; an unbounded mean degree is not
 * clamped at all, so it stands as infinite and the pair count bounds it.
 */
function topologyMax(topology: EdgeTopology): number {
  const { distribution } = topology;
  const unbounded =
    topology.metric === 'density' ? 1 : Number.POSITIVE_INFINITY;
  // The support the draw can REACH, not the bound it is clamped into: a
  // zero-deviation beta or normal returns its mean outright, so counting the
  // whole domain there refused an edge variable for edges the run never makes.
  // Derived once, beside the schema that admits the topology.
  const raw = syntheticTopologySupport(distribution).max ?? unbounded;
  return topology.metric === 'density'
    ? Math.min(1, Math.max(0, raw))
    : Math.max(0, raw);
}

/**
 * A floor no draw from the descriptor can go below, the counterpart of
 * {@link syntheticCountSupport}'s ceiling at the other end of the window.
 * Under-stating a floor is the safe direction here: feasibility deducts
 * floors from the shared population budget to bound what remains for LATER
 * creations, so a floor too low only leaves a later cap looser than it had to
 * be; a floor too high would let the planner hand a later stage more people
 * than preflight counted.
 */
function countFloor(count: SyntheticCount): number {
  const { floor, ceiling } = syntheticCountSupport(count);
  // Held down to the ceiling for an inverted window, where the sampler's own
  // clamp settles on the ceiling too.
  return Math.min(floor, ceiling);
}

/**
 * Indexes of stages the PLANNER might yet settle as skipped after ego is
 * drawn.
 *
 * `reachableStagesForFeasibility` removes only stages proven unreachable
 * before anything is drawn. `planNetwork` goes further: with ego in hand it
 * settles every all-ego guard (its `guardSettlesSkip`) and follows skip
 * destinations, and a creator it settles as skipped spends nothing from the
 * shared population budget — exactly as the live session builds nobody at a
 * stage it never reaches. Which way such a guard settles depends on the ego
 * draw, so the only per-seed floor on that creator's spend is zero, and
 * feasibility must not deduct its people when bounding what the budget leaves
 * for later creations: doing so starved a later creator's cap below a
 * population the plan then built in full, and its `unique` demand passed
 * preflight only to exhaust the value space mid-plan.
 *
 * Mirrors the two ways the planner's walk removes a stage: its own all-ego
 * guard, and standing inside a settled guard's forward jump to its
 * destination. A guard counts as unsettled only where some rule reads an
 * attribute an earlier reachable EgoForm can write — the same reading
 * `reachableStagesForFeasibility` applies — because a guard over attributes
 * nothing collects evaluates identically against the planner's drawn ego and
 * the empty one, and so was already settled (or kept for every seed) before
 * this is asked.
 */
function stagesThePlanMaySettleSkipped(
  stages: Stage[],
  reachableIndexes: ReadonlySet<number>,
  respectSkipLogicAndFiltering: boolean,
  codebook: StructuralCodebook,
): Set<number> {
  const maybeSkipped = new Set<number>();
  if (!respectSkipLogicAndFiltering) return maybeSkipped;

  // The reachability pass's own reading of which ego values the seed cannot
  // move, asked for rather than restated so the two cannot disagree about
  // which guards are already settled.
  const { values: pinnedEgoValues, certainlyAbsent: certainlyAbsentEgoValues } =
    settledEgoValues(codebook);
  const possibleEgoAttributes = new Set<string>();
  for (let index = 0; index < stages.length; index++) {
    // A stage already proven unreachable contributes no creations to the
    // analysis, and `reachableStagesForFeasibility` has already followed its
    // jump; neither its guard nor its form fields exist for the planner's ego.
    if (!reachableIndexes.has(index)) continue;
    const stage = stages[index]!;
    const { skipLogic } = stage;
    const undecided =
      skipLogic !== undefined &&
      skipLogic.filter.rules.every((rule) => rule.type === 'ego') &&
      skipLogic.filter.rules.some((rule) => {
        const attribute =
          'attribute' in rule.options ? rule.options.attribute : undefined;
        if (attribute === undefined) return false;
        // A value the seed cannot move leaves nothing for the planner to
        // decide, so a guard reading only such values is already settled —
        // and settled as NOT skipped, since one that fired was removed from
        // the reachable list before this ran. Counting it as merely writable
        // put an always-reached creator's floor at zero, and preflight then
        // handed a later creator slots the plan had already spent.
        if (pinnedEgoValues.has(attribute)) return false;
        if (certainlyAbsentEgoValues.has(attribute)) return false;
        return possibleEgoAttributes.has(attribute);
      });
    if (undecided) {
      maybeSkipped.add(index);
      // A settled guard does not only remove its own stage: a destination
      // makes the walk jump, and every stage between the guard and its
      // destination is planned for on one ego draw and never reached on
      // another.
      const { destination } = skipLogic;
      if (destination !== undefined) {
        const destinationIndex = resolveSkipLogicDestinationIndex(
          destination,
          stages,
          index,
        );
        if (destinationIndex !== undefined) {
          for (let jumped = index + 1; jumped < destinationIndex; jumped++) {
            maybeSkipped.add(jumped);
          }
        }
      }
    }
    // Collected AFTER the stage's own guard is judged, as the planner projects
    // ego: `guardSettlesSkip` reads it STRICTLY before the guarded stage, so a
    // form's own fields cannot decide the guard standing on that form — the
    // reading `reachableStagesForFeasibility` makes too, and the one the live
    // interview makes, since the only thing that could answer such a field is
    // the stage its guard decides about.
    if (stage.type === 'EgoForm') {
      for (const field of stage.form?.fields ?? []) {
        // Tolerated as a draft: Architect previews a form whose field has no
        // variable chosen yet.
        if (typeof field.variable === 'string') {
          possibleEgoAttributes.add(field.variable);
        }
      }
    }
  }
  return maybeSkipped;
}

/**
 * Worst-case bounds feasibility counts against, derived from the codebook's
 * declared populations and topologies.
 *
 * Both halves are ceilings the planner provably cannot exceed rather than
 * guesses: a creating stage is capped at its own declared ceiling clamped to
 * the most budget the planner can still hold when it reaches that stage on
 * ANY seed, and an edge type is bounded by the most its declared topology can
 * ask for. Counting a stage at its type's whole ceiling, or a pair domain as
 * if every pair could be linked, refuses protocols whose plan would have
 * fitted comfortably.
 */
function deriveFeasibilityConfig(
  codebook: StructuralCodebook,
  effects: StageEffects,
  today: string,
  pedigreeCeiling: number,
  pedigreePopulation: Map<string, number>,
  plannerMaySkip: ReadonlySet<number>,
): FeasibilityConfig {
  // --- Per-stage node ceilings ----------------------------------------------
  //
  // Each creating stage declares its own population, so there is nothing to
  // apportion and nothing to reconcile: the most of a type the planner can
  // build is the sum of what its creating stages can each ask for, and the
  // most one stage can build is its own declared ceiling clamped by the
  // capacity its interface actually offers.
  //
  // A pedigree's people are outside this — the specialist generator builds
  // them and `familyPedigreeNodeCount` bounds them — so its creations are left
  // out, exactly as the planner leaves them out.
  const nodeCapByStage: Record<string, Record<string, number>> = {};
  const effectivePopulation = new Map<string, number>();
  // Gathered per type first, then bounded against the run-level budget the
  // planner spends from. Counting the unbounded figure here refused protocols
  // the preview can build quite happily: `behaviours.minNodes` is unbounded in
  // the schema, so a stage declaring a billion made preflight demand a billion
  // unique values while `planNetwork` went on to build ten thousand nodes.
  //
  // Each entry carries a CEILING and a FLOOR because the planner spends
  // sampled draws rather than ceilings. What a later creation can be handed
  // is the budget minus what its predecessors actually drew, and on the seed
  // where every predecessor draws its minimum that remainder is largest — so
  // a per-stage cap stays an upper bound only when predecessors are deducted
  // at their floors. Deducting their ceilings instead sized a later stage's
  // cap for the seed where predecessors drew biggest, while another seed left
  // that stage thousands of people whose `unique` demand preflight never
  // counted. A creation the planner may yet settle as skipped has a floor of
  // zero for the same reason: on the seeds that skip it, it spends nothing.
  const ceilingsByType = new Map<
    string,
    { stageId: string; ceiling: number; floor: number; protectedMin: number }[]
  >();
  for (const summary of effects.stages) {
    for (const creation of summary.nodeCreations) {
      if (creation.source === 'pedigree') continue;
      const count = creation.count ?? DEFAULT_NODE_COUNT;
      const declaredCeiling = syntheticCountSupport(count).ceiling;
      const declaredFloor = countFloor(count);
      const { min, max } = creation.capacity;
      // Both ends pass through the capacity clamp exactly as the planner's
      // draw does (`max(min, min(max, drawn))`), so a `minNodes` the
      // interface enforces raises the floor and a `maxNodes` lowers the
      // ceiling in the same places the plan honours them.
      const ceiling = Math.max(
        min,
        max === null ? declaredCeiling : Math.min(max, declaredCeiling),
      );
      const floor = plannerMaySkip.has(creation.stageIndex)
        ? 0
        : Math.max(
            min,
            max === null ? declaredFloor : Math.min(max, declaredFloor),
          );
      const list = ceilingsByType.get(creation.nodeType) ?? [];
      list.push({
        stageId: creation.stageId,
        ceiling,
        floor,
        // What the planner's minimum-respecting trim guarantees this creation
        // even when earlier asks would have spent the whole budget — a
        // declared minimum is a floor the live interface holds the
        // participant to, so `planNetwork` reserves it across types and
        // trims discretionary shares first. Clamped to the run cap because
        // the reservation itself lives inside it; past that, `planNetwork`
        // refuses the protocol outright before any draw.
        protectedMin: Math.min(min, MAX_SYNTHETIC_POPULATION),
      });
      ceilingsByType.set(creation.nodeType, list);
    }
  }

  // Walked in CODEBOOK order, and deducting from one run-level budget, because
  // that is the order and the budget `planNetwork` trims against — read in
  // first-appearance order, or per type, the two would disagree about which
  // type keeps its people and preflight would size a population the plan does
  // not build.
  //
  // Deducted at the FLOOR of each predecessor's spend, not its ceiling. The
  // planner's greedy trim gives a creation `min(its draw, what is left)`, and
  // what is left is largest on the seed where every predecessor drew its
  // minimum, so that seed is the one a later stage's cap has to survive. For
  // the constant counts ordinary protocols declare, floor and ceiling
  // coincide and this reckoning is byte-identical to trimming ceilings; the
  // two part only where a draw genuinely varies, which is exactly where the
  // old reckoning let preflight approve a population the plan then exceeded.
  let floorSpend = 0;
  const trimOrder = [
    ...Object.keys(codebook.node ?? {}).filter((type) =>
      ceilingsByType.has(type),
    ),
    // A creation naming a type the codebook does not carry cannot be planned,
    // but it must not silently escape the budget either.
    ...[...ceilingsByType.keys()].filter(
      (type) => !(type in (codebook.node ?? {})),
    ),
  ];
  for (const nodeType of trimOrder) {
    const entries = ceilingsByType.get(nodeType) ?? [];
    const typeBudget = Math.max(0, MAX_SYNTHETIC_POPULATION - floorSpend);
    let ceilingSum = 0;
    let protectedMinSum = 0;
    for (const entry of entries) {
      // Never below the protected minimum: the planner's trim spends
      // discretionary shares before it touches a reachable minimum, so a
      // creation standing after budget-hungry predecessors is still handed
      // its `minNodes` — and a cap below that would count fewer holders of a
      // `unique` value than the plan then builds.
      const ceiling = Math.max(
        entry.protectedMin,
        Math.min(
          entry.ceiling,
          Math.max(0, MAX_SYNTHETIC_POPULATION - floorSpend),
        ),
      );
      floorSpend += entry.floor;
      ceilingSum += entry.ceiling;
      protectedMinSum += entry.protectedMin;
      const forStage = nodeCapByStage[entry.stageId] ?? {};
      // A stage creating one type through two interactions gets both.
      forStage[nodeType] = (forStage[nodeType] ?? 0) + ceiling;
      nodeCapByStage[entry.stageId] = forStage;
    }
    // The type's whole population is still one budget's worth: per-stage caps
    // are each reachable on SOME seed but not together, so their sum can
    // exceed what any single plan builds. What every seed's total respects is
    // the budget standing when the planner reaches the type — plus the
    // minimums the planner reserved for this type's own creations out of
    // EARLIER types' shares, which arrive here however hungry those types
    // were — and never more than the summed ceilings or the run cap itself.
    effectivePopulation.set(
      nodeType,
      Math.min(
        ceilingSum,
        MAX_SYNTHETIC_POPULATION,
        typeBudget + protectedMinSum,
      ),
    );
  }

  let nodeCap = 1;
  const nodeCountByType: Record<string, { min: number; max: number }> = {};
  for (const type of Object.keys(codebook.node ?? {})) {
    // A type no stage creates has no creating stage to draw for it, so its
    // population is zero by construction rather than by a rule.
    const ceiling = effectivePopulation.get(type) ?? 0;
    nodeCountByType[type] = { min: 0, max: ceiling };
    nodeCap = Math.max(nodeCap, ceiling);
  }

  // --- Per-type edge ceilings -----------------------------------------------
  const edgeCountByType: Record<string, number> = {};
  for (const type of Object.keys(codebook.edge ?? {})) {
    const topologyCreations = (
      effects.edgeCreationsByType.get(type) ?? []
    ).filter((creation) => creation.structured === null);
    if (topologyCreations.length === 0) continue;

    // Bounded per creation, then SUMMED within a subject type up to that
    // subject's total pairs, and summed across subject types. Stages over one
    // subject can expose disjoint filtered domains, and each rounds its own
    // topology target independently, so taking only their largest declared
    // bound under-counts the edges those stages can build between them.
    const ceilingBySubject = new Map<string, number>();
    // Per (subject, filter) — one pair domain — before those are summed.
    const boundsByDomain = new Map<string, number>();
    const subjectOfDomain = new Map<string, string>();
    // One bound per TARGET, not per creation. Prompts on one stage creating
    // the same edge type share a topology — the stage declared it once — and
    // `topologyKey` is what the plan draws that single target against, so
    // counting each prompt separately reports edges no session can hold: two
    // prompts over three subjects at density 0.5 can build two shared edges
    // between them, counted as three, and a `unique` edge variable offering
    // two values was refused for a protocol that always fits. Distinct stages
    // still sum, since each declares its own.
    const countedTargets = new Set<string>();
    for (const creation of topologyCreations) {
      const target = topologyKey(creation);
      if (countedTargets.has(target)) continue;
      countedTargets.add(target);
      const topology = creation.topology ?? DEFAULT_EDGE_TOPOLOGY;
      const most = topologyMax(topology);
      // The two populations ADD. A pedigree's people are absent from
      // `effectivePopulation` — its creations are skipped when that map is
      // built — and `materializeFamilyPedigree` appends its family to what is
      // already there rather than replacing it, so a type built both ways ends
      // up carrying both. Taking the larger of the two under-counted the pairs
      // of exactly that type: one ordinary person beside a seven-person core
      // is eight subjects and 28 pairs, counted as 21.
      const ordinary = effectivePopulation.get(creation.subjectNodeType) ?? 0;
      const count =
        ordinary + (pedigreePopulation.get(creation.subjectNodeType) ?? 0);
      const pairs = pairsAmong(count);
      const bound = Math.min(
        pairs,
        Math.ceil(
          topology.metric === 'density' ? most * pairs : (most * count) / 2,
        ),
      );
      // Summed across stages that reach DIFFERENT pairs, maxed across stages
      // that reach the same ones.
      //
      // Both readings are needed and neither alone is right. The plan settles
      // each creation over the domain accumulated so far and tops up to that
      // creation's target, so two stages whose filters admit disjoint people
      // build two separate sets of edges (measured: two), while two stages
      // over one domain top up to a single level and build one (measured:
      // one). Summing everything refused a protocol whose `unique` edge
      // variable the run never exhausts; taking the largest let a disjoint
      // pair of stages clear preflight and exhaust it mid-plan.
      //
      // A domain is identified by its subject and its filter: identical
      // filters admit identical people, whatever they say. Anything else is
      // summed, which is the safe direction — a domain that turns out to
      // overlap is only counted generously.
      const domainKey = `${creation.subjectNodeType}\u0000${JSON.stringify(creation.filter ?? null)}`;
      boundsByDomain.set(
        domainKey,
        Math.max(boundsByDomain.get(domainKey) ?? 0, bound),
      );
      subjectOfDomain.set(domainKey, creation.subjectNodeType);
    }
    for (const [domainKey, bound] of boundsByDomain) {
      const subject = subjectOfDomain.get(domainKey)!;
      const subjectPairs = pairsAmong(
        (effectivePopulation.get(subject) ?? 0) +
          (pedigreePopulation.get(subject) ?? 0),
      );
      ceilingBySubject.set(
        subject,
        Math.min(subjectPairs, (ceilingBySubject.get(subject) ?? 0) + bound),
      );
    }
    edgeCountByType[type] = [...ceilingBySubject.values()].reduce(
      (total, bound) => total + bound,
      0,
    );
  }

  return {
    nodeCount: { min: 0, max: nodeCap },
    nodeCountByType,
    nodeCapByStage,
    edgeCountByType,
    rosterDrawRatio: 0.7,
    sociogramEdgeProbability: { min: 0, max: 1 },
    censusEdgeProbability: { min: 0, max: 1 },
    networkComposerEdgeProbability: { min: 0, max: 1 },
    familyPedigreeNodeCount: { min: 0, max: pedigreeCeiling },
    today,
  };
}

/**
 * Generates a complete synthetic session: analyse the stages, plan the final
 * network from the codebook's `synthetic` metadata (or its documented
 * defaults), then materialise the plan back through the stage sequence so
 * entities appear where the interview would create them and stage metadata
 * matches the final graph.
 */
export function generateNetwork(
  params: GenerateNetworkParams,
): GenerateNetworkResult {
  const {
    codebook,
    stages,
    externalData: suppliedExternalData,
    seed,
    simulateDropOut = false,
    respectSkipLogicAndFiltering = false,
    inProgressStageIndex,
    config,
    familyPedigree,
  } = params;

  /**
   * Roster rows, with any legacy `null`/`undefined` attribute stripped.
   *
   * An unanswered attribute is an ABSENT key, and a caller's external data may
   * still carry the old null placeholders — read as values they were merged
   * onto the person built from the row, so a generated network came back
   * holding a null the contract forbids.
   */
  const externalData =
    suppliedExternalData === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(suppliedExternalData).map(([stageId, rows]) => [
            stageId,
            rows.map(
              (row) =>
                ({
                  ...row,
                  [entityAttributesProperty]: definedAttributesOf(
                    row[entityAttributesProperty],
                  ),
                }) as NcNode,
            ),
          ]),
        );

  const resolvedConfig = resolveGenerationConfig(config);
  // A pedigree sizes itself. No protocol-level constraint caps it: the
  // codebook describes what a family IS, not how big one gets, and the
  // stage-level `synthetic` counts belong to interfaces that size a population
  // rather than build a structure. What remains is the engine's own bound on
  // optional branches, which a caller may raise or lower through its own
  // options; the generator's seven-person core stands under either.
  const resolvedFamilyPedigree = resolveFamilyPedigreeGenerationOptions(
    familyPedigree,
    DEFAULT_PEDIGREE_NODE_CEILING,
  );

  // The codebook as supplied, before the composer renderings folded in below:
  // the pass reads ego's declared `synthetic` metadata, which a rendering
  // never touches. See its own note.
  const feasibilityStages = reachableStagesForFeasibility(
    codebook,
    stages,
    respectSkipLogicAndFiltering,
  );

  // A reachable NetworkComposer field carries the control it renders its
  // variable with. Where an ordinary form also renders that variable through
  // the codebook control, the generated value must satisfy both. Fold their
  // common domain into the codebook before anything reads it; see
  // `applyComposerRenderings`.
  const composed = applyComposerRenderings(
    codebook,
    feasibilityStages,
    resolvedConfig.today,
  );
  if (composed.conflicts.length > 0) {
    throw new SyntheticDataConstraintError(
      composed.conflicts,
      COMPOSER_RENDERING_CONFLICT.summary,
    );
  }
  const renderedCodebook = composed.codebook;

  // A stage skip logic proves unreachable contributes nothing to the plan.
  // Planning a share of a node type's population for one would leave that
  // share unbuilt — materialisation skips the stage and does not reallocate to
  // a later creator — so the finished network would sit below its declared
  // population, and the `unique` values that share claimed would be spent on
  // people the session never holds. Indexes are preserved, because every
  // consumer of the analysis addresses stages by position.
  const reachableIndexes = new Set<number>();
  const reachable = new Set(feasibilityStages);
  stages.forEach((stage, index) => {
    if (reachable.has(stage)) reachableIndexes.add(index);
  });
  const effects = analyseStageEffects(stages, reachableIndexes);

  // Refused before anything is drawn, and before the seed is consulted: a
  // protocol whose declared rules no value can satisfy fails the same way on
  // every seed rather than only on the ones that happen to reach the
  // contradiction.
  const conflicts = analyseFeasibility(
    renderedCodebook,
    feasibilityStages,
    deriveFeasibilityConfig(
      renderedCodebook,
      effects,
      resolvedConfig.today,
      resolvedFamilyPedigree.maxNodes,
      // The reachable subset, matching `effects` and `feasibilityStages`. A
      // pedigree the run provably skips builds nobody, and counting its people
      // raised the topology ceiling enough to refuse a feasible protocol.
      familyPedigreePopulationByType(
        codebook,
        feasibilityStages,
        // Resolved exactly as the materialiser resolves it, so what is counted
        // and what is built cannot disagree.
        Math.max(resolvedFamilyPedigree.maxNodes, MINIMUM_PEDIGREE_CORE),
      ),
      // The creators whose skip only the planner's drawn ego can settle, so
      // the budget reckoning above can refuse to count spend the plan may
      // never make.
      stagesThePlanMaySettleSkipped(
        stages,
        reachableIndexes,
        respectSkipLogicAndFiltering,
        codebook,
      ),
    ),
    externalData,
    respectSkipLogicAndFiltering,
    resolvedFamilyPedigree,
  );
  if (conflicts.length > 0) {
    throw new SyntheticDataConstraintError(conflicts);
  }

  const runSeed = seed ?? Math.floor(Math.random() * 100000);
  const valueGen = new ValueGenerator(runSeed, resolvedConfig.today);

  // The same variable ids that feasibility declined to analyse must also be
  // drawn without their rules, or the draw exhausts a value space no rule was
  // ever going to be enforced against.
  const binOnly = collectBinOnlyVariables(feasibilityStages);

  const constraintsByType = (
    definitions: StructuralCodebook['node'] | StructuralCodebook['edge'],
  ): Map<string, EntityConstraints> =>
    new Map(
      Object.entries(definitions ?? {}).map(([type, definition]) => [
        type,
        buildEntityConstraints(
          definition.variables,
          resolvedConfig.today,
          binOnly.get(type),
        ),
      ]),
    );

  // The rendered codebook throughout, so no reader can pick up a control the
  // interview will not use. Ego is untouched by it: a composer's subject is
  // always a node, and its edge forms name edge types.
  const ctx: GenerationContext = {
    codebook: renderedCodebook,
    valueGen,
    config: resolvedConfig,
    usedRosterUids: new Set<string>(),
    externalData,
    respectSkipLogicAndFiltering,
    uniqueRegistry: new UniqueRegistry(),
    entityConstraints: {
      ego: buildEntityConstraints(
        renderedCodebook.ego?.variables,
        resolvedConfig.today,
      ),
      node: constraintsByType(renderedCodebook.node),
      edge: constraintsByType(renderedCodebook.edge),
    },
  };

  // A pedigree's ego flag, biological sexes and relationship types are fixed
  // by the specialist generator during the walk rather than drawn in the plan,
  // so nothing else holds them back. Reserve them before planning, for the
  // same reason the plan reserves a prompt's fixed values and a roster's rows:
  // a free draw that took one of these would leave the network holding it
  // twice once the family is built, which `unique` forbids and nothing
  // downstream repairs. Reservations are soft, so a draw with nothing else
  // left still takes one.
  // The reachable subset, matching `effects` and feasibility. A pedigree the
  // run provably skips never materialises, so a value reserved for it is never
  // consumed and never released — it just holds a value back from the draws
  // that DO happen, and an unreachable pedigree could decide what an ordinary
  // edge of the same type ends up with.
  reserveFamilyPedigreeFixedValues(ctx, feasibilityStages);

  const plan = planNetwork(ctx, effects);

  return materialiseSession({
    ctx,
    effects,
    plan,
    stages,
    simulateDropOut,
    inProgressStageIndex,
    reachableStages: feasibilityStages,
    runSeed,
    familyPedigree: resolvedFamilyPedigree,
  });
}
