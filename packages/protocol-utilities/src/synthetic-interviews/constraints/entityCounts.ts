import { type Stage, syntheticCountSupport } from '@codaco/protocol-validation';

import type { AssetData } from '../simulators/types';
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

/** One roster stage measured against the rows the run was handed. */
export type RosterDemand = {
  stageId: string;
  stageLabel: string;
  nodeType: string;
  /** The nominations the live interface refuses to advance below. */
  minNodes: number;
  /** Rows the caller resolved for this stage. */
  poolSize: number;
};

export type WalkEntityCounts = {
  /** Counts by `scopeKey`, for the scopes the walk writes entities into. */
  scopes: Map<string, ScopeCounts>;
  /**
   * Scopes whose size this analysis does not model, keyed the same way.
   *
   * FamilyPedigree is the whole of it: its size comes from a run-level
   * population draw rather than from a `synthetic.count`, so the schema
   * publishes no support for it and nothing here may invent one. A scope listed
   * here is left alone rather than counted low — an under-count would refuse
   * nothing while claiming it had checked.
   */
  unmodelled: Set<string>;
  pairDemands: PairDemand[];
  rosterDemands: RosterDemand[];
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

const PAIR_TYPES: ReadonlySet<string> = new Set([
  'DyadCensus',
  'NetworkComposer',
  'OneToManyDyadCensus',
  'Sociogram',
  'TieStrengthCensus',
]);

const isNodeCreating = (stage: Stage): stage is NodeCreatingStage =>
  NODE_CREATING_TYPES.has(stage.type);

const isPairStage = (stage: Stage): stage is PairStage =>
  PAIR_TYPES.has(stage.type);

/** The variables a form collects, as plain codebook ids. */
const formVariables = (
  form: { fields?: readonly { variable: string }[] } | undefined,
): string[] => (form?.fields ?? []).map((field) => field.variable);

/** The edge types one stage can draw over its subject's pair set. */
const edgeTypesOf = (stage: PairStage): string[] => {
  switch (stage.type) {
    case 'DyadCensus':
    case 'OneToManyDyadCensus':
    case 'TieStrengthCensus':
      return stage.prompts.map((prompt) => prompt.createEdge);
    case 'Sociogram':
      return stage.prompts
        .map((prompt) => prompt.edges?.create)
        .filter((type): type is string => type !== undefined);
    case 'NetworkComposer':
      return (stage.edges ?? []).map((edge) => edge.subject.type);
  }
};

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
 * A caller supplying no `rosterNodes` MAP has not resolved rosters at all, and
 * refusing its protocol would blame the document for a host that never looked;
 * a caller supplying one and omitting this stage's key is reporting a source it
 * could not resolve, which is an empty pool.
 */
const poolFor = (stageId: string, assetData: AssetData): number | undefined => {
  const { rosterNodes } = assetData;
  if (rosterNodes === undefined) return undefined;
  return rosterNodes[stageId]?.length ?? 0;
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
 * fabricates nobody, so both ends are held to it. A NetworkComposer's quick-add
 * variable may come back missing, which builds fewer people than the count
 * asked for, so its floor is nobody.
 */
const nodesAdded = (
  stage: NodeCreatingStage,
  assetData: AssetData,
): EntityWindow => {
  if (stage.type === 'NetworkComposer') {
    const composerCount = stage.synthetic.count;
    if (composerCount === undefined) return { floor: 0, ceiling: 0 };
    const { ceiling } = syntheticCountSupport(composerCount);
    return { floor: 0, ceiling };
  }

  const { floor, ceiling } = syntheticCountSupport(stage.synthetic.count);
  if (stage.type !== 'NameGeneratorRoster') return { floor, ceiling };

  const pool = poolFor(stage.id, assetData);
  if (pool === undefined) return { floor: 0, ceiling };
  return { floor: Math.min(floor, pool), ceiling: Math.min(ceiling, pool) };
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
 * Everything the pre-seed gate needs to know about how big a session can get.
 *
 * One pass in stage order, because every question the gate asks is positional:
 * a census enumerates the people who exist WHEN IT RUNS, a form fills the
 * population standing in front of it, and a roster's pool is judged against the
 * stage that draws from it. Skip logic is deliberately not modelled — a skipped
 * stage produces fewer entities and fewer draws, never more, so reading every
 * stage as reached is the direction that cannot under-count.
 */
export const worstCaseEntityCounts = (
  stages: readonly Stage[],
  assetData: AssetData,
): WalkEntityCounts => {
  const scopes = new Map<string, ScopeCounts>();
  const unmodelled = new Set<string>();
  const pairDemands: PairDemand[] = [];
  const rosterDemands: RosterDemand[] = [];
  /** Edge type -> the node types whose pairs can carry one. */
  const edgeSubjects = new Map<string, Set<string>>();

  const nodeCounts = (type: string): ScopeCounts =>
    countsFor(scopes, { entity: 'node', type });
  const edgeCounts = (type: string): ScopeCounts =>
    countsFor(scopes, { entity: 'edge', type });

  for (const stage of stages) {
    if (stage.type === 'FamilyPedigree') {
      unmodelled.add(scopeKey({ entity: 'node', type: stage.nodeConfig.type }));
      unmodelled.add(scopeKey({ entity: 'edge', type: stage.edgeConfig.type }));
      continue;
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
              prompt.otherVariable && String(prompt.otherVariable),
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
      case 'NetworkComposer': {
        const counts = nodeCounts(stage.subject.type);
        record(
          counts,
          [
            ...formVariables(stage.nodeForm),
            stage.convexHullVariable && String(stage.convexHullVariable),
          ],
          counts.entities.ceiling,
          true,
        );
        break;
      }
      default:
        break;
    }

    if (isPairStage(stage)) {
      const subjectType = stage.subject.type;
      const nodes = nodeCounts(subjectType);
      const edgeTypes = [...new Set(edgeTypesOf(stage))];
      const pairs = pairCount(nodes.entities.ceiling);
      const drawn = edgeDrawsOf(stage);

      if (edgeTypes.length > 0) {
        pairDemands.push({
          stageId: stage.id,
          stageLabel: stage.label,
          subjectType,
          edgeTypes,
          guaranteedNodes: nodes.entities.floor,
          guaranteedPairs: pairCount(nodes.entities.floor),
        });
      }

      for (const edgeType of edgeTypes) {
        const counts = edgeCounts(edgeType);
        // Edges of one type live on one shared graph and are deduped by their
        // pair, so a stage linking people an earlier stage already linked
        // REACHES the same edges rather than making new ones — it re-grades
        // them. A stage over a different node type brings a pair set of its
        // own, and those edges are additional.
        const onExisting =
          edgeSubjects.get(edgeType)?.has(subjectType) === true;
        counts.entities.ceiling = onExisting
          ? Math.max(counts.entities.ceiling, pairs)
          : counts.entities.ceiling + pairs;
        record(counts, drawn.get(edgeType) ?? [], pairs, onExisting);
      }

      for (const edgeType of edgeTypes) {
        const subjects = edgeSubjects.get(edgeType) ?? new Set<string>();
        subjects.add(subjectType);
        edgeSubjects.set(edgeType, subjects);
      }
    }

    if (!isNodeCreating(stage)) continue;

    if (stage.type === 'NameGeneratorRoster') {
      const pool = poolFor(stage.id, assetData);
      const minNodes = stage.behaviours?.minNodes;
      if (pool !== undefined && minNodes !== undefined && pool < minNodes) {
        rosterDemands.push({
          stageId: stage.id,
          stageLabel: stage.label,
          nodeType: stage.subject.type,
          minNodes,
          poolSize: pool,
        });
      }
    }

    const added = nodesAdded(stage, assetData);
    const counts = nodeCounts(stage.subject.type);
    record(counts, createdNodeVariables(stage), added.ceiling, false);
    counts.entities.floor += added.floor;
    counts.entities.ceiling += added.ceiling;
  }

  return { scopes, unmodelled, pairDemands, rosterDemands };
};
