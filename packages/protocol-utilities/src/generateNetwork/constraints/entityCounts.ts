import {
  collectEntityAttributeReferences,
  type Stage,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import type { GenerationConfig } from '../config';
import type { StageOfType } from '../context';
import { getNodeCountBounds, type NodeCreationStage } from '../nodes';
import { getSubjectType } from '../subject';
import { valueKey } from './uniqueRegistry';

type WorstCaseCounts = {
  node: NodeCounts;
  edge: EdgeCounts;
};

/**
 * How many edges of each type can hold a value, split by what fills them.
 *
 * A FamilyPedigree edge is born with no attributes at all, so whether it can
 * ever hold a value is a question about one variable rather than about its
 * type: a form filling `note` on the same edge type leaves `code` undefined on
 * every one of them. The two sources are therefore counted apart and combined
 * per variable by {@link edgeCountFor}.
 */
export type EdgeCounts = {
  /** Edges whose creating stage fills every variable of the type. */
  base: Map<string, number>;
  /** Edges a FamilyPedigree stage creates, which start empty. */
  pedigree: Map<string, number>;
  /** The variable ids some stage names an attribute of, per edge type. */
  named: Map<string, ReadonlySet<string>>;
};

/**
 * The most edges of `type` that can end up holding a value for `variableId`.
 *
 * Pedigree-built edges join the count only where some stage names that
 * variable, since nothing else writes onto an edge it did not create. Edges
 * from every other stage count for every variable, because those stages
 * generate the type's whole attribute set as they create them — a structural
 * fact about the draw rather than a rule about which stages exist.
 */
export function edgeCountFor(
  counts: EdgeCounts,
  type: string,
  variableId: string,
): number {
  const base = counts.base.get(type) ?? 0;
  const fillable = counts.named.get(type)?.has(variableId) ?? false;
  return base + (fillable ? (counts.pedigree.get(type) ?? 0) : 0);
}

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
  /** Rows those stages offer between them, keyed by primary key. */
  rosterRows: RosterRows;
};

/**
 * The rows behind one node type, deduped across the stages offering them.
 *
 * A pool repeating a primary key can build a node per copy, since one stage
 * draws its whole pool before any of it is marked used; two stages offering one
 * key cannot, because the used-set is shared. `copies` is therefore the most
 * any single stage offers, while `rows` is every row seen under the key — the
 * values those nodes could carry, whichever pool they were drawn from.
 */
type RosterRows = Map<string, { copies: number; rows: NcNode[] }>;

/** Per node type, the tallies {@link nodeCountFor} combines. */
export type NodeCounts = Map<string, NodeTally>;

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

