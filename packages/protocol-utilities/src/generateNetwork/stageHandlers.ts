import { v4 as uuid } from 'uuid';

import type { Stage } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_VALUES,
  FRAMING_IDS,
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  GAMETE_ROLES,
  type NcNode,
  RELATIONSHIP_TYPES,
  type VariableValue,
} from '@codaco/shared-consts';

import { claimFixedValues, generateAttributesForEntity } from './attributes';
import {
  type EntityScopeRef,
  scopeKey,
  uniqueSlotMembers,
} from './constraints/generateEntityAttributes';
import { withRuleTiedVariables } from './constraints/stageWrites';
import { valueKey } from './constraints/uniqueRegistry';
import type { GenerationContext, NetworkDraft, StageOfType } from './context';
import { createEdgesForPairs } from './edges';
import { getStageFilteredEdges, getStageFilteredNodes } from './filtering';
import { createNodesForStage, type RosterDraw } from './nodes';
import {
  generatePedigree,
  type PedigreeNomination,
} from './pedigree/generatePedigree';
import type { InheritancePattern } from './pedigree/inheritance';
import { PEDIGREE_RELATIONSHIP_TERMS } from './pedigree/render';
import { getSubjectType } from './subject';

export function handleNameGenerators(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<
    'NameGenerator' | 'NameGeneratorQuickAdd' | 'NameGeneratorRoster'
  >,
): void {
  const roster: RosterDraw = {
    pool: ctx.externalData?.[stage.id],
    used: ctx.usedRosterUids,
    allowFabrication: stage.type !== 'NameGeneratorRoster',
  };

  // A stage form needs no fill pass of its own: `createNodesForStage` gives
  // every node a value for every variable its type declares, so a form field
  // naming one is already answered, and a field naming anything else has no
  // codebook entry to generate from.
  let stageNodeCount = 0;
  for (const prompt of stage.prompts) {
    const newNodes = createNodesForStage(
      ctx,
      stage,
      prompt,
      draft.nodes.length,
      stageNodeCount,
      roster,
    );
    stageNodeCount += newNodes.length;
    draft.nodes.push(...newNodes);
  }
}

export function handleSociogram(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'Sociogram'>,
): void {
  const subjectType = getSubjectType(stage.subject, 'node');
  if (subjectType === undefined) return;

  const subjectNodes = getStageFilteredNodes(ctx, draft, stage, subjectType);

  for (const prompt of stage.prompts) {
    const createEdge = prompt.edges?.create;
    if (createEdge) {
      const { created } = createEdgesForPairs(
        ctx,
        subjectNodes,
        createEdge,
        ctx.valueGen.randomFloat(
          ctx.config.sociogramEdgeProbability.min,
          ctx.config.sociogramEdgeProbability.max,
        ),
        draft.edges,
      );
      // Reused pairs need nothing written: `toggleEdge` only adds or deletes,
      // and the Sociogram collects no variable of its own on an edge.
      draft.edges.push(...created.map(({ edge }) => edge));
    }

    const layoutVariable = prompt.layout?.layoutVariable;
    if (layoutVariable) {
      for (const node of subjectNodes) {
        node[entityAttributesProperty][layoutVariable] = {
          x: ctx.valueGen.randomFloat(
            ctx.config.sociogramLayoutRange.min,
            ctx.config.sociogramLayoutRange.max,
          ),
          y: ctx.valueGen.randomFloat(
            ctx.config.sociogramLayoutRange.min,
            ctx.config.sociogramLayoutRange.max,
          ),
        };
      }
    }

    // Tapping a node toggles the prompt's highlight variable, so this stage is
    // its writer. Nothing else in a protocol need name it, and node creation no
    // longer fills what the creating stage did not collect, so without this
    // pass a highlight variable would stay unset for the whole run.
    //
    // Gated exactly as the interface gates it: `Sociogram.tsx` reaches the
    // highlight branch only as the `else` of edge creation, and only when
    // `allowHighlighting` is on. Writing it unconditionally would overwrite
    // values an earlier stage collected and produce a network no interview
    // could have produced.
    const highlightVariable =
      prompt.highlight?.allowHighlighting === true && !createEdge
        ? prompt.highlight.variable
        : undefined;
    if (highlightVariable) {
      for (const node of subjectNodes) {
        node[entityAttributesProperty][highlightVariable] =
          ctx.valueGen.randomFloat(0, 1) <
          ctx.config.sociogramHighlightProbability;
      }
    }
  }
}

