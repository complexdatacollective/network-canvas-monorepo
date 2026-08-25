import {
  type CurrentProtocol,
  type EdgeTopology,
  MAX_SYNTHETIC_POPULATION,
  type Stage,
  syntheticCountSupport,
  topologyRealisedEdgeCeiling,
} from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import type { AssetData } from '../simulators/types';
import type {
  EdgeOverrideEntry,
  NodeOverrideEntry,
  SessionOverrides,
} from '../walk/overrides';
import { type EntityScopeRef, scopeKey } from './generateEntityAttributes';

/**
 * How many entities of one scope the WALK can put into a session, as an
 * inclusive window over every seed.
 *
 * Walk-scoped, not codebook-scoped (decision 18): the question is what the
 * stages this protocol actually carries can produce, so a node type no stage
 * creates has no window at all and a type two stages create has both their
 * counts in it. Every figure comes from `syntheticCountSupport` over the
 * stage's own `synthetic.count` — the schema's single derivation of what a
 * declaration can reach — so the gate and the sampler cannot drift apart about
 * how many people a stage builds (spec rule 2).
 *
 * `floor` is what the walk always produces; `ceiling` is what it can produce on
 * its luckiest seed. The two answer different questions and the feasibility
 * gate asks both: a `unique` slot has to hold every entity the run CAN build,
 * while a pair-work refusal is about the work the protocol ALWAYS demands.
 */
export type EntityWindow = { floor: number; ceiling: number };

/**
 * One stage DRAWING values for some variables, and how many entities carry
 * that draw.
 *
 * Only drawn values are recorded, and that is the whole point of the type. A
 * `unique` slot runs dry when the generator is FORCED to invent more distinct
 * values than exist, and only a draw is forced: a roster row carrying a value
 * the network already holds is passed over (`rosterRowIsDrawable`), and a
 * prompt's `additionalAttributes` writes one fixed value however many people it
 * touches. Counting either as a holder refuses protocols whose rows the walk
 * simply declines.
 */
export type WriteEvent = {
  /** The variables this stage draws a value for. */
  variables: ReadonlySet<string>;
  /** Entities carrying the draw, at the walk's luckiest seed. */
  entities: number;
  /**
   * Whether the draw lands on entities that already exist rather than on the
   * ones this stage creates. A form filled over the whole population reaches
   * every entity built before it, so it REPLACES the tally rather than adding
   * to it; a creation-time draw adds the people it brings with it.
   */
  onExisting: boolean;
};

export type ScopeCounts = {
  /** Every entity of this scope, whatever variable is being asked about. */
  entities: EntityWindow;
  /** Draws against this scope, in stage order. */
  writes: WriteEvent[];
};

/** One edge-creating stage and the pair set it is guaranteed to enumerate. */
export type PairDemand = {
  stageId: string;
  stageLabel: string;
  /** The node type whose members the stage asks about two at a time. */
  subjectType: string;
  /** The edge types this stage can create over that pair set. */
  edgeTypes: string[];
  /** People the creators before it are guaranteed to have produced. */
  guaranteedNodes: number;
  /** Unordered pairs over those people — what the interface enumerates. */
  guaranteedPairs: number;
};

/** One roster stage measured against the rows the run can still offer it. */
export type RosterDemand = {
  stageId: string;
  stageLabel: string;
  nodeType: string;
  /** The nominations the live interface refuses to advance below. */
  minNodes: number;
  /** Rows the caller resolved for this stage. */
  poolSize: number;
  /**
   * The rows the stage is guaranteed to still be able to nominate on its
   * LUCKIEST seed, after every earlier roster-backed stage sharing rows with
   * it has taken its own guaranteed minimum. Equal to `poolSize` where no
   * earlier stage shares a row.
   */
  guaranteedAvailable: number;
  /**
   * True where the caller supplied no roster map at all: the host never
   * resolved rosters for this run, so the pool is not small — it is missing,
   * and the refusal names host resolution rather than the document.
   */
  unresolved: boolean;
};

/**
 * One name-generating stage whose own runtime gate demands more people than
 * synthetic generation can build. `behaviours.minNodes` above
 * `MAX_SYNTHETIC_POPULATION` keeps the protocol valid — the live interface
 * has no such ceiling — but no count the schema can express reaches it, so
 * the refusal belongs here, at the generation boundary.
 */
