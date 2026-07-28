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

/** One FamilyPedigree stage's edges, and where in the run it builds them. */
type PedigreeEdges = {
  count: number;
  /** The stage's position in the list, which is the order it runs in. */
  stageIndex: number;
};

/**
 * What the stages pairing a node type's whole population reach for one edge
 * type: the largest pair set any of them walks, and the last of them to run.
 */
type PopulationPairing = { maxPairs: number; lastIndex: number };

/**
 * Edges a stage creates among only the nodes it builds itself — a
 * NetworkComposer's and a FamilyPedigree's — held until the whole stage list is
 * known, because whether they are already inside a population pair set depends
 * on what runs after them.
 */
type OwnNodeEdges = {
  edgeType: string;
  nodeType: string;
  count: number;
  stageIndex: number;
  /** Whether the stage fills the edges as it creates them, or leaves them empty. */
  born: 'filled' | 'empty';
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
  /**
   * Edges each FamilyPedigree stage creates, which start empty, kept apart per
   * stage because whether a writer can reach them depends on where that stage
   * runs relative to the writer.
   */
  pedigree: Map<string, PedigreeEdges[]>;
  /**
   * The last stage index naming an attribute of an edge type, per variable id.
   * Read as "a stage naming it runs no later than this", which is what decides
   * which pedigrees' edges the naming can reach.
   */
  named: Map<string, Map<string, number>>;
};

/**
 * The most edges of `type` that can end up holding a value for the equality
 * group `variableIds` — one variable, or every member of a group held to a
 * single value.
 *
 * Pedigree-built edges join the count where a stage naming any member of the
 * group runs at or after the pedigree that built them, since nothing else
 * writes onto an edge it did not create and writing one member gives the whole
 * group a value. The ordering is what a stage can reach rather than what it
 * declares: `generateNetwork` walks its stage list once, in order, and skip
 * logic only ever jumps forward (`resolveSkipLogicDestinationIndex` resolves a
 * destination only when it is strictly after the owning stage), so a stage
 * writing edges at index `i` sees exactly the edges the stages before `i` left
 * on the draft. A pedigree later than every naming site therefore hands its
 * edges to nobody, and they stay as `handleFamilyPedigree` built them: empty.
 *
 * "At or after" rather than "after", because a FamilyPedigree's own
 * `edgeConfig` names four edge variables of its type
 * (`relationshipTypeVariable` and friends), and a stage naming a variable of
 * the edges it is itself creating is exactly the case this must not narrow
 * away.
 *
 * Edges from every other stage count for every variable, because those stages
 * generate the type's whole attribute set as they create them — a structural
 * fact about the draw rather than a rule about which stages exist.
 */
