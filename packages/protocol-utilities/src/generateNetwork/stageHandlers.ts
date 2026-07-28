import { v4 as uuid } from 'uuid';

import {
  type Stage,
  VARIABLE_REFERENCE_VALIDATIONS,
} from '@codaco/protocol-validation';
import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { claimFixedValues, generateAttributesForEntity } from './attributes';
import {
  type EntityScopeRef,
  scopeKey,
  uniqueSlotMembers,
} from './constraints/generateEntityAttributes';
import type { EntityConstraints } from './constraints/types';
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
      const { edges: newEdges } = createEdgesForPairs(
        ctx,
        subjectNodes,
        createEdge,
        ctx.valueGen.randomFloat(
          ctx.config.sociogramEdgeProbability.min,
          ctx.config.sociogramEdgeProbability.max,
        ),
      );
      draft.edges.push(...newEdges);
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

  const negativeResponses: DyadCensusMetadataItem[] = [];
  for (let promptIndex = 0; promptIndex < stage.prompts.length; promptIndex++) {
    const createEdgeType = stage.prompts[promptIndex]!.createEdge;
    if (!createEdgeType) continue;

    const probability = ctx.valueGen.randomFloat(
      ctx.config.censusEdgeProbability.min,
      ctx.config.censusEdgeProbability.max,
    );
    const { edges: newEdges, negativeIndices } = createEdgesForPairs(
      ctx,
      subjectNodes,
      createEdgeType,
      probability,
    );
    draft.edges.push(...newEdges);

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

export function handleTieStrengthCensus(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'TieStrengthCensus'>,
  stageIndex: number,
): void {
  const subjectType = getSubjectType(stage.subject, 'node');
  if (subjectType === undefined) return;

  const subjectNodes = getStageFilteredNodes(ctx, draft, stage, subjectType);

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
    const { edges: newEdges, negativeIndices } = createEdgesForPairs(
      ctx,
      subjectNodes,
      createEdgeType,
      probability,
    );

    if (edgeVariable) {
      for (let edgeIdx = 0; edgeIdx < newEdges.length; edgeIdx++) {
        const attrs = newEdges[edgeIdx]![entityAttributesProperty];
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

    draft.edges.push(...newEdges);

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

/**
 * Whether any rule of `entity` resolves against `variableId` — the variable
 * declaring a rule that names another, or another naming it as their target.
 *
 * A value fixed for a variable nothing resolves against changes no other
 * variable's, so this is what separates a pin the rest of the entity has to be
 * generated around from one that can simply be written on afterwards. Read from
 * the schema's own list of rules whose value is a variable id, so a rule added
 * there is accounted for here without this being updated.
 */
function ruleResolvesAgainst(
  entity: EntityConstraints,
  variableId: string,
): boolean {
  for (const [id, { constraints }] of entity) {
    for (const rule of VARIABLE_REFERENCE_VALIDATIONS) {
      const target = constraints[rule];
      if (target === undefined) continue;
      if (id === variableId || target === variableId) return true;
    }
  }

  return false;
}

/**
 * Whether `variableId`'s value is one the `unique` registry issues — its own
 * rule declaring it, or a rule holding it equal to a variable that does.
 *
 * Asked of the slots themselves rather than of the variable's own `unique`, so
 * the judgement is the one {@link claimFixedValues} goes on to act against.
 */
function isUniqueSlotVariable(
  entity: EntityConstraints,
  variableId: string,
): boolean {
  for (const memberIds of uniqueSlotMembers(entity).values()) {
    if (memberIds.includes(variableId)) return true;
  }

  return false;
}

/**
 * Holds back the ego flag every FamilyPedigree stage is going to write, for the
 * whole run and before any stage draws.
 *
 * The flag is a value the interface writes rather than one the generator picks,
 * so a `unique` variable carrying it has one value spoken for from the start. A
 * draw that ran earlier knows nothing about it — the flag only reaches the
 * registry when the pedigree's own nodes are built — and a name generator ahead
 * of the pedigree is issued `true` on the first position of the slot's
 * sequence, which the pedigree then writes on its proband as well: the
 * duplicate `unique` forbids, on every seed.
 *
 * Only the proband's `true` is held. Every pedigree marks exactly one node ego
 * whatever its node count, while the `false` on the others is written only
 * where the stage builds more than one — and holding both would empty a
 * boolean's domain, where a draw left nothing takes a reserved value anyway and
 * lands back on the collision. A protocol where that `false` is genuinely
 * contested has a pedigree of two or more nodes plus a node from somewhere
 * else, which is more entities than a two-value space covers and is refused
 * before any of this runs.
 */
export function reserveFamilyPedigreeEgoValues(
  ctx: GenerationContext,
  stages: Stage[],
): void {
  for (const stage of stages) {
    if (stage.type !== 'FamilyPedigree') continue;

    const nodeType = stage.nodeConfig?.type;
    const egoVariable = stage.nodeConfig?.egoVariable;
    if (nodeType === undefined || egoVariable === undefined) continue;

    const registry = scopeKey({ entity: 'node', type: nodeType });
    const entity = ctx.entityConstraints.node.get(nodeType);
    if (entity === undefined) continue;

    for (const [slot, memberIds] of uniqueSlotMembers(entity)) {
      if (!memberIds.includes(egoVariable)) continue;
      ctx.uniqueRegistry.reserve(registry, slot, true);
    }
  }
}

export function handleFamilyPedigree(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'FamilyPedigree'>,
  stageIndex: number,
): void {
  const nodeCount = ctx.valueGen.randomInt(
    ctx.config.familyPedigreeNodeCount.min,
    ctx.config.familyPedigreeNodeCount.max,
  );

  const nodeType = stage.nodeConfig?.type;
  const edgeType = stage.edgeConfig?.type;
  const egoVariable = stage.nodeConfig?.egoVariable;

  if (!nodeType) return;

  // Attribute generation randomises egoVariable per node like any other boolean
  // codebook variable, but the runtime marks exactly one pedigree node as ego
  // (FamilyPedigree's egoCellTransform sets true on the proband and explicit
  // false on every other alter/partner/child). That flag is therefore a value
  // fixed for the node rather than drawn for it.
  //
  // Where the flag's value is read by anything outside the node, it is settled
  // before anything is drawn and the rest of the node generated around it — the
  // mechanism a roster row and a prompt's `additionalAttributes` use — and then
  // claimed. Two things read it. A rule resolving against it: a `sameAs`
  // counterpart would otherwise keep whatever the shared draw landed on and the
  // finished node would break the rule generation had just satisfied. And the
  // `unique` registry: drawing a value that is thrown away leaves the registry
  // holding one no node carries while the value the node does carry is
  // unrecorded, so a later entity can be issued the proband's own flag.
  //
  // Where neither reads it, the flag is written after generation instead:
  // nothing resolves against it and no slot issues it, so drawing every
  // variable as before costs the pin no RNG draws and leaves the stage's random
  // stream where it was.
  const scope: EntityScopeRef = { entity: 'node', type: nodeType };
  const nodeVariables: EntityConstraints =
    ctx.entityConstraints.node.get(nodeType) ?? new Map();
  const drawnVariables =
    egoVariable &&
    (ruleResolvesAgainst(nodeVariables, egoVariable) ||
      isUniqueSlotVariable(nodeVariables, egoVariable))
      ? new Set([...nodeVariables.keys()].filter((id) => id !== egoVariable))
      : undefined;

  const familyNodes: NcNode[] = [];
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const fixed = egoVariable ? { [egoVariable]: nodeIndex === 0 } : undefined;

    const attrs = generateAttributesForEntity(
      ctx,
      scope,
      draft.nodes.length + nodeIndex,
      fixed && drawnVariables
        ? { existing: fixed, only: drawnVariables }
        : undefined,
    );
    if (fixed) Object.assign(attrs, fixed);
    if (fixed && drawnVariables) claimFixedValues(ctx, scope, fixed);

    familyNodes.push({
      [entityPrimaryKeyProperty]: uuid(),
      type: nodeType,
      [entityAttributesProperty]: attrs,
      stageId: stage.id,
    });
  }

  draft.nodes.push(...familyNodes);

  if (edgeType && familyNodes.length > 1) {
    for (let childIndex = 1; childIndex < familyNodes.length; childIndex++) {
      const parentIdx = ctx.valueGen.randomInt(
        0,
        Math.min(childIndex - 1, familyNodes.length - 1),
      );
      const edge: NcEdge = {
        [entityPrimaryKeyProperty]: uuid(),
        type: edgeType,
        from: familyNodes[parentIdx]![entityPrimaryKeyProperty],
        to: familyNodes[childIndex]![entityPrimaryKeyProperty],
        [entityAttributesProperty]: {},
      };
      draft.edges.push(edge);
    }
  }

  draft.stageMetadata[stageIndex] = { isNetworkCommitted: true };
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
    const { edges: newEdges } = createEdgesForPairs(
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
    );
    draft.edges.push(...newEdges);
  }
}
