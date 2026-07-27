import { v4 as uuid } from 'uuid';

import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { generateAttributesForEntity } from './attributes';
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
  const form = 'form' in stage ? stage.form : undefined;
  const subjectType = getSubjectType(stage.subject, 'node');

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

    // A stage form fills any codebook variables a drawn node does not yet have.
    // Values are indexed by the running node total (before these nodes are added).
    if (form && subjectType !== undefined) {
      const formVarIds = form.fields.map((field) => field.variable);
      for (const node of newNodes) {
        const attrs = node[entityAttributesProperty];
        const missing = new Set(
          formVarIds.filter((varId) => !(varId in attrs)),
        );
        if (missing.size === 0) continue;

        Object.assign(
          attrs,
          generateAttributesForEntity(
            ctx,
            { entity: 'node', type: subjectType },
            draft.nodes.length,
            { existing: attrs, only: missing },
          ),
        );
      }
    }

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

export function handleOrdinalBin(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'OrdinalBin'>,
): void {
  const subjectType = getSubjectType(stage.subject, 'node');
  if (subjectType === undefined) return;

  const subjectNodes = getStageFilteredNodes(ctx, draft, stage, subjectType);
  const nodeTypeDef = ctx.codebook.node?.[subjectType];

  for (const prompt of stage.prompts) {
    const varDef = nodeTypeDef?.variables?.[prompt.variable];
    if (!varDef) continue;

    const variableOptions = 'options' in varDef ? (varDef.options ?? []) : [];
    if (variableOptions.length === 0) continue;

    for (const node of subjectNodes) {
      const optionIndex = ctx.valueGen.randomInt(0, variableOptions.length - 1);
      node[entityAttributesProperty][prompt.variable] =
        variableOptions[optionIndex]!.value;
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

  for (const prompt of stage.prompts) {
    const varDef = nodeTypeDef?.variables?.[prompt.variable];
    if (!varDef) continue;

    const variableOptions =
      'options' in varDef
        ? (varDef.options?.filter((o) => typeof o.value !== 'boolean') ?? [])
        : [];
    if (variableOptions.length === 0) continue;

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
      node[entityAttributesProperty][prompt.variable] = picked;
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
    const attrs = subjectNodes[nodeIndex]![entityAttributesProperty];
    Object.assign(
      attrs,
      generateAttributesForEntity(
        ctx,
        { entity: 'node', type: subjectType },
        nodeIndex,
        { existing: attrs, only: formVarIds },
      ),
    );
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

  const familyNodes: NcNode[] = [];
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const attrs = generateAttributesForEntity(
      ctx,
      { entity: 'node', type: nodeType },
      draft.nodes.length + nodeIndex,
    );

    familyNodes.push({
      [entityPrimaryKeyProperty]: uuid(),
      type: nodeType,
      [entityAttributesProperty]: attrs,
      stageId: stage.id,
    });
  }

  // Attribute generation randomises egoVariable per node like any other boolean
  // codebook variable, but the runtime marks exactly one pedigree node as ego
  // (FamilyPedigree's egoCellTransform sets true on the proband and explicit
  // false on every other alter/partner/child). Pin that here, after
  // generation, so overwriting the attribute costs no RNG draws and the rest
  // of the stage's random stream is undisturbed.
  if (egoVariable) {
    familyNodes.forEach((node, index) => {
      node[entityAttributesProperty][egoVariable] = index === 0;
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