export type PopulationDemand = {
  stageId: string;
  stageLabel: string;
  nodeType: string;
  minNodes: number;
};

export type WalkEntityCounts = {
  /** Counts by `scopeKey`, for the scopes the walk writes entities into. */
  scopes: Map<string, ScopeCounts>;
  /**
   * Scopes whose entity WINDOW this analysis does not fully model, keyed the
   * same way.
   *
   * FamilyPedigree is the whole of it: its size comes from a run-level
   * population draw rather than from a `synthetic.count`, so the schema
   * publishes no support for it and nothing here may invent one. A scope
   * listed here still carries the counts every OTHER stage contributes — a
   * name generator's own creations, the draws it makes — and the gate judges
   * those known lower bounds exactly as it judges any scope: the pedigree can
   * only ADD entities and draws, so a refusal the known writes already earn
   * stands whatever the pedigree does. What the listing withholds is the
   * claim of completeness — the windows here are floors of the truth, never
   * the whole of it.
   */
  unmodelled: Set<string>;
  pairDemands: PairDemand[];
  rosterDemands: RosterDemand[];
  populationDemands: PopulationDemand[];
};

/**
 * Unordered pairs over `count` people, as every census enumerates them. Fewer
 * than two people is no pairs, stated rather than left to the arithmetic, whose
 * answer for one person is negative zero.
 */
const pairCount = (count: number): number =>
  count < 2 ? 0 : (count * (count - 1)) / 2;

/**
 * How many entities of one scope can be forced to hold a distinct value for
 * `group` — one variable, or every member of a set held equal.
 *
 * Folded in stage order, because the two kinds of write compose differently. A
 * form filled over the whole population subsumes every draw before it, so it
 * takes the larger of the two; a stage that draws on the people it brings adds
 * them. Members of one equality group are counted ONCE per stage: an entity
 * carrying two of them carries one value, so the widest of that stage's
 * windows is the number of values it spends.
 */
export const holdersOf = (
  counts: ScopeCounts | undefined,
  group: readonly string[],
): number => {
  if (counts === undefined) return 0;

  let holders = 0;
  for (const write of counts.writes) {
    if (!group.some((id) => write.variables.has(id))) continue;
    holders = write.onExisting
      ? Math.max(holders, write.entities)
      : holders + write.entities;
  }

  return holders;
};

type NodeCreatingStage = Extract<
  Stage,
  {
    type:
      | 'NameGenerator'
      | 'NameGeneratorQuickAdd'
      | 'NameGeneratorRoster'
      | 'NetworkComposer';
  }
>;

type NameGeneratingStage = Extract<
  Stage,
  {
    type: 'NameGenerator' | 'NameGeneratorQuickAdd' | 'NameGeneratorRoster';
  }
>;

type PairStage = Extract<
  Stage,
  {
    type:
      | 'DyadCensus'
      | 'NetworkComposer'
      | 'OneToManyDyadCensus'
      | 'Sociogram'
      | 'TieStrengthCensus';
  }
>;

const NODE_CREATING_TYPES: ReadonlySet<string> = new Set([
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'NetworkComposer',
]);

const NAME_GENERATING_TYPES: ReadonlySet<string> = new Set([
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
]);

const PAIR_TYPES: ReadonlySet<string> = new Set([
  'DyadCensus',
  'NetworkComposer',
  'OneToManyDyadCensus',
  'Sociogram',
  'TieStrengthCensus',
]);

const isNodeCreating = (stage: Stage): stage is NodeCreatingStage =>
  NODE_CREATING_TYPES.has(stage.type);

const isNameGenerating = (stage: Stage): stage is NameGeneratingStage =>
  NAME_GENERATING_TYPES.has(stage.type);

const isPairStage = (stage: Stage): stage is PairStage =>
  PAIR_TYPES.has(stage.type);

/** The variables a form collects, as plain codebook ids. */
const formVariables = (
  form: { fields?: readonly { variable: string }[] } | undefined,
): string[] => (form?.fields ?? []).map((field) => field.variable);

/**
 * The edge types one stage can create, each with the number of separate
 * topology REALISATIONS that can add edges of that type — one per prompt that
 * creates it, or one per NetworkComposer edge entry. Two prompts sharing a
 * type realise the topology twice, and each realisation can select pairs the
 * other did not, so the type's ceiling scales with the realisation count
 * (capped, as everything here is, at the pair set itself).
 */
