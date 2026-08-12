import { filter as getFilter } from '@codaco/network-query';
import { MAX_SYNTHETIC_POPULATION } from '@codaco/protocol-validation';
import type {
  EdgeTopology,
  StructuralCodebook,
  Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNetwork,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import {
  attributesAsOf,
  type EdgeCreation,
  isRewrittenAfter,
  populationWrittenVariables,
  type NodeCreation,
  scopeKeyFor,
  type StageEffects,
  writtenVariables,
} from '../analyse/stageEffects';
import {
  claimFixedValues,
  constraintsFor,
  generateAttributesForEntity,
  reserveFixedValues,
  rosterRowIsDrawable,
  unreserveFixedValues,
} from '../attributes';
import { resolveGenerationOrder } from '../constraints/dependencyOrder';
import { SyntheticDataConstraintError } from '../constraints/error';
import { completionCheckFor } from '../constraints/generateEntityAttributes';
import type { EntityConstraints } from '../constraints/types';
import type { GenerationContext } from '../context';
import { ruleBrokenByFixedValues } from '../nodes';
import { sampleContinuous, sampleCount } from './distributions';
import { deterministicUuid, type RandomSource } from './random';
import {
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_NODE_COUNT,
  resolveVariableSynthetic,
} from './resolveSynthetic';

/**
 * The plan phase: the target network as it stands when the synthetic
 * interview ends. Populations come from codebook counts, values from resolved
 * distributions (through the constraint machinery), edges from topology
 * targets over the eligible pair domain, and missingness from declared
 * probabilities. The schedule/materialize phases replay this plan through the
 * stage sequence; nothing here consults stage order beyond capacity and
 * domain facts the analysis extracted.
 */

export type PlannedNode = {
  uid: string;
  type: string;
  creationStageIndex: number;
  /** Prompt index under the creating stage (promptIDs, additionalAttributes). */
  promptIndex: number;
  source: NodeCreation['source'];
  /** The roster row this node was drawn from, when source is 'roster'. */
  rosterRow?: NcNode;
  /** Latent final attributes: every variable a stage writes on this entity. */
  attributes: Record<string, VariableValue>;
  /**
   * What the creating interaction writes, before any later stage overwrites
   * it. Equal to the final value except where a later stage rewrites the
   * variable, where this is the intermediate the participant first sees.
   */
  fixedAtCreation: Record<string, VariableValue>;
  /** Variables whose final state is "unanswered" (stored as null). */
  missing: Set<string>;
};

export type PlannedEdge = {
  uid: string;
  type: string;
  from: string;
  to: string;
  creationStageIndex: number;
  attributes: Record<string, VariableValue>;
  fixedAtCreation: Record<string, VariableValue>;
  missing: Set<string>;
};

export type EdgeTopologyTarget = {
  metric: EdgeTopology['metric'];
  value: number;
};

/**
 * Declared populations trimmed to what a synchronous preview can build.
 *
 * A stage minimum is a FLOOR the planner has to honour, and `behaviours
 * .minNodes` is unbounded in the stage schema — so a schema-valid minimum of a
 * billion would make `planNetwork` iterate a billion times on Architect's main
 * thread. `syntheticCountCeiling` already bounds what a declared count can ask
 * for at validation time; this is the floor's equivalent, and it bounds the
 * SUM as well, since several stages each at the cap reach the same place by
 * another route.
 *
 * Clamped rather than refused: `minNodes` is an interview constraint rather
 * than a synthetic declaration, so a protocol carrying a large one is not
 * wrong — its preview simply cannot render that many people. Trimmed from the
 * last stage back, so the earliest stages keep the people they asked for.
 */
function withinPopulationCeiling(assigned: number[]): number[] {
  const capped = assigned.map((count) =>
    Math.min(count, MAX_SYNTHETIC_POPULATION),
  );
  let total = capped.reduce((sum, count) => sum + count, 0);
  for (
    let index = capped.length - 1;
    index >= 0 && total > MAX_SYNTHETIC_POPULATION;
    index--
  ) {
    const current = capped[index]!;
    const drop = Math.min(current, total - MAX_SYNTHETIC_POPULATION);
    capped[index] = current - drop;
    total -= drop;
  }
  return capped;
}

/**
 * Key under which one creation's topology target is stored and looked up.
 *
 * Topology is declared by the stage, so a target belongs to a (stage, edge
 * type) pair rather than to the type: two stages may create the same edge type
 * at different densities, and a stage whose prompts create several types
 * applies its declared topology to each of them separately.
 */
export function topologyKey(creation: {
  stageId: string;
  edgeType: string;
}): string {
  // Length-prefixed, like `pairKey`'s endpoints, rather than joined on a
  // separator. Stage ids and edge types are arbitrary strings, so no character
  // is safe to join on: a space made ('a', 'b c') and ('a b', 'c') read alike.
  // Prefixing each part with its own length is injective over every string.
  return `${creation.stageId.length}:${creation.stageId}${creation.edgeType}`;
}

export type NetworkPlan = {
  ego: {
    uid: string;
    attributes: Record<string, VariableValue>;
    fixedAtCreation: Record<string, VariableValue>;
    missing: Set<string>;
  };
  nodes: PlannedNode[];
  edges: PlannedEdge[];
  /**
   * The topology each edge-creating stage was drawn to, keyed by
   * {@link topologyKey}.
   *
   * Kept because the plan's pair domain is not always the whole story: a
   * FamilyPedigree's people are built by the specialist generator during the
   * session walk, so a census or sociogram over them has no domain to plan
   * against here. The walk applies that stage's own target to those pairs,
   * which is why the metric is drawn even where the planned domain is empty.
   */
  topologyTargets: Map<string, EdgeTopologyTarget>;
};

/**
 * How many of a pair domain a topology target links. Shared by the plan and
 * the walk so the two cannot read one declared topology differently.
 */
export function topologyTarget(
  target: EdgeTopologyTarget,
  pairCount: number,
  nodeCount: number,
): number {
  return Math.min(
    pairCount,
    Math.round(
      target.metric === 'density'
        ? target.value * pairCount
        : (target.value * nodeCount) / 2,
    ),
  );
}

type VariablesRecord = Record<string, Variable>;

const variablesOf = (
  definition: { variables?: VariablesRecord } | undefined,
): VariablesRecord => (definition?.variables ?? {}) as VariablesRecord;

/** An entity scope's variables, empty where the scope declares none. */
const EMPTY_PROBABILITIES: ReadonlyMap<string, number> = new Map();
const EMPTY_REQUIRED: ReadonlySet<string> = new Set();

export const missingProbabilitiesFor = (
  probabilities: ReadonlyMap<string, ReadonlyMap<string, number>>,
  scope: string,
): ReadonlyMap<string, number> =>
  probabilities.get(scope) ?? EMPTY_PROBABILITIES;

export const requiredVariablesFor = (
  required: ReadonlyMap<string, ReadonlySet<string>>,
  scope: string,
): ReadonlySet<string> => required.get(scope) ?? EMPTY_REQUIRED;

/**
 * Missing probabilities, per entity scope and then per variable.
 *
 * Scoped rather than flat because a codebook may use one variable key in two
 * places — the same name under two node types, or on a node and on ego — and
 * those are separate definitions. Flattened, a probability declared in one
 * scope was applied to every variable sharing its key, so a variable declaring
 * no missingness at all came back null on every entity.
 */
export function missingProbabilities(
  codebook: StructuralCodebook,
): Map<string, Map<string, number>> {
  const probabilities = new Map<string, Map<string, number>>();
  const collect = (scope: string, variables: VariablesRecord) => {
    for (const [id, variable] of Object.entries(variables)) {
      const resolved = resolveVariableSynthetic(variable);
      if (resolved.kind === 'stageOwned') continue;
      if (resolved.missingProbability > 0) {
        const forScope = probabilities.get(scope) ?? new Map<string, number>();
        forScope.set(id, resolved.missingProbability);
        probabilities.set(scope, forScope);
      }
    }
  };
  for (const [type, definition] of Object.entries(codebook.node ?? {})) {
    collect(scopeKeyFor('node', type), variablesOf(definition));
  }
  for (const [type, definition] of Object.entries(codebook.edge ?? {})) {
    collect(scopeKeyFor('edge', type), variablesOf(definition));
  }
  collect(scopeKeyFor('ego'), variablesOf(codebook.ego));
  return probabilities;
}

/**
 * Variable ids the codebook marks required, per entity scope. Scoped for the
 * same reason as {@link missingProbabilities}: flattened, a required
 * definition in any scope suppressed missingness for every variable sharing
 * its key.
 */
export function requiredVariables(
  codebook: StructuralCodebook,
): Map<string, Set<string>> {
  const required = new Map<string, Set<string>>();
  const collect = (scope: string, variables: VariablesRecord) => {
    for (const [id, variable] of Object.entries(variables)) {
      // Not every branch of the variable union carries `validation` — a layout
      // or location variable has none to declare.
      if ('validation' in variable && variable.validation?.required === true) {
        const forScope = required.get(scope) ?? new Set<string>();
        forScope.add(id);
        required.set(scope, forScope);
      }
    }
  };
  for (const [type, definition] of Object.entries(codebook.node ?? {})) {
    collect(scopeKeyFor('node', type), variablesOf(definition));
  }
  for (const [type, definition] of Object.entries(codebook.edge ?? {})) {
    collect(scopeKeyFor('edge', type), variablesOf(definition));
  }
  collect(scopeKeyFor('ego'), variablesOf(codebook.ego));
  return required;
}

/**
 * The chance a `sameAs` group goes unanswered: the largest probability any
 * member declares, because a variable cannot be answered while the value it is
 * declared equal to is not.
 *
 * A required member takes the whole group to zero. `resolveVariableSynthetic`
 * already refuses a probability on a required variable, and the schema rejects
 * one, but both judge a variable alone — neither sees that an optional variable
 * is tied to a required one. Left unguarded the maximum would carry the
 * optional member's probability onto its required sibling and empty a field
 * the runtime's own validator insists on.
 */
export function groupMissingProbability(
  members: readonly string[],
  probabilities: ReadonlyMap<string, number>,
  required: ReadonlySet<string>,
): number {
  if (members.some((id) => required.has(id))) return 0;
  return Math.max(...members.map((id) => probabilities.get(id) ?? 0));
}

/**
 * The variable groups a missingness decision is taken over: the `sameAs`
 * equality classes, resolved exactly as the draw itself resolves them.
 */
export const equalityGroups = (constraints: EntityConstraints): string[][] => [
  ...resolveGenerationOrder(constraints).membersOf.values(),
];

/**
 * Nulls non-fixed attributes according to their missing probability, each
 * decision drawn from the group's own missingness stream.
 *
 * The decision is taken per `sameAs` group rather than per variable, because
 * such a group is one answer: the draw gives its members a single shared
 * value, and the runtime's `sameAs` validator compares them. Leaving one
 * member null beside a populated sibling would emit a completed session that
 * no participant could have submitted. Where members declare different
 * probabilities the largest wins — a variable cannot be answered while the
 * value it is declared equal to is not.
 */
function applyMissingness(
  attributes: Record<string, VariableValue>,
  fixedKeys: ReadonlySet<string>,
  probabilities: ReadonlyMap<string, number>,
  required: ReadonlySet<string>,
  groups: readonly string[][],
  source: RandomSource,
  /** The entity scope, so two scopes sharing a key do not share a stream. */
  scope: string,
): Set<string> {
  const missing = new Set<string>();
  for (const members of groups) {
    const probability = groupMissingProbability(
      members,
      probabilities,
      required,
    );
    if (probability <= 0) continue;
    // A value the creating interaction settled stands: missingness describes a
    // question the participant left unanswered, and a fixed value was never
    // asked. One fixed member settles the whole group's shared value.
    if (members.some((id) => fixedKeys.has(id))) continue;
    const present = members.filter((id) => id in attributes);
    if (present.length === 0) continue;
    // Keyed by the sorted membership so a group's decision does not depend on
    // whichever member the codebook happens to list first, and by the scope so
    // that one variable key used under two entity types addresses two streams
    // rather than one shared one.
    const key = members.toSorted().join('\u0000');
    if (!source.stream('missing', scope, key).bool(probability)) continue;
    for (const id of present) {
      attributes[id] = null;
      missing.add(id);
    }
  }
  return missing;
}

/**
 * The planned network as the session holds it when `asOf` runs.
 *
 * Entities are cut to those that exist by then, and their attributes to those
 * some stage has written by then. The plan settles final values up front, so
 * showing a filter the whole of them would answer with the end of the
 * interview rather than its middle: a stage filtering on a variable only a
 * later form writes would admit subjects on a value it could not yet have
 * collected, and plan edges the interview never presents.
 */
function plannedNetwork(
  egoUid: string,
  egoAttributes: Record<string, VariableValue>,
  nodes: PlannedNode[],
  edges: readonly PlannedEdge[],
  effects: StageEffects,
  asOf: number,
): NcNetwork {
  return {
    ego: {
      [entityPrimaryKeyProperty]: egoUid,
      // Projected like every other entity. Left empty, a stage filtering on an
      // ego variable an earlier EgoForm writes saw a participant who had
      // answered nothing: a `consent === true` filter planned no pairs at all,
      // and the walk-time fallback skips pairs whose endpoints are both
      // planned, so the declared topology was never recovered and the census
      // came back all negatives. The inverse predicate plans edges for a
      // domain the real stage excludes.
      [entityAttributesProperty]: attributesAsOf(
        effects,
        scopeKeyFor('ego'),
        egoAttributes,
        asOf,
      ),
    } as NcNetwork['ego'],
    nodes: nodes.map((node) => ({
      [entityPrimaryKeyProperty]: node.uid,
      type: node.type,
      [entityAttributesProperty]: attributesAsOf(
        effects,
        scopeKeyFor('node', node.type),
        node.attributes,
        asOf,
        node.fixedAtCreation,
      ),
    })) as NcNode[],
    edges: edges.map((edge) => ({
      [entityPrimaryKeyProperty]: edge.uid,
      type: edge.type,
      from: edge.from,
      to: edge.to,
      [entityAttributesProperty]: attributesAsOf(
        effects,
        scopeKeyFor('edge', edge.type),
        edge.attributes,
        asOf,
        edge.fixedAtCreation,
      ),
    })) as NcEdge[],
  };
}

/** Unordered pair key; self-pairs are never eligible. */
/**
 * An unordered pair as one key.
 *
 * Length-prefixed rather than delimited. An `_uid` is an arbitrary string —
 * roster rows keep whatever ids the caller's external data carried, and
 * `BaseNcEntitySchema` permits every string — so no character is safe to join
 * on: a space made `('a', 'b c')` and `('a b', 'c')` read alike, and a NUL
 * only moves the problem to ids that contain one, which JSON can encode.
 * Prefixing each endpoint with its own length is injective over every string,
 * so the domain cannot silently lose a pair and a census answer cannot be
 * attributed to the wrong one.
 */
const encodeUid = (uid: string): string => `${uid.length}:${uid}`;

const pairKey = (a: string, b: string): string =>
  a < b ? `${encodeUid(a)}${encodeUid(b)}` : `${encodeUid(b)}${encodeUid(a)}`;

/**
 * Separates the values a creating interaction writes into those that survive
 * to the end of the interview and those a later stage overwrites.
 *
 * A prompt's `additionalAttributes`, a roster row's data and a pedigree's
 * fixed edge values are all written by the interaction that creates the
 * entity. Where no later stage writes the same variable that value IS the
 * entity's final state, and the draw must work around it. Where a later stage
 * does write it — an AlterEdgeForm over a pedigree's relationship type, say —
 * the fixed value is only the intermediate the participant first sees, and
 * the final value is drawn freely so the last writer lands it. Feasibility
 * models exactly this when it declines to count a pin a later stage redraws.
 */
function splitFixedValues(
  fixed: Record<string, VariableValue>,
  effects: StageEffects,
  scope: string,
  stageIndex: number,
  alwaysFinal?: ReadonlySet<string>,
): {
  fixedFinal: Record<string, VariableValue>;
  fixedAtCreation: Record<string, VariableValue>;
} {
  const fixedFinal: Record<string, VariableValue> = {};
  for (const [variableId, value] of Object.entries(fixed)) {
    if (
      alwaysFinal?.has(variableId) === true ||
      !isRewrittenAfter(effects, scope, variableId, stageIndex)
    ) {
      fixedFinal[variableId] = value;
    }
  }
  return { fixedFinal, fixedAtCreation: fixed };
}

/**
 * The variables an entity's draw produces: those some stage writes, less
 * those already fixed to their final value.
 *
 * Narrowing to written variables keeps the plan to what an interview can
 * actually answer. A variable no stage writes is never asked, so drawing one
 * would claim a `unique` value the network never holds — and feasibility,
 * which exempts unwritten variables from its counting, would accept protocols
 * whose plan then ran out of values.
 */
/**
 * The variables of an entity whose value is certainly unanswered.
 *
 * Drawing one and then nulling it is not merely wasted work: a `unique` draw
 * CLAIMS its value from the run's registry, so a variable declared missing on
 * every entity could exhaust a small value space and fail a session whose
 * final state holds no values at all. The runtime's own `unique` validator
 * exempts empty values, so those nulls were never in tension with it.
 *
 * The conditions are `applyMissingness`'s own, so the two cannot disagree
 * about which groups these are: no required member, no member whose value an
 * interaction settles, and a group probability of exactly 1. Anything less
 * than certain still has to be drawn — the value is needed whenever the
 * decision comes back false.
 */
function certainlyMissingVariables(
  groups: readonly string[][],
  probabilities: ReadonlyMap<string, number>,
  required: ReadonlySet<string>,
  fixedKeys: ReadonlySet<string>,
): Set<string> {
  const certain = new Set<string>();
  for (const members of groups) {
    if (members.some((id) => fixedKeys.has(id))) continue;
    if (groupMissingProbability(members, probabilities, required) !== 1) {
      continue;
    }
    for (const id of members) certain.add(id);
  }
  return certain;
}

const drawableVariables = (
  written: ReadonlySet<string>,
  fixedFinal: Record<string, VariableValue>,
): Set<string> =>
  new Set([...written].filter((variableId) => !(variableId in fixedFinal)));

/**
 * Whether a roster row can be built into a node, judged by the assignment the
 * node would actually be written with.
 *
 * Three halves, all of which feasibility already applies when it counts which
 * rows a roster can contribute: the registry (no `unique` value the network
 * has issued), the row's own plausibility (its values break no rule of their
 * own and none between them), and completability (what it fixes still leaves
 * the rest of the entity's draw a solution). Judging only the registry would
 * draw rows whose finished node contradicts the protocol's own validation,
 * and would disagree with the counting that decided the protocol was
 * generatable at all.
 *
 * Built once per node type: `completionCheckFor` resolves a whole type's
 * generation order and solves its tractable components, which is far too much
 * work to repeat for every row.
 */
function rowJudgeFor(
  ctx: GenerationContext,
  ref: { entity: 'node'; type: string },
): (fixed: Record<string, VariableValue>) => boolean {
  const constraints = constraintsFor(ctx, ref);
  const canComplete = completionCheckFor(constraints);
  return (fixed) =>
    rosterRowIsDrawable(ctx, ref, fixed) &&
    ruleBrokenByFixedValues(constraints, fixed) === undefined &&
    canComplete(fixed);
}

type EligiblePair = { a: string; b: string; firstStageIndex: number };

/**
 * The unordered subject-node pairs ONE creating stage can reach, respecting
 * own-nodes-only restrictions and (when enabled) its filter. Each pair
 * remembers this stage, which is where a planned edge on it materialises.
 *
 * A stage can only link nodes that exist by the time it runs, so a creation
 * sees the population as of its own point in the interview. Pairing across the
 * whole final network instead would plan edges onto endpoints a later stage
 * has yet to introduce — an anachronistic session, and a domain wider than the
 * stage-time populations feasibility counts, so protocols it accepted could
 * exhaust their values mid-plan.
 *
 * The same stage-time cut applies to `visibleEdges`. A filter rule of type
 * `edge` selects the nodes an edge of that type touches, so judging it against
 * an edgeless shadow answers about a network the interview never has: `EXISTS`
 * admits nobody and plans no edges at all, and `NOT_EXISTS` admits everybody
 * including the very nodes it is meant to exclude. The caller passes both the
 * edges of types settled earlier and the ones already committed for this type,
 * so a stage filtering on the type it creates sees what its predecessors made.
 *
 * A pedigree's structural links remain invisible: they are built by the
 * specialist generator during the walk, so nothing here can know them.
 */
function eligiblePairsForCreation(
  ctx: GenerationContext,
  creation: EdgeCreation,
  nodes: PlannedNode[],
  egoUid: string,
  egoAttributes: Record<string, VariableValue>,
  visibleEdges: readonly PlannedEdge[],
  effects: StageEffects,
): Map<string, EligiblePair> {
  const pairs = new Map<string, EligiblePair>();

  {
    const existing = nodes.filter(
      (node) => node.creationStageIndex <= creation.stageIndex,
    );
    const network = plannedNetwork(
      egoUid,
      egoAttributes,
      existing,
      visibleEdges.filter(
        (edge) => edge.creationStageIndex <= creation.stageIndex,
      ),
      effects,
      creation.stageIndex,
    );
    let candidates = existing.filter(
      (node) => node.type === creation.subjectNodeType,
    );
    if (creation.ownNodesOnly) {
      candidates = candidates.filter(
        (node) => node.creationStageIndex === creation.stageIndex,
      );
    }
    if (creation.filter && ctx.respectSkipLogicAndFiltering) {
      const filtered = getFilter(creation.filter)(network);
      const kept = new Set(
        filtered.nodes.map((node) => node[entityPrimaryKeyProperty]),
      );
      candidates = candidates.filter((node) => kept.has(node.uid));
    }
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i]!.uid;
        const b = candidates[j]!.uid;
        const key = pairKey(a, b);
        if (!pairs.has(key)) {
          pairs.set(key, { a, b, firstStageIndex: creation.stageIndex });
        }
      }
    }
  }
  return pairs;
}

