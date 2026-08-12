import {
  filter as getFilter,
  isStageSkipped,
  resolveSkipLogicDestinationIndex,
} from '@codaco/network-query';
import { MAX_SYNTHETIC_PAIRS, type Stage } from '@codaco/protocol-validation';
import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNetwork,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import type { StageEffectSummary, StageEffects } from '../analyse/stageEffects';
import { constraintsFor, drawVariableOnto } from '../attributes';
import {
  type EntityScopeRef,
  scopeKey,
} from '../constraints/generateEntityAttributes';
import type { GenerationContext, NetworkDraft } from '../context';
import { materializeFamilyPedigree } from '../familyPedigree/materializeFamilyPedigree';
import { familyPedigreeSeed } from '../familyPedigree/seed';
import type { ResolvedFamilyPedigreeGenerationOptions } from '../familyPedigree/types';
import { buildCurrentNetwork } from '../filtering';
import { markStageInProgress } from '../inProgress';
import {
  equalityGroups,
  groupMissingProbability,
  missingProbabilities,
  missingProbabilitiesFor,
  refuseTooManyPairs,
  requiredVariables,
  requiredVariablesFor,
  type NetworkPlan,
  shuffled,
  topologyKey,
  topologyTarget,
} from '../plan/networkPlan';
import { deterministicUuid } from '../plan/random';

/**
 * The materialise phase: walks the protocol in interview order and replays
 * the plan as a session. Entities appear at their planned creating stage
 * carrying only what that interaction writes; each later writer lands the
 * planned final value (an intermediate equal to the final is the simplest
 * compatible intermediate); metadata is derived from final membership, so a
 * census pair the plan left unlinked becomes an explicit negative
 * nomination. Skip logic and filters are evaluated against the shadow
 * network — exactly what the interview has collected so far.
 */

export type MaterialisedSession = {
  network: NcNetwork;
  /** Stage metadata keyed by stage INDEX (the runtime reads it that way). */
  stageMetadata: Record<string, unknown> | null;
  currentStep: number;
  droppedOut: boolean;
};

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
 * The walk's own pair domain belongs to an (edge type, subject node type)
 * pair, for the reason the plan's does: a pair is two nodes of one type, so
 * creators over different types reach disjoint pairs and must not be measured
 * against one another. Length-prefixed for the same reason as `pairKey` —
 * both parts are arbitrary strings, so no separator is safe.
 */
const walkDomainKey = (edgeType: string, subjectNodeType: string): string =>
  `${encodeUid(edgeType)}${encodeUid(subjectNodeType)}`;

/**
 * An equality group as one key, and one entity's decision about that group as
 * another.
 *
 * Length-prefixed for `pairKey`'s reason: variable ids and roster uids are
 * arbitrary strings, so no separator is safe. Joined on NUL, the groups
 * ['a', 'b<NUL>c'] and ['a<NUL>b', 'c'] produced one key and shared a single
 * missingness decision, and a uid ending in a group key's opening characters
 * aliased another (uid, group) pair the same way — one entity's unanswered
 * question answered for another's. Escaping the random-source path fixed the
 * stream those keys address, not the keys themselves.
 */
export const missingGroupKey = (members: readonly string[]): string =>
  [...members].toSorted().map(encodeUid).join('');

export const missingDecisionKey = (uid: string, groupKey: string): string =>
  `${encodeUid(uid)}${encodeUid(groupKey)}`;

type Planned = {
  attributes: Record<string, VariableValue>;
  fixedAtCreation: Record<string, VariableValue>;
  missing: Set<string>;
};

/** The planned final state of one attribute: null when planned-missing. */
const valueFor = (planned: Planned, variableId: string): VariableValue =>
  planned.missing.has(variableId)
    ? null
    : (planned.attributes[variableId] ?? null);

/**
 * What an entity carries the moment it is created.
 *
 * A value the creating interaction fixes is written as the interaction writes
 * it, even where a later stage goes on to overwrite it — that later write is
 * what lands the planned final value, and the difference between the two is
 * the ordering effect a session should show. Everything else the creating
 * interaction writes is already planned as final.
 */
