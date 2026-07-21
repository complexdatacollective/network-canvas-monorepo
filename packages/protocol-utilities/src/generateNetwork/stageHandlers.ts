import { v4 as uuid } from 'uuid';

import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { generateAttributes, toVariableEntry } from './attributes';
import type { GenerationContext, NetworkDraft, StageOfType } from './context';
import { createEdgesForPairs } from './edges';
import { getStageFilteredEdges, getStageFilteredNodes } from './filtering';
import { createNodesForStage, type RosterDraw } from './nodes';

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
  const nodeTypeDef = ctx.codebook.node?.[stage.subject.type];

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
    if (form && nodeTypeDef?.variables) {
      const formVarIds = new Set(form.fields.map((f) => f.variable));
      for (const node of newNodes) {
        const attrs = node[entityAttributesProperty];
        for (const varId of formVarIds) {
          const varDef = nodeTypeDef.variables[varId];
          if (varDef && !(varId in attrs)) {
            const entry = toVariableEntry(varId, varDef);
            attrs[varId] = ctx.valueGen.generateForVariable(
              entry,
              draft.nodes.length,
            );
          }
        }
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
  const subjectNodes = getStageFilteredNodes(
    ctx,
    draft,
    stage,
    stage.subject.type,
  );

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
        ctx.codebook.edge?.[createEdge]?.variables,
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
  const subjectNodes = getStageFilteredNodes(
    ctx,
    draft,
    stage,
    stage.subject.type,
  );

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
      ctx.codebook.edge?.[createEdgeType]?.variables,
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
  const subjectNodes = getStageFilteredNodes(
    ctx,
    draft,
    stage,
    stage.subject.type,
  );

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
    const edgeTypeDef = ctx.codebook.edge?.[createEdgeType];
    const { edges: newEdges, negativeIndices } = createEdgesForPairs(
      ctx,
      subjectNodes,
      createEdgeType,
      probability,
      edgeTypeDef?.variables,
    );

    const edgeVarDef = edgeVariable
      ? edgeTypeDef?.variables?.[edgeVariable]
      : undefined;
    if (edgeVariable && edgeVarDef) {
      for (let edgeIdx = 0; edgeIdx < newEdges.length; edgeIdx++) {
        const entry = toVariableEntry(edgeVariable, edgeVarDef);
        newEdges[edgeIdx]![entityAttributesProperty][edgeVariable] =
          ctx.valueGen.generateForVariable(entry, edgeIdx);
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
  const subjectNodes = getStageFilteredNodes(
    ctx,
    draft,
    stage,
    stage.subject.type,
  );
  const nodeTypeDef = ctx.codebook.node?.[stage.subject.type];

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
  const subjectNodes = getStageFilteredNodes(
    ctx,
    draft,
    stage,
    stage.subject.type,
  );
  const nodeTypeDef = ctx.codebook.node?.[stage.subject.type];

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
  const egoVars = ctx.codebook.ego?.variables;
  if (egoVars) {
    Object.assign(
      draft.egoAttributes,
      generateAttributes(egoVars, ctx.valueGen, 0),
    );
  }
}

export function handleAlterForm(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'AlterForm'>,
): void {
  const form = stage.form;
  if (!form) return;

  const subjectNodes = getStageFilteredNodes(
    ctx,
    draft,
    stage,
    stage.subject.type,
  );
  const nodeTypeDef = ctx.codebook.node?.[stage.subject.type];
  if (!nodeTypeDef?.variables) return;

  const formVarIds = form.fields.map((f) => f.variable);

  for (let nodeIndex = 0; nodeIndex < subjectNodes.length; nodeIndex++) {
    const node = subjectNodes[nodeIndex]!;
    for (const varId of formVarIds) {
      const varDef = nodeTypeDef.variables[varId];
      if (varDef) {
        const entry = toVariableEntry(varId, varDef);
        node[entityAttributesProperty][varId] =
          ctx.valueGen.generateForVariable(entry, nodeIndex);
      }
    }
  }
}

export function handleAlterEdgeForm(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'AlterEdgeForm'>,
): void {
  const form = stage.form;
  if (!form) return;

  const subjectEdges = getStageFilteredEdges(
    ctx,
    draft,
    stage,
    stage.subject.type,
  );
  const edgeTypeDef = ctx.codebook.edge?.[stage.subject.type];
  if (!edgeTypeDef?.variables) return;

  const formVarIds = form.fields.map((f) => f.variable);

  for (let edgeIndex = 0; edgeIndex < subjectEdges.length; edgeIndex++) {
    const edge = subjectEdges[edgeIndex]!;
    for (const varId of formVarIds) {
      const varDef = edgeTypeDef.variables[varId];
      if (varDef) {
        const entry = toVariableEntry(varId, varDef);
        edge[entityAttributesProperty][varId] =
          ctx.valueGen.generateForVariable(entry, edgeIndex);
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
  const nodeCount = ctx.valueGen.randomInt(
    ctx.config.familyPedigreeNodeCount.min,
    ctx.config.familyPedigreeNodeCount.max,
  );

  const nodeType = stage.nodeConfig?.type;
  const nodeTypeDef = nodeType ? ctx.codebook.node?.[nodeType] : undefined;
  const edgeType = stage.edgeConfig?.type;

  if (!nodeType) return;

  const familyNodes: NcNode[] = [];
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const attrs = generateAttributes(
      nodeTypeDef?.variables,
      ctx.valueGen,
      draft.nodes.length + nodeIndex,
    );

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
  const subjectNodes = getStageFilteredNodes(
    ctx,
    draft,
    stage,
    stage.subject.type,
  );

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
      ctx.codebook.edge?.[edgeType]?.variables,
    );
    draft.edges.push(...newEdges);
  }
}