const edgeRealisationsOf = (stage: PairStage): Map<string, number> => {
  const realisations = new Map<string, number>();
  const add = (edgeType: string | undefined): void => {
    if (edgeType === undefined) return;
    realisations.set(edgeType, (realisations.get(edgeType) ?? 0) + 1);
  };

  switch (stage.type) {
    case 'DyadCensus':
    case 'OneToManyDyadCensus':
    case 'TieStrengthCensus':
      for (const prompt of stage.prompts) add(prompt.createEdge);
      break;
    case 'Sociogram':
      for (const prompt of stage.prompts) add(prompt.edges?.create);
      break;
    case 'NetworkComposer':
      for (const entry of stage.edges ?? []) add(entry.subject.type);
      break;
  }

  return realisations;
};

/**
 * The topology a pair stage realises its edges through, or `undefined` for a
 * NetworkComposer that declares none — whose `drawComposedEdges` then creates
 * nothing at all.
 */
const topologyOf = (stage: PairStage): EdgeTopology | undefined =>
  stage.synthetic.topology;

/**
 * The variables a stage DRAWS onto an edge as it creates it, per edge type.
 *
 * Only two interfaces do. A tie-strength census grades every tie it makes, and
 * a NetworkComposer fills the form its author attached to an edge type; the
 * plain censuses and a Sociogram's tap create an edge carrying nothing at all,
 * which is why a `unique` variable on their edge type is never spent.
 */
const edgeDrawsOf = (stage: PairStage): Map<string, string[]> => {
  const drawn = new Map<string, string[]>();

  if (stage.type === 'TieStrengthCensus') {
    for (const prompt of stage.prompts) {
      const held = drawn.get(prompt.createEdge) ?? [];
      held.push(String(prompt.edgeVariable));
      drawn.set(prompt.createEdge, held);
    }
  }

  if (stage.type === 'NetworkComposer') {
    for (const entry of stage.edges ?? []) {
      const held = drawn.get(entry.subject.type) ?? [];
      held.push(...formVariables(entry.form));
      drawn.set(entry.subject.type, held);
    }
  }

  return drawn;
};

/**
 * The rows a roster stage may draw from, or `undefined` where the caller takes
 * no part in the roster contract at all.
 *
 * The three-way key contract (spec, "Counts, topology, rosters, panels") is
 * what the simulators collapse — rows present, empty array, and absent key all
 * leave `nominateFromRoster` with nothing to take — and it is what this pass
 * must keep, because the gate is the one place the difference is load-bearing.
 * A caller supplying no `rosterNodes` MAP has not resolved rosters at all; a
 * caller supplying one and omitting this stage's key is reporting a source it
 * could not resolve, which is an empty pool.
 */
const poolFor = (
  stageId: string,
  assetData: AssetData,
): readonly { [entityPrimaryKeyProperty]: string }[] | undefined => {
  const { rosterNodes } = assetData;
  if (rosterNodes === undefined) return undefined;
  return rosterNodes[stageId] ?? [];
};

const countsFor = (
  scopes: Map<string, ScopeCounts>,
  scope: EntityScopeRef,
): ScopeCounts => {
  const key = scopeKey(scope);
  const existing = scopes.get(key);
  if (existing) return existing;

  const created: ScopeCounts = {
    entities: { floor: 0, ceiling: 0 },
    writes: [],
  };
  scopes.set(key, created);
  return created;
};

const record = (
  counts: ScopeCounts,
  variables: readonly (string | undefined)[],
  entities: number,
  onExisting: boolean,
): void => {
  const named = new Set(
    variables.filter((id): id is string => id !== undefined),
  );
  if (named.size === 0 || entities === 0) return;
  counts.writes.push({ variables: named, entities, onExisting });
};

/**
 * What one node-creating stage adds to its subject type's window.
 *
 * The identity each simulator establishes, read back. NameGenerator and
 * NameGeneratorQuickAdd build EXACTLY the count they draw — a roster row that
 * is passed over is replaced by a fabricated person — so both ends of the
 * support carry through. NameGeneratorRoster draws from a finite pool and
 * fabricates nobody, so both ends are held to it. A NetworkComposer builds the
 * count it draws too: its quick-add field is interface-implied `required` (the
 * palette will not create a node from a blank name, so resolution zeroes any
 * authored missingness), which means a valid draw always names somebody and
 * the count's own floor carries through.
 */