export function edgeCountFor(
  counts: EdgeCounts,
  type: string,
  variableIds: readonly string[],
): number {
  const base = counts.base.get(type) ?? 0;
  const named = counts.named.get(type);

  let namedAt = -1;
  for (const id of variableIds) {
    const at = named?.get(id);
    if (at !== undefined) namedAt = Math.max(namedAt, at);
  }
  if (namedAt < 0) return base;

  let fromPedigree = 0;
  for (const { count, stageIndex } of counts.pedigree.get(type) ?? []) {
    if (stageIndex <= namedAt) fromPedigree += count;
  }

  return base + fromPedigree;
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

/**
 * The same count read across a whole equality group rather than one member.
 *
 * A drawn row claims every value it carries into the group's single `unique`
 * slot — `claimFixedValues` walks `uniqueSlotMembers`, which keys the slot by
 * the group — and `rosterRowIsDrawable` passes over any later row carrying a
 * value that slot already holds. Two drawn rows therefore share no value
 * between them, so the rows carrying any of the group's values can build at
 * most as many nodes as there are distinct values among them, and at most as
 * many as there are such rows. Rows carrying none of them are the unset case
 * again: the draw supplies the group's value, so they count one apiece.
 */
function rosterGroupValueCount(
  rows: RosterRows,
  variableIds: readonly string[],
): number {
  const carried = new Set<string>();
  let carrying = 0;
  let bare = 0;

  for (const { copies, rows: group } of rows.values()) {
    let withValues = 0;
    let without = 0;

    for (const row of group) {
      const attributes = row[entityAttributesProperty];
      let holds = false;
      for (const id of variableIds) {
        const value = attributes[id];
        if (value === undefined) continue;
        holds = true;
        carried.add(valueKey(value));
      }
      if (holds) withValues += 1;
      else without += 1;
    }

    carrying += Math.min(copies, withValues);
    bare += Math.min(copies, without);
  }

  return bare + Math.min(carrying, carried.size);
}

/**
 * How many of a node type's roster rows can end up holding a value of the
 * equality group `variableIds`.
 *
 * Every member of the group bounds the whole group on its own, by the argument
 * {@link rosterValueCount} makes: the members share one `unique` slot, so a
 * drawn row's value for any member is what a later row carrying that same value
 * is turned away by. Reading the group as a whole bounds it again, and neither
 * reading dominates the other — a group whose members are populated unevenly is
 * tightest per member, while rows spreading one value across different members
 * are tightest read together. Both are upper bounds on the same quantity, so
 * the smallest of them is one too, and taking it can only refuse fewer
 * protocols than reading any single member would.
 */
function rosterCarrierCount(
  rows: RosterRows,
  variableIds: readonly string[],
): number {
  let bound = rosterGroupValueCount(rows, variableIds);
  for (const id of variableIds) {
    bound = Math.min(bound, rosterValueCount(rows, id));
  }
  return bound;
}

/** Every node of a type, whatever variable is being asked about. */
function nodeTotal(tally: NodeTally): number {
  return (
    tally.fabricated + Math.min(tally.rosterDrawn, totalRows(tally.rosterRows))
  );
}

/**
 * How many distinct values of the equality group `variableIds` nodes of `type`
 * can spend between them — one variable, or every member of a group held to a
 * single value.
 *
 * Fabricated nodes each draw their own value, so they spend one apiece. Roster
 * rows do not: see {@link rosterCarrierCount}, which counts what they can spend
 * as the rows the run could actually draw rather than as the rows it was
 * handed.
 *
 * Per group rather than per type, because which rows repeat a value is a
 * question about the variables in play — a roster whose `nickname` column is
 * unique and whose `consented` column is a boolean offers a different number of
 * each.
 */
export function nodeCountFor(
  counts: NodeCounts,
  type: string,
  variableIds: readonly string[],
): number {
  const tally = counts.get(type);
  if (tally === undefined) return 0;
  return (
    tally.fabricated +
    Math.min(
      tally.rosterDrawn,
      rosterCarrierCount(tally.rosterRows, variableIds),
    )
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
 * The last stage index naming an attribute of each edge type, per variable id.
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
 *
 * Where the reference sits is kept alongside it, because a stage can only write
 * edges that already exist when it runs — see {@link edgeCountFor}. The index
 * is read off the hit's own value path, whose root is the `stages` array this
 * passes in, exactly as `isBinPromptAssignment` reads it. A hit this cannot
 * place that way is read as reaching every pedigree rather than none, which is
 * the direction that leaves a refusal standing instead of letting a draw run
 * out of values: only stage references are collected here, so nothing produces
 * such a hit today, and a reference site added somewhere else later should keep
 * the old wide behaviour until it is deliberately placed.
 */
function namedEdgeAttributes(
  stages: Stage[],
): Map<string, Map<string, number>> {
  const named = new Map<string, Map<string, number>>();

  for (const hit of collectEntityAttributeReferences({ stages })) {
    if (hit.subject?.entity !== 'edge') continue;

    const [root, stageIndex] = hit.path;
    const namedAt =
      root === 'stages' && typeof stageIndex === 'number'
        ? stageIndex
        : Number.POSITIVE_INFINITY;

    const variables = named.get(hit.subject.type) ?? new Map<string, number>();
    variables.set(
      hit.variableId,
      Math.max(variables.get(hit.variableId) ?? -1, namedAt),
    );
    named.set(hit.subject.type, variables);
  }

  return named;
}

/** Unordered pairs over `count` entities, as `createEdgesForPairs` walks them. */
function pairCount(count: number): number {
  return (count * (count - 1)) / 2;
}

/**
 * The unordered pairs a subject node type reaches with the nodes counted so
 * far — which, walking the stage list in order, is the population a stage at
 * this point in the run can pair.
 *
 * Read from the type's whole node count rather than from any one variable's:
 * an edge is created for a pair of people, whatever values those people hold,
 * so a roster row passed over for repeating one variable's value still pairs
 * with everyone for a stage reading another.
 *
 * For the stages that pair whatever the network holds when they run — the
 * censuses and the Sociogram, which read `getStageFilteredNodes` over the whole
 * draft. A NetworkComposer pairs only the nodes it built itself, and is counted
 * from its own ceiling instead.
 */
function pairsSoFar(nodeType: string | undefined, node: NodeCounts): number {
  if (nodeType === undefined) return 0;
  const tally = node.get(nodeType);
  return pairCount(tally === undefined ? 0 : nodeTotal(tally));
}

/**
 * Whether a configured per-pair probability can ever produce an edge.
 *
 * `createEdgesForPairs` creates one only where `randomFloat(0, 1) <
 * probability`, and that draw is never negative, so a probability the config
 * cannot draw above zero leaves every pair unconnected however many pairs the
 * stage walks. The ceiling is the larger end of the range rather than `max`:
 * `randomFloat` is handed the range as written and does not normalise an
 * inverted one, so `{ min: 0.5, max: 0 }` must be read as reaching 0.5.
 */
function createsEdges(probability: { min: number; max: number }): boolean {
  return Math.max(probability.min, probability.max) > 0;
}

/**
 * Worst-case entity counts per node/edge type across a protocol's stages, used
 * to decide `unique` feasibility. Every stage's contribution is an upper
 * bound, not its actual random draw: name-generator variants and
 * NetworkComposer use `getNodeCountBounds`'s ceiling, FamilyPedigree uses the
 * configured maximum pedigree size. For edges, DyadCensus, TieStrengthCensus,
 * OneToManyDyadCensus and Sociogram bound an edge type by the pair count over
 * each subject node type any of them pairs it for — a run creates at most one
 * edge of a type per unordered node pair, however many prompts and stages ask
 * about it, because `createEdgesForPairs` reuses the pair's existing edge the
 * way the interview does. A NetworkComposer bounds each of its edge types by
 * the pairs of its own node ceiling instead, since it pairs only the people it
 * built itself, and FamilyPedigree by one less than its node ceiling, the
 * parent-child edges it actually creates; both are folded into a later pairing
 * of the same node type where one exists, and counted on their own where it
 * does not. Node counts sum across stages producing the same type, since a
 * `unique` constraint spans the whole run.
 *
 * The stage list is read in the order `generateNetwork` runs it, because every
 * one of these bounds is about what a stage can reach rather than about what
 * the protocol eventually holds. A census pairs the people standing when it
 * runs, so a name generator after it adds nobody to its pair set; a form fills
 * the edges standing when it runs, so a pedigree after it hands its edges to
 * nobody. That reading is sound because the run only ever moves forward —
 * `resolveSkipLogicDestinationIndex` resolves a skip destination only when it
 * is strictly after the owning stage, so no stage is revisited and no node is
 * ever removed — and because a skipped stage or an early drop-out leaves fewer
 * entities than counted here, never more.
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
  const pedigree = new Map<string, PedigreeEdges[]>();
  const node: NodeCounts = new Map();

  // The node types whose whole population is paired for each edge type, and
  // the stages that pair only the people they build themselves.
  //
  // One pair count per node type rather than per prompt, because
  // `createEdgesForPairs` now looks the pair up on `draft.edges` before drawing
  // and reuses whatever it finds, exactly as the interview's `edgeExists` does.
  // Edges carry no stage or prompt provenance, so that lookup spans the whole
  // run: two prompts of one census, two censuses, and a Sociogram elsewhere in
  // the protocol all draw from the same set of pairs and leave at most one edge
  // of the type on each. Summing them would count edges the draw cannot create.
  //
  // Node types are summed against each other, not unioned: a pair is two nodes
  // of one type, so a stage over `person` and a stage over `place` reach
  // disjoint sets of pairs even when both create the same edge type.
  const paired = new Map<string, Map<string, PopulationPairing>>();
  const ownNodeEdges: OwnNodeEdges[] = [];

  function pairsWith(
    edgeType: string,
    nodeType: string,
    stageIndex: number,
  ): void {
    const byNodeType =
      paired.get(edgeType) ?? new Map<string, PopulationPairing>();
    const existing = byNodeType.get(nodeType);
    // The largest pair set and the latest stage reaching it, which for a
    // population that only ever grows are the same stage. Recorded apart all
    // the same: the maximum is what bounds the type, while the index is what
    // says which stage-local edge sets are inside that bound.
    byNodeType.set(nodeType, {
      maxPairs: Math.max(existing?.maxPairs ?? 0, pairsSoFar(nodeType, node)),
      lastIndex: Math.max(existing?.lastIndex ?? -1, stageIndex),
    });
    paired.set(edgeType, byNodeType);
  }

  for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
    const stage = stages[stageIndex]!;

    // One pass, in stage order, because a pair set is bounded by the population
    // standing when its stage runs rather than by the one the protocol ends
    // with. `generateNetwork` walks this same list once and only forwards —
    // `resolveSkipLogicDestinationIndex` resolves a destination only when it is
    // strictly after the owning stage — so nodes accumulate monotonically and
    // the tally read at a stage is that stage's whole candidate pool. A skipped
    // stage or an early drop-out leaves fewer nodes than counted here, never
    // more, so the reading stays an upper bound either way.
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
      } else {
        tally.rosterDrawn += Math.min(maxNodes, pool.length);
        addRosterRows(tally.rosterRows, pool);
      }

      if (stage.type === 'NetworkComposer') {
        // Pairs of the stage's own new nodes, not of the type's whole
        // population: `handleNetworkComposer` hands `createEdgesForPairs` the
        // `newNodes` it just built, so people an earlier stage added are never
        // among them. The protocol-wide total would count pairs the handler
        // cannot form — a five-person name generator ahead of a composer capped
        // at two claims 21 edges for a stage able to create one.
        //
        // The ceiling is `getNodeCountBounds`'s, which is what
        // `createNodesForStage` caps the stage at, and it reads an inverted
        // configured range as the draw does. A composer never draws from a
        // roster — `handleNetworkComposer` passes no pool and allows
        // fabrication — so nothing narrows the stage below it.
        const pairs = createsEdges(config.networkComposerEdgeProbability)
          ? pairCount(maxNodes)
          : 0;
        // Once per distinct type, not once per definition: the handler pushes
        // each definition's edges onto the draft before the next one runs, so
        // two definitions naming one type share the stage's pairs between them.
        // Mirrors `handleNetworkComposer`'s read exactly (no `entity` check),
        // so this count can never be lower than what the generator produces.
        const edgeTypes = new Set<string>();
        for (const edgeDef of stage.edges ?? []) {
          const edgeType = edgeDef.subject?.type;
          if (edgeType !== undefined) edgeTypes.add(edgeType);
        }
        for (const edgeType of edgeTypes) {
          ownNodeEdges.push({
            edgeType,
            nodeType,
            count: pairs,
            stageIndex,
            born: 'filled',
          });
        }
      }
      continue;
    }

    if (isPairEdgeStage(stage)) {
      const nodeType = getSubjectType(stage.subject, 'node');
      if (nodeType === undefined) continue;
      // A census whose configured probability cannot rise above zero creates
      // nothing at all, so it puts no pair of its own into the count. It may
      // still WRITE onto a pair it meets — `handleTieStrengthCensus` fills its
      // `edgeVariable` over reused edges as well as new ones — but every edge
      // it could meet was created by some other stage, and is counted there.
      if (!createsEdges(config.censusEdgeProbability)) continue;
      for (const prompt of stage.prompts) {
        const edgeType = prompt.createEdge;
        if (edgeType) pairsWith(edgeType, nodeType, stageIndex);
      }
      continue;
    }

    if (stage.type === 'Sociogram') {
      const nodeType = getSubjectType(stage.subject, 'node');
      if (nodeType === undefined) continue;
      if (!createsEdges(config.sociogramEdgeProbability)) continue;
      for (const prompt of stage.prompts) {
        const edgeType = prompt.edges?.create;
        if (edgeType) pairsWith(edgeType, nodeType, stageIndex);
      }
      continue;
    }

    if (stage.type === 'FamilyPedigree') {
      // `handleFamilyPedigree` returns before building anything — nodes and
      // edges alike — when its config names no node type.
      const nodeType = stage.nodeConfig?.type;
      if (nodeType === undefined) continue;

      tallyFor(node, nodeType).fabricated += pedigreeNodeCeiling(config);

      const edgeType = stage.edgeConfig?.type;
      // Tallied apart from the rest because these edges start empty, and only
      // the variables some stage names ever stop being — see
      // {@link edgeCountFor}, which decides that per variable.
      if (edgeType !== undefined) {
        // `handleFamilyPedigree` creates exactly `n - 1` edges (one per node
        // index 1..n-1), never pairwise, so the pair count over-counts by
        // roughly 5x at the default config maximum. Bound it by the true
        // maximum instead.
        ownNodeEdges.push({
          edgeType,
          nodeType,
          count: Math.max(pedigreeNodeCeiling(config) - 1, 0),
          stageIndex,
          born: 'empty',
        });
      }
    }
  }

  for (const [edgeType, byNodeType] of paired) {
    for (const { maxPairs } of byNodeType.values()) {
      add(base, edgeType, maxPairs);
    }
  }

  for (const { edgeType, nodeType, count, stageIndex, born } of ownNodeEdges) {
    // A composer's or a pedigree's people are part of their type's population,
    // so where a census or Sociogram pairs that whole population for this edge
    // type LATER in the run, this stage's edges are inside that pair set and
    // the census reuses whichever of them it meets — `createEdgesForPairs`
    // looks the pair up before drawing. Counting them again would double a
    // pair.
    //
    // A pedigree's edges are a subset of its own people's pairs because
    // `handleFamilyPedigree` gives every node after the first exactly one
    // parent drawn from the nodes before it, so no two of its edges land on one
    // unordered pair. That is where the generator parts company with the
    // interface, which lets several edges of a type join one pair and tells
    // them apart by `relationshipTypeVariable`; were the generator ever taught
    // to do the same, this fold would become an under-count and would have to
    // go.
    //
    // Strictly later, because a pairing stage that ran BEFORE this one never
    // saw these people: they did not exist yet, so its pair set excludes them
    // and cannot hold these edges. Where nothing pairs the type afterwards,
    // each such stage contributes its own edges and they sum — two composers
    // build disjoint sets of people, and two pedigrees likewise — and that sum
    // can never exceed the type's whole pair count, since every ceiling is
    // inside `nodeTotal` and pairs grow faster than nodes.
    if ((paired.get(edgeType)?.get(nodeType)?.lastIndex ?? -1) > stageIndex) {
      continue;
    }

    // A composer generates the whole attribute set of every edge it creates, so
    // its edges join the count for every variable; a pedigree's are born empty
    // and are kept apart for {@link edgeCountFor} to settle per variable.
    if (born === 'filled') {
      add(base, edgeType, count);
      continue;
    }

    const forType = pedigree.get(edgeType) ?? [];
    forType.push({ count, stageIndex });
    pedigree.set(edgeType, forType);
  }

  return { node, edge: { base, pedigree, named: namedEdgeAttributes(stages) } };
}
