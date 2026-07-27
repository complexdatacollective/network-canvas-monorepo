import type { Stage } from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import type { GenerationConfig } from '../config';
import type { StageOfType } from '../context';
import { getNodeCountBounds, type NodeCreationStage } from '../nodes';
import { getSubjectType } from '../subject';

type WorstCaseCounts = {
  node: Map<string, number>;
  edge: Map<string, number>;
};

/**
 * How many nodes of one type the run can build, split by what bounds them.
 *
 * Roster-drawn nodes are counted apart from fabricated ones because their
 * ceiling is shared: rows are drawn without replacement across every prompt and
 * stage, so two stages reading one roster cannot each have all of it.
 */
type NodeTally = {
  /** From stages nothing external bounds, at their configured maxima. */
  fabricated: number;
  /** From roster-bounded stages, before the shared rows are accounted for. */
  rosterDrawn: number;
  /** Rows those stages offer between them, as copies per primary key. */
  rosterRows: Map<string, number>;
};

/**
 * Stages whose prompts each name a single edge type to create for every
 * subject-node pair considered.
 */
type PairEdgeStage = StageOfType<
  'DyadCensus' | 'OneToManyDyadCensus' | 'TieStrengthCensus'
>;

function isNodeCreationStage(stage: Stage): stage is NodeCreationStage {
  return (
    stage.type === 'NameGenerator' ||
    stage.type === 'NameGeneratorQuickAdd' ||
    stage.type === 'NameGeneratorRoster' ||
    stage.type === 'NetworkComposer'
  );
}

function isPairEdgeStage(stage: Stage): stage is PairEdgeStage {
  return (
    stage.type === 'DyadCensus' ||
    stage.type === 'OneToManyDyadCensus' ||
    stage.type === 'TieStrengthCensus'
  );
}

function add(counts: Map<string, number>, key: string, value: number): void {
  counts.set(key, (counts.get(key) ?? 0) + value);
}

function tallyFor(
  tallies: Map<string, NodeTally>,
  nodeType: string,
): NodeTally {
  const existing = tallies.get(nodeType);
  if (existing) return existing;

  const tally: NodeTally = {
    fabricated: 0,
    rosterDrawn: 0,
    rosterRows: new Map(),
  };
  tallies.set(nodeType, tally);
  return tally;
}

/**
 * Folds one stage's roster rows into the rows already counted for its node
 * type. A row another stage also offers is not counted twice — the first stage
 * to draw it puts it in the shared used-set, and every later stage's pool
 * excludes it — while a pool repeating one primary key counts each copy,
 * because that single stage can draw them all.
 */
function addRosterRows(rows: Map<string, number>, pool: NcNode[]): void {
  const copies = new Map<string, number>();
  for (const row of pool) {
    const key = row[entityPrimaryKeyProperty];
    copies.set(key, (copies.get(key) ?? 0) + 1);
  }

  for (const [key, count] of copies) {
    rows.set(key, Math.max(rows.get(key) ?? 0, count));
  }
}

function totalRows(rows: Map<string, number>): number {
  let total = 0;
  for (const count of rows.values()) total += count;
  return total;
}

/**
 * The most nodes a FamilyPedigree stage can build, as `getNodeCountBounds`
 * treats a name generator's: an inverted configured range is honoured by
 * raising the ceiling to the floor, because `randomInt` collapses such a range
 * to its `min` rather than refusing it. Reading `max` alone would under-count,
 * and an under-count lets a `unique` variable pass feasibility and then run out
 * of values partway through the run.
 */
function pedigreeNodeCeiling(config: GenerationConfig): number {
  const { min, max } = config.familyPedigreeNodeCount;
  return Math.max(max, min);
}

/** The largest number of unordered pairs a subject node type could ever reach. */
function pairsFor(
  nodeType: string | undefined,
  node: Map<string, number>,
): number {
  if (nodeType === undefined) return 0;
  const count = node.get(nodeType) ?? 0;
  return (count * (count - 1)) / 2;
}