function tallyFor(tallies: NodeCounts, nodeType: string): NodeTally {
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
function addRosterRows(rows: RosterRows, pool: NcNode[]): void {
  const copies = new Map<string, number>();
  for (const row of pool) {
    const key = row[entityPrimaryKeyProperty];
    copies.set(key, (copies.get(key) ?? 0) + 1);
  }

  for (const row of pool) {
    const key = row[entityPrimaryKeyProperty];
    const entry = rows.get(key) ?? { copies: 0, rows: [] };
    entry.copies = Math.max(entry.copies, copies.get(key) ?? 0);
    entry.rows.push(row);
    rows.set(key, entry);
  }
}

function totalRows(rows: RosterRows): number {
  let total = 0;
  for (const { copies } of rows.values()) total += copies;
  return total;
}

/**
 * How many distinct values of `variableId` a node type's roster rows can spend.
 *
 * A roster row is data rather than protocol, so two rows may carry one value
 * for a variable the codebook marks `unique` — and `rosterRowIsDrawable` passes
 * the second of them over rather than refusing the protocol, since leaving a
 * row undrawn contradicts nothing the protocol declares. Rows repeating a value
 * therefore spend it once between them, whatever their number, which is why
 * they are counted by the registry's own `valueKey` rather than as a pool
 * length: counting them any other way would put this number and the pass-over
 * at odds, and the count is what decides whether the pass-over is ever reached.
 *
 * A row leaving the variable unset is the opposite case. `createNodesForStage`
 * generates the node around only the values the row supplies, so the draw is
 * asked for that variable and spends a value on it exactly as a fabricated node
 * would. Those rows are counted one apiece — capped by the copies a stage can
 * draw, since a key no stage offers twice cannot build two nodes.
 *
 * A row whose values break rules of their own is passed over too (the draw
 * refuses it the same way), but is counted here regardless: judging that needs
 * the type's whole constraint set, and over-counting only leaves a refusal
 * standing that is already standing today, where under-counting would let a
 * `unique` variable pass this check and run out of values mid-draw.
 */
function rosterValueCount(rows: RosterRows, variableId: string): number {
  const distinct = new Set<string>();
  let drawn = 0;

  for (const { copies, rows: group } of rows.values()) {
    let unset = 0;
    for (const row of group) {
      const value = row[entityAttributesProperty][variableId];
      if (value === undefined) unset += 1;
      else distinct.add(valueKey(value));
    }
    drawn += Math.min(copies, unset);
  }

  return drawn + distinct.size;
}

/** Every node of a type, whatever variable is being asked about. */
function nodeTotal(tally: NodeTally): number {
  return (
    tally.fabricated + Math.min(tally.rosterDrawn, totalRows(tally.rosterRows))
  );
}

/**
 * How many distinct values of `variableId` nodes of `type` can spend between
 * them.
 *
 * Fabricated nodes each draw their own value, so they spend one apiece. Roster
 * rows do not: see {@link rosterValueCount}, which counts what they can spend
 * as the rows the run could actually draw rather than as the rows it was
 * handed.
 *
 * Per variable rather than per type, because which rows repeat a value is a
 * question about one variable — a roster whose `nickname` column is unique and
 * whose `consented` column is a boolean offers a different number of each.
 */
export function nodeCountFor(
  counts: NodeCounts,
  type: string,
  variableId: string,
): number {
  const tally = counts.get(type);
  if (tally === undefined) return 0;
  return (
    tally.fabricated +
    Math.min(tally.rosterDrawn, rosterValueCount(tally.rosterRows, variableId))
  );
}

/**
 * The most nodes a FamilyPedigree stage can build, as `getNodeCountBounds`
 * treats a name generator's: an inverted configured range is honoured by
 * raising the ceiling to the floor, because `randomInt` collapses such a range
 * to its `min` rather than refusing it. Reading `max` alone would under-count,
 * and an under-count lets a `unique` variable pass feasibility and then run out
 * of values partway through the run.
 */
export function pedigreeNodeCeiling(config: GenerationConfig): number {
  const { min, max } = config.familyPedigreeNodeCount;
  return Math.max(max, min);
}

/**
 * The variables some stage names an attribute of, per edge type.
 *
 * `handleFamilyPedigree` builds its edges with empty attributes — the interface
 * draws parent-child links and collects nothing on them — so a pedigree edge
 * carries a value only where another stage writes one onto an edge it did not
 * create. `handleAlterEdgeForm` is that stage today: it walks every existing
 * edge of its subject type, pedigree-built ones included, and fills the
 * variables its form renders — and only those, since it passes its field list
 * to `generateEntityAttributes` as `only`. A variable no form lists is
 * therefore `undefined` on every pedigree edge of the type, which is why this
 * is recorded per variable rather than per type.
 *
 * Which handlers write edges they did not create is a property of the
 * generator rather than of the schema, so this gate is deliberately wider than
 * that one stage: any attribute reference resolving to an edge variable keeps
 * that variable's pedigree edges counted, whether or not the stage naming it
 * would write them. Reading the schema's own `entityAttributeReference` tags —
 * as `collectBinOnlyVariables` reads them — means a reference site added later
 * counts on its own, without this code being updated, and errs towards
 * refusing up front rather than running out of values partway through a draw.
 */
function namedEdgeAttributes(
  stages: Stage[],
): Map<string, ReadonlySet<string>> {
  const named = new Map<string, Set<string>>();

  for (const hit of collectEntityAttributeReferences({ stages })) {
    if (hit.subject?.entity !== 'edge') continue;
    const variables = named.get(hit.subject.type) ?? new Set<string>();
    variables.add(hit.variableId);
    named.set(hit.subject.type, variables);
  }

  return named;
}

/**
 * The largest number of unordered pairs a subject node type could ever reach.
 *
 * Read from the type's whole node count rather than from any one variable's:
 * an edge is created for a pair of people, whatever values those people hold,
 * so a roster row passed over for repeating one variable's value still pairs
 * with everyone for a stage reading another.
 */
function pairsFor(nodeType: string | undefined, node: NodeCounts): number {
  if (nodeType === undefined) return 0;
  const tally = node.get(nodeType);
  const count = tally === undefined ? 0 : nodeTotal(tally);
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
 * Entities are therefore counted as the value space they spend, not as every
 * entity the run creates, because spending values is the only thing the count
 * is asked about: feasibility measures a `unique` variable's value space
 * against it, and an edge born empty spends none of that space, as do two
 * roster rows carrying one value between them. Both are settled per variable
 * rather than per type — see {@link edgeCountFor} and {@link nodeCountFor},
 * which read the tallies this returns.
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
  const base = new Map<string, number>();
  const pedigree = new Map<string, number>();
  const node: NodeCounts = new Map();

  for (const stage of stages) {
    if (isNodeCreationStage(stage)) {
      const nodeType = getSubjectType(stage.subject, 'node');
      if (nodeType === undefined) continue;

      const tally = tallyFor(node, nodeType);
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
        tallyFor(node, nodeType).fabricated += pedigreeNodeCeiling(config);
      }
    }
  }

  for (const stage of stages) {
    if (isPairEdgeStage(stage)) {
      const pairs = pairsFor(getSubjectType(stage.subject, 'node'), node);
      for (const prompt of stage.prompts) {
        const edgeType = prompt.createEdge;
        if (edgeType) add(base, edgeType, pairs);
      }
      continue;
    }

    if (stage.type === 'Sociogram') {
      const pairs = pairsFor(getSubjectType(stage.subject, 'node'), node);
      for (const prompt of stage.prompts) {
        const edgeType = prompt.edges?.create;
        if (edgeType) add(base, edgeType, pairs);
      }
      continue;
    }

    if (stage.type === 'NetworkComposer') {
      const pairs = pairsFor(getSubjectType(stage.subject, 'node'), node);
      // Mirrors `handleNetworkComposer`'s read exactly (no `entity` check), so
      // this count can never be lower than what the generator produces.
      for (const edgeDef of stage.edges ?? []) {
        const edgeType = edgeDef.subject?.type;
        if (edgeType !== undefined) add(base, edgeType, pairs);
      }
      continue;
    }

    if (stage.type === 'FamilyPedigree') {
      const edgeType = stage.edgeConfig?.type;
      // Tallied apart from the rest because these edges start empty, and only
      // the variables some stage names ever stop being — see
      // {@link edgeCountFor}, which decides that per variable.
      if (edgeType) {
        // `handleFamilyPedigree` creates exactly `n - 1` edges (one per node
        // index 1..n-1), never pairwise, so the pair count over-counts by
        // roughly 5x at the default config maximum. Bound it by the true
        // maximum instead.
        add(pedigree, edgeType, Math.max(pedigreeNodeCeiling(config) - 1, 0));
      }
    }
  }

  return { node, edge: { base, pedigree, named: namedEdgeAttributes(stages) } };
}