export function handleDyadCensus(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'DyadCensus' | 'OneToManyDyadCensus'>,
  stageIndex: number,
): void {
  const subjectType = getSubjectType(stage.subject, 'node');
  if (subjectType === undefined) return;

  const subjectNodes = getStageFilteredNodes(ctx, draft, stage, subjectType);

  // Both answers, as DyadCensus records them: a "yes" writes
  // `[promptIndex, a, b, true]` alongside the edge it may or may not have had
  // to create, and a "no" writes the same tuple with `false`. A pair reusing a
  // sibling prompt's edge is a "yes" — the interface pre-selects it from the
  // shared graph — so it belongs here rather than among the negatives, and
  // without it a resumed synthetic session would read that pair as unanswered.
  //
  // OneToManyDyadCensus shares this handler but records no stage metadata of
  // its own in the runtime, so its tuples are inert. Left as they were: the
  // divergence predates this and removing it is not a question about duplicate
  // edges.
  const responses: DyadCensusMetadataItem[] = [];
  for (let promptIndex = 0; promptIndex < stage.prompts.length; promptIndex++) {
    const createEdgeType = stage.prompts[promptIndex]!.createEdge;
    if (!createEdgeType) continue;

    const probability = ctx.valueGen.randomFloat(
      ctx.config.censusEdgeProbability.min,
      ctx.config.censusEdgeProbability.max,
    );
    const { created, reused, negativeIndices } = createEdgesForPairs(
      ctx,
      subjectNodes,
      createEdgeType,
      probability,
      draft.edges,
    );
    draft.edges.push(...created.map(({ edge }) => edge));

    for (const { indices } of [...created, ...reused]) {
      const [a, b] = indices;
      responses.push([
        promptIndex,
        subjectNodes[a]![entityPrimaryKeyProperty],
        subjectNodes[b]![entityPrimaryKeyProperty],
        true,
      ]);
    }

    for (const [a, b] of negativeIndices) {
      responses.push([
        promptIndex,
        subjectNodes[a]![entityPrimaryKeyProperty],
        subjectNodes[b]![entityPrimaryKeyProperty],
        false,
      ]);
    }
  }

  if (responses.length > 0) {
    draft.stageMetadata[stageIndex] = responses;
  }
}