/** Deterministic in-place Fisher–Yates over a copy, drawn from `stream`. */
export function shuffled<T>(
  values: readonly T[],
  stream: { int(min: number, max: number): number },
): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = stream.int(0, i);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Which rows each roster stage gets first refusal on, and the refusal when a
 * pool cannot cover what its stage was told to add.
 *
 * Most-constrained-first. Served in stage order instead, a wide pool takes
 * rows the only stage that could have used them still needed: pools [a,b,c,d]
 * and [a,b], two people wanted from each, is satisfiable, and stage order
 * fills the first from {a,b} and leaves the second with nothing.
 *
 * A preference is returned only for CONTESTED creations — those sharing at
 * least one row with another. Where a pool is a stage's alone every ordering
 * of it is equivalent, so imposing one would churn seeded output to no end.
 * The shortfall check runs for every roster stage regardless, because a lone
 * stage can outstrip its own pool just as easily.
 */
function assignRosterRows(
  ctx: GenerationContext,
  effects: StageEffects,
  creations: NodeCreation[],
  assigned: number[],
  nodeType: string,
  nodeTypeName: string | undefined,
): Map<number, string[]> {
  /** Distinct rows per roster creation, minus everyone the run already used. */
  const pools = new Map<number, string[]>();
  creations.forEach((creation, index) => {
    // Only a roster interface's pool binds. A name generator's panel is a
    // shortcut for naming someone already known, not a closed list — it can
    // always add someone the panel does not mention — so it is neither
    // assigned rows nor held to the pool's size.
    if (creation.source !== 'roster' || creation.rosterStageId === undefined) {
      return;
    }
    const pool = ctx.externalData?.[creation.rosterStageId];
    if (pool === undefined) return;
    const seen = new Set<string>(ctx.usedRosterUids);
    const distinct: string[] = [];
    for (const row of pool) {
      const uid = row[entityPrimaryKeyProperty];
      if (seen.has(uid)) continue;
      seen.add(uid);
      distinct.push(uid);
    }
    pools.set(index, distinct);
  });
  if (pools.size === 0) return new Map();

  const owners = new Map<string, number[]>();
  for (const [index, uids] of pools) {
    for (const uid of uids) {
      const list = owners.get(uid) ?? [];
      list.push(index);
      owners.set(uid, list);
    }
  }
  const contested = new Set<number>();
  for (const list of owners.values()) {
    if (list.length > 1) for (const index of list) contested.add(index);
  }

  // Each person a stage must place is one SLOT, and each slot may take any
  // unused row from that stage's pool. Assigning greedily — smallest pool
  // first, claiming a prefix — still rejects assignments that exist: with
  // pools A=[1,2], B=[1,3], C=[3,4], D=[1,4] each wanting one person, greedy
  // takes 1, 3 and 4 and reports D empty, though A=2, B=3, C=4, D=1 satisfies
  // every stage. That is bipartite matching, so it is solved as one: each slot
  // walks an augmenting path, which REPAIRS an earlier choice rather than
  // living with it.
  const slots: number[] = [];
  const order = [...pools.keys()].toSorted(
    (left, right) => pools.get(left)!.length - pools.get(right)!.length,
  );
  for (const index of order) {
    const creation = creations[index]!;
    // An UNDECLARED roster stage is only carrying the generic 1-8 fallback,
    // which says nothing about this roster: the real Development Protocol has
    // six classmates and a stage the default would have asked eight of. Cap it
    // at what the pool could offer, and reserve the refusal for a count the
    // author actually wrote.
    if (!creation.countDeclared) {
      assigned[index] = Math.min(
        assigned[index] ?? 0,
        pools.get(index)!.length,
      );
    }
    for (let taken = 0; taken < (assigned[index] ?? 0); taken++) {
      slots.push(index);
    }
  }

  /** Row currently held by each slot, and the slot holding each row. */
  const rowOfSlot = new Map<number, string>();
  const slotOfRow = new Map<string, number>();

  const augment = (slot: number, visited: Set<string>): boolean => {
    for (const uid of pools.get(slots[slot]!)!) {
      if (visited.has(uid)) continue;
      visited.add(uid);
      const holder = slotOfRow.get(uid);
      if (holder === undefined || augment(holder, visited)) {
        const previous = rowOfSlot.get(slot);
        if (previous !== undefined) slotOfRow.delete(previous);
        rowOfSlot.set(slot, uid);
        slotOfRow.set(uid, slot);
        return true;
      }
    }
    return false;
  };

  const unmatched = new Map<number, number>();
  slots.forEach((creationIndex, slot) => {
    if (!augment(slot, new Set())) {
      unmatched.set(creationIndex, (unmatched.get(creationIndex) ?? 0) + 1);
    }
  });

  for (const [index, short] of unmatched) {
    const creation = creations[index]!;
    const wanted = assigned[index] ?? 0;
    const offered = wanted - short;
    const label =
      effects.stages[creation.stageIndex]?.stage.label ?? creation.stageId;
    throw new SyntheticDataConstraintError(
      [
        {
          entity: 'node',
          entityType: nodeType,
          ...(nodeTypeName === undefined
            ? {}
            : { entityTypeName: nodeTypeName }),
          variableIds: [],
          variableNames: [],
          rules: ['roster size'],
          reason:
            `the roster for "${label}" can supply ${offered} ${offered === 1 ? 'person' : 'people'} ` +
            `no other stage needs more, but that stage is set to add ${wanted}`,
        },
      ],
      'a roster does not hold enough people for the stages drawing from it',
    );
  }

  const preference = new Map<number, string[]>();
  for (const [slot, uid] of rowOfSlot) {
    const index = slots[slot]!;
    if (!contested.has(index)) continue;
    preference.set(index, [...(preference.get(index) ?? []), uid]);
  }

  return preference;
}