const nodesAdded = (
  stage: NodeCreatingStage,
  assetData: AssetData,
): EntityWindow => {
  if (stage.type === 'NetworkComposer') {
    const composerCount = stage.synthetic.count;
    if (composerCount === undefined) return { floor: 0, ceiling: 0 };
    return syntheticCountSupport(composerCount);
  }

  const { floor, ceiling } = syntheticCountSupport(stage.synthetic.count);
  if (stage.type !== 'NameGeneratorRoster') return { floor, ceiling };

  const pool = poolFor(stage.id, assetData);
  if (pool === undefined) return { floor: 0, ceiling };
  return {
    floor: Math.min(floor, pool.length),
    ceiling: Math.min(ceiling, pool.length),
  };
};

/** The variables a stage draws onto the nodes it creates, as it creates them. */
const createdNodeVariables = (stage: NodeCreatingStage): string[] => {
  switch (stage.type) {
    case 'NameGenerator':
      return formVariables(stage.form);
    case 'NameGeneratorQuickAdd':
      return [String(stage.quickAdd)];
    case 'NameGeneratorRoster':
      // Roster rows arrive carrying their own columns verbatim, so this stage
      // draws nothing: a row whose value is taken is passed over rather than
      // redrawn, which is a person the walk declines, not a value it invents.
      return [];
    case 'NetworkComposer':
      return [String(stage.quickAdd), String(stage.layoutVariable)];
  }
};

/**
 * The codebook variables an override entry lets the walk DRAW: the declared
 * set minus what the caller fixed or suppressed. A `manual` entry draws
 * nothing at all — its unset variables take neutral values.
 */
const overrideDrawnVariables = (
  codebook: CurrentProtocol['codebook'],
  scope: Extract<EntityScopeRef, { entity: 'node' | 'edge' }>,
  entry: NodeOverrideEntry | EdgeOverrideEntry,
): string[] => {
  if (entry.manual) return [];
  const declared = codebook[scope.entity]?.[scope.type]?.variables ?? {};
  const settled = new Set(entry.suppress ?? []);
  for (const [id, value] of Object.entries(entry.attributes ?? {})) {
    if (id in declared) settled.add(id);
    void value;
  }
  return Object.keys(declared).filter((id) => !settled.has(id));
};

/** One roster-backed stage's contribution to shared-pool depletion. */
type RosterUse = {
  uids: ReadonlySet<string>;
  /** The rows the stage takes on EVERY seed, however the draws land. */
  guaranteedTake: number;
  /** The most rows the stage can take on any seed. */
  ceilingTake: number;
};

const intersectionSize = (
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): number => {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const uid of small) if (large.has(uid)) count += 1;
  return count;
};

/** How far the walk works one stage, under a `stopAt` bound. */
type StageExtent = 'full' | 'partial' | 'skipped';

/**
 * Everything the pre-seed gate needs to know about how big a session can get.
 *
 * One pass in stage order, because every question the gate asks is positional:
 * a census enumerates the people who exist WHEN IT RUNS, a form fills the
 * population standing in front of it, and a roster's pool is judged against the
 * stage that draws from it.
 *
 * Skip logic is deliberately not modelled: every stage is read as reached. The
 * price is real and is a REFUSAL, not an under-count — a stage the routing
 * would always skip still contributes its demands, so a protocol whose
 * unreachable stage is itself infeasible is refused before the walk can prove
 * the stage never runs. Modelling it would take a second, static opinion about
 * routing, where the walk resolves the route against the network it is
 * building; a static verdict that disagreed with the live one on some seeds
 * would turn a pre-seed refusal into the seed-dependent mid-walk failure this
 * gate exists to make impossible (spec rules 1 and 5). Until reachability can
 * be PROVEN from the walk's own routing rather than modelled beside it, the
 * refusal stands.
 *
 * `stopAt` bounds the pass the way it bounds the walk: stages past the stop
 * are never run and contribute nothing, and the stop stage itself contributes
 * nothing when its prompt bound is zero (arrived, did nothing — the preview
 * default). A stop stage with a positive bound is counted WHOLE: the exact
 * prompt-sliced arithmetic buys nothing a preview reads, and over-counting is
 * the direction that cannot let the walk exhaust a slot the gate approved.
 *
 * `overrides` replaces a listed stage outright, exactly as the walk's applier
 * does: the stage is not simulated, so nothing it would have created or drawn
 * is counted — its predetermined entries are, one entity and one draw set per
 * entry — and the override edges land once at the end, endpoints permitting.
 */