export function handleTieStrengthCensus(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'TieStrengthCensus'>,
  stageIndex: number,
): void {
  const subjectType = getSubjectType(stage.subject, 'node');
  if (subjectType === undefined) return;

  const subjectNodes = getStageFilteredNodes(ctx, draft, stage, subjectType);

  // Negatives only, unlike DyadCensus: TieStrengthCensus records an ordinal
  // answer as the value on the edge and *removes* any metadata entry for the
  // pair, so its metadata never holds a positive tuple. A reused pair is an
  // ordinal answer, so it writes nothing here.
  const negativeResponses: DyadCensusMetadataItem[] = [];
  for (let promptIndex = 0; promptIndex < stage.prompts.length; promptIndex++) {
    const prompt = stage.prompts[promptIndex]!;
    const createEdgeType = prompt.createEdge;
    const edgeVariable = prompt.edgeVariable;
    if (!createEdgeType) continue;

    const probability = ctx.valueGen.randomFloat(
      ctx.config.censusEdgeProbability.min,
      ctx.config.censusEdgeProbability.max,
    );
    const { created, reused, negativeIndices } = createEdgesForPairs(
      ctx,
      subjectNodes,
      createEdgeType,
      probability,
      draft.edges,
    );

    if (edgeVariable) {
      // Over the reused edges as well as the new ones: an ordinal answer on a
      // pair that already has an edge dispatches `updateEdge` with just
      // `{ [edgeVariable]: value }`, and the reducer merges it into whatever
      // the edge already held. Regeneration goes through the draw machinery,
      // which releases the value it is replacing before drawing another.
      const answered = [...created, ...reused];
      for (let edgeIdx = 0; edgeIdx < answered.length; edgeIdx++) {
        const attrs = answered[edgeIdx]!.edge[entityAttributesProperty];
        Object.assign(
          attrs,
          generateAttributesForEntity(
            ctx,
            { entity: 'edge', type: createEdgeType },
            edgeIdx,
            { existing: attrs, only: new Set([edgeVariable]) },
          ),
        );
      }
    }

    draft.edges.push(...created.map(({ edge }) => edge));

    for (const [a, b] of negativeIndices) {
      negativeResponses.push([
        promptIndex,
        subjectNodes[a]![entityPrimaryKeyProperty],
        subjectNodes[b]![entityPrimaryKeyProperty],
        false,
      ]);
    }
  }

  if (negativeResponses.length > 0) {
    draft.stageMetadata[stageIndex] = negativeResponses;
  }
}

/**
 * The variables each node holds a value for that the `unique` registry did not
 * issue it — today a binning stage's prompt variable, the only attribute
 * written outside a form that a `unique` rule can reach (layout and location
 * variables take no validation at all).
 *
 * Read where a node is regenerated: the release a redraw makes gives back the
 * value the registry issued that node, and a value listed here is not one of
 * them.
 *
 * Keyed by the node itself rather than threaded through {@link
 * GenerationContext}, so it lives exactly as long as the nodes of the run that
 * wrote it. Every entry is unreachable once its run's network is, and the only
 * other entry point that builds a context — `SyntheticInterview`'s direct draw —
 * runs no stage handler and so has nothing to carry.
 */
const outOfBandWrites = new WeakMap<NcNode, Set<string>>();

/** The `unique` slot a node variable's value is issued from, if any. */
function uniqueSlotFor(
  ctx: GenerationContext,
  nodeType: string,
  variableId: string,
): { slot: string; memberIds: string[] } | undefined {
  const entity = ctx.entityConstraints.node.get(nodeType);
  if (entity === undefined) return undefined;

  for (const [slot, memberIds] of uniqueSlotMembers(entity)) {
    if (memberIds.includes(variableId)) return { slot, memberIds };
  }

  return undefined;
}

/**
 * Writes the value a binning stage's interaction decides onto a node, and
 * squares the `unique` registry with it.
 *
 * The value is not claimed. Neither binning interface renders a form field for
 * its prompt variable — OrdinalBin renders no `Field` at all, CategoricalBin one
 * only for a prompt's `otherVariable` — so the interview never validates it, and
 * two nodes sharing a bin is an arrangement the interface offers rather than a
 * duplicate to be prevented (49142e017).
 *
 * What the write does do is take off the node whatever the registry issued it
 * for that variable, and two things follow from that. The displaced value is
 * given back, because no node holds it any more and leaving it claimed drains a
 * space feasibility sized against the entity count. And the variable is recorded
 * as one the registry did not issue: a later form regenerating it is handed the
 * value the node currently holds, and would otherwise release a claim that is
 * not this node's — where two bin assignments collided, releasing that value for
 * the second node frees the first node's claim and the draw can issue it a
 * second time.
 */
