import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateAttributesForEntity } from './attributes';
import {
  type EntityScopeRef,
  scopeKey,
  uniqueSlotMembers,
} from './constraints/generateEntityAttributes';
import { valueKey } from './constraints/uniqueRegistry';
import type { GenerationContext, NetworkDraft, StageOfType } from './context';
import { createEdgesForPairs } from './edges';
import { getStageFilteredEdges, getStageFilteredNodes } from './filtering';
import { createNodesForStage, type RosterDraw } from './nodes';
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

  // A stage form needs no fill pass of its own: `createNodesForStage` fills the
  // variables this creating stage collects as it builds each node.
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

    // Tapping a node toggles the prompt's highlight variable, so the synthetic
    // walk must settle it here now that node creation no longer fills unrelated
    // variables. Gate it exactly as the interface does: highlighting is the
    // alternative to edge creation and only runs when explicitly enabled.
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