/**
 * Worst-case entity counts per node/edge type across a protocol's stages, used
 * to decide `unique` feasibility. Every stage's contribution is an upper
 * bound, not its actual random draw: name-generator variants and
 * NetworkComposer use `getNodeCountBounds`'s ceiling, FamilyPedigree uses the
 * configured maximum pedigree size. For edges, DyadCensus, TieStrengthCensus,
 * OneToManyDyadCensus, Sociogram, and NetworkComposer bound each prompt (or
 * edge definition) by the pair count over its subject node type — a run
 * creates at most one edge of a type per unordered node pair per prompt, so
 * bounds accumulate per prompt. FamilyPedigree instead bounds its edge type by
 * one less than its node ceiling, the parent-child edges it actually creates.
 * Counts sum across stages producing the same type, since a `unique` constraint
 * spans the whole run.
 *
 * `externalData` is `generateNetwork`'s own roster argument, read here for the
 * same three-way meaning `createNodesForStage` gives it: a roster stage with no
 * entry fabricates (so it reaches its configured maximum), one with an empty
 * entry produces nothing, and one with rows produces at most that many. Leaving
 * it out therefore reads every roster stage as fabricating, which is the
 * stricter count — a protocol whose rosters are unknown here must still refuse
 * up front rather than run out of values partway through the draw.
 */
export function worstCaseEntityCounts(
  stages: Stage[],
  config: GenerationConfig,
  externalData?: Record<string, NcNode[]>,
): WorstCaseCounts {
  const node = new Map<string, number>();
  const edge = new Map<string, number>();
  const tallies = new Map<string, NodeTally>();

  for (const stage of stages) {
    if (isNodeCreationStage(stage)) {
      const nodeType = getSubjectType(stage.subject, 'node');
      if (nodeType === undefined) continue;

      const tally = tallyFor(tallies, nodeType);
      const { maxNodes } = getNodeCountBounds(stage, config);
      // Only a roster stage is held to its rows. Every other node-creation
      // stage may fabricate, so a roster it also draws from lowers nothing.
      const pool =
        stage.type === 'NameGeneratorRoster'
          ? externalData?.[stage.id]
          : undefined;

      if (pool === undefined) {
        tally.fabricated += maxNodes;
        continue;
      }

      tally.rosterDrawn += Math.min(maxNodes, pool.length);
      addRosterRows(tally.rosterRows, pool);
      continue;
    }

    if (stage.type === 'FamilyPedigree') {
      const nodeType = stage.nodeConfig?.type;
      if (nodeType) {
        tallyFor(tallies, nodeType).fabricated += pedigreeNodeCeiling(config);
      }
    }
  }

  for (const [nodeType, tally] of tallies) {
    node.set(
      nodeType,
      tally.fabricated +
        Math.min(tally.rosterDrawn, totalRows(tally.rosterRows)),
    );
  }

  for (const stage of stages) {
    if (isPairEdgeStage(stage)) {
      const pairs = pairsFor(getSubjectType(stage.subject, 'node'), node);
      for (const prompt of stage.prompts) {
        const edgeType = prompt.createEdge;
        if (edgeType) add(edge, edgeType, pairs);
      }
      continue;
    }

    if (stage.type === 'Sociogram') {
      const pairs = pairsFor(getSubjectType(stage.subject, 'node'), node);
      for (const prompt of stage.prompts) {
        const edgeType = prompt.edges?.create;
        if (edgeType) add(edge, edgeType, pairs);
      }
      continue;
    }

    if (stage.type === 'NetworkComposer') {
      const pairs = pairsFor(getSubjectType(stage.subject, 'node'), node);
      // Mirrors `handleNetworkComposer`'s read exactly (no `entity` check), so
      // this count can never be lower than what the generator produces.
      for (const edgeDef of stage.edges ?? []) {
        const edgeType = edgeDef.subject?.type;
        if (edgeType !== undefined) add(edge, edgeType, pairs);
      }
      continue;
    }

    if (stage.type === 'FamilyPedigree') {
      const edgeType = stage.edgeConfig?.type;
      if (edgeType) {
        // `handleFamilyPedigree` creates exactly `n - 1` edges (one per node
        // index 1..n-1), never pairwise, so the pair count over-counts by
        // roughly 5x at the default config maximum. Bound it by the true
        // maximum instead.
        add(edge, edgeType, Math.max(pedigreeNodeCeiling(config) - 1, 0));
      }
    }
  }

  return { node, edge };
}