function assignBinValue(
  ctx: GenerationContext,
  node: NcNode,
  scope: EntityScopeRef,
  variableId: string,
  value: VariableValue,
  uniqueSlot: { slot: string; memberIds: string[] } | undefined,
): void {
  const attrs = node[entityAttributesProperty];
  const previous = attrs[variableId];
  attrs[variableId] = value;

  if (uniqueSlot === undefined) return;

  const written = outOfBandWrites.get(node) ?? new Set<string>();
  // A value an earlier bin wrote was never issued to this node, so there is
  // nothing of this node's for this write to displace.
  const wasIssued = previous !== undefined && !written.has(variableId);

  // A bin landing on the value the node already carried displaces nothing: the
  // registry's claim still describes what the node holds, and the redraw a later
  // form makes should give it back as it always did.
  if (wasIssued && valueKey(value) === valueKey(previous)) return;

  written.add(variableId);
  outOfBandWrites.set(node, written);

  if (!wasIssued) return;

  // A `sameAs` sibling still carrying the issued value leaves the node holding
  // it, so the claim stays; dropping this variable from a later regeneration's
  // `existing` is what points the redraw's release at the sibling.
  const previousKey = valueKey(previous);
  const stillHeld = uniqueSlot.memberIds.some((id) => {
    const held = attrs[id];
    return held !== undefined && valueKey(held) === previousKey;
  });
  if (stillHeld) return;

  ctx.uniqueRegistry.release(scopeKey(scope), uniqueSlot.slot, previous);
}

export function handleOrdinalBin(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'OrdinalBin'>,
): void {
  const subjectType = getSubjectType(stage.subject, 'node');
  if (subjectType === undefined) return;

  const subjectNodes = getStageFilteredNodes(ctx, draft, stage, subjectType);
  const nodeTypeDef = ctx.codebook.node?.[subjectType];
  const scope: EntityScopeRef = { entity: 'node', type: subjectType };

  for (const prompt of stage.prompts) {
    const varDef = nodeTypeDef?.variables?.[prompt.variable];
    if (!varDef) continue;

    const variableOptions = 'options' in varDef ? (varDef.options ?? []) : [];
    if (variableOptions.length === 0) continue;

    const uniqueSlot = uniqueSlotFor(ctx, subjectType, prompt.variable);

    for (const node of subjectNodes) {
      const optionIndex = ctx.valueGen.randomInt(0, variableOptions.length - 1);
      assignBinValue(
        ctx,
        node,
        scope,
        prompt.variable,
        variableOptions[optionIndex]!.value,
        uniqueSlot,
      );
    }
  }
}

export function handleCategoricalBin(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'CategoricalBin'>,
): void {
  const subjectType = getSubjectType(stage.subject, 'node');
  if (subjectType === undefined) return;

  const subjectNodes = getStageFilteredNodes(ctx, draft, stage, subjectType);
  const nodeTypeDef = ctx.codebook.node?.[subjectType];
  const scope: EntityScopeRef = { entity: 'node', type: subjectType };

  for (const prompt of stage.prompts) {
    const varDef = nodeTypeDef?.variables?.[prompt.variable];
    if (!varDef) continue;

    const variableOptions =
      'options' in varDef
        ? (varDef.options?.filter((o) => typeof o.value !== 'boolean') ?? [])
        : [];
    if (variableOptions.length === 0) continue;

    const uniqueSlot = uniqueSlotFor(ctx, subjectType, prompt.variable);

    for (const node of subjectNodes) {
      const count = ctx.valueGen.randomInt(
        1,
        Math.min(2, variableOptions.length),
      );
      const picked: (string | number)[] = [];
      const startIdx = ctx.valueGen.randomInt(0, variableOptions.length - 1);
      for (let c = 0; c < count; c++) {
        picked.push(
          variableOptions[(startIdx + c) % variableOptions.length]!.value,
        );
      }
      assignBinValue(ctx, node, scope, prompt.variable, picked, uniqueSlot);
    }
  }
}

export function handleEgoForm(
  ctx: GenerationContext,
  draft: NetworkDraft,
): void {
  Object.assign(
    draft.egoAttributes,
    generateAttributesForEntity(ctx, { entity: 'ego' }, 0),
  );
}