export function planNetwork(
  ctx: GenerationContext,
  effects: StageEffects,
): NetworkPlan {
  const source = ctx.valueGen.randomSource;
  const missing = missingProbabilities(ctx.codebook);
  const required = requiredVariables(ctx.codebook);

  // --- Ego -----------------------------------------------------------------
  const egoUid = deterministicUuid(source.stream('id', 'ego'));
  const egoAttributes = generateAttributesForEntity(ctx, { entity: 'ego' }, 0, {
    only: writtenVariables(effects, 'ego'),
  });
  const egoMissing = applyMissingness(
    egoAttributes,
    new Set(),
    missingProbabilitiesFor(missing, scopeKeyFor('ego')),
    requiredVariablesFor(required, scopeKeyFor('ego')),
    equalityGroups(constraintsFor(ctx, { entity: 'ego' })),
    source,
    scopeKeyFor('ego'),
  );

  // --- Node populations ----------------------------------------------------
  const nodes: PlannedNode[] = [];
  const creationsByType = new Map<string, NodeCreation[]>();
  for (const summary of effects.stages) {
    for (const creation of summary.nodeCreations) {
      // A family pedigree builds its own people and links through the
      // specialist generator at materialisation, because a family has to hold
      // together as a structure rather than be sized as a population. The
      // plan leaves its entities alone; the node type's declared count still
      // bounds how large a family may grow.
      if (creation.source === 'pedigree') continue;
      const list = creationsByType.get(creation.nodeType) ?? [];
      list.push(creation);
      creationsByType.set(creation.nodeType, list);
    }
  }

  for (const [type, definition] of Object.entries(ctx.codebook.node ?? {})) {
    const creations = creationsByType.get(type) ?? [];
    if (creations.length === 0) continue;

    // Each creating stage declares its own population, so there is nothing to
    // apportion. A count belongs to the asking rather than the asked-about:
    // three name generators over one node type each nominate their own people,
    // and nothing in the protocol ever said how one declared population would
    // divide between them.
    //
    // What the stage's own behaviours allow still binds — `minNodes` and
    // `maxNodes` are what the interface will actually hold, whatever the
    // author declared beside them.
    const assigned = withinPopulationCeiling(
      creations.map((creation) => {
        const drawn = sampleCount(
          creation.count ?? DEFAULT_NODE_COUNT,
          source.stream('count', creation.stageId, type),
        );
        const { min, max } = creation.capacity;
        return Math.max(min, max === null ? drawn : Math.min(max, drawn));
      }),
    );

    // Roster rows are drawn without replacement across the whole run, so
    // stages over overlapping pools contest the same people. With counts fixed
    // by declaration that is no longer a negotiation over how many each stage
    // gets, only an assignment of which rows go where — and a stage that still
    // cannot be filled is a protocol the researcher needs to hear about.
    const rosterPreference = assignRosterRows(
      ctx,
      effects,
      creations,
      assigned,
      type,
      definition.name,
    );

    const ref = { entity: 'node' as const, type };
    const scope = scopeKeyFor('node', type);
    // What reaches EVERY person of this type. A creation-time write reaches
    // only the people its own creator made, so it is added per creation
    // below: drawing the type's whole union onto every node spends `unique`
    // values on entities the session never writes them to, and can exhaust a
    // space feasibility sized to the one creator that collects it.
    const populationWritten = populationWrittenVariables(
      effects,
      'node',
      type,
      ctx.respectSkipLogicAndFiltering,
    );
    const typeWritten = writtenVariables(
      effects,
      'node',
      type,
      ctx.respectSkipLogicAndFiltering,
    );
    const writtenFor = (creation: NodeCreation): Set<string> =>
      new Set([
        ...populationWritten,
        ...creation.writesAtCreation.filter((id) => typeWritten.has(id)),
      ]);
    const missingGroups = equalityGroups(constraintsFor(ctx, ref));

    // Roster stages draw real rows without replacement across the run. Built
    // before any draw so the values they carry can be held back from it.
    const rosterPools = creations.map((creation, creationIndex) => {
      if (creation.rosterStageId === undefined) return undefined;
      const pool = ctx.externalData?.[creation.rosterStageId];
      if (pool === undefined) return undefined;
      const available = shuffled(
        pool.filter(
          (row) => !ctx.usedRosterUids.has(row[entityPrimaryKeyProperty]),
        ),
        source.stream('roster', creation.rosterStageId),
      );

      const preferred = rosterPreference.get(creationIndex);
      if (preferred === undefined) return available;

      // A preference, not a restriction. The assignment above is blind to
      // whether a row can actually satisfy this type's rules, so holding a
      // stage to its assigned rows alone would starve it of the ones it could
      // have used — a pool of a hundred rows where only ten are completable
      // would hand over ten arbitrary rows and build one person. Ordering
      // leaves every row reachable and only decides who gets first refusal on
      // the contested ones. Sort is stable, so the rest keep their shuffle.
      const rank = new Map(preferred.map((uid, order) => [uid, order]));
      const rankOf = (row: NcNode): number =>
        rank.get(row[entityPrimaryKeyProperty]) ?? Number.MAX_SAFE_INTEGER;
      return [...available].toSorted(
        (left, right) => rankOf(left) - rankOf(right),
      );
    });

    // Hold every value this type will be given from outside the registry, so
    // a free draw at an earlier stage leaves alone what a later prompt fixes
    // or a roster row carries. Each hold is released as it is consumed.
    for (const creation of creations) {
      for (const fixed of creation.promptFixedValues) {
        reserveFixedValues(ctx, ref, fixed);
      }
    }
    for (const pool of rosterPools) {
      for (const row of pool ?? []) {
        reserveFixedValues(ctx, ref, row[entityAttributesProperty]);
      }
    }
    // Only built where rows actually have to be judged: resolving a type's
    // generation order to answer that is expensive.
    const rowIsDrawable = rosterPools.some((pool) => pool !== undefined)
      ? rowJudgeFor(ctx, ref)
      : undefined;

    let typeIndex = 0;
    creations.forEach((creation, creationIndex) => {
      const share = assigned[creationIndex]!;
      if (share === 0) return;
      const promptCount = Math.max(1, creation.promptFixedValues.length);
      const rosterRows = rosterPools[creationIndex];

      for (let i = 0; i < share; i++) {
        const promptIndex = i % promptCount;
        const promptFixed = creation.promptFixedValues[promptIndex] ?? {};

        let rosterRow: NcNode | undefined;
        let fixed: Record<string, VariableValue> = { ...promptFixed };
        if (rosterRows !== undefined) {
          while (rosterRows.length > 0) {
            const candidate = rosterRows.shift()!;
            const rowValues = candidate[entityAttributesProperty];
            // Consumed either way: a row passed over is never drawn, so its
            // hold must not keep constraining the draws that follow.
            unreserveFixedValues(ctx, ref, rowValues);
            // Each stage's pool is taken before any of them draws, so a row
            // two stages share sits in both. One person is never added twice.
            if (ctx.usedRosterUids.has(candidate[entityPrimaryKeyProperty])) {
              continue;
            }
            const merged = creation.rosterValuesWin
              ? { ...promptFixed, ...rowValues }
              : { ...rowValues, ...promptFixed };
            if (rowIsDrawable?.(merged) ?? true) {
              rosterRow = candidate;
              fixed = merged;
              break;
            }
          }
          // A roster stage cannot fabricate. Its share ends when the pool has
          // nothing left to give — including a pool an earlier stage sharing
          // the same roster already emptied, which leaves nothing to loop over
          // here at all.
          if (creation.source === 'roster' && rosterRow === undefined) break;
        }

        const uid = rosterRow
          ? rosterRow[entityPrimaryKeyProperty]
          : deterministicUuid(source.stream('id', 'node', type));
        if (rosterRow) ctx.usedRosterUids.add(uid);

        // A roster row is external data bound to this person: a later form
        // pass displays what the roster already knows rather than asking the
        // participant to invent it again, and a node whose name no longer
        // matches the row it was drawn from is incoherent. So row-settled
        // values stay final even where a later stage writes the variable —
        // unlike a prompt's assertion, which such a stage genuinely re-asks.
        const rowSettled = new Set<string>();
        if (rosterRow) {
          for (const key of Object.keys(rosterRow[entityAttributesProperty])) {
            if (creation.rosterValuesWin || !(key in promptFixed)) {
              rowSettled.add(key);
            }
          }
        }

        const { fixedFinal, fixedAtCreation } = splitFixedValues(
          fixed,
          effects,
          scope,
          creation.stageIndex,
          rowSettled.size > 0 ? rowSettled : undefined,
        );
        const fixedKeys = new Set(Object.keys(fixedFinal));
        const certain = certainlyMissingVariables(
          missingGroups,
          missingProbabilitiesFor(missing, scope),
          requiredVariablesFor(required, scope),
          fixedKeys,
        );
        const written = writtenFor(creation);
        const drawable = drawableVariables(written, fixedFinal);
        for (const id of certain) drawable.delete(id);
        const generated = generateAttributesForEntity(ctx, ref, typeIndex, {
          existing: fixedFinal,
          only: drawable,
        });
        claimFixedValues(ctx, ref, fixedFinal);
        unreserveFixedValues(ctx, ref, promptFixed);
        const attributes = { ...generated, ...fixedFinal };
        // Present but unanswered, so `applyMissingness` still records them as
        // this entity's missing values rather than leaving the key absent.
        for (const id of certain) {
          if (written.has(id)) attributes[id] = null;
        }
        const missingSet = applyMissingness(
          attributes,
          fixedKeys,
          missingProbabilitiesFor(missing, scope),
          requiredVariablesFor(required, scope),
          missingGroups,
          source,
          scope,
        );

        nodes.push({
          uid,
          type,
          creationStageIndex: creation.stageIndex,
          promptIndex,
          source: creation.source,
          ...(rosterRow ? { rosterRow } : {}),
          attributes,
          fixedAtCreation,
          missing: missingSet,
        });
        typeIndex += 1;
      }
    });
  }

  // --- Edges ---------------------------------------------------------------
  //
  // Types are planned in the order their first edge can appear, so one whose
  // edges a later type's filter reads is already in the shadow network by the
  // time that filter runs. This is a planning order only: every type draws
  // from its own keyed streams, and the plan's edges are emitted in codebook
  // order once the walk is done, so no output depends on it.
  const edgeTypes = Object.entries(ctx.codebook.edge ?? {});
  const firstEdgeStage = (type: string): number => {
    const stageIndices = (effects.edgeCreationsByType.get(type) ?? [])
      .filter((creation) => creation.structured === null)
      .map((creation) => creation.stageIndex);
    return stageIndices.length > 0
      ? Math.min(...stageIndices)
      : Number.MAX_SAFE_INTEGER;
  };

  const edgesByType = new Map<string, PlannedEdge[]>();
  const plannedEdges: PlannedEdge[] = [];
  const topologyTargets = new Map<string, EdgeTopologyTarget>();
  for (const [type] of edgeTypes.toSorted(
    ([a], [b]) => firstEdgeStage(a) - firstEdgeStage(b),
  )) {
    const creations = effects.edgeCreationsByType.get(type) ?? [];
    if (creations.length === 0) continue;
    const ref = { entity: 'edge' as const, type };
    const scope = scopeKeyFor('edge', type);
    const written = writtenVariables(
      effects,
      'edge',
      type,
      ctx.respectSkipLogicAndFiltering,
    );
    const missingGroups = equalityGroups(constraintsFor(ctx, ref));
    const edgeStream = source.stream('edges', type);
    let edgeIndex = 0;

    const buildEdge = (
      from: string,
      to: string,
      creationStageIndex: number,
      fixed: Record<string, VariableValue>,
    ): PlannedEdge => {
      const { fixedFinal, fixedAtCreation } = splitFixedValues(
        fixed,
        effects,
        scope,
        creationStageIndex,
      );
      const fixedKeys = new Set(Object.keys(fixedFinal));
      const certain = certainlyMissingVariables(
        missingGroups,
        missingProbabilitiesFor(missing, scope),
        requiredVariablesFor(required, scope),
        fixedKeys,
      );
      const drawable = drawableVariables(written, fixedFinal);
      for (const id of certain) drawable.delete(id);
      const generated = generateAttributesForEntity(ctx, ref, edgeIndex, {
        existing: fixedFinal,
        only: drawable,
      });
      claimFixedValues(ctx, ref, fixedFinal);
      const attributes = { ...generated, ...fixedFinal };
      for (const id of certain) {
        if (written.has(id)) attributes[id] = null;
      }
      const missingSet = applyMissingness(
        attributes,
        fixedKeys,
        missingProbabilitiesFor(missing, scope),
        requiredVariablesFor(required, scope),
        missingGroups,
        source,
        scope,
      );
      edgeIndex += 1;
      return {
        uid: deterministicUuid(source.stream('id', 'edge', type)),
        type,
        from,
        to,
        creationStageIndex,
        attributes,
        fixedAtCreation,
        missing: missingSet,
      };
    };

    // Topology target over the eligible pair domain.
    //
    // Every planned edge is a topology edge. A pedigree's own parent/partner
    // links are structural and come from the specialist generator alongside
    // its people, so they are neither planned here nor counted against a
    // target: they are not drawn from this domain, and subtracting them from
    // it would suppress unrelated edges between pairs the pedigree never
    // touched.
    const topologyCreations = creations.filter(
      (creation) => creation.structured === null,
    );
    if (topologyCreations.length === 0) continue;

    // Drawn before any domain is consulted, so a stage whose endpoints all
    // come from a pedigree still resolves its topology for the walk to apply.
    // Each creation draws from its own keyed stream, so sampling one the plan
    // then makes no use of perturbs nothing else.
    for (const creation of topologyCreations) {
      const topology = creation.topology ?? DEFAULT_EDGE_TOPOLOGY;
      topologyTargets.set(topologyKey(creation), {
        metric: topology.metric,
        value: sampleContinuous(
          topology.distribution,
          topology.metric === 'density' ? { min: 0, max: 1 } : { min: 0 },
          source.stream('topology', creation.stageId, type),
        ),
      });
    }

    // Creations are settled one at a time, in interview order, each committing
    // its edges before the next one's domain is built.
    //
    // A stage can filter on the very type it creates — "everyone who already
    // has a friendship" — and the interview answers that against the edges its
    // predecessors made. Computing the whole union domain first and selecting
    // over it once could never show a creation the edges of its own type,
    // because the selection that would produce them is what the domain is
    // being computed for. Settling incrementally breaks that circle: by the
    // time a later creation is judged, the earlier ones are real.
    //
    // The target is re-measured against the domain accumulated so far and
    // reduced by what is already committed, so the total after the last
    // creation is the target over the full union — what a single global
    // selection would have produced, arrived at without the blind spot.
    const domain = new Map<string, EligiblePair>();
    const typeEdges: PlannedEdge[] = [];
    const taken = new Set<string>();

    for (const creation of [...topologyCreations].toSorted(
      (a, b) => a.stageIndex - b.stageIndex,
    )) {
      for (const [key, pair] of eligiblePairsForCreation(
        ctx,
        creation,
        nodes,
        egoUid,
        egoAttributes,
        [...plannedEdges, ...typeEdges],
        effects,
      )) {
        if (!domain.has(key)) domain.set(key, pair);
      }
      if (domain.size === 0) continue;

      const target = topologyTargets.get(topologyKey(creation));
      if (target === undefined) continue;

      const eligibleNodeCount = new Set(
        [...domain.values()].flatMap((pair) => [pair.a, pair.b]),
      ).size;
      // Still measured over the domain accumulated so far and reduced by what
      // this type already holds, not by this creation's own contribution
      // alone: two stages declaring 0.5 over overlapping pairs describe one
      // graph at 0.5, not 0.75.
      const outstanding =
        topologyTarget(target, domain.size, eligibleNodeCount) -
        typeEdges.length;
      if (outstanding <= 0) continue;

      const available = [...domain.entries()].filter(
        ([key]) => !taken.has(key),
      );
      for (const [key, pair] of shuffled(available, edgeStream).slice(
        0,
        outstanding,
      )) {
        taken.add(key);
        // The SELECTING creation, not the one that first admitted the pair to
        // the domain. Topology is declared per stage now, so a density-0
        // sociogram followed by a density-1 one selects at the later stage
        // while the pair entered at the earlier: stamping where it entered
        // materialised the edge before the stage that decided it, changing
        // intermediate filters, skip logic and census answers. Creations are
        // walked in ascending stage order, so this only ever moves an edge
        // later — never before a stage that could reach its endpoints.
        typeEdges.push(buildEdge(pair.a, pair.b, creation.stageIndex, {}));
      }
    }

    edgesByType.set(type, typeEdges);
    plannedEdges.push(...typeEdges);
  }

  const edges = edgeTypes.flatMap(([type]) => edgesByType.get(type) ?? []);

  return {
    ego: {
      uid: egoUid,
      attributes: egoAttributes,
      // Nothing creates ego, so nothing is fixed on it at creation.
      fixedAtCreation: {},
      missing: egoMissing,
    },
    nodes,
    edges,
    topologyTargets,
  };
}