export const worstCaseEntityCounts = (
  stages: readonly Stage[],
  assetData: AssetData,
  options?: {
    codebook?: CurrentProtocol['codebook'];
    stopAt?: { stageIndex: number; promptIndex?: number };
    overrides?: SessionOverrides;
  },
): WalkEntityCounts => {
  const scopes = new Map<string, ScopeCounts>();
  const unmodelled = new Set<string>();
  const pairDemands: PairDemand[] = [];
  const rosterDemands: RosterDemand[] = [];
  const populationDemands: PopulationDemand[] = [];
  /** Edge type -> the node types whose pairs can carry one. */
  const edgeSubjects = new Map<string, Set<string>>();
  /** Roster-backed stages already passed, for shared-pool depletion. */
  const rosterUses: RosterUse[] = [];

  const stopAt = options?.stopAt;
  const codebook = options?.codebook;
  const overrides = options?.overrides;

  const extentOf = (index: number): StageExtent => {
    if (stopAt === undefined) return 'full';
    if (index > stopAt.stageIndex) return 'skipped';
    if (index < stopAt.stageIndex) return 'full';
    return (stopAt.promptIndex ?? 0) === 0 ? 'skipped' : 'partial';
  };

  const nodeCounts = (type: string): ScopeCounts =>
    countsFor(scopes, { entity: 'node', type });
  const edgeCounts = (type: string): ScopeCounts =>
    countsFor(scopes, { entity: 'edge', type });

  const recordOverrideEntry = (
    scope: Extract<EntityScopeRef, { entity: 'node' | 'edge' }>,
    entry: NodeOverrideEntry | EdgeOverrideEntry,
    counts: ScopeCounts,
  ): void => {
    if (codebook !== undefined) {
      record(counts, overrideDrawnVariables(codebook, scope, entry), 1, false);
    }
  };

  const trackRosterStage = (
    stage: NameGeneratingStage,
    extent: StageExtent,
  ): void => {
    const pool = poolFor(stage.id, assetData);
    const minNodes =
      'behaviours' in stage ? stage.behaviours?.minNodes : undefined;

    // A runtime gate no expressible count reaches: the count schemas cap
    // every figure at the population ceiling, so a stage demanding more can
    // never be generated faithfully however the rows resolve.
    if (
      extent === 'full' &&
      minNodes !== undefined &&
      minNodes > MAX_SYNTHETIC_POPULATION
    ) {
      populationDemands.push({
        stageId: stage.id,
        stageLabel: stage.label,
        nodeType: stage.subject.type,
        minNodes,
      });
    }

    if (stage.type !== 'NameGeneratorRoster') {
      // A name generator's roster PANEL consumes shared rows too, but is
      // never forced to: its roster share draws from zero. It caps later
      // stages' luck (ceiling) without guaranteeing anyone's depletion.
      if (pool !== undefined && pool.length > 0) {
        const { ceiling } = syntheticCountSupport(stage.synthetic.count);
        rosterUses.push({
          uids: new Set(pool.map((row) => row[entityPrimaryKeyProperty])),
          guaranteedTake: 0,
          ceilingTake: Math.min(ceiling, pool.length),
        });
      }
      return;
    }

    // Judged only for a stage the walk completes: mid-stage, the interface's
    // min-nodes gate has not yet been reached.
    if (extent !== 'full') return;

    if (pool === undefined) {
      // The host never resolved rosters at all. Without `minNodes` the walk's
      // empty stage is a participant who nominated nobody, which the
      // interface permits; with it, the completed session would sit below the
      // gate the interface refuses to advance past, so the run is refused as
      // a host-resolution failure.
      if (minNodes !== undefined && minNodes >= 1) {
        rosterDemands.push({
          stageId: stage.id,
          stageLabel: stage.label,
          nodeType: stage.subject.type,
          minNodes,
          poolSize: 0,
          guaranteedAvailable: 0,
          unresolved: true,
        });
      }
      return;
    }

    const uids = new Set(pool.map((row) => row[entityPrimaryKeyProperty]));
    const { floor, ceiling } = syntheticCountSupport(stage.synthetic.count);

    // The rows this stage can still see on its LUCKIEST seed: every earlier
    // roster-backed stage has taken at least its guaranteed minimum, and at
    // least the part of that minimum its own pool forces into this one
    // (rows it could not have avoided by preferring rows outside the
    // overlap). Each earlier take lands on distinct rows — a taken row is in
    // the network and cannot be taken again — so the guarantees sum.
    let guaranteedDepletion = 0;
    // The rows earlier stages can have taken on THIS stage's unluckiest
    // seed, which is what bounds the take it is guaranteed to make.
    let possibleDepletion = 0;
    for (const use of rosterUses) {
      const overlap = intersectionSize(use.uids, uids);
      guaranteedDepletion += Math.max(
        0,
        use.guaranteedTake - (use.uids.size - overlap),
      );
      possibleDepletion += Math.min(use.ceilingTake, overlap);
    }
    const guaranteedAvailable = Math.max(
      0,
      pool.length - Math.min(guaranteedDepletion, pool.length),
    );

    if (minNodes !== undefined && guaranteedAvailable < minNodes) {
      rosterDemands.push({
        stageId: stage.id,
        stageLabel: stage.label,
        nodeType: stage.subject.type,
        minNodes,
        poolSize: pool.length,
        guaranteedAvailable,
        unresolved: false,
      });
    }

    rosterUses.push({
      uids,
      guaranteedTake: Math.min(
        floor,
        Math.max(0, pool.length - Math.min(possibleDepletion, pool.length)),
      ),
      ceilingTake: Math.min(ceiling, pool.length),
    });
  };

  const countPairStage = (stage: PairStage): void => {
    const subjectType = stage.subject.type;
    const nodes = nodeCounts(subjectType);
    const realisations = edgeRealisationsOf(stage);
    const pairs = pairCount(nodes.entities.ceiling);
    const nodeCeiling = nodes.entities.ceiling;
    const topology = topologyOf(stage);
    const drawn = edgeDrawsOf(stage);

    if (realisations.size > 0) {
      pairDemands.push({
        stageId: stage.id,
        stageLabel: stage.label,
        subjectType,
        edgeTypes: [...realisations.keys()],
        guaranteedNodes: nodes.entities.floor,
        guaranteedPairs: pairCount(nodes.entities.floor),
      });
    }

    for (const [edgeType, realisationCount] of realisations) {
      const counts = edgeCounts(edgeType);
      // What one realisation of the declared topology can select — the full
      // pair set only where the topology can genuinely reach it. A stage
      // realising the topology once per prompt (or per composer edge entry)
      // can accumulate across realisations, never past the pair set itself;
      // a composer with no topology creates no edges at all.
      const perRealisation =
        topology === undefined
          ? 0
          : topologyRealisedEdgeCeiling(topology, pairs, nodeCeiling);
      const added = Math.min(pairs, perRealisation * realisationCount);

      // Edges of one type live on one shared graph and are deduped by their
      // pair, so a stage linking people an earlier stage already linked
      // REACHES the same edges rather than making new ones — it re-grades
      // them. That reuse only holds where this stage can SEE those edges: a
      // stage filter hides edges from the interface's own selector, so a
      // filtered census can answer yes for a pair whose edge exists but is
      // invisible, and the runtime then adds a second edge of the type. A
      // filtered stage is therefore counted as additive, and only an
      // unfiltered one over an already-linked subject as reuse.
      const filtered = 'filter' in stage && stage.filter !== undefined;
      const onExisting =
        !filtered && edgeSubjects.get(edgeType)?.has(subjectType) === true;
      counts.entities.ceiling = onExisting
        ? Math.max(counts.entities.ceiling, added)
        : counts.entities.ceiling + added;
      record(counts, drawn.get(edgeType) ?? [], added, onExisting);
    }

    for (const edgeType of realisations.keys()) {
      const subjects = edgeSubjects.get(edgeType) ?? new Set<string>();
      subjects.add(subjectType);
      edgeSubjects.set(edgeType, subjects);
    }
  };

  stages.forEach((stage, index) => {
    const extent = extentOf(index);
    if (extent === 'skipped') return;

    // A stage the fixture channel claims is not simulated: its output is its
    // entries, and nothing the stage would have elicited or drawn happens.
    const entries = overrides?.nodes?.[stage.id];
    if (entries !== undefined) {
      const worked =
        extent === 'partial'
          ? entries.filter(
              (entry) => (entry.promptIndex ?? 0) < (stopAt?.promptIndex ?? 0),
            )
          : entries;
      for (const entry of worked) {
        const counts = nodeCounts(entry.type);
        recordOverrideEntry(
          { entity: 'node', type: entry.type },
          entry,
          counts,
        );
        counts.entities.floor += 1;
        counts.entities.ceiling += 1;
      }
      return;
    }

    if (stage.type === 'FamilyPedigree') {
      unmodelled.add(scopeKey({ entity: 'node', type: stage.nodeConfig.type }));
      unmodelled.add(scopeKey({ entity: 'edge', type: stage.edgeConfig.type }));
      return;
    }

    // The composer builds first and then describes everybody on the canvas —
    // its own additions included — so its counting follows the simulator's
    // order rather than the values-then-creations order below.
    if (stage.type === 'NetworkComposer') {
      const counts = nodeCounts(stage.subject.type);
      const added = nodesAdded(stage, assetData);
      record(counts, createdNodeVariables(stage), added.ceiling, false);
      counts.entities.floor += added.floor;
      counts.entities.ceiling += added.ceiling;

      // The inspector fills its form over EVERY node the canvas lists,
      // the ones just composed included (`fillInspectorForms` runs after
      // `addComposedNodes`), so the draw reaches the population as it now
      // stands.
      record(
        counts,
        [
          ...formVariables(stage.nodeForm),
          stage.convexHullVariable && String(stage.convexHullVariable),
        ],
        counts.entities.ceiling,
        true,
      );

      countPairStage(stage);
      return;
    }

    // Values written onto whoever is already there, before this stage's own
    // creations join them.
    switch (stage.type) {
      case 'AlterForm': {
        const counts = nodeCounts(stage.subject.type);
        record(
          counts,
          formVariables(stage.form),
          counts.entities.ceiling,
          true,
        );
        break;
      }
      case 'AlterEdgeForm': {
        const counts = edgeCounts(stage.subject.type);
        record(
          counts,
          formVariables(stage.form),
          counts.entities.ceiling,
          true,
        );
        break;
      }
      case 'CategoricalBin': {
        const counts = nodeCounts(stage.subject.type);
        for (const prompt of stage.prompts) {
          record(
            counts,
            [
              String(prompt.variable),
              // An other bin whose authored odds are exactly zero is never
              // reached for — the simulator's coin can never land below 0 —
              // so its free-text variable is never drawn here.
              prompt.otherVariable && prompt.synthetic.otherBinProbability > 0
                ? String(prompt.otherVariable)
                : undefined,
            ],
            counts.entities.ceiling,
            true,
          );
        }
        break;
      }
      case 'OrdinalBin':
      case 'Geospatial': {
        const counts = nodeCounts(stage.subject.type);
        for (const prompt of stage.prompts) {
          record(
            counts,
            [String(prompt.variable)],
            counts.entities.ceiling,
            true,
          );
        }
        break;
      }
      case 'Sociogram': {
        const counts = nodeCounts(stage.subject.type);
        for (const prompt of stage.prompts) {
          record(
            counts,
            [
              String(prompt.layout.layoutVariable),
              prompt.highlight?.variable && String(prompt.highlight.variable),
            ],
            counts.entities.ceiling,
            true,
          );
        }
        break;
      }
      case 'EgoForm': {
        const counts = countsFor(scopes, { entity: 'ego' });
        counts.entities = { floor: 1, ceiling: 1 };
        record(counts, formVariables(stage.form), 1, true);
        break;
      }
      default:
        break;
    }

    if (isPairStage(stage)) countPairStage(stage);

    if (!isNodeCreating(stage)) return;

    if (isNameGenerating(stage)) trackRosterStage(stage, extent);

    const added = nodesAdded(stage, assetData);
    const counts = nodeCounts(stage.subject.type);
    record(counts, createdNodeVariables(stage), added.ceiling, false);
    counts.entities.floor += added.floor;
    counts.entities.ceiling += added.ceiling;
  });

  // Predetermined relationships, applied by the walk as soon as both
  // endpoints exist. Worst case, every one of them lands (a stopAt run may
  // strand some short of their endpoints, which only produces fewer).
  for (const entry of overrides?.edges ?? []) {
    const counts = edgeCounts(entry.type);
    recordOverrideEntry({ entity: 'edge', type: entry.type }, entry, counts);
    counts.entities.ceiling += 1;
  }

  return { scopes, unmodelled, pairDemands, rosterDemands, populationDemands };
};