/**
 * The values a regeneration resolves against, with the ones a stage wrote out of
 * band dropped from the variables being redrawn.
 *
 * A redraw gives a `unique` slot's value back before drawing the replacement,
 * and reads that value from `existing`. That is right for a value the registry
 * issued this entity, and wrong for one a binning stage wrote: the registry's
 * claim on such a value, if it holds one at all, belongs to whichever entity was
 * issued it, so handing it back frees a value somebody else still carries. A
 * variable being redrawn contributes nothing else through `existing` — a
 * comparison or `differentFrom` rule resolves against the *other* variables'
 * values — so dropping it costs the draw nothing.
 */
function existingForRegeneration(
  node: NcNode,
  regenerated: ReadonlySet<string>,
): Record<string, VariableValue> {
  const attrs = node[entityAttributesProperty];
  const written = outOfBandWrites.get(node);
  if (written === undefined) return attrs;

  const dropped = [...written].filter((id) => regenerated.has(id));
  if (dropped.length === 0) return attrs;

  const existing = { ...attrs };
  for (const id of dropped) delete existing[id];
  return existing;
}

/** Marks regenerated variables as the registry's again, now it has issued them. */
function clearOutOfBandWrites(
  node: NcNode,
  regenerated: ReadonlySet<string>,
): void {
  const written = outOfBandWrites.get(node);
  if (written === undefined) return;

  for (const id of regenerated) written.delete(id);
  if (written.size === 0) outOfBandWrites.delete(node);
}

export function handleAlterForm(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'AlterForm'>,
): void {
  const form = stage.form;
  if (!form) return;

  const subjectType = getSubjectType(stage.subject, 'node');
  if (subjectType === undefined) return;

  const subjectNodes = getStageFilteredNodes(ctx, draft, stage, subjectType);
  const formVarIds = new Set(form.fields.map((field) => field.variable));

  for (let nodeIndex = 0; nodeIndex < subjectNodes.length; nodeIndex++) {
    const node = subjectNodes[nodeIndex]!;
    Object.assign(
      node[entityAttributesProperty],
      generateAttributesForEntity(
        ctx,
        { entity: 'node', type: subjectType },
        nodeIndex,
        {
          existing: existingForRegeneration(node, formVarIds),
          only: formVarIds,
        },
      ),
    );
    clearOutOfBandWrites(node, formVarIds);
  }
}

export function handleAlterEdgeForm(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'AlterEdgeForm'>,
): void {
  const form = stage.form;
  if (!form) return;

  const subjectType = getSubjectType(stage.subject, 'edge');
  if (subjectType === undefined) return;

  const subjectEdges = getStageFilteredEdges(ctx, draft, stage, subjectType);
  const formVarIds = new Set(form.fields.map((field) => field.variable));

  for (let edgeIndex = 0; edgeIndex < subjectEdges.length; edgeIndex++) {
    const attrs = subjectEdges[edgeIndex]![entityAttributesProperty];
    Object.assign(
      attrs,
      generateAttributesForEntity(
        ctx,
        { entity: 'edge', type: subjectType },
        edgeIndex,
        { existing: attrs, only: formVarIds },
      ),
    );
  }
}

/** Holds one written value back from every `unique` slot that would issue it. */
function reserveWrittenValue(
  ctx: GenerationContext,
  ref: { entity: 'node' | 'edge'; type: string },
  variableId: string,
  value: VariableValue,
): void {
  const entity = ctx.entityConstraints[ref.entity].get(ref.type);
  if (entity === undefined) return;

  const registry = scopeKey(ref);
  for (const [slot, memberIds] of uniqueSlotMembers(entity)) {
    if (!memberIds.includes(variableId)) continue;
    ctx.uniqueRegistry.reserve(registry, slot, value);
  }
}

