import {
  filter as getFilter,
  isStageSkipped,
  resolveSkipLogicDestinationIndex,
} from '@codaco/network-query';
import type { Stage } from '@codaco/protocol-validation';
import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  FRAMING_IDS,
  type NcEdge,
  type NcNetwork,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import type { StageEffectSummary, StageEffects } from '../analyse/stageEffects';
import type { GenerationContext, NetworkDraft } from '../context';
import { materializeFamilyPedigree } from '../familyPedigree/materializeFamilyPedigree';
import { familyPedigreeSeed } from '../familyPedigree/seed';
import type { ResolvedFamilyPedigreeGenerationOptions } from '../familyPedigree/types';
import { buildCurrentNetwork } from '../filtering';
import { markStageInProgress } from '../inProgress';
import type { NetworkPlan } from '../plan/networkPlan';

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

const pairKey = (a: string, b: string): string =>
  a < b ? `${a} ${b}` : `${b} ${a}`;

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

  // Final pair membership per edge type, for census answers and negatives.
  const finalPairsByType = new Map<string, Set<string>>();
  for (const edge of plan.edges) {
    const set = finalPairsByType.get(edge.type) ?? new Set<string>();
    set.add(pairKey(edge.from, edge.to));
    finalPairsByType.set(edge.type, set);
  }

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
      materializeFamilyPedigree(
        ctx,
        draft,
        stage,
        i,
        stages,
        reachableStages,
        familyPedigreeSeed(runSeed, stage.id),
        familyPedigree,
      );
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

    for (const creation of summary.edgeCreations) {
      for (const planned of plan.edges) {
        if (planned.creationStageIndex !== i) continue;
        if (planned.type !== creation.edgeType) continue;
        if (materialisedEdges.has(planned.uid)) continue;

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

    // --- Variable writes ------------------------------------------------
    for (const write of summary.writes) {
      if (write.entity === 'ego') {
        draft.egoAttributes[write.variableId] = valueFor(
          plan.ego,
          write.variableId,
        );
        continue;
      }
      if (write.entity === 'node') {
        for (const node of filteredSubjects(
          write.entityType ?? '',
          write.filter,
        )) {
          const planned = nodeByUid.get(node[entityPrimaryKeyProperty]);
          if (!planned) continue;
          node[entityAttributesProperty][write.variableId] = valueFor(
            planned,
            write.variableId,
          );
        }
        continue;
      }
      for (const edge of draft.edges) {
        if (edge.type !== write.entityType) continue;
        const planned = edgeByUid.get(edge[entityPrimaryKeyProperty]);
        if (!planned) continue;
        edge[entityAttributesProperty][write.variableId] = valueFor(
          planned,
          write.variableId,
        );
      }
    }

    // --- Stage metadata -------------------------------------------------
    if (stage.type === 'DyadCensus' || stage.type === 'TieStrengthCensus') {
      // Answers derive from final membership: a pair the plan linked is a
      // "yes" (even when the edge was created earlier and reused); a pair it
      // left unlinked is an explicit negative nomination. TieStrengthCensus
      // records negatives only — a positive lives as the ordinal value on
      // the edge itself.
      // Read as a draft throughout: Architect previews a stage while it is
      // still being authored, and a missing subject or prompt must leave the
      // preview without metadata rather than throw.
      const tuples: DyadCensusMetadataItem[] = [];
      const subjects = filteredSubjects(
        stage.subject?.type ?? '',
        'filter' in stage ? stage.filter : undefined,
      );
      (stage.prompts ?? []).forEach((prompt, promptIndex) => {
        const members = finalPairsByType.get(prompt.createEdge) ?? new Set();
        for (let a = 0; a < subjects.length; a++) {
          for (let b = a + 1; b < subjects.length; b++) {
            const uidA = subjects[a]![entityPrimaryKeyProperty];
            const uidB = subjects[b]![entityPrimaryKeyProperty];
            const linked = members.has(pairKey(uidA, uidB));
            if (stage.type === 'TieStrengthCensus' && linked) continue;
            tuples.push([promptIndex, uidA, uidB, linked]);
          }
        }
      });
      if (tuples.length > 0) draft.stageMetadata[i] = tuples;
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
