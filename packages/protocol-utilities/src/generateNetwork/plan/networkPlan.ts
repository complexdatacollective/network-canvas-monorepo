import {
  filter as getFilter,
  isStageSkipped,
  resolveSkipLogicDestinationIndex,
} from '@codaco/network-query';
import {
  MAX_SYNTHETIC_PAIRS,
  MAX_SYNTHETIC_POPULATION,
} from '@codaco/protocol-validation';
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
  analyseStageEffects,
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
 * Trimmed from the last stage back, so the earliest stages keep the people
 * they asked for — but only down to each stage's own `minimums` entry. A
 * declared minimum is not discretionary: the live interface's `minNodes` gate
 * will not let a participant leave the stage below it, so a "completed
 * session" holding fewer is a state no participant could produce. As long as
 * the minimums together fit the budget the trim consumes discretionary
 * (above-minimum) shares only; `planNetwork` refuses outright before calling
 * here when they do not, so the floor-breaking second pass below is reached
 * only by callers that opted out of floors altogether.
 *
 * `budget` is what remains of the WHOLE RUN's population, defaulting to the
 * cap for a caller weighing one type alone. A preview freezes on the number of
 * people it has to build, not on how many types they are spread across: ten
 * schema-valid types with a constant-10,000 creator each planned a hundred
 * thousand people, every type inside a ceiling applied only to itself.
 */