/**
 * Holds back the values every FamilyPedigree stage is going to write itself,
 * for the whole run and before any stage draws.
 *
 * These are values the interface writes rather than ones the generator picks,
 * so a `unique` variable carrying one has it spoken for from the start. A draw
 * that ran earlier knows nothing about it — the value only reaches the registry
 * when the pedigree's own entities are built — and a name generator ahead of
 * the pedigree is issued `true` on the first position of the slot's sequence,
 * which the pedigree then writes on its proband as well: the duplicate `unique`
 * forbids, on every seed. The pedigree's edge values are the same shape, and
 * are held for the same reason.
 *
 * Only the proband's `true` is held of the ego flag. Every pedigree marks
 * exactly one node ego whatever its node count, while the `false` on the others
 * is written only where the stage builds more than one — and holding both would
 * empty a boolean's domain, where a draw left nothing takes a reserved value
 * anyway and lands back on the collision. A protocol where that `false` is
 * genuinely contested has a pedigree of two or more nodes plus a node from
 * somewhere else, which is more entities than a two-value space covers and is
 * refused before any of this runs.
 *
 * The edge values are held once apiece for the same reason. A pedigree writing
 * one value onto two or more edges of a `unique` variable is a contradiction no
 * seed resolves and no reservation helps with, and is feasibility's to refuse
 * rather than the registry's to work around — the same division the ego flag's
 * `false` is settled by.
 */
export function reserveFamilyPedigreeFixedValues(
  ctx: GenerationContext,
  stages: Stage[],
): void {
  for (const stage of stages) {
    if (stage.type !== 'FamilyPedigree') continue;

    const nodeType = stage.nodeConfig?.type;
    if (nodeType !== undefined) {
      const nodeRef: EntityScopeRef = { entity: 'node', type: nodeType };

      // Every value the generator *may* write, not just the ones a given seed
      // does. Reservation runs once before the stage loop, so a slot cannot
      // hand one of these to an earlier stage and leave the pedigree unable to
      // write its own; claiming after the fact would be too late for anything
      // drawn before the pedigree runs.
      const egoVariable = stage.nodeConfig?.egoVariable;
      if (egoVariable) {
        for (const value of [true, false]) {
          reserveWrittenValue(ctx, nodeRef, egoVariable, value);
        }
      }

      const sexVariable = stage.nodeConfig?.biologicalSexVariable;
      if (sexVariable) {
        for (const value of BIOLOGICAL_SEX_VALUES) {
          reserveWrittenValue(ctx, nodeRef, sexVariable, [value]);
        }
      }

      const relationshipVariable = stage.nodeConfig?.relationshipVariable;
      if (relationshipVariable) {
        for (const value of PEDIGREE_RELATIONSHIP_TERMS) {
          reserveWrittenValue(ctx, nodeRef, relationshipVariable, value);
        }
      }

      // The nomination booleans, plus any disease variable a NarrativePedigree
      // renders from this pedigree — both end up on the same nodes.
      const nominated = new Set(
        (stage.nominationPrompts ?? []).map((prompt) => prompt.variable),
      );
      for (const candidate of stages) {
        if (candidate.type !== 'NarrativePedigree') continue;
        if (candidate.sourceStageId !== stage.id) continue;
        for (const disease of candidate.diseases)
          nominated.add(disease.variable);
      }
      for (const variable of nominated) {
        for (const value of [true, false]) {
          reserveWrittenValue(ctx, nodeRef, variable, value);
        }
      }
    }

    const edgeType = stage.edgeConfig?.type;
    if (edgeType === undefined) continue;
    const edgeRef: EntityScopeRef = { entity: 'edge', type: edgeType };

    const relationshipTypeVariable = stage.edgeConfig?.relationshipTypeVariable;
    if (relationshipTypeVariable) {
      for (const value of RELATIONSHIP_TYPES) {
        reserveWrittenValue(ctx, edgeRef, relationshipTypeVariable, [value]);
      }
    }

    const isActiveVariable = stage.edgeConfig?.isActiveVariable;
    if (isActiveVariable) {
      for (const value of [true, false]) {
        reserveWrittenValue(ctx, edgeRef, isActiveVariable, value);
      }
    }

    const carrierVariable = stage.edgeConfig?.isGestationalCarrierVariable;
    if (carrierVariable) {
      for (const value of [true, false]) {
        reserveWrittenValue(ctx, edgeRef, carrierVariable, value);
      }
    }

    const gameteRoleVariable = stage.edgeConfig?.gameteRoleVariable;
    if (gameteRoleVariable) {
      for (const value of GAMETE_ROLES) {
        reserveWrittenValue(ctx, edgeRef, gameteRoleVariable, [value]);
      }
    }
  }
}