const creationValueFor = (
  planned: Planned,
  variableId: string,
): VariableValue =>
  variableId in planned.fixedAtCreation
    ? (planned.fixedAtCreation[variableId] ?? null)
    : valueFor(planned, variableId);

export function materialiseSession(params: {
  ctx: GenerationContext;
  effects: StageEffects;
  plan: NetworkPlan;
  stages: Stage[];
  simulateDropOut: boolean;
  inProgressStageIndex?: number;
  /** Stages feasibility judged reachable, which is where diseases are read. */
  reachableStages: readonly Stage[];
  runSeed: number;
  familyPedigree: ResolvedFamilyPedigreeGenerationOptions;
}): MaterialisedSession {
  const {
    ctx,
    effects,
    plan,
    stages,
    simulateDropOut,
    inProgressStageIndex,
    reachableStages,
    runSeed,
    familyPedigree,
  } = params;
  const source = ctx.valueGen.randomSource;

  const draft: NetworkDraft = {
    egoUid: plan.ego.uid,
    egoAttributes: {},
    nodes: [],
    edges: [],
    stageMetadata: {},
  };

  const nodeByUid = new Map(plan.nodes.map((node) => [node.uid, node]));
  const edgeByUid = new Map(plan.edges.map((edge) => [edge.uid, edge]));
  const materialisedNodes = new Set<string>();
  const materialisedEdges = new Set<string>();

  /**
   * The domain each walk-time topology is measured over, keyed by edge type
   * AND subject node type (see `walkDomainKey`), grown as the walk meets
   * creators of that type.
   *
   * Accumulated across creations and stages, not recomputed per creator, for
   * the reason the planner accumulates its own: two creators of one type can
   * have overlapping but different filtered subject sets, and a target
   * measured over each in turn is a target over neither. Two four-node
   * domains sharing two nodes at density 0.5 span eleven pairs and want six
   * edges; taken separately they want three and then three-less-the-shared,
   * which is five.
   */
  const walkPairsByType = new Map<string, Set<string>>();
  const walkNodesByType = new Map<string, Set<string>>();

  // Final pair membership per edge type, for the walk-time topology fallback.
  const finalPairsByType = new Map<string, Set<string>>();
  for (const edge of plan.edges) {
    const set = finalPairsByType.get(edge.type) ?? new Set<string>();
    set.add(pairKey(edge.from, edge.to));
    finalPairsByType.set(edge.type, set);
  }

  /**
   * What each census asked about, answered after the walk rather than during
   * it.
   *
   * A census answer is a claim about the network the session RETURNS. Read
   * from the plan mid-walk it was a claim about the completed session instead:
   * where `simulateDropOut` stops the walk after a census but before a later
   * creator of the same edge type, the census called a pair linked on the
   * strength of an edge that creator would have made, while the returned
   * network — which never reached it — holds no such edge. The subject set is
   * still a fact about the moment the census ran, so that is captured here;
   * only the answers wait.
   */
  const pendingCensus: {
    index: number;
    negativesOnly: boolean;
    prompts: string[];
    subjectUids: string[];
  }[] = [];

  /** Materialised subject nodes, narrowed by the stage filter when enabled. */
  const filteredSubjects = (
    entityType: string,
    filter: StageEffectSummary['writes'][number]['filter'],
  ): NcNode[] => {
    let candidates = draft.nodes.filter((node) => node.type === entityType);
    if (filter && ctx.respectSkipLogicAndFiltering) {
      const filtered = getFilter(filter)(buildCurrentNetwork(draft));
      const kept = new Set(
        filtered.nodes.map((node) => node[entityPrimaryKeyProperty]),
      );
      candidates = candidates.filter((node) =>
        kept.has(node[entityPrimaryKeyProperty]),
      );
    }
    return candidates;
  };

  /**
   * The edges one write reaches.
   *
   * A stage's filter narrows its edges exactly as it narrows its nodes: an
   * excluded edge is never presented, so writing to it would put values in the
   * dataset the interview never collected — values that go on to steer later
   * skip and filter decisions. A tie-strength write is narrower still, because
   * the census records a strength only for the pairs it actually walked: edges
   * between people outside its subject set were never asked about.
   */
  const writtenEdges = (
    write: StageEffectSummary['writes'][number],
  ): NcEdge[] => {
    let candidates = draft.edges.filter(
      (edge) => edge.type === write.entityType,
    );
    if (write.filter && ctx.respectSkipLogicAndFiltering) {
      const kept = new Set(
        getFilter(write.filter)(buildCurrentNetwork(draft)).edges.map(
          (edge) => edge[entityPrimaryKeyProperty],
        ),
      );
      candidates = candidates.filter((edge) =>
        kept.has(edge[entityPrimaryKeyProperty]),
      );
    }
    if (write.subjectNodeType !== undefined) {
      const subjects = new Set(
        filteredSubjects(write.subjectNodeType, write.filter).map(
          (node) => node[entityPrimaryKeyProperty],
        ),
      );
      candidates = candidates.filter(
        (edge) => subjects.has(edge.from) && subjects.has(edge.to),
      );
    }
    return candidates;
  };

  /**
   * Distinguishes successive draws onto entities the plan does not own, so two
   * pedigree edges given the same variable by one form do not draw identically.
   */
  let unplannedDraw = 0;

  /**
   * Lands one write on one entity.
   *
   * The plan is consulted first and used wherever it holds a value. It does
   * not always hold one, for two reasons that meet here. A FamilyPedigree
   * builds its people and links during this walk rather than in the plan; and
   * a variable no stage writes except behind a filter is deliberately left
   * unplanned, because only the session as it stands at this stage can say
   * which entities the filter admits — planning it for the whole type would
   * claim a `unique` value for every entity when the session gives it to a
   * few. Either way the value is drawn now, against the same constraints and
   * the same registry the plan drew against.
   */
  const missingByVariable = missingProbabilities(ctx.codebook);
  const requiredByVariable = requiredVariables(ctx.codebook);
  const groupsByScope = new Map<string, string[][]>();
  const groupsFor = (ref: EntityScopeRef): string[][] => {
    const key = scopeKey(ref);
    let groups = groupsByScope.get(key);
    if (groups === undefined) {
      groups = equalityGroups(constraintsFor(ctx, ref));
      groupsByScope.set(key, groups);
    }
    return groups;
  };

  /**
   * Missingness decisions already taken for an entity's equality group.
   *
   * A group's members can arrive here through separate writes, and the whole
   * point of deciding per group is that they agree: one member left null
   * beside a populated sibling is a session the `sameAs` validator rejects.
   * So the decision is taken once per entity and group and reused, rather
   * than redrawn for each member that happens to be written.
   */
  const unplannedMissing = new Map<string, boolean>();

  /**
   * Applies a declared `missingProbability` to a value drawn during the walk.
   *
   * The plan applies missingness to everything it draws, but not everything is
   * planned — a pedigree's people and a filtered-only write are both drawn
   * here. Without this a variable declared `missingProbability: 1` comes back
   * populated on exactly those entities, which is the declaration inverted.
   */
  /**
   * Whether the plan already answers some member of this equality group.
   *
   * A group holding an answered value is ANSWERED — the plan's own rule
   * (`certainlyMissingVariables`) exempts it for exactly this reason, and both
   * walk-time paths have to agree. Nulling such a group emits a session that
   * contradicts the `sameAs` it was built to satisfy: one member holding the
   * value its creating interaction fixed, the rest null beside it.
   */
  const groupHasPlannedAnswer = (
    members: readonly string[],
    planned: Planned | undefined,
  ): boolean =>
    planned !== undefined &&
    members.some(
      (id) =>
        id in planned.fixedAtCreation ||
        (id in planned.attributes && !planned.missing.has(id)),
    );

  const applyUnplannedMissingness = (
    ref: EntityScopeRef,
    uid: string,
    attributes: Record<string, VariableValue>,
    variableId: string,
    planned: Planned | undefined,
  ): void => {
    const members = groupsFor(ref).find((group) => group.includes(variableId));
    if (members === undefined) return;
    if (groupHasPlannedAnswer(members, planned)) return;
    // Per scope: one variable key can name separate definitions under two
    // entity types, and each declares its own missingness.
    const scope = scopeKey(ref);
    const probability = groupMissingProbability(
      members,
      missingProbabilitiesFor(missingByVariable, scope),
      requiredVariablesFor(requiredByVariable, scope),
    );
    if (probability <= 0) return;

    const groupKey = missingGroupKey(members);
    const decisionKey = missingDecisionKey(uid, groupKey);
    let decided = unplannedMissing.get(decisionKey);
    if (decided === undefined) {
      decided = source
        .stream('missing', 'unplanned', groupKey, uid)
        .bool(probability);
      unplannedMissing.set(decisionKey, decided);
    }
    if (!decided) return;
    for (const id of members) {
      if (id in attributes) attributes[id] = null;
    }
  };

  /**
   * Whether a group the walk is about to draw is certainly unanswered.
   *
   * The plan skips drawing these; the walk has to as well, and for the same
   * reason: a `unique` draw claims its value from the registry, so drawing one
   * only to null it can exhaust a small value space and fail a session whose
   * final state holds nothing. Feasibility exempts these groups too.
   */
  const certainlyMissing = (
    ref: EntityScopeRef,
    variableId: string,
    planned: Planned | undefined,
  ): boolean => {
    const members = groupsFor(ref).find((group) => group.includes(variableId));
    if (members === undefined) return false;
    // A group holding a value fixed at creation is ANSWERED, whatever the
    // declared missingness of its other members says — the plan's own rule
    // (`certainlyMissingVariables`) exempts it for exactly this reason. The
    // walk skipped that check, so a variable written only behind a filter and
    // declared certainly-missing was nulled beside a fixed `sameAs` sibling,
    // emitting a finished session that contradicts its own rule.
    if (groupHasPlannedAnswer(members, planned)) return false;
    const scope = scopeKey(ref);
    return (
      groupMissingProbability(
        members,
        missingProbabilitiesFor(missingByVariable, scope),
        requiredVariablesFor(requiredByVariable, scope),
      ) === 1
    );
  };

  const landWrite = (
    ref: EntityScopeRef,
    uid: string,
    attributes: Record<string, VariableValue>,
    planned: Planned | undefined,
    variableId: string,
  ): void => {
    if (
      planned &&
      (variableId in planned.attributes || planned.missing.has(variableId))
    ) {
      attributes[variableId] = valueFor(planned, variableId);
      return;
    }
    if (certainlyMissing(ref, variableId, planned)) {
      attributes[variableId] = null;
      return;
    }
    drawVariableOnto(ctx, ref, attributes, variableId, unplannedDraw++);
    applyUnplannedMissingness(ref, uid, attributes, variableId, planned);
  };

  const totalStages = stages.length;
  let currentStep = 0;
  let droppedOut = false;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    const summary = effects.stages[i]!;

    if (ctx.respectSkipLogicAndFiltering && stage.skipLogic) {
      const { skipLogic } = stage;
      if (isStageSkipped(skipLogic, buildCurrentNetwork(draft))) {
        const { destination } = skipLogic;
        if (destination) {
          const destinationIndex = resolveSkipLogicDestinationIndex(
            destination,
            stages,
            i,
          );
          if (destinationIndex !== undefined) {
            i = destinationIndex - 1;
          }
        }
        continue;
      }
    }

    if (simulateDropOut) {
      const dropOutChance = ((i + 1) / totalStages) * ctx.config.dropOutFactor;
      if (source.stream('dropout').next() < dropOutChance) {
        droppedOut = true;
        currentStep = i;
        break;
      }
    }

    if (summary.kind === 'content') continue;

    // --- Family pedigree ------------------------------------------------
    // A pedigree builds its own sub-network: a family is a structure, not a
    // population, and its people and links have to satisfy each other
    // (two genetic parents each, consistent sexes, an inheritance pattern the
    // diseases actually follow). The specialist generator owns that, so the
    // plan leaves this stage's entities to it and this walk hands over.
    if (stage.type === 'FamilyPedigree') {
      const beforePedigree = draft.edges.length;
      materializeFamilyPedigree(
        ctx,
        draft,
        stage,
        i,
        stages,
        reachableStages,
        familyPedigreeSeed(runSeed, stage.id),
        // One ceiling for every pedigree in the protocol. Nothing in the
        // protocol caps a family — the codebook describes what a family is,
        // not how big one gets — so this is the engine's own bound on optional
        // branches, already resolved against whatever the caller asked for.
        familyPedigree,
      );
      // The links the pedigree just drew are part of the final network, so a
      // census over that edge type has to see them as membership. Seeded only
      // from the plan, this map knew nothing of them, and the census reported
      // every existing family pair as unlinked — an explicit negative
      // nomination beside an edge the session actually holds.
      for (const edge of draft.edges.slice(beforePedigree)) {
        const pairs = finalPairsByType.get(edge.type) ?? new Set<string>();
        pairs.add(pairKey(edge.from, edge.to));
        finalPairsByType.set(edge.type, pairs);
      }
    }

    // --- Entity introduction -------------------------------------------
    for (const creation of summary.nodeCreations) {
      const prompts = 'prompts' in stage ? stage.prompts : undefined;
      for (const planned of plan.nodes) {
        if (planned.creationStageIndex !== i) continue;
        if (planned.type !== creation.nodeType) continue;
        if (materialisedNodes.has(planned.uid)) continue;

        // A new entity carries only what the creating interaction writes:
        // its form/quick-add fields, the prompt's fixed values, and — for a
        // roster draw — the row's own data.
        const writeSet = new Set<string>([
          ...creation.writesAtCreation,
          ...Object.keys(creation.promptFixedValues[planned.promptIndex] ?? {}),
          ...(planned.rosterRow
            ? Object.keys(planned.rosterRow[entityAttributesProperty])
            : []),
        ]);
        const attributes: Record<string, VariableValue> = {};
        for (const variableId of writeSet) {
          attributes[variableId] = creationValueFor(planned, variableId);
        }

        const promptIDs =
          creation.source === 'composer'
            ? [stage.id]
            : creation.source === 'pedigree'
              ? undefined
              : [prompts?.[planned.promptIndex]?.id ?? stage.id];

        const node = {
          [entityPrimaryKeyProperty]: planned.uid,
          type: planned.type,
          stageId: stage.id,
          ...(promptIDs ? { promptIDs } : {}),
          [entityAttributesProperty]: attributes,
        } as NcNode;
        materialisedNodes.add(planned.uid);
        draft.nodes.push(node);
      }
    }

    // Endpoints have to be in the session for an edge between them to be: a
    // creating stage the participant skipped introduced nobody, and an edge
    // planned onto its people would dangle from ids the network never held.
    const presentNodes = new Set(
      draft.nodes.map((node) => node[entityPrimaryKeyProperty]),
    );

    for (const creation of summary.edgeCreations) {
      // Who this interaction could actually join, for judging an edge planned
      // before it. Built lazily: only a retry consults it.
      let reach: Set<string> | undefined;
      const canJoin = (from: string, to: string): boolean => {
        if (reach === undefined) {
          let candidates = filteredSubjects(
            creation.subjectNodeType,
            creation.filter,
          );
          if (creation.ownNodesOnly) {
            candidates = candidates.filter((node) => node.stageId === stage.id);
          }
          reach = new Set(
            candidates.map((node) => node[entityPrimaryKeyProperty]),
          );
        }
        return reach.has(from) && reach.has(to);
      };

      for (const planned of plan.edges) {
        // `<=`, not `===`: an edge is planned at the earliest stage that could
        // create it, and skip logic can bypass exactly that stage while a
        // later one creates the same type. Pinning the edge to the index it
        // was planned at would strand it — the session would lose the planned
        // topology while the census answers, which read planned membership,
        // went on reporting those absent edges as links.
        if (planned.creationStageIndex > i) continue;
        if (planned.type !== creation.edgeType) continue;
        if (materialisedEdges.has(planned.uid)) continue;
        if (!presentNodes.has(planned.from)) continue;
        if (!presentNodes.has(planned.to)) continue;
        // A retry is being offered to an interaction that did not plan it, and
        // sharing an edge type is not the same as sharing a domain: a later
        // creator can have a different subject type, a narrower filter, or its
        // own nodes only. Landing the edge anyway would put one in the session
        // that no reachable stage could have presented. Only the retry is
        // judged this way — an edge planned for this very stage was already
        // drawn from its domain, and re-testing the filter against a
        // half-written session rather than the planned network would drop
        // edges whose filter reads a value a later stage writes.
        if (
          planned.creationStageIndex < i &&
          !canJoin(planned.from, planned.to)
        )
          continue;

        const attributes: Record<string, VariableValue> = {};
        for (const variableId of creation.writesAtCreation) {
          attributes[variableId] = creationValueFor(planned, variableId);
        }
        const edge = {
          [entityPrimaryKeyProperty]: planned.uid,
          type: planned.type,
          from: planned.from,
          to: planned.to,
          [entityAttributesProperty]: attributes,
        } as NcEdge;
        materialisedEdges.add(planned.uid);
        draft.edges.push(edge);
      }
    }

    // A FamilyPedigree builds its people during this walk, so the plan had no
    // domain over which to place a later census or sociogram's edges between
    // them — it would have been pairing nodes that did not yet exist. The same
    // declared topology is applied here to exactly the pairs the plan could
    // not see: every candidate below has at least one endpoint the plan never
    // held, so nothing the plan already decided is drawn twice.
    for (const creation of summary.edgeCreations) {
      if (creation.structured !== null) continue;
      const target = plan.topologyTargets.get(topologyKey(creation));
      if (target === undefined) continue;

      const subjects = filteredSubjects(
        creation.subjectNodeType,
        creation.filter,
      );
      const linked = new Set(
        draft.edges
          .filter((edge) => edge.type === creation.edgeType)
          .map((edge) => pairKey(edge.from, edge.to)),
      );
      // Measured over the whole subject graph and reduced by what that graph
      // already holds, rather than targeted independently at the partition
      // this block can add to.
      //
      // Two reasons, and mean degree is the one that makes it necessary. It is
      // a property of a graph, not of a subset: the plan has already emitted
      // `meanDegree × plannedNodes / 2`, so a fallback drawing another
      // `meanDegree × itsOwnEndpoints / 2` overshoots the declared degree
      // outright. Density survives the subset reading arithmetically, but not
      // repetition — every prompt creating the type reaches this block, and a
      // fresh target against the unlinked remainder applies the declared
      // density again to what the last pass left: two passes at 0.5 leaving
      // 0.75. Counting what exists towards the target settles both.
      //
      // The domain is also carried between creators rather than rebuilt for
      // each, so two whose filtered subject sets overlap without matching are
      // measured over their union.
      //
      // Kept per (edge type, SUBJECT node type), as the plan keeps its own
      // domains. A pair is two nodes of one type, so creators over different
      // types reach disjoint pairs — and a domain spanning both let a
      // density-1 creator over `place` put its pairs into the target measured
      // for a later density-0.5 creator over `person`, which then subtracted
      // the place edge and made fewer person edges than `person`'s own
      // declared topology asks for.
      const domainKey = walkDomainKey(
        creation.edgeType,
        creation.subjectNodeType,
      );
      const domainPairs = walkPairsByType.get(domainKey) ?? new Set<string>();
      walkPairsByType.set(domainKey, domainPairs);
      const domainNodes = walkNodesByType.get(domainKey) ?? new Set<string>();
      walkNodesByType.set(domainKey, domainNodes);

      // Counted BEFORE the pairs are built, for the reason the plan counts its
      // own: pairs grow quadratically, and this is the walk's separate domain
      // — nodes a FamilyPedigree builds during materialisation are not in the
      // plan's, so the ceiling the planner applies never sees them. A raised
      // pedigree ceiling, or enough pedigree stages, would assemble millions
      // of keys synchronously on Architect's main thread.
      const possiblePairs = (subjects.length * (subjects.length - 1)) / 2;
      if (domainPairs.size + possiblePairs > MAX_SYNTHETIC_PAIRS) {
        refuseTooManyPairs(
          ctx,
          creation.edgeType,
          `${subjects.length.toLocaleString('en')} people are eligible to be linked here, reaching ` +
            `${(domainPairs.size + possiblePairs).toLocaleString('en')} pairs with those the stages before it reached`,
        );
      }

      const reachable: { a: string; b: string; linked: boolean }[] = [];
      for (let a = 0; a < subjects.length; a++) {
        for (let b = a + 1; b < subjects.length; b++) {
          const uidA = subjects[a]![entityPrimaryKeyProperty];
          const uidB = subjects[b]![entityPrimaryKeyProperty];
          domainPairs.add(pairKey(uidA, uidB));
          domainNodes.add(uidA);
          domainNodes.add(uidB);
          // Only pairs the plan could not reach are this block's to add: one
          // whose endpoints it both held was already decided.
          if (nodeByUid.has(uidA) && nodeByUid.has(uidB)) continue;
          reachable.push({
            a: uidA,
            b: uidB,
            linked: linked.has(pairKey(uidA, uidB)),
          });
        }
      }
      if (reachable.length === 0) continue;

      // What the accumulated domain already holds, however it came to hold it.
      let domainLinked = 0;
      for (const key of domainPairs) if (linked.has(key)) domainLinked += 1;

      // Reuse, not replacement: a pair this type already joins was answered
      // when that edge was made, exactly as `edgeExists` has the interview
      // reuse it, so it counts towards the target rather than being redrawn.
      const outstanding =
        topologyTarget(target, domainPairs.size, domainNodes.size) -
        domainLinked;
      if (outstanding <= 0) continue;

      const ref = { entity: 'edge' as const, type: creation.edgeType };
      const chosen = shuffled(
        reachable.filter((pair) => !pair.linked),
        source.stream('edges', 'unplanned', creation.edgeType),
      ).slice(0, outstanding);

      // The census answers below read final membership, so a pair joined here
      // has to join the set they read. Left out, the same pair would carry an
      // edge and a negative nomination saying it has none.
      const finalPairs =
        finalPairsByType.get(creation.edgeType) ?? new Set<string>();
      finalPairsByType.set(creation.edgeType, finalPairs);

      for (const pair of chosen) {
        const attributes: Record<string, VariableValue> = {};
        const uid = deterministicUuid(
          source.stream('id', 'edge', 'unplanned', creation.edgeType),
        );
        draft.edges.push({
          [entityPrimaryKeyProperty]: uid,
          type: creation.edgeType,
          from: pair.a,
          to: pair.b,
          [entityAttributesProperty]: attributes,
        } as NcEdge);
        finalPairs.add(pairKey(pair.a, pair.b));
        for (const variableId of creation.writesAtCreation) {
          drawVariableOnto(ctx, ref, attributes, variableId, unplannedDraw++);
          // Every variable written at an edge's creation currently also has a
          // population write that would apply this later, so no protocol shape
          // tells the two apart today. It is applied at the draw anyway: this
          // is where the value comes into being, and leaving the declaration
          // to be honoured by a separate write is a coincidence of the two
          // models agreeing, not something this code establishes.
          // No planned entity: this edge is brought into being by the walk
          // itself, so the plan holds no answer for its group to preserve.
          applyUnplannedMissingness(
            ref,
            uid,
            attributes,
            variableId,
            undefined,
          );
        }
      }
    }

    // --- Variable writes ------------------------------------------------
    // A FamilyPedigree's own writes — its nomination and disease variables —
    // are landed by the generator that built the family, which is the only
    // thing that knows which of its people each one applies to, and which
    // normalises them across the families an earlier stage committed. Replaying
    // them here would overwrite that with an independent draw.
    const writes = stage.type === 'FamilyPedigree' ? [] : summary.writes;
    for (const write of writes) {
      if (write.entity === 'ego') {
        draft.egoAttributes[write.variableId] = valueFor(
          plan.ego,
          write.variableId,
        );
        continue;
      }
      if (write.entity === 'node') {
        const ref = { entity: 'node' as const, type: write.entityType ?? '' };
        for (const node of filteredSubjects(
          write.entityType ?? '',
          write.filter,
        )) {
          landWrite(
            ref,
            node[entityPrimaryKeyProperty],
            node[entityAttributesProperty],
            nodeByUid.get(node[entityPrimaryKeyProperty]),
            write.variableId,
          );
        }
        continue;
      }
      const ref = { entity: 'edge' as const, type: write.entityType ?? '' };
      for (const edge of writtenEdges(write)) {
        landWrite(
          ref,
          edge[entityPrimaryKeyProperty],
          edge[entityAttributesProperty],
          edgeByUid.get(edge[entityPrimaryKeyProperty]),
          write.variableId,
        );
      }
    }

    // --- Stage metadata -------------------------------------------------
    if (stage.type === 'DyadCensus' || stage.type === 'TieStrengthCensus') {
      // The pairs this census asked about, recorded now because the subject
      // set is a fact about this moment in the walk. What it ANSWERS is
      // settled once the walk is over — see `censusAnswers`.
      //
      // Read as a draft throughout: Architect previews a stage while it is
      // still being authored, and a missing subject or prompt must leave the
      // preview without metadata rather than throw.
      const subjects = filteredSubjects(
        stage.subject?.type ?? '',
        'filter' in stage ? stage.filter : undefined,
      );
      pendingCensus.push({
        index: i,
        negativesOnly: stage.type === 'TieStrengthCensus',
        prompts: (stage.prompts ?? []).map((prompt) => prompt.createEdge),
        subjectUids: subjects.map((node) => node[entityPrimaryKeyProperty]),
      });
      // A FamilyPedigree's metadata — its committed membership snapshot and
      // chosen framing — is written by the generator that built the family,
      // which is the only thing that knows which entities are in it.
    } else if (stage.type === 'NetworkComposer') {
      // Generated sessions report automatic layout rather than fabricating
      // hand-placed positions.
      draft.stageMetadata[i] = { automaticLayout: true };
    }
  }

  if (!droppedOut) {
    currentStep = totalStages;
  }

  // Census answers, settled against the network the session actually returns.
  // A pair the walk joined is a "yes" — including one an earlier stage created
  // and this census reused, exactly as the interview's own `edgeExists` reads
  // it — and a pair left unjoined is an explicit negative nomination.
  // TieStrengthCensus records negatives only: a positive lives as the ordinal
  // value on the edge itself.
  const walkedPairsByType = new Map<string, Set<string>>();
  for (const edge of draft.edges) {
    const set = walkedPairsByType.get(edge.type) ?? new Set<string>();
    set.add(pairKey(edge.from, edge.to));
    walkedPairsByType.set(edge.type, set);
  }
  for (const census of pendingCensus) {
    const tuples: DyadCensusMetadataItem[] = [];
    census.prompts.forEach((createEdge, promptIndex) => {
      const members = walkedPairsByType.get(createEdge) ?? new Set<string>();
      for (let a = 0; a < census.subjectUids.length; a++) {
        for (let b = a + 1; b < census.subjectUids.length; b++) {
          const uidA = census.subjectUids[a]!;
          const uidB = census.subjectUids[b]!;
          const linked = members.has(pairKey(uidA, uidB));
          if (census.negativesOnly && linked) continue;
          tuples.push([promptIndex, uidA, uidB, linked]);
        }
      }
    });
    if (tuples.length > 0) draft.stageMetadata[census.index] = tuples;
  }

  // Applied as a post-pass: later stages may rewrite the same variable, so
  // values must be cleared after all stages have run.
  const inProgressStage =
    inProgressStageIndex !== undefined
      ? stages[inProgressStageIndex]
      : undefined;
  if (inProgressStage) {
    markStageInProgress(ctx, draft, inProgressStage);
  }

  return {
    network: buildCurrentNetwork(draft),
    stageMetadata:
      Object.keys(draft.stageMetadata).length > 0 ? draft.stageMetadata : null,
    currentStep,
    droppedOut,
  };
}