function withinPopulationCeiling(
  assigned: number[],
  budget: number = MAX_SYNTHETIC_POPULATION,
  minimums?: readonly number[],
): number[] {
  const ceiling = Math.max(0, Math.min(budget, MAX_SYNTHETIC_POPULATION));
  const capped = assigned.map((count) => Math.min(count, ceiling));
  let total = capped.reduce((sum, count) => sum + count, 0);
  for (let index = capped.length - 1; index >= 0 && total > ceiling; index--) {
    const current = capped[index]!;
    const floor = Math.min(minimums?.[index] ?? 0, ceiling);
    const drop = Math.min(Math.max(0, current - floor), total - ceiling);
    capped[index] = current - drop;
    total -= drop;
  }
  // The ceiling binds absolutely — a synchronous preview cannot build past it
  // whatever was declared — so where the floors alone exceed it (a caller
  // that skipped the refusal) they give way, again from the last stage back.
  for (let index = capped.length - 1; index >= 0 && total > ceiling; index--) {
    const current = capped[index]!;
    const drop = Math.min(current, total - ceiling);
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
export function applyMissingness(
  attributes: Record<string, VariableValue>,
  fixedKeys: ReadonlySet<string>,
  probabilities: ReadonlyMap<string, number>,
  required: ReadonlySet<string>,
  groups: readonly string[][],
  source: RandomSource,
  /** The entity scope, so two scopes sharing a key do not share a stream. */
  scope: string,
  /**
   * Variables this entity REACHES but holds no value for — the certainly
   * missing ones. Attributes are sparse, so they cannot be marked by writing a
   * null; they are named here instead, and a group containing one is still
   * this entity's group to decide.
   */
  alsoReached: ReadonlySet<string> = new Set(),
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
    const present = members.filter(
      (id) => id in attributes || alsoReached.has(id),
    );
    if (present.length === 0) continue;
    // Keyed by the sorted membership so a group's decision does not depend on
    // whichever member the codebook happens to list first, and by the scope so
    // that one variable key used under two entity types addresses two streams
    // rather than one shared one.
    //
    // Length-prefixed rather than joined on a separator, as the walk's own
    // missingness keys are and for the same reason: a variable id is an
    // arbitrary string, so joined on NUL the groups ['a', 'b<NUL>c'] and
    // ['a<NUL>b', 'c'] addressed one stream between them, and adding or
    // reordering one decided whether the other came back missing. Escaping the
    // stream path fixed the path, not the key handed to it.
    const key = missingGroupKey(members);
    if (!source.stream('missing', scope, key).bool(probability)) continue;
    // Unanswered is ABSENT rather than null: the key is removed, and the
    // returned set is what records that the entity reached the question.
    for (const id of present) {
      delete attributes[id];
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
  respectFiltering: boolean,
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
      // Ego exists from the session's first stage, so its writes are bounded
      // below by stage 0 like any other entity's by its creation.
      [entityAttributesProperty]: attributesAsOf(
        effects,
        scopeKeyFor('ego'),
        egoAttributes,
        asOf,
        undefined,
        respectFiltering,
        0,
      ),
    } as NcNetwork['ego'],
    nodes: nodes.map((node) => ({
      [entityPrimaryKeyProperty]: node.uid,
      type: node.type,
      // Projected from the entity's own creation stage: a write that ran
      // before this node existed never landed on it, so a filter between
      // that write and the node's creation must see it unanswered — as the
      // live session does.
      [entityAttributesProperty]: attributesAsOf(
        effects,
        scopeKeyFor('node', node.type),
        node.attributes,
        asOf,
        node.fixedAtCreation,
        respectFiltering,
        node.creationStageIndex,
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
        respectFiltering,
        edge.creationStageIndex,
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

/**
 * An equality group as one key.
 *
 * Length-prefixed for `pairKey`'s reason: a variable id is an arbitrary
 * string, so no separator is safe. Shared with the walk's own missingness
 * decisions so the plan and the walk cannot key one group two ways.
 */
export const missingGroupKey = (members: readonly string[]): string =>
  [...members].toSorted().map(encodeUid).join('');

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
/**
 * The refusal both pair-domain ceilings raise: one stage's own candidates, and
 * the domain accumulated across every stage over a subject type.
 */
export function refuseTooManyPairs(
  ctx: GenerationContext,
  edgeType: string,
  reason: string,
): never {
  const definition = ctx.codebook.edge?.[edgeType];
  throw new SyntheticDataConstraintError(
    [
      {
        entity: 'edge',
        entityType: edgeType,
        ...(definition?.name === undefined
          ? {}
          : { entityTypeName: definition.name }),
        variableIds: [],
        variableNames: [],
        rules: ['pair domain'],
        reason:
          `${reason}; a preview is generated synchronously, so it is capped at ` +
          MAX_SYNTHETIC_PAIRS.toLocaleString('en'),
      },
    ],
    'a stage would have to consider more pairs than a preview can build',
  );
}

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
      ctx.respectSkipLogicAndFiltering,
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
    // Counted BEFORE the pairs are built, because building them is the harm:
    // pairs grow quadratically, so the population cap alone still admits a
    // domain of tens of millions of map entries, assembled synchronously on
    // Architect's main thread before any topology is selected from it.
    const possiblePairs = (candidates.length * (candidates.length - 1)) / 2;
    if (possiblePairs > MAX_SYNTHETIC_PAIRS) {
      refuseTooManyPairs(
        ctx,
        creation.edgeType,
        `${candidates.length.toLocaleString('en')} people are eligible to be linked here, which is ` +
          `${possiblePairs.toLocaleString('en')} possible pairs`,
      );
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
 * The rows each contested creation is given, and how many it was left short.
 *
 * Assigning greedily — smallest pool first, claiming a prefix — rejects
 * assignments that exist: with pools A=[1,2], B=[1,3], C=[3,4], D=[1,4] each
 * wanting one person, greedy takes 1, 3 and 4 and reports D empty, though
 * A=2, B=3, C=4, D=1 satisfies every stage. That is bipartite matching, so it
 * is solved as one.
 *
 * Solved over row GROUPS rather than over rows one at a time. Every person a
 * stage places is interchangeable with the next, and so is every row the same
 * set of stages can reach, so what decides this is a graph with one node per
 * membership pattern rather than one per row: a ten-thousand-row roster two
 * stages share is three nodes, not ten thousand. Matching row by row is what
 * made the search quadratic in the roster — a thousand rows already cost
 * upwards of a hundred million row checks, and the schema-supported ten
 * thousand drove the recursion toward the stack limit, so opening an Architect
 * preview froze before a single node was drawn.
 */
function matchRows(
  pools: ReadonlyMap<number, string[]>,
  assigned: number[],
  contestedOrder: readonly number[],
): { short: Map<number, number>; chosen: Map<number, string[]> } {
  const short = new Map<number, number>();
  const chosen = new Map<number, string[]>();
  if (contestedOrder.length === 0) return { short, chosen };

  const inPlay = new Set(contestedOrder);
  const owners = new Map<string, number[]>();
  for (const index of contestedOrder) {
    for (const uid of pools.get(index) ?? []) {
      const list = owners.get(uid) ?? [];
      list.push(index);
      owners.set(uid, list);
    }
  }

  /** Rows keyed by the contested creations that can reach them. */
  const groups = new Map<string, { uids: string[]; members: number[] }>();
  for (const [uid, list] of owners) {
    const members = list.filter((index) => inPlay.has(index));
    if (members.length === 0) continue;
    const key = members.join(',');
    const group = groups.get(key) ?? { uids: [], members };
    group.uids.push(uid);
    groups.set(key, group);
  }

  // source → creation → group → sink, so an augmenting path is three arcs
  // long and the level graph is four deep however large the roster is.
  type Arc = { to: number; cap: number; rev: number };
  const groupList = [...groups.values()];
  const nodeOfCreation = new Map<number, number>();
  contestedOrder.forEach((index, position) =>
    nodeOfCreation.set(index, position + 1),
  );
  const SOURCE = 0;
  const firstGroupNode = contestedOrder.length + 1;
  const SINK = firstGroupNode + groupList.length;
  const graph: Arc[][] = Array.from({ length: SINK + 1 }, () => []);
  const link = (from: number, to: number, cap: number): Arc => {
    const forward: Arc = { to, cap, rev: graph[to]!.length };
    graph[from]!.push(forward);
    graph[to]!.push({ to: from, cap: 0, rev: graph[from]!.length - 1 });
    return forward;
  };

  const demand = new Map<number, Arc>();
  for (const index of contestedOrder) {
    demand.set(index, link(SOURCE, nodeOfCreation.get(index)!, 0));
  }
  const supply: { group: number; arcs: Map<number, Arc> }[] = [];
  groupList.forEach((group, position) => {
    const node = firstGroupNode + position;
    const arcs = new Map<number, Arc>();
    for (const member of group.members) {
      arcs.set(
        member,
        link(nodeOfCreation.get(member)!, node, group.uids.length),
      );
    }
    link(node, SINK, group.uids.length);
    supply.push({ group: position, arcs });
  });

  const saturate = (): void => {
    for (;;) {
      const level = Array.from<number>({ length: graph.length }).fill(-1);
      level[SOURCE] = 0;
      const queue = [SOURCE];
      for (let head = 0; head < queue.length; head++) {
        const node = queue[head]!;
        for (const arc of graph[node]!) {
          if (arc.cap > 0 && level[arc.to] === -1) {
            level[arc.to] = level[node]! + 1;
            queue.push(arc.to);
          }
        }
      }
      if (level[SINK] === -1) return;

      const next = Array.from<number>({ length: graph.length }).fill(0);
      const push = (node: number, limit: number): number => {
        if (node === SINK) return limit;
        for (; next[node]! < graph[node]!.length; next[node]!++) {
          const arc = graph[node]![next[node]!]!;
          if (arc.cap <= 0 || level[arc.to] !== level[node]! + 1) continue;
          const pushed = push(arc.to, Math.min(limit, arc.cap));
          if (pushed > 0) {
            arc.cap -= pushed;
            graph[arc.to]![arc.rev]!.cap += pushed;
            return pushed;
          }
          level[arc.to] = -1;
        }
        return 0;
      };
      for (;;) {
        const pushed = push(SOURCE, Number.POSITIVE_INFINITY);
        if (pushed === 0) break;
      }
    }
  };

  // Most-constrained-first, kept from the row-by-row matcher it replaces.
  // Served all at once instead, a wide pool takes rows the only stage that
  // could have used them still needed: pools [a,b,c,d] and [a,b], two people
  // wanted from each, is satisfiable, and serving the wide one first leaves
  // the narrow one with nothing. Admitting one stage's whole demand before
  // the next is offered any only ever REROUTES an earlier stage between
  // groups — an augmenting path always leaves the source — so no stage
  // already served can lose a person to a later one.
  for (const index of contestedOrder) {
    const wanted = assigned[index] ?? 0;
    demand.get(index)!.cap = wanted;
    saturate();
    const left = demand.get(index)!.cap;
    if (left > 0) short.set(index, left);
  }

  // The flow on each creation → group arc is how many of that group's rows
  // the creation was given; which of them is immaterial, so they are handed
  // out in pool order.
  const taken = new Map<number, number>();
  for (const { group, arcs } of supply) {
    const uids = groupList[group]!.uids;
    for (const [index, arc] of arcs) {
      const count = uids.length - arc.cap;
      if (count <= 0) continue;
      const from = taken.get(group) ?? 0;
      chosen.set(index, [
        ...(chosen.get(index) ?? []),
        ...uids.slice(from, from + count),
      ]);
      taken.set(group, from + count);
    }
  }

  return { short, chosen };
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
): Map<number, Map<number, string[]>> {
  /**
   * Whether a stage could build a person from a row, judged the way the draw
   * judges it: the row's own values merged with what one of the stage's
   * prompts asserts, under this type's rules.
   *
   * Any prompt will do. The stage writes ONE prompt's assignment onto the
   * person it builds, and is free to use whichever of them the row suits.
   *
   * Built lazily and once: `rowJudgeFor` resolves a whole type's generation
   * order and solves its tractable components, so it must not be built for a
   * type no roster reaches.
   */
  let judge: ((fixed: Record<string, VariableValue>) => boolean) | undefined;
  const promptsOf = (
    creation: NodeCreation,
  ): readonly Record<string, VariableValue>[] =>
    creation.promptFixedValues.length > 0
      ? creation.promptFixedValues
      : [{} as Record<string, VariableValue>];

  const drawableUnder = (
    creation: NodeCreation,
    promptIndex: number,
    row: NcNode,
  ): boolean => {
    judge ??= rowJudgeFor(ctx, { entity: 'node', type: nodeType });
    const rowValues = row[entityAttributesProperty];
    const promptFixed = promptsOf(creation)[promptIndex] ?? {};
    return judge(
      creation.rosterValuesWin
        ? { ...promptFixed, ...rowValues }
        : { ...rowValues, ...promptFixed },
    );
  };

  /**
   * The rows each roster creation could actually build a person from, minus
   * everyone the run already used.
   *
   * A row a stage cannot draw is not that stage's row, and this pool is what
   * BOTH questions are answered over:
   *
   * - WHICH rows a stage gets first refusal on. Decided over raw membership, a
   *   stage took the single row another stage's prompts could have used: a
   *   shared two-row pool where one stage fixes a value only one row satisfies
   *   handed that row to the stage with no preference, left the other to
   *   reject what remained, and quietly built one person where both stages
   *   asked for one — though the other assignment satisfies both.
   *
   * - HOW MANY it can be given. A pool of rows this stage's rules turn away is
   *   a pool that cannot furnish the people the protocol says it will, and
   *   counting them made the plan promise a population the draw then failed to
   *   build. So a roster whose usable rows fall short is now reported like any
   *   other under-provisioned roster rather than quietly building fewer.
   *
   * The judgement here is the more permissive of the two: the registry it
   * consults is emptier than at draw time, so a row this pass admits may still
   * be passed over later, but a row it turns away could never have been drawn.
   * A shortfall reported here is therefore one the draw would have reached.
   */
  //
  // One pool per (creation, PROMPT), because that is the unit the draw fills:
  // `createNodesForStage` gives slot `i` to prompt `i % promptCount`, so a row
  // only the first prompt can use is no supply at all for the second's slots.
  // Asked stage-wide, two rows both compatible with the first of two prompts
  // reported enough supply for a declared count of two, and the second slot
  // then found nothing and ended the stage one person short in silence.
  const demands: {
    creationIndex: number;
    promptIndex: number;
    wanted: number;
    pool: string[];
    binding: boolean;
  }[] = [];
  creations.forEach((creation, index) => {
    // A panel-backed name generator can fabricate, so its pool does not bind
    // its final count. It still consumes panel rows before fabricating,
    // however, and therefore has to participate in the same assignment as a
    // closed roster that shares those rows. Closed rosters are served first;
    // a panel receives only rows left for it and fabricates any shortfall.
    if (creation.rosterStageId === undefined) return;
    const pool = ctx.externalData?.[creation.rosterStageId];
    if (pool === undefined) return;
    const promptCount = promptsOf(creation).length;
    const wanted = assigned[index] ?? 0;
    for (let promptIndex = 0; promptIndex < promptCount; promptIndex++) {
      const seen = new Set<string>(ctx.usedRosterUids);
      const usable: string[] = [];
      for (const row of pool) {
        const uid = row[entityPrimaryKeyProperty];
        // A key is claimed by the first DRAWABLE row carrying it, not by the
        // first row. A caller's external data may give two rows one primary
        // key while their values differ, and the draw takes the first of them
        // it can use — so letting an undrawable row claim the key here would
        // hide a usable sibling and report a shortfall over a person the run
        // can build.
        if (seen.has(uid)) continue;
        if (!drawableUnder(creation, promptIndex, row)) continue;
        seen.add(uid);
        usable.push(uid);
      }
      // Slots go round the prompts in turn, so this prompt fills every `i`
      // congruent to it.
      const slots = Math.max(
        0,
        Math.ceil((wanted - promptIndex) / promptCount),
      );
      demands.push({
        creationIndex: index,
        promptIndex,
        wanted: slots,
        pool: usable,
        binding: creation.source === 'roster',
      });
    }
  });
  if (demands.length === 0) return new Map();

  const pools = new Map<number, string[]>(
    demands.map((demand, index) => [index, demand.pool]),
  );
  const demandCounts = demands.map((demand) => demand.wanted);

  /** Rows a creation can reach under ANY of its prompts, for contested-ness. */
  const reachByCreation = new Map<number, Set<string>>();
  for (const demand of demands) {
    const reach =
      reachByCreation.get(demand.creationIndex) ?? new Set<string>();
    for (const uid of demand.pool) reach.add(uid);
    reachByCreation.set(demand.creationIndex, reach);
  }
  // A creation needs an assignment where anything contends for its rows — a
  // second stage sharing the roster, or its OWN prompts, which is contention
  // just the same once slots are matched per prompt. Only a single-prompt
  // stage with a pool nobody else can reach is free of it, and there every
  // ordering really is equivalent, so imposing one would churn seeded output
  // to no end. That is what this gate keeps out.
  const promptsPerCreation = new Map<number, number>();
  for (const demand of demands) {
    promptsPerCreation.set(
      demand.creationIndex,
      (promptsPerCreation.get(demand.creationIndex) ?? 0) + 1,
    );
  }
  const contestedCreations = new Set<number>(
    [...promptsPerCreation]
      .filter(([, count]) => count > 1)
      .map(([creationIndex]) => creationIndex),
  );
  for (const [left, leftReach] of reachByCreation) {
    for (const [right, rightReach] of reachByCreation) {
      if (left === right) continue;
      for (const uid of leftReach) {
        if (rightReach.has(uid)) {
          contestedCreations.add(left);
          break;
        }
      }
    }
  }

  const order = [...pools.keys()].toSorted(
    (left, right) =>
      Number(demands[right]!.binding) - Number(demands[left]!.binding) ||
      pools.get(left)!.length - pools.get(right)!.length,
  );
  const unmatched = new Map<number, number>();
  const preference = new Map<number, Map<number, string[]>>();

  // What is left is genuinely contested. Assigning greedily — smallest pool
  // first, claiming a prefix — rejects assignments that exist: with pools
  // A=[1,2], B=[1,3], C=[3,4], D=[1,4] each wanting one person, greedy takes
  // 1, 3 and 4 and reports D empty, though A=2, B=3, C=4, D=1 satisfies every
  // stage. That is bipartite matching, so it is solved as one.
  //
  // Solved over row GROUPS rather than over rows one at a time. Every person a
  // stage places is interchangeable with the next, and so is every row the same
  // set of stages can reach, so what decides this is a graph with one node per
  // membership pattern rather than one per row: a ten-thousand-row roster two
  // stages share is three nodes, not ten thousand. Matching row by row is what
  // made the search quadratic in the roster — a thousand rows already cost
  // upwards of a hundred million row checks, and the schema-supported ten
  // thousand drove the recursion toward the stack limit, so opening an
  // Architect preview froze before a single node was drawn.
  //
  // Every demand goes through the matching, contested or not: two prompts of
  // one stage contend for its rows just as two stages do, and the graph is one
  // node per membership pattern either way — a one-prompt roster of ten
  // thousand rows is still a single node.
  const matched = matchRows(pools, demandCounts, order);
  // Shortfalls are the CREATION's: a stage is short by what its prompts could
  // not fill between them.
  for (const [demandIndex, count] of matched.short) {
    const creationIndex = demands[demandIndex]!.creationIndex;
    unmatched.set(creationIndex, (unmatched.get(creationIndex) ?? 0) + count);
  }
  // Kept PER PROMPT, not flattened into one list per stage. The matcher
  // assigns rows to individual prompt demands — with prompt 0 able to use `a`
  // or `b` and prompt 1 only `a`, it gives `b` to 0 and `a` to 1 — and a
  // flattened ordering let prompt 0 take `a` first all the same, leaving
  // prompt 1 to reject `b` and the stage seed-dependently short of a count
  // that was satisfiable.
  for (const creationIndex of contestedCreations) {
    preference.set(creationIndex, new Map());
  }
  for (const [demandIndex, uids] of matched.chosen) {
    const { creationIndex, promptIndex } = demands[demandIndex]!;
    if (!contestedCreations.has(creationIndex)) continue;
    const byPrompt = preference.get(creationIndex)!;
    byPrompt.set(promptIndex, [...(byPrompt.get(promptIndex) ?? []), ...uids]);
    preference.set(creationIndex, byPrompt);
  }

  for (const [index, short] of unmatched) {
    const creation = creations[index]!;
    // A panel is an open shortcut: the matching decides which shared rows it
    // may consume, and it fabricates the rest of its assigned population.
    // Only a closed roster can be under-provisioned by a short match.
    if (creation.source !== 'roster') continue;
    const wanted = assigned[index] ?? 0;

    // An UNDECLARED roster stage is only carrying the generic 1-8 fallback,
    // which says nothing about this roster: the real Development Protocol has
    // six classmates and a stage the default would have asked eight of. Take
    // what the assignment could actually give it — decided HERE rather than
    // against its own pool size, because a shared pool's rows may already have
    // gone to another stage. The refusal is reserved for a count the author
    // actually wrote.
    const offered = wanted - short;
    if (!creation.countDeclared && offered >= creation.capacity.min) {
      assigned[index] = offered;
      continue;
    }
    // Below the stage's own minimum it is no longer the fallback giving way.
    // `behaviours.minNodes` is something the author wrote, and the interface
    // holds the participant to it, so a roster that cannot reach it is the
    // same under-provisioning a declared count reports — a stage set to a
    // minimum of five over a roster of two would otherwise generate two people
    // and say nothing.
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

  return preference;
}

export function planNetwork(
  ctx: GenerationContext,
  effects: StageEffects,
): NetworkPlan {
  const source = ctx.valueGen.randomSource;
  const missing = missingProbabilities(ctx.codebook);
  const required = requiredVariables(ctx.codebook);

  /**
   * Every primary key the caller's rosters carry, drawn or not.
   *
   * A roster row's `_uid` is an arbitrary caller-chosen string, so nothing
   * stops one matching a uid a stream mints — and a plan holding two entities
   * under one key is silently halved at materialisation (`materialisedNodes`
   * keeps whichever lands first) while topology can pair the two planned
   * entries as identical endpoints. Undrawn rows are reserved too: a later
   * stage may still draw one AFTER a fabricated node has taken its key.
   *
   * Redrawing advances the same memoised stream, so a protocol containing no
   * collision — every fixture and committed snapshot — mints byte-identical
   * ids to before the guard.
   */
  const suppliedRosterUids = new Set<string>();
  for (const pool of Object.values(ctx.externalData ?? {})) {
    for (const row of pool) {
      suppliedRosterUids.add(row[entityPrimaryKeyProperty]);
    }
  }
  const mintUid = (...path: (string | number)[]): string => {
    const stream = source.stream(...path);
    let uid = deterministicUuid(stream);
    while (suppliedRosterUids.has(uid)) uid = deterministicUuid(stream);
    return uid;
  };

  // --- Ego -----------------------------------------------------------------
  const egoUid = mintUid('id', 'ego');
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

  /**
   * Whether the ego this plan just drew settles a stage's skip logic.
   *
   * `reachableStagesForFeasibility` runs BEFORE anything is drawn, so a guard
   * on an ego attribute an EgoForm collects is undecidable there and the stage
   * stays in conservatively. By this point ego HAS been drawn, so a guard whose
   * every rule is an ego rule can be settled — and a creator settled as skipped
   * must not be planned for: its people never materialise, yet the values
   * claimed for them are spent, and a `unique` space can be exhausted by
   * entities the session never holds.
   *
   * Only all-ego guards. A rule about alters is still undecidable here, since
   * the nodes it asks about are what this pass is about to plan.
   */
  const plannedEgoNetwork = (asOf: number, view: StageEffects): NcNetwork =>
    ({
      ego: {
        [entityPrimaryKeyProperty]: egoUid,
        // As of the guarded stage, not as of the end. A creator standing
        // BEFORE the EgoForm that writes the attribute its guard reads sees an
        // ego who has not answered yet, so a `SKIP` on `consent === true` does
        // not skip it — and settling it against the final draw removed a
        // creator the session then reaches with nothing planned to introduce.
        // The stage-time filter shadow above is projected for the same reason.
        [entityAttributesProperty]: attributesAsOf(
          view,
          scopeKeyFor('ego'),
          egoAttributes,
          asOf,
          undefined,
          ctx.respectSkipLogicAndFiltering,
          0,
        ),
      },
      nodes: [],
      edges: [],
    }) as unknown as NcNetwork;

  const guardSettlesSkip = (
    summary: StageEffects['stages'][number],
    view: StageEffects,
  ): boolean => {
    if (!ctx.respectSkipLogicAndFiltering) return false;
    const { skipLogic } = summary.stage;
    if (skipLogic === undefined) return false;
    if (skipLogic.filter.rules.some((rule) => rule.type !== 'ego'))
      return false;
    // Strictly BEFORE the guarded stage, which is what separates a guard from
    // a filter. A filter runs while its stage is on screen, so a value that
    // stage collects belongs in it — the interview's `getFilteredNetwork`
    // recomputes as each prompt lands. A guard decides whether the stage is
    // shown at all, so it can only read what the session held on arrival.
    //
    // The difference is decisive where a form guards on a field it collects
    // itself, because the reading is self-referential: the only thing that
    // could answer that field is the very stage the guard suppresses. Live
    // (`buildStageAvailabilityMap`), `SKIP` on `NOT_EXISTS` skips the form and
    // the field stays unanswered forever; on `EXISTS` the form runs, and the
    // answer it collects arrives too late to have hidden it. Projected as of
    // the stage itself, the plan read the drawn value and decided both the
    // other way — and disagreed with `reachableStagesForFeasibility`, which
    // reads the same guard against an ego who has not answered. Feasibility
    // then dropped stages the plan went on to build, leaving the entities it
    // built unanalysed.
    return isStageSkipped(
      skipLogic,
      plannedEgoNetwork(summary.index - 1, view),
    );
  };

  /**
   * The stages this plan can actually arrive at, walked rather than filtered.
   *
   * A settled guard does not only remove its own stage: `skipLogic.destination`
   * makes the session jump, and `materialiseSession` walks it that way. Judged
   * stage by stage, the stages BETWEEN the guard and its destination stayed in
   * the plan — their entities spending `unique` values, joining later filters
   * and taking part in topology selection — while the session they belong to
   * never reached them.
   */
  const stageList = effects.stages.map((summary) => summary.stage);
  const plannedReachable = new Set<number>();
  /**
   * The analysis a guard evaluated MID-walk may read: everything the walk has
   * reached so far, plus every stage not yet judged. One settled jump removes
   * the stages it clears from the view the NEXT guard sees — a consent-based
   * jump over a flag form must leave a later flag-guarded creator reading an
   * ego who never answered, exactly as the session will. Judged against the
   * original analysis, that guard settled the creator as skipped on a value
   * the session never collects, and materialisation then reached a creator
   * with nothing planned to introduce.
   */
  let guardView = effects;
  const viewAfterJump = (nextIndex: number): StageEffects => {
    const mask = new Set(plannedReachable);
    for (let i = nextIndex; i < effects.stages.length; i++) mask.add(i);
    return analyseStageEffects(stageList, mask);
  };
  for (let index = 0; index < effects.stages.length; index++) {
    const summary = effects.stages[index]!;
    if (guardSettlesSkip(summary, guardView)) {
      const destination = summary.stage.skipLogic?.destination;
      let next = index + 1;
      if (destination !== undefined) {
        const destinationIndex = resolveSkipLogicDestinationIndex(
          destination,
          stageList,
          index,
        );
        // Only a destination strictly after the guard resolves, so this
        // always moves forward and the walk terminates.
        if (destinationIndex !== undefined) {
          index = destinationIndex - 1;
          next = destinationIndex;
        }
      }
      guardView = viewAfterJump(next);
      continue;
    }
    plannedReachable.add(index);
  }

  const settledAsSkipped = (summary: StageEffects['stages'][number]): boolean =>
    !plannedReachable.has(summary.index);

  /**
   * The analysis as the WALK sees it, with the stages a settled guard removes
   * reduced to empty summaries.
   *
   * Masking the creations alone was not enough: `writtenVariables` and
   * `attributesAsOf` read the indexes, so a jumped-over form still made its
   * variable part of every entity's plan and visible to a later filtered
   * stage — which then admitted subjects the live session excludes, and the
   * same-stage edges planned for them are never rechecked at materialisation.
   *
   * Re-analysed rather than patched: `analyseStageEffects` already reduces an
   * unreachable stage to an empty summary and rebuilds every index from what
   * remains, so no second notion of what a reachable stage writes can enter.
   * Skipped entirely where nothing was settled, which is the ordinary case.
   */
  const walked: StageEffects =
    plannedReachable.size === effects.stages.length
      ? effects
      : analyseStageEffects(stageList, plannedReachable);

  // --- Node populations ----------------------------------------------------
  const nodes: PlannedNode[] = [];
  const creationsByType = new Map<string, NodeCreation[]>();
  for (const summary of walked.stages) {
    if (settledAsSkipped(summary)) continue;
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

  // What the run has left to spend on people, across every type. The trim is
  // applied within a type and then deducted, so the types the codebook lists
  // first keep the people they asked for — the same 'earliest keeps its own'
  // rule the per-stage trim follows.
  let populationBudget = MAX_SYNTHETIC_POPULATION;

  // Declared stage minimums are floors trimming may not cross: the live
  // interface's `minNodes` gate will not let a participant leave the stage
  // below its minimum, so a completed session holding fewer is a state no
  // participant could produce — and where the budget forces trimming, it is
  // the discretionary (above-minimum) shares that give way, across every
  // stage and type, before any reachable minimum is touched. Reserving the
  // floors of the types still to come is what keeps a codebook-earlier type's
  // discretionary people from spending a later type's minimum. Where the
  // minimums ALONE outgrow the run's cap no allocation can honour them, and
  // that is refused rather than quietly under-built.
  const typeFloors = new Map<string, number>();
  {
    let floorTotal = 0;
    for (const [type, definition] of Object.entries(ctx.codebook.node ?? {})) {
      const creations = creationsByType.get(type) ?? [];
      const floors = creations.reduce(
        (sum, creation) => sum + creation.capacity.min,
        0,
      );
      typeFloors.set(type, floors);
      floorTotal += floors;
      if (floorTotal > MAX_SYNTHETIC_POPULATION) {
        throw new SyntheticDataConstraintError(
          [
            {
              entity: 'node',
              entityType: type,
              ...(definition.name === undefined
                ? {}
                : { entityTypeName: definition.name }),
              variableIds: [],
              variableNames: [],
              rules: ['stage minimums'],
              reason:
                `the reachable creating stages declare minimums (behaviours.minNodes) totalling more than ` +
                `${MAX_SYNTHETIC_POPULATION.toLocaleString('en')} people between them; a preview is generated ` +
                `synchronously, so the whole run is capped there`,
            },
          ],
          'declared stage minimums alone exceed the population a preview can build',
        );
      }
    }
  }
  let floorsOutstanding = [...typeFloors.values()].reduce(
    (sum, floors) => sum + floors,
    0,
  );

  for (const [type, definition] of Object.entries(ctx.codebook.node ?? {})) {
    const creations = creationsByType.get(type) ?? [];
    // This type's own floors are no longer "outstanding" — they are handed to
    // the trim below as its per-stage minimums instead.
    floorsOutstanding -= typeFloors.get(type) ?? 0;
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
      populationBudget - floorsOutstanding,
      creations.map((creation) => creation.capacity.min),
    );
    populationBudget -= assigned.reduce((sum, count) => sum + count, 0);

    // Roster rows are drawn without replacement across the whole run, so
    // stages over overlapping pools contest the same people. With counts fixed
    // by declaration that is no longer a negotiation over how many each stage
    // gets, only an assignment of which rows go where — and a stage that still
    // cannot be filled is a protocol the researcher needs to hear about.
    const rosterPreference = assignRosterRows(
      ctx,
      walked,
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
      walked,
      'node',
      type,
      ctx.respectSkipLogicAndFiltering,
    );
    const typeWritten = writtenVariables(
      walked,
      'node',
      type,
      ctx.respectSkipLogicAndFiltering,
    );
    // A population write reaches only the people alive when it runs, so a
    // creation is judged against the variable's LAST writer: a form whose
    // only run precedes this creator never asks its question of the people
    // this creator introduces, and drawing the value anyway spent `unique`
    // values the session never collects and showed later filters an answer
    // the live interview leaves absent. Where filtering is respected the
    // unconditional writes are the ones counted, matching what
    // `populationWrittenVariables` admitted. Creation-time writes need no
    // such test — `writesAtCreation` is the creating interaction's own.
    const writeStagesForScope = (
      ctx.respectSkipLogicAndFiltering
        ? walked.unconditionalWriteStages
        : walked.writeStages
    ).get(scope);
    const writtenFor = (creation: NodeCreation): Set<string> =>
      new Set([
        ...[...populationWritten].filter((variableId) => {
          const stages = writeStagesForScope?.get(variableId);
          const last = stages?.[stages.length - 1];
          return last !== undefined && last >= creation.stageIndex;
        }),
        ...creation.writesAtCreation.filter((id) => typeWritten.has(id)),
      ]);
    const missingGroups = equalityGroups(constraintsFor(ctx, ref));

    // Roster stages draw real rows without replacement across the run. Built
    // before any draw so the values they carry can be held back from it.
    const rosterPools = creations.map((creation, creationIndex) => {
      if (creation.rosterStageId === undefined) return undefined;
      const pool = ctx.externalData?.[creation.rosterStageId];
      if (pool === undefined) return undefined;
      const assignedPanelRows = rosterPreference.get(creationIndex);
      const allowedPanelUids =
        creation.source !== 'roster' && assignedPanelRows !== undefined
          ? new Set([...assignedPanelRows.values()].flat())
          : undefined;
      const available = shuffled(
        pool.filter(
          (row) =>
            !ctx.usedRosterUids.has(row[entityPrimaryKeyProperty]) &&
            (allowedPanelUids === undefined ||
              allowedPanelUids.has(row[entityPrimaryKeyProperty])),
        ),
        source.stream('roster', creation.rosterStageId),
      );

      return available;
    });

    /**
     * The rows the assignment gave each prompt, as a queue that prompt draws
     * from first.
     *
     * A preference, not a restriction. The assignment is blind to what the
     * registry will hold by the time a row is reached, so holding a prompt to
     * its assigned rows alone would starve it of ones it could have used —
     * a pool of a hundred rows where only ten are completable would hand over
     * ten and build one person. Its queue is tried first and the whole pool
     * remains behind it.
     *
     * Per PROMPT rather than as one ordering per stage: the matcher assigns
     * rows to individual prompt demands, and a stage-wide ordering let the
     * first prompt take a row the matcher had given to the second.
     */
    const preferredQueues = creations.map((_creation, creationIndex) => {
      const byPrompt = rosterPreference.get(creationIndex);
      if (byPrompt === undefined) return undefined;
      return new Map(
        [...byPrompt].map(([promptIndex, uids]) => [promptIndex, [...uids]]),
      );
    });
    const rowsByUid = rosterPools.map((pool) =>
      pool === undefined
        ? undefined
        : new Map(pool.map((row) => [row[entityPrimaryKeyProperty], row])),
    );

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
      /**
       * Rows each prompt has already turned away, so no (row, prompt) pair is
       * judged twice.
       *
       * A row kept for a later prompt must not be re-judged by the prompt that
       * rejected it: the verdict cannot change, and re-asking is how a pool of
       * ninety undrawable rows became a judgement per row PER DRAW — the
       * quadratic cost the whole-run ceiling exists to keep out.
       */
      const rejectedByPrompt = new Map<number, Set<NcNode>>();
      const rosterRows = rosterPools[creationIndex];

      /**
       * Rows whose values this stage is still holding back from free draws.
       *
       * The hold exists so a draw between now and this row being reached
       * cannot take a `unique` value the row will bring. Released the moment
       * the row's fate is settled — drawn, taken by another stage, or turned
       * away by every prompt — and not before: a row kept for a later prompt
       * is still a row that may be drawn, and releasing it there let an
       * intervening draw claim its value, so the prompt that had saved it then
       * rejected it as a collision and the stage came up short with a complete
       * assignment available.
       */
      const heldRows = new Set<NcNode>(rosterRows ?? []);
      const releaseHold = (row: NcNode): void => {
        if (!heldRows.delete(row)) return;
        unreserveFixedValues(ctx, ref, row[entityAttributesProperty]);
      };

      /**
       * Whether this prompt can build a person from a row, recording the
       * verdict so no (row, prompt) pair is judged twice and releasing the
       * hold on a row every prompt has now turned away.
       */
      const judgeFor = (
        promptIndex: number,
        promptFixed: Record<string, VariableValue>,
        candidate: NcNode,
      ): Record<string, VariableValue> | undefined => {
        const rowValues = candidate[entityAttributesProperty];
        const merged = creation.rosterValuesWin
          ? { ...promptFixed, ...rowValues }
          : { ...rowValues, ...promptFixed };
        if (rowIsDrawable?.(merged) ?? true) return merged;

        const seen = rejectedByPrompt.get(promptIndex) ?? new Set<NcNode>();
        seen.add(candidate);
        rejectedByPrompt.set(promptIndex, seen);
        const rejectedEverywhere = Array.from(
          { length: promptCount },
          (_unused, at) => at,
        ).every((at) => rejectedByPrompt.get(at)?.has(candidate) === true);
        if (rejectedEverywhere) releaseHold(candidate);
        return undefined;
      };

      for (let i = 0; i < share; i++) {
        const promptIndex = i % promptCount;
        const promptFixed = creation.promptFixedValues[promptIndex] ?? {};

        let rosterRow: NcNode | undefined;
        let fixed: Record<string, VariableValue> = { ...promptFixed };
        if (rosterRows !== undefined) {
          // First refusal goes to the rows the assignment gave THIS prompt.
          // The pool behind them is still reachable, so a queue that empties
          // or whose rows the registry has since taken costs this prompt
          // nothing.
          const queue = preferredQueues[creationIndex]?.get(promptIndex);
          const byUid = rowsByUid[creationIndex];
          while (
            queue !== undefined &&
            byUid !== undefined &&
            queue.length > 0
          ) {
            const uid = queue.shift()!;
            if (ctx.usedRosterUids.has(uid)) continue;
            const candidate = byUid.get(uid);
            if (candidate === undefined) continue;
            if (rejectedByPrompt.get(promptIndex)?.has(candidate)) continue;
            const merged = judgeFor(promptIndex, promptFixed, candidate);
            if (merged === undefined) continue;
            releaseHold(candidate);
            rosterRow = candidate;
            fixed = merged;
            break;
          }
        }
        if (rosterRow === undefined && rosterRows !== undefined) {
          // Rows this prompt cannot use, kept for the prompts that follow.
          // A roster stage's prompts fix DIFFERENT values, so "not drawable"
          // is a judgement about this prompt rather than about the roster:
          // discarding the row outright meant a shuffle presenting the second
          // prompt's only match first left the stage a person short, though a
          // complete assignment existed.
          const passedOver: NcNode[] = [];
          while (rosterRows.length > 0) {
            const candidate = rosterRows.shift()!;
            // Each stage's pool is taken before any of them draws, so a row
            // two stages share sits in both. One person is never added twice —
            // and this one is drawable by nobody, so its hold is released for
            // good rather than kept for a later prompt.
            if (ctx.usedRosterUids.has(candidate[entityPrimaryKeyProperty])) {
              releaseHold(candidate);
              continue;
            }
            // Keyed on the ROW, not its uid: a caller's external data may
            // give two rows one primary key while their values differ, and
            // one being rejected says nothing about the other.
            if (rejectedByPrompt.get(promptIndex)?.has(candidate)) {
              passedOver.push(candidate);
              continue;
            }
            const merged = judgeFor(promptIndex, promptFixed, candidate);
            if (merged !== undefined) {
              // Released here because the draw itself claims what it settles.
              releaseHold(candidate);
              rosterRow = candidate;
              fixed = merged;
              break;
            }
            // Kept for a later prompt, which fixes different values. This
            // prompt will not ask again, and the hold stays while any prompt
            // still could — `judgeFor` releases it once none can.
            passedOver.push(candidate);
          }
          rosterRows.unshift(...passedOver);
          // A roster stage cannot fabricate. Its share ends when the pool has
          // nothing left to give — including a pool an earlier stage sharing
          // the same roster already emptied, which leaves nothing to loop over
          // here at all.
          if (creation.source === 'roster' && rosterRow === undefined) break;
        }

        const uid = rosterRow
          ? rosterRow[entityPrimaryKeyProperty]
          : mintUid('id', 'node', type);
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
          walked,
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
          highlightVariables: walked.highlightVariables.get(scope),
        });
        claimFixedValues(ctx, ref, fixedFinal);
        unreserveFixedValues(ctx, ref, promptFixed);
        const attributes = { ...generated, ...fixedFinal };
        // Reached but unanswered. Named rather than written as null, since an
        // unset attribute is one the entity does not carry.
        const reachedButUnanswered = new Set(
          [...certain].filter((id) => written.has(id)),
        );
        const missingSet = applyMissingness(
          attributes,
          fixedKeys,
          missingProbabilitiesFor(missing, scope),
          requiredVariablesFor(required, scope),
          missingGroups,
          source,
          scope,
          reachedButUnanswered,
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

      // This stage is done drawing, so whatever it was still holding back is
      // no longer owed to anyone. Released directly rather than through
      // `releaseHold`, which would mutate the set being walked.
      for (const row of heldRows) {
        unreserveFixedValues(ctx, ref, row[entityAttributesProperty]);
      }
      heldRows.clear();
    });
  }

  // --- Edges ---------------------------------------------------------------
  //
  // Creations are settled in ONE pass across every edge type, ordered by
  // (stage, prompt) — the order the interview actually presents them — so a
  // creation whose filter reads another type's edges sees exactly the ones
  // that exist by the time it runs live. Settled a whole type at a time
  // instead, a type whose FIRST creation came early carried its later-stage
  // creations to the front too, where a filter on a type settled after it
  // read an edgeless shadow — and the later type's filter read edges that did
  // not exist yet. This is a settlement order only: every type draws from its
  // own keyed streams and its creations keep their relative order, so a
  // protocol without cross-type edge filters plans byte-identically — and the
  // plan's edges are emitted in codebook order once the walk is done.
  const edgeTypes = Object.entries(ctx.codebook.edge ?? {});
  /**
   * Creations of one edge type whose owning stage the run really reaches.
   *
   * The node pass drops a creator an all-ego guard settles as skipped, and so
   * must this one: its edges were planned all the same, and where a later
   * reachable stage creates the same type the walk retried them and emitted
   * them — a skipped density-1 Sociogram's links appearing under a density-0
   * census that had asked for none.
   */
  const reachableCreations = (type: string): EdgeCreation[] =>
    (walked.edgeCreationsByType.get(type) ?? []).filter((creation) => {
      const summary = walked.stages[creation.stageIndex];
      return summary === undefined || !settledAsSkipped(summary);
    });
  const plannedEdges: PlannedEdge[] = [];
  const topologyTargets = new Map<string, EdgeTopologyTarget>();

  // Every type's topology-driven creations, gathered in codebook order so the
  // settlement sort below can break (stage, prompt) ties by it.
  const topologyCreationsByType = new Map<string, EdgeCreation[]>();
  for (const [type] of edgeTypes) {
    const creations = reachableCreations(type);
    if (creations.length === 0) continue;

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
    topologyCreationsByType.set(type, topologyCreations);

    // Drawn before any domain is consulted, so a stage whose endpoints all
    // come from a pedigree still resolves its topology for the walk to apply.
    // Each creation draws from its own keyed stream, so sampling one the plan
    // then makes no use of perturbs nothing else.
    for (const creation of topologyCreations) {
      const key = topologyKey(creation);
      // ONE draw per (stage, edge type), not per creation. A census whose
      // prompts all create the same edge type has one creation per prompt and
      // one topology between them — the stage declared it — and they share a
      // key, so drawing per creation took a second value from the same stream
      // and overwrote the first. Adding or removing a duplicate prompt then
      // changed the density of the stage's whole graph, though neither its
      // declared topology nor its eligible domain had moved.
      if (topologyTargets.has(key)) continue;
      const topology = creation.topology ?? DEFAULT_EDGE_TOPOLOGY;
      topologyTargets.set(key, {
        metric: topology.metric,
        value: sampleContinuous(
          topology.distribution,
          topology.metric === 'density' ? { min: 0, max: 1 } : { min: 0 },
          source.stream('topology', creation.stageId, type),
        ),
      });
    }
  }

  /**
   * One edge type's accumulated planning state, created the first time a
   * creation of the type is settled. Everything in it is the TYPE's own —
   * its keyed streams, its draw counter, its domain and committed edges — so
   * interleaving types in the settlement loop leaves each type's draw
   * sequence exactly what a type-at-a-time walk produced.
   *
   * `bySubject` is kept per SUBJECT node type, not per edge type. A pair is
   * two nodes of one type, so stages over different types reach disjoint
   * pairs — and an accumulated domain spanning both let a stage over `place`
   * select a pair of people and be stamped as having created it, an edge
   * between endpoints outside its own subject domain. Feasibility already
   * sums its ceilings per subject type for the same reason.
   */
  type EdgeTypeState = {
    edgeStream: ReturnType<RandomSource['stream']>;
    buildEdge: (
      from: string,
      to: string,
      creationStageIndex: number,
      fixed: Record<string, VariableValue>,
    ) => PlannedEdge;
    bySubject: Map<
      string,
      {
        /** Union across stages, retained for the synchronous pair cap. */
        domain: Map<string, EligiblePair>;
        /** Eligible pairs accumulated only within one (stage, edge type). */
        domainsByTopology: Map<string, Map<string, EligiblePair>>;
        edges: PlannedEdge[];
        taken: Set<string>;
      }
    >;
    typeEdges: PlannedEdge[];
  };
  const stateByType = new Map<string, EdgeTypeState>();
  const stateFor = (type: string): EdgeTypeState => {
    const existing = stateByType.get(type);
    if (existing) return existing;
    const ref = { entity: 'edge' as const, type };
    const scope = scopeKeyFor('edge', type);
    const written = writtenVariables(
      walked,
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
        walked,
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
        highlightVariables: walked.highlightVariables.get(scope),
      });
      claimFixedValues(ctx, ref, fixedFinal);
      const attributes = { ...generated, ...fixedFinal };
      const reachedButUnanswered = new Set(
        [...certain].filter((id) => written.has(id)),
      );
      const missingSet = applyMissingness(
        attributes,
        fixedKeys,
        missingProbabilitiesFor(missing, scope),
        requiredVariablesFor(required, scope),
        missingGroups,
        source,
        scope,
        reachedButUnanswered,
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

    const created: EdgeTypeState = {
      edgeStream,
      buildEdge,
      bySubject: new Map(),
      typeEdges: [],
    };
    stateByType.set(type, created);
    return created;
  };

  // Creations are settled one at a time, in interview order, each committing
  // its edges before the next one's domain is built.
  //
  // A stage can filter on the very type it creates — "everyone who already
  // has a friendship" — and the interview answers that against the edges its
  // predecessors made. Computing the whole union domain first and selecting
  // over it once could never show a creation the edges of its own type,
  // because the selection that would produce them is what the domain is
  // being computed for. Settling incrementally breaks that circle: by the
  // time a later creation is judged, the earlier ones are real. And the order
  // is GLOBAL across types for the same reason one type's creations are
  // ordered: a filter can read any type's edges, and the interview re-reads
  // it against the network as each prompt changes it, so what has to be real
  // by the time a creation is judged is everything the session holds — not
  // everything its own type does.
  //
  // Stage dominates prompt in the sort key: no protocol has enough prompts on
  // one stage for a prompt index to reach the next stage's place. Ties — two
  // types created by one prompt cannot happen, so ties are across stages'
  // structural creations only — keep codebook order, the stable order the
  // list was gathered in.
  const settlementOrder = [...topologyCreationsByType.entries()]
    .flatMap(([type, creations]) =>
      creations.map((creation) => ({ type, creation })),
    )
    .toSorted(
      (a, b) =>
        a.creation.stageIndex * 1_000_000 +
        a.creation.promptIndex -
        (b.creation.stageIndex * 1_000_000 + b.creation.promptIndex),
    );

  for (const { type, creation } of settlementOrder) {
    const state = stateFor(type);
    const subjectState = (subjectType: string) => {
      const existing = state.bySubject.get(subjectType);
      if (existing) return existing;
      const created = {
        domain: new Map<string, EligiblePair>(),
        domainsByTopology: new Map<string, Map<string, EligiblePair>>(),
        edges: [] as PlannedEdge[],
        taken: new Set<string>(),
      };
      state.bySubject.set(subjectType, created);
      return created;
    };
    const {
      domain,
      domainsByTopology,
      edges: subjectEdges,
      taken,
    } = subjectState(creation.subjectNodeType);
    const targetKey = topologyKey(creation);
    const targetDomain =
      domainsByTopology.get(targetKey) ?? new Map<string, EligiblePair>();
    domainsByTopology.set(targetKey, targetDomain);
    for (const [key, pair] of eligiblePairsForCreation(
      ctx,
      creation,
      nodes,
      egoUid,
      egoAttributes,
      plannedEdges,
      walked,
    )) {
      if (!domain.has(key)) domain.set(key, pair);
      if (!targetDomain.has(key)) targetDomain.set(key, pair);
    }
    // The ACCUMULATED domain, which the per-creation ceiling does not bound.
    // Where filters are respected, each stage can expose a different subset
    // of the same node type and stay well inside its own ceiling while the
    // union outgrows it: twenty disjoint five-hundred-person subsets are
    // 124,750 pairs each and roughly 2.5 million between them, which is the
    // memory the per-creation check exists to refuse, reached by another
    // route. Checked after the merge rather than on the sum, because
    // overlapping subsets are the ordinary case and their union is smaller
    // than their total.
    if (domain.size > MAX_SYNTHETIC_PAIRS) {
      refuseTooManyPairs(
        ctx,
        creation.edgeType,
        `the stages linking this type reach ${domain.size.toLocaleString('en')} pairs between them`,
      );
    }
    if (targetDomain.size === 0) continue;

    const target = topologyTargets.get(targetKey);
    if (target === undefined) continue;

    const eligibleNodeCount = new Set(
      [...targetDomain.values()].flatMap((pair) => [pair.a, pair.b]),
    ).size;
    const existingInTargetDomain = subjectEdges.filter((edge) =>
      targetDomain.has(pairKey(edge.from, edge.to)),
    ).length;
    // A topology belongs to its stage, so earlier edges count only where they
    // are inside this stage's own eligible domain. Edges from a disjoint stage
    // remain in the safety union above but cannot satisfy this target.
    const outstanding =
      topologyTarget(target, targetDomain.size, eligibleNodeCount) -
      existingInTargetDomain;
    if (outstanding <= 0) continue;

    const available = [...targetDomain.entries()].filter(
      ([key]) => !taken.has(key),
    );
    for (const [key, pair] of shuffled(available, state.edgeStream).slice(
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
      const edge = state.buildEdge(pair.a, pair.b, creation.stageIndex, {});
      subjectEdges.push(edge);
      state.typeEdges.push(edge);
      plannedEdges.push(edge);
    }
  }

  const edges = edgeTypes.flatMap(
    ([type]) => stateByType.get(type)?.typeEdges ?? [],
  );

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