export function handleFamilyPedigree(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'FamilyPedigree'>,
  stageIndex: number,
): void {
  const nodeType = stage.nodeConfig?.type;
  const edgeType = stage.edgeConfig?.type;
  if (!nodeType || !edgeType) return;

  // A pedigree is generated whole, by its own module, rather than assembled
  // from the generic attribute draw. Its variables are not attributes that
  // happen to sit on a person: sex, gamete role, relationship type and the edge
  // topology constrain one another, so filling them independently cannot
  // produce a pedigree. See `pedigree/generatePedigree.ts`.
  const scope: EntityScopeRef = { entity: 'node', type: nodeType };
  const nominations = pedigreeNominations(ctx, stage);

  const generated = generatePedigree({
    rng: ctx.valueGen,
    mode: ctx.config.pedigreeMode,
    config: {
      nodeType,
      edgeType,
      nodeLabelVariable: stage.nodeConfig?.nodeLabelVariable,
      egoVariable: stage.nodeConfig?.egoVariable,
      relationshipVariable: stage.nodeConfig?.relationshipVariable,
      biologicalSexVariable: stage.nodeConfig?.biologicalSexVariable,
      relationshipTypeVariable: stage.edgeConfig?.relationshipTypeVariable,
      isActiveVariable: stage.edgeConfig?.isActiveVariable,
      isGestationalCarrierVariable:
        stage.edgeConfig?.isGestationalCarrierVariable,
      gameteRoleVariable: stage.edgeConfig?.gameteRoleVariable,
    },
    nominations,
    maxPeople: Math.max(
      ctx.config.familyPedigreeNodeCount.max,
      ctx.config.familyPedigreeNodeCount.min,
    ),
    // The stage's own completeness rules. Ignoring them produces pedigrees the
    // interface would refuse to finalize — a `required` grandparents boundary
    // with no grandparents drawn — or ones deeper than it ever asked for.
    boundaries: stage.boundaries,
    // `participantChoice` records what the participant picked; a fixed framing
    // records itself. Either way the interface writes it, and the pedigree
    // layout reads it back.
    selectedFraming:
      stage.framing?.mode === 'fixed'
        ? stage.framing.value
        : FRAMING_IDS[ctx.valueGen.randomInt(0, FRAMING_IDS.length - 1)],
    nextId: () => uuid(),
    nextName: () => ctx.valueGen.generateName(),
    stageId: stage.id,
  });

  // Only what the stage itself collects: the fields its `nodeConfig.form`
  // renders. Everything else the pedigree writes — the proband flag, the
  // kinship term, the sex, the nominations — it settles directly, and a
  // variable the stage never asks about is left unset like any other stage's.
  //
  // Drawing the whole node type here would disagree with `pedigreeNodeVariables`,
  // which is what feasibility counts, so an unrelated `unique` variable would be
  // treated as unwritten during analysis and then spent on every pedigree
  // member during generation.
  const written = new Set(
    generated.nodes.flatMap((node) =>
      Object.keys(node[entityAttributesProperty]),
    ),
  );
  const collected = new Set<string>([
    ...written,
    ...(stage.nodeConfig?.form ?? []).map((field) => field.variable as string),
  ]);
  const toDraw = new Set(
    [
      ...withRuleTiedVariables(
        ctx.codebook.node?.[nodeType]?.variables,
        collected,
      ),
    ].filter((id) => !written.has(id)),
  );

  if (toDraw.size > 0) {
    generated.nodes.forEach((node, index) => {
      const attrs = node[entityAttributesProperty];
      Object.assign(
        attrs,
        generateAttributesForEntity(ctx, scope, draft.nodes.length + index, {
          existing: attrs,
          only: toDraw,
        }),
      );
    });
  }

  // Every value the pedigree wrote itself has to be claimed, or the registry
  // can hand the proband's own flag to a later entity.
  for (const node of generated.nodes) {
    claimFixedValues(ctx, scope, node[entityAttributesProperty]);
  }

  draft.nodes.push(...generated.nodes);
  draft.edges.push(...generated.edges);

  // The committed membership list, as the interface writes it. Without it
  // `pedigreeMemberIds` returns null and NarrativePedigree falls back to every
  // node of the pedigree's type — sweeping alters named by later stages onto
  // the family tree.
  draft.stageMetadata[stageIndex] = generated.metadata;
}

