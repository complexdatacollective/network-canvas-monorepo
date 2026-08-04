import {
  collectEntityAttributeReferences,
  type Stage,
} from '@codaco/protocol-validation';
import {
  GAMETE_ROLES,
  RELATIONSHIP_TYPES,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import type { GenerationConfig } from '../config';
import type { StageOfType } from '../context';
import type { ResolvedFamilyPedigreeGenerationOptions } from '../familyPedigree/types';
import {
  getNodeCountBounds,
  type NodeCreationStage,
  ruleBrokenByFixedValues,
} from '../nodes';
import { getSubjectType } from '../subject';
import { completionCheckFor } from './generateEntityAttributes';
import type { EntityConstraints } from './types';
import { valueKey } from './uniqueRegistry';

type WorstCaseCounts = {
  node: NodeCounts;
  edge: EdgeCounts;
  /** Node population standing immediately before each stage runs. */
  nodeBeforeStage: Map<number, Map<string, number>>;
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
  /**
   * Whether the stage fills the edge type's whole attribute set as it creates
   * them, or only the part of it the stage itself writes.
   */
  born: 'whole' | 'partial';
};

/**
 * How many edges of each type can hold a value, split by what fills them.
 *
 * A FamilyPedigree edge is born holding only the interface semantics named by
 * its edge config. Whether it can ever hold an arbitrary codebook value is
 * therefore a question about that variable rather than about its type: a form
 * filling `note` on the same edge type leaves `code` undefined on every one of
 * them. The two sources are counted apart and combined per variable by
 * {@link edgeCountFor}.
 */
export type EdgeCounts = {
  /** Edges whose creating stage fills every variable of the type. */
  base: Map<string, number>;
  /**
   * Edges each FamilyPedigree stage creates, which start holding only what that
   * stage writes, kept apart per stage because whether any other writer can
   * reach them depends on where the pedigree runs relative to that writer.
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
 * edges to nobody, and they retain only their configured pedigree semantics.
 *
 * "At or after" rather than "after" is what lets a pedigree reach its own
 * edges. The naming sites that share a pedigree's index are that pedigree's
 * `edgeConfig`; its relationship, activity, carrier, and gamete semantics are
 * written onto the applicable edges at that same point in the run.
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
 * The variables of an edge type whose edges are all born part-filled that no
 * stage can write — the same question {@link edgeCountFor} answers as a number,
 * read as a set so a scope can drop their rules.
 *
 * Validation rules are a form-field mechanism: they apply where a stage renders
 * a `Field` for the variable, and generation spends a value on it in the same
 * places. FamilyPedigree renders no field and writes only the relationship,
 * activity, carrier, and gamete variables in its edge config. Where it is an
 * edge type's only source, any other variable that no later stage names remains
 * `undefined` on every edge of the type. Analysing rules on that absent value
 * would refuse a protocol over something nothing draws or submits.
 *
 * Which stages count as writers is not decided here: this reads
 * {@link EdgeCounts.named} through {@link edgeCountFor} itself, so "reached by
 * a writer" means the same thing to the count and to the analysis. A variable
 * an AlterEdgeForm renders at or after the pedigree is reached, as is a
 * TieStrengthCensus' `edgeVariable` over the edges it reuses; a filter rule
 * naming the variable is not, because its reference resolves no subject — it
 * reads a value, it does not write one.
 *
 * Asked per equality group rather than per variable, for the reason
 * `edgeCountFor` is: the members share one value, so writing any of them gives
 * the whole group one, and a variable held equal to one a form renders is
 * written whether or not the form ever names it. Reading them one at a time
 * would exempt exactly the member carrying the group's `unique` rule and let a
 * real contradiction through. Every group is therefore all-or-nothing, which is
 * also why exempting one cannot disturb another: a group with any written
 * member keeps every member's rules, so no surviving group loses a reference
 * the exempted ones declared.
 *
 * Held to edge types every one of whose edges a pedigree creates. An edge any
 * other stage creates is born with its type's whole attribute set, so nothing
 * of it is unwritten; and a type nothing creates has no edge to exempt anything
 * on, which `analyseFeasibility` settles before this is asked — a type only an
 * alter form names drops its whole scope there, for the same reason this
 * exempts a group here.
 *
 * What this exempts the draw never asks for, so nothing has to be exempted
 * there to match: every writer of a pedigree edge names what it writes, which
 * is what put the variable in `named` in the first place.
 */
export function unwrittenEdgeVariables(
  counts: EdgeCounts,
  type: string,
  groups: Iterable<readonly string[]>,
): ReadonlySet<string> {
  const unwritten = new Set<string>();
  if ((counts.base.get(type) ?? 0) > 0) return unwritten;
  if (!counts.pedigree.has(type)) return unwritten;

  for (const members of groups) {
    if (edgeCountFor(counts, type, members) > 0) continue;
    for (const id of members) unwritten.add(id);
  }

  return unwritten;
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
 * The rows behind one node type, grouped by the primary key they arrived under.
 *
 * A key builds at most one node however many rows carry it, and whichever pool
 * they came from: `createNodesForStage` adds each drawn row's key to the shared
 * `usedRosterUids`, and its `rowIsDrawable` turns away any later row whose key
 * that set already holds. So a repeated key is not a repeated person — it is
 * several descriptions of one, and which of them the draw reaches is a seed's
 * business. Every row under the key is therefore kept, as the values that one
 * node could carry, and every count below spends the key once.
 *
 * Only the rows a run could actually draw reach here — see
 * {@link drawableRosterRows}.
 */
type RosterRows = Map<string, NcNode[]>;

/**
 * The constraints one node type's values are judged against: the map
 * `generateNetwork` hands the draw, built over the same `unvalidated` set so a
 * rule the interview never applies is absent from both. Answering `undefined`
 * counts that type's rows unfiltered, the same conservative direction as
 * omitting `externalData` — see {@link worstCaseEntityCounts}.
 *
 * Asked per type as it is reached, rather than handed over as a whole map, so
 * a type nothing draws from is never built. `buildEntityConstraints` refuses a
 * date bound it cannot read, and a codebook type no stage names should keep
 * reaching feasibility's own unused-type exemption rather than being refused
 * over a parameter nothing in the run would have read. This is asked only of a
 * type some roster stage draws people of, which is exactly where the draw
 * builds the same map.
 */
export type NodeConstraintsFor = (
  nodeType: string,
) => EntityConstraints | undefined;

/** Whether the draw can complete a node around one set of fixed values. */
type CompletionCheck = (fixed: Record<string, VariableValue>) => boolean;

/** What judging one node type's rows takes, built once and kept. */
type RowJudge = {
  constraints: EntityConstraints;
  canComplete: CompletionCheck;
};

/** The values one prompt writes onto every node it creates. */
function promptFixedValues(
  prompt: StageOfType<'NameGeneratorRoster'>['prompts'][number],
): Record<string, VariableValue> {
  const fixed: Record<string, VariableValue> = {};
  for (const { variable, value } of prompt.additionalAttributes ?? []) {
    fixed[variable] = value;
  }
  return fixed;
}

/**
 * The rows of one roster stage's pool that the run could build a node from on
 * some seed.
 *
 * `createNodesForStage` judges every candidate row twice, and only one of those
 * judgements is settled by the protocol. `rosterRowIsDrawable` asks whether the
 * network can still take the row's `unique` values, which changes as nodes are
 * built: a row it turns away under one seed is drawn under another, where the
 * draw reached it before whatever claimed the value. That is not decidable
 * here, and rows it would pass over stay counted — the same reading by which a
 * row a `min: 0` stage might have left for a later one keeps being counted for
 * both.
 *
 * The other judgement is `rulesAllow`, and it is settled before any drawing.
 * Its two halves read nothing but the type's constraints and the assignment the
 * node will be written with: {@link ruleBrokenByFixedValues} answers whether a
 * value its own variable's bounds reject, or a pair of the row's own values
 * breaking a rule spanning them, is present; `completionCheckFor`'s predicate
 * answers whether those values leave the draw a way to complete the rest of the
 * node around them. Neither consults the network, the registry or the seed, so
 * a row they reject is one no seed can draw — counting it claims a node the run
 * will never build, and with it a pair set and a value spend that nothing
 * reaches.
 *
 * Both halves are asked of exactly what the draw asks them of, rather than of a
 * second reading of the same rules. The completion check is the very closure
 * `createNodesForStage` builds, and the constraints are the map it reads, so
 * this cannot come to a different verdict than the pass-over it describes.
 *
 * A row is kept where ANY of the stage's prompts admits it. Which prompt draws
 * a row is a seed's business, so a row one prompt's `additionalAttributes` break
 * and another leaves alone is still drawable. Prompts the stage's node ceiling
 * leaves nothing for are read alongside the rest rather than dropped: a prompt
 * that cannot draw can only keep a row that would otherwise be excluded, which
 * over-counts, and that is the safe direction.
 *
 * The merge is the roster interface's: a `NameGeneratorRoster` is the one node
 * stage held to its rows, so its `RosterDraw.allowFabrication` is false and
 * `fixedValuesFor` spreads the row's own values over the prompt's. A panel on a
 * fabricating name generator settles a collision the other way round, but its
 * rows never reach this tally at all — the stage fabricates to its own ceiling,
 * so narrowing its pool would lower nothing.
 */
function drawableRosterRows(
  stage: StageOfType<'NameGeneratorRoster'>,
  pool: NcNode[],
  constraints: EntityConstraints,
  canComplete: CompletionCheck,
): NcNode[] {
  const promptValues = stage.prompts.map(promptFixedValues);
  // A stage with no prompt creates no node, so the row's own values are all
  // there would be to judge it by.
  const assignments = promptValues.length > 0 ? promptValues : [{}];

  return pool.filter((row) =>
    assignments.some((fixed) => {
      const merged = { ...fixed, ...row[entityAttributesProperty] };
      return (
        ruleBrokenByFixedValues(constraints, merged) === undefined &&
        canComplete(merged)
      );
    }),
  );
}

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
 * Folds one stage's drawable roster rows into the rows already counted for its
 * node type. Neither a key two stages offer nor a key one pool repeats is
 * counted twice: the first draw of it enters the shared used-set, and every
 * later row carrying it is passed over.
 *
 * `pool` is the stage's drawable window rather than its whole roster, so a key
 * one stage's prompts leave undrawable still arrives from a stage whose prompts
 * admit it, and the rows kept under a key are the rows some stage could really
 * build a node from.
 */
function addRosterRows(rows: RosterRows, pool: NcNode[]): void {
  for (const row of pool) {
    const key = row[entityPrimaryKeyProperty];
    const group = rows.get(key) ?? [];
    group.push(row);
    rows.set(key, group);
  }
}

/** Every node the rows can build between them: one per key. */
function totalRows(rows: RosterRows): number {
  return rows.size;
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
 * would. Those rows are counted one apiece — one per KEY, since a key builds
 * one node whichever of its rows the draw reaches.
 *
 * A row whose values break rules of their own never reaches this count at all:
 * {@link drawableRosterRows} has already left it out of `rows`, because no seed
 * can draw it. What is counted here is therefore what the drawable rows spend
 * between them.
 */
function rosterValueCount(rows: RosterRows, variableId: string): number {
  const distinct = new Set<string>();
  let drawn = 0;

  for (const group of rows.values()) {
    let anyUnset = false;
    for (const row of group) {
      const value = row[entityAttributesProperty][variableId];
      if (value === undefined) anyUnset = true;
      else distinct.add(valueKey(value));
    }
    if (anyUnset) drawn += 1;
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
 *
 * Read per key rather than per row, because a key builds one node: a key some
 * of whose rows carry a value and some of which do not is one node either way,
 * and is counted on both sides only because which row the draw reaches is a
 * seed's business. That leaves the reading an upper bound, which is what it is
 * asked to be.
 */
function rosterGroupValueCount(
  rows: RosterRows,
  variableIds: readonly string[],
): number {
  const carried = new Set<string>();
  let carrying = 0;
  let bare = 0;

  for (const group of rows.values()) {
    let anyWithValues = false;
    let anyWithout = false;

    for (const row of group) {
      const attributes = row[entityAttributesProperty];
      let holds = false;
      for (const id of variableIds) {
        const value = attributes[id];
        if (value === undefined) continue;
        holds = true;
        carried.add(valueKey(value));
      }
      if (holds) anyWithValues = true;
      else anyWithout = true;
    }

    if (anyWithValues) carrying += 1;
    if (anyWithout) bare += 1;
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
 *
 * The key count is a third bound, and the only one that sees a key some of
 * whose rows carry a value while others leave it unset. Which of them the draw
 * reaches is a seed's business, so the readings above count such a key on both
 * sides; one node is all it can build either way.
 */
function rosterCarrierCount(
  rows: RosterRows,
  variableIds: readonly string[],
): number {
  let bound = Math.min(rosterGroupValueCount(rows, variableIds), rows.size);
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
type PedigreeCeilingContext = {
  options: ResolvedFamilyPedigreeGenerationOptions;
  stage: StageOfType<'FamilyPedigree'>;
  stages: readonly Stage[];
};

const CONTRIBUTOR_ANCESTRY_NODE_CEILING = 6;
const CONTRIBUTOR_ANCESTRY_EDGE_CEILING = 9;
const EXTERNAL_CONTRIBUTOR_NODE_MULTIPLIER = 8;
const EXTERNAL_CONTRIBUTOR_EDGE_MULTIPLIER = 12;

function compatibleContributorPedigree(
  first: StageOfType<'FamilyPedigree'>,
  second: StageOfType<'FamilyPedigree'>,
): boolean {
  return (
    first.nodeConfig?.type !== undefined &&
    first.nodeConfig.type === second.nodeConfig?.type &&
    first.nodeConfig.egoVariable !== undefined &&
    first.nodeConfig.egoVariable === second.nodeConfig?.egoVariable &&
    first.edgeConfig?.type !== undefined &&
    first.edgeConfig.type === second.edgeConfig?.type &&
    first.edgeConfig.relationshipTypeVariable !== undefined &&
    first.edgeConfig.relationshipTypeVariable ===
      second.edgeConfig?.relationshipTypeVariable
  );
}

function pairsPedigreePopulation(
  stage: Stage,
  nodeType: string,
  edgeType: string,
): boolean {
  if (isPairEdgeStage(stage)) {
    return (
      getSubjectType(stage.subject, 'node') === nodeType &&
      stage.prompts.some((prompt) => prompt.createEdge === edgeType)
    );
  }
  return (
    stage.type === 'Sociogram' &&
    getSubjectType(stage.subject, 'node') === nodeType &&
    stage.prompts.some((prompt) => prompt.edges?.create === edgeType)
  );
}

function canReshapeContributorGraph(
  candidate: Stage,
  pedigree: StageOfType<'FamilyPedigree'>,
): boolean {
  const nodeType = pedigree.nodeConfig?.type;
  const edgeType = pedigree.edgeConfig?.type;
  const relationshipVariable = pedigree.edgeConfig?.relationshipTypeVariable;
  if (nodeType === undefined || edgeType === undefined) return false;

  if (pairsPedigreePopulation(candidate, nodeType, edgeType)) return true;

  if (
    candidate.type === 'NetworkComposer' &&
    getSubjectType(candidate.subject, 'node') === nodeType &&
    candidate.edges?.some((edge) => edge.subject?.type === edgeType) === true
  ) {
    return true;
  }

  if (
    candidate.type === 'AlterEdgeForm' &&
    relationshipVariable !== undefined &&
    getSubjectType(candidate.subject, 'edge') === edgeType &&
    candidate.form?.fields.some(
      (field) => field.variable === relationshipVariable,
    )
  ) {
    return true;
  }

  return (
    candidate.type === 'FamilyPedigree' &&
    candidate.nodeConfig?.type === nodeType &&
    candidate.edgeConfig?.type === edgeType &&
    !compatibleContributorPedigree(candidate, pedigree)
  );
}

/** Maximum ancestry a required boundary may add above inherited co-parents. */
export function inheritedContributorAncestryCeiling(
  stageIndex: number,
  stages: readonly Stage[],
  preexistingNodeCeiling = 0,
  options?: ResolvedFamilyPedigreeGenerationOptions,
): { nodes: number; edges: number } {
  const stage = stages[stageIndex];
  if (
    stage?.type !== 'FamilyPedigree' ||
    stage.boundaries?.requireChildrenContributors !== 'required'
  ) {
    return { nodes: 0, edges: 0 };
  }

  let incompleteContributorBranches = 0;
  let completedContributorIndex = -1;
  let firstContributorIndex = -1;
  for (const [candidateIndex, candidate] of stages
    .slice(0, stageIndex)
    .entries()) {
    if (
      candidate.type !== 'FamilyPedigree' ||
      !compatibleContributorPedigree(candidate, stage)
    ) {
      continue;
    }
    if (firstContributorIndex < 0) firstContributorIndex = candidateIndex;
    if (candidate.boundaries?.requireChildrenContributors === 'required') {
      // This stage completed every older inherited branch and its own new one.
      incompleteContributorBranches = 0;
      completedContributorIndex = candidateIndex;
    } else {
      // Each generated pedigree can introduce at most one co-parent branch.
      if (options === undefined || canPlanEgoChildBranch(options)) {
        incompleteContributorBranches += 1;
      }
    }
  }

  const contributorGraphStartIndex = Math.max(
    completedContributorIndex,
    firstContributorIndex,
  );
  const hasExternalContributorEdges =
    preexistingNodeCeiling > 0 &&
    contributorGraphStartIndex >= 0 &&
    stages
      .slice(contributorGraphStartIndex + 1, stageIndex)
      .some((candidate) => canReshapeContributorGraph(candidate, stage));

  if (hasExternalContributorEdges) {
    // Other graph-writing stages can connect the inherited ego to any existing
    // same-typed person, rewrite family edges as genetic relationships, and
    // give every resulting co-parent existing genetic parents of their own.
    // The materializer deduplicates each ancestry target, so at most 8N nodes
    // and 12N edges complete all targets for N existing people. Keep the
    // ordinary one-branch-per-pedigree bound when no such stage intervenes; it
    // is much tighter for the common repeated-pedigree case.
    return {
      nodes: Math.max(
        incompleteContributorBranches * CONTRIBUTOR_ANCESTRY_NODE_CEILING,
        preexistingNodeCeiling * EXTERNAL_CONTRIBUTOR_NODE_MULTIPLIER,
      ),
      edges: Math.max(
        incompleteContributorBranches * CONTRIBUTOR_ANCESTRY_EDGE_CEILING,
        preexistingNodeCeiling * EXTERNAL_CONTRIBUTOR_EDGE_MULTIPLIER,
      ),
    };
  }

  return {
    nodes: incompleteContributorBranches * CONTRIBUTOR_ANCESTRY_NODE_CEILING,
    edges: incompleteContributorBranches * CONTRIBUTOR_ANCESTRY_EDGE_CEILING,
  };
}

function minimumScenarioNodeFloor(
  options: ResolvedFamilyPedigreeGenerationOptions,
): number {
  switch (options.scenario) {
    case 'none':
      return 7;
    case 'donorConception':
    case 'surrogacy':
      return 8;
    case 'adoption':
      return 9;
    case 'population': {
      const { adoption, donorConception, surrogacy } =
        options.population.scenarios;
      const scenarioFloors: number[] = [];
      let probabilityBefore = 0;
      for (const [probability, floor] of [
        [adoption, 9],
        [donorConception, 8],
        [surrogacy, 8],
      ] as const) {
        const reachableProbability = Number.isNaN(probability)
          ? 0
          : Math.max(0, probability);
        if (probabilityBefore < 1 && reachableProbability > 0) {
          scenarioFloors.push(floor);
        }
        probabilityBefore += reachableProbability;
      }
      if (probabilityBefore < 1) scenarioFloors.push(7);
      return Math.min(...scenarioFloors);
    }
  }
}

/** Whether any resolved plan can fit a partner and at least one ego child. */
function canPlanEgoChildBranch(
  options: ResolvedFamilyPedigreeGenerationOptions,
): boolean {
  const canSampleChild = options.population.completedFamilySize.some(
    ({ value, weight }) => weight > 0 && Math.round(value) > 0,
  );
  return (
    canSampleChild && options.maxNodes >= minimumScenarioNodeFloor(options) + 2
  );
}

function inheritedEgoSexCanBeIndependent({
  stage,
  stages,
}: PedigreeCeilingContext): boolean {
  const nodeType = stage.nodeConfig?.type;
  const egoVariable = stage.nodeConfig?.egoVariable;
  const biologicalSexVariable = stage.nodeConfig?.biologicalSexVariable;
  if (
    nodeType === undefined ||
    egoVariable === undefined ||
    biologicalSexVariable === undefined
  ) {
    return false;
  }

  const stageIndex = stages.indexOf(stage);
  return stages
    .slice(0, stageIndex)
    .some(
      (candidate) =>
        candidate.type === 'FamilyPedigree' &&
        candidate.nodeConfig?.type === nodeType &&
        candidate.nodeConfig?.egoVariable === egoVariable &&
        candidate.nodeConfig?.biologicalSexVariable !== biologicalSexVariable,
    );
}

function requiredPedigreeNodeFloor(context: PedigreeCeilingContext): number {
  const { options, stage, stages } = context;
  const scenarioFloor = (() => {
    switch (options.scenario) {
      case 'none':
        return 7;
      case 'donorConception':
      case 'surrogacy':
        return 8;
      case 'adoption':
        return 9;
      case 'population': {
        const { adoption, donorConception, surrogacy } =
          options.population.scenarios;
        return Math.max(
          7,
          adoption > 0 ? 9 : 0,
          donorConception > 0 ? 8 : 0,
          surrogacy > 0 ? 8 : 0,
        );
      }
    }
  })();
  const requiresMaleSibling =
    options.diseaseMode === 'visualization' &&
    (options.population.femaleAtBirthProbability > 0 ||
      inheritedEgoSexCanBeIndependent(context)) &&
    stages.some(
      (candidate) =>
        candidate.type === 'NarrativePedigree' &&
        candidate.sourceStageId === stage.id &&
        candidate.diseases.some(
          (disease) => disease.inheritancePattern === 'xLinkedRecessive',
        ),
    );

  return scenarioFloor + (requiresMaleSibling ? 1 : 0);
}

export function pedigreeNodeCeiling(
  config: GenerationConfig,
  context?: PedigreeCeilingContext,
): number {
  const { min, max } = config.familyPedigreeNodeCount;
  // Without resolved options retain the conservative all-scenarios bound used
  // by direct callers. Generation supplies the context, allowing forced modes
  // to use their actual required floor rather than rejecting value spaces for
  // people that scenario can never create.
  const requiredFloor = context ? requiredPedigreeNodeFloor(context) : 10;
  return Math.max(max, min, requiredFloor);
}

/** Conservative upper bound for parentage, partner, and scenario edges. */
export function pedigreeEdgeCeiling(
  config: GenerationConfig,
  context?: PedigreeCeilingContext,
): number {
  const nodes = pedigreeNodeCeiling(config, context);
  return Math.min((nodes * (nodes - 1)) / 2, nodes * 3);
}

/** Every fixed value the isolated materializer may put on a pedigree edge. */
export function pedigreePossibleEdgeValues(
  edgeConfig: Partial<StageOfType<'FamilyPedigree'>['edgeConfig']>,
): [string, VariableValue][] {
  const values: [string, VariableValue][] = [];
  const relationshipTypeVariable = edgeConfig.relationshipTypeVariable;
  if (relationshipTypeVariable) {
    values.push(
      ...RELATIONSHIP_TYPES.map(
        (value) =>
          [relationshipTypeVariable, [value]] as [string, VariableValue],
      ),
    );
  }
  if (edgeConfig.isActiveVariable) {
    values.push([edgeConfig.isActiveVariable, true]);
  }
  if (edgeConfig.isGestationalCarrierVariable) {
    values.push([edgeConfig.isGestationalCarrierVariable, true]);
  }
  const gameteRoleVariable = edgeConfig.gameteRoleVariable;
  if (gameteRoleVariable) {
    values.push(
      ...GAMETE_ROLES.map(
        (value) => [gameteRoleVariable, [value]] as [string, VariableValue],
      ),
    );
  }
  return values;
}

/**
 * The last stage index naming an attribute of each edge type, per variable id.
 *
 * FamilyPedigree builds edges holding only its configured pedigree semantics,
 * so an edge carries any other value only where a further stage writes one
 * onto an edge it did not create.
 * `handleAlterEdgeForm` is that stage today: it walks every existing
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
 * Wide, but not indiscriminate: a reference is a naming site only where it
 * resolves an edge SUBJECT, which is the schema's own account of whose value
 * the reference is. A filter rule's `attribute` resolves none — the collector
 * answers `undefined` for `subject: 'filterRule'` — so an AlterEdgeForm
 * filtering on `verified` while rendering only `note` leaves `verified`
 * unnamed, exactly as `collectReferencedScopes` leaves an ego filter rule out:
 * a filter rule reads a value, it does not write one. That distinction is
 * load-bearing in both directions now. A reader counted as a writer would put
 * every pedigree edge in a `unique` variable's tally and refuse a protocol
 * whose edges hold no such value, and would keep the variable's declared rules
 * analysed where {@link unwrittenEdgeVariables} should have exempted them.
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
 *
 * A FamilyPedigree's own edge config is recorded at the pedigree's index: the
 * stage writes those semantics on the applicable edges it creates there.
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
 * configured maximum pedigree size plus any ancestry a later required boundary
 * must add above inherited co-parents. For edges, DyadCensus, TieStrengthCensus,
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
 * `unique` constraint spans the whole run, except that compatible pedigrees
 * after the first reuse its ego and therefore add one fewer node.
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
 * against it, and an edge born without a value for that variable spends none of
 * that space, as do two roster rows carrying one value between them. Both are
 * settled per variable
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
 *
 * `nodeConstraints` is what tells a row the run could draw from one it could
 * not: a row whose own values the type's rules already reject builds no node on
 * any seed, so counting it claims people, pairs and value spends that nothing
 * reaches — see {@link drawableRosterRows}. It is asked only of the node types
 * a roster stage draws people of, and omitting it counts every row, in the same
 * direction as omitting `externalData`.
 */
export function worstCaseEntityCounts(
  stages: Stage[],
  config: GenerationConfig,
  externalData?: Record<string, NcNode[]>,
  nodeConstraints?: NodeConstraintsFor,
  familyPedigree?: ResolvedFamilyPedigreeGenerationOptions,
): WorstCaseCounts {
  const base = new Map<string, number>();
  const pedigree = new Map<string, PedigreeEdges[]>();
  const node: NodeCounts = new Map();
  const nodeBeforeStage = new Map<number, Map<string, number>>();
  const pedigreeEgoVariables = new Map<string, Set<string>>();

  // `completionCheckFor` resolves a whole type's generation order and solves
  // its tractable components, so a type's judge is built once rather than once
  // per roster stage reading it.
  const judges = new Map<string, RowJudge | undefined>();
  /**
   * A roster stage's drawable rows, keeping `externalData`'s three-way meaning:
   * `undefined` is a stage with no roster entry, which fabricates.
   */
  const drawableRosterPool = (
    stage: StageOfType<'NameGeneratorRoster'>,
    nodeType: string,
    pool: NcNode[] | undefined,
  ): NcNode[] | undefined => {
    if (pool === undefined || nodeConstraints === undefined) return pool;

    let judge = judges.get(nodeType);
    if (judge === undefined && !judges.has(nodeType)) {
      const constraints = nodeConstraints(nodeType);
      judge =
        constraints === undefined
          ? undefined
          : { constraints, canComplete: completionCheckFor(constraints) };
      judges.set(nodeType, judge);
    }
    if (judge === undefined) return pool;

    return drawableRosterRows(
      stage,
      pool,
      judge.constraints,
      judge.canComplete,
    );
  };

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
    nodeBeforeStage.set(
      stageIndex,
      new Map(
        [...node.entries()].map(([type, tally]) => [type, nodeTotal(tally)]),
      ),
    );

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
      // stage may fabricate, so a roster it also draws from lowers nothing. Of
      // those rows, only the ones the rules admit bound it — a pool none of
      // them can be drawn from ends the stage exactly as an exhausted one does.
      const pool =
        stage.type === 'NameGeneratorRoster'
          ? drawableRosterPool(stage, nodeType, externalData?.[stage.id])
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
            born: 'whole',
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
      // The materializer returns before building anything when no node type is
      // configured (possible in deliberately partial unit-test fixtures).
      const nodeType = stage.nodeConfig?.type;
      if (nodeType === undefined) continue;

      const pedigreeContext = familyPedigree
        ? { options: familyPedigree, stage, stages }
        : undefined;
      const egoVariable = stage.nodeConfig?.egoVariable;
      const knownEgoVariables = pedigreeEgoVariables.get(nodeType);
      const reusesEgo =
        egoVariable !== undefined &&
        knownEgoVariables?.has(egoVariable) === true;
      const tally = tallyFor(node, nodeType);
      const inheritedContributorCeiling = inheritedContributorAncestryCeiling(
        stageIndex,
        stages,
        nodeTotal(tally),
        familyPedigree,
      );
      tally.fabricated +=
        Math.max(
          pedigreeNodeCeiling(config, pedigreeContext) - (reusesEgo ? 1 : 0),
          0,
        ) + inheritedContributorCeiling.nodes;
      if (egoVariable !== undefined) {
        const variables = knownEgoVariables ?? new Set<string>();
        variables.add(egoVariable);
        pedigreeEgoVariables.set(nodeType, variables);
      }

      const edgeType = stage.edgeConfig?.type;
      // Tallied apart from the rest because these edges start holding only what
      // the pedigree writes, and only the variables some stage names ever stop
      // being undefined — see {@link edgeCountFor}, which decides that per
      // variable.
      if (edgeType !== undefined) {
        ownNodeEdges.push({
          edgeType,
          nodeType,
          count:
            pedigreeEdgeCeiling(config, pedigreeContext) +
            inheritedContributorCeiling.edges,
          stageIndex,
          born: 'partial',
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
    // A pedigree's edges are a subset of its own people's unordered pairs: its
    // semantic builder de-duplicates partner links and never assigns two
    // relationship roles to the same pair. If that changes, this fold must be
    // removed so the count cannot understate parallel edges.
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
    // its edges join the count for every variable; a pedigree's hold only what
    // the pedigree itself writes, and are kept apart for {@link edgeCountFor}
    // to settle per variable.
    if (born === 'whole') {
      add(base, edgeType, count);
      continue;
    }

    const forType = pedigree.get(edgeType) ?? [];
    forType.push({ count, stageIndex });
    pedigree.set(edgeType, forType);
  }

  return {
    node,
    edge: { base, pedigree, named: namedEdgeAttributes(stages) },
    nodeBeforeStage,
  };
}