/**
 * The nomination prompts a pedigree writes, each paired with the inheritance
 * pattern it should follow.
 *
 * The pattern is read from the `NarrativePedigree` stage that renders this
 * pedigree, where one exists, so the generated data matches what will actually
 * be drawn: a dominant pathway rendered under a recessive model looks broken,
 * and the fault would appear to lie with the interface.
 */
function pedigreeNominations(
  ctx: GenerationContext,
  stage: StageOfType<'FamilyPedigree'>,
): PedigreeNomination[] {
  const patternByVariable = new Map<string, InheritancePattern>();
  for (const candidate of ctx.stages ?? []) {
    if (candidate.type !== 'NarrativePedigree') continue;
    if (candidate.sourceStageId !== stage.id) continue;
    for (const disease of candidate.diseases) {
      patternByVariable.set(disease.variable, disease.inheritancePattern);
    }
  }

  return (stage.nominationPrompts ?? []).map((prompt) => ({
    variable: prompt.variable,
    inheritancePattern:
      patternByVariable.get(prompt.variable) ?? 'autosomalDominant',
  }));
}

export function handleGeospatial(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'Geospatial'>,
): void {
  const subjectType = getSubjectType(stage.subject, 'node');
  if (subjectType === undefined) return;

  const subjectNodes = getStageFilteredNodes(ctx, draft, stage, subjectType);

  for (const prompt of stage.prompts) {
    const varId = prompt.variable;
    if (!varId) continue;

    for (const node of subjectNodes) {
      // ±180/±90 are the world-coordinate bounds (the coordinate space), not a
      // tuning knob, so they stay as literals.
      node[entityAttributesProperty][varId] = {
        x: ctx.valueGen.randomFloat(-180, 180),
        y: ctx.valueGen.randomFloat(-90, 90),
      };
    }
  }
}

export function handleNetworkComposer(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'NetworkComposer'>,
): void {
  const subjectType = getSubjectType(stage.subject, 'node');
  if (subjectType === undefined) return;

  // Network Composer builds the network from scratch: create nodes of the
  // subject type (populating their codebook attributes) and draw edges of each
  // configured edge type among them. It is promptless, so a synthetic prompt id
  // seeds creation, and it never draws from a roster.
  const newNodes = createNodesForStage(
    ctx,
    stage,
    { id: stage.id },
    draft.nodes.length,
    0,
    { used: ctx.usedRosterUids, allowFabrication: true },
  );
  draft.nodes.push(...newNodes);

  for (const edgeDef of stage.edges ?? []) {
    const edgeType = edgeDef.subject?.type;
    if (!edgeType) continue;
    const { created } = createEdgesForPairs(
      ctx,
      newNodes,
      edgeType,
      // A from-scratch builder rendered across several edge types at once; a
      // per-pair 30-50% probability produced a near-complete graph in the
      // preview, so this range keeps it sparse and readable.
      ctx.valueGen.randomFloat(
        ctx.config.networkComposerEdgeProbability.min,
        ctx.config.networkComposerEdgeProbability.max,
      ),
      draft.edges,
    );
    // Pushed inside the loop so two edge definitions naming one type see each
    // other's edges, the way the composer's own canvas would.
    draft.edges.push(...created.map(({ edge }) => edge));
  }
}
