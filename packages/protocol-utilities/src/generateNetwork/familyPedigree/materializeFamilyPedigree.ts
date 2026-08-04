import { v4 as uuid } from 'uuid';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { ValueGenerator } from '../../ValueGenerator';
import {
  claimFixedValues,
  generateAttributesForEntity,
  replaceFixedValues,
} from '../attributes';
import { SyntheticDataConstraintError } from '../constraints/error';
import type { EntityScopeRef } from '../constraints/generateEntityAttributes';
import { COMPARISON_RULES, type EntityConstraints } from '../constraints/types';
import type { GenerationContext, NetworkDraft, StageOfType } from '../context';
import { ruleBrokenByFixedValues } from '../nodes';
import { generateFamilyPedigreePlan } from './generateFamilyPedigree';
import type {
  PedigreeDisease,
  PedigreeRelationship,
  ResolvedFamilyPedigreeGenerationOptions,
} from './types';

function diseasesForStage(
  stage: StageOfType<'FamilyPedigree'>,
  stages: readonly Stage[],
): PedigreeDisease[] {
  const byVariable = new Map<string, PedigreeDisease>();

  for (const prompt of stage.nominationPrompts ?? []) {
    byVariable.set(prompt.variable, {
      variable: prompt.variable,
      inheritancePattern: 'unknown',
    });
  }

  for (const candidate of stages) {
    if (
      candidate.type !== 'NarrativePedigree' ||
      candidate.sourceStageId !== stage.id
    ) {
      continue;
    }
    for (const disease of candidate.diseases) {
      byVariable.set(disease.variable, {
        variable: disease.variable,
        inheritancePattern: disease.inheritancePattern,
      });
    }
  }

  return [...byVariable.values()];
}

function variableName(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  variableId: string,
): string {
  if (ref.entity === 'ego') {
    return ctx.codebook.ego?.variables?.[variableId]?.name ?? variableId;
  }
  return (
    ctx.codebook[ref.entity]?.[ref.type]?.variables?.[variableId]?.name ??
    variableId
  );
}

function assertFixedValuesAccepted(
  ctx: GenerationContext,
  ref: EntityScopeRef,
  fixed: Record<string, VariableValue>,
): void {
  const constraints =
    ref.entity === 'ego'
      ? ctx.entityConstraints.ego
      : (ctx.entityConstraints[ref.entity].get(ref.type) ?? new Map());
  const broken = ruleBrokenByFixedValues(constraints, fixed);
  if (!broken) return;

  throw new SyntheticDataConstraintError(
    [
      {
        entity: ref.entity,
        ...(ref.entity === 'ego' ? {} : { entityType: ref.type }),
        variableIds: broken.variableIds,
        variableNames: broken.variableIds.map((id) =>
          variableName(ctx, ref, id),
        ),
        rules: [broken.rule],
        reason:
          'the FamilyPedigree data model requires the fixed semantic value ' +
          broken.values.map(String).join(' and '),
      },
    ],
    'the FamilyPedigree configuration rejects a value required by its data model',
  );
}

function edgeAttributes(
  edgeConfig: Partial<StageOfType<'FamilyPedigree'>['edgeConfig']>,
  relationship: PedigreeRelationship,
): Record<string, VariableValue> {
  const attributes: Record<string, VariableValue> = {};
  if (edgeConfig.relationshipTypeVariable) {
    attributes[edgeConfig.relationshipTypeVariable] = [
      relationship.relationshipType,
    ];
  }
  if (edgeConfig.isActiveVariable) {
    attributes[edgeConfig.isActiveVariable] = relationship.isActive;
  }
  if (
    relationship.isGestationalCarrier &&
    edgeConfig.isGestationalCarrierVariable
  ) {
    attributes[edgeConfig.isGestationalCarrierVariable] = true;
  }
  if (relationship.gameteRole && edgeConfig.gameteRoleVariable) {
    attributes[edgeConfig.gameteRoleVariable] = [relationship.gameteRole];
  }
  return attributes;
}

const REFERENCE_RULES = [
  'sameAs',
  'differentFrom',
  ...COMPARISON_RULES,
] as const;

/** Variables in the same cross-variable constraint component as a fixed flag. */
function constraintConnectedVariables(
  constraints: EntityConstraints,
  fixedIds: Iterable<string>,
): Set<string> {
  const connected = new Set(fixedIds);
  const neighbours = new Map<string, Set<string>>();

  for (const [id, variable] of constraints) {
    for (const rule of REFERENCE_RULES) {
      const target = variable.constraints[rule];
      if (target === undefined || !constraints.has(target)) continue;
      const from = neighbours.get(id) ?? new Set<string>();
      const to = neighbours.get(target) ?? new Set<string>();
      from.add(target);
      to.add(id);
      neighbours.set(id, from);
      neighbours.set(target, to);
    }
  }

  const pending = [...connected];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined) break;
    for (const neighbour of neighbours.get(id) ?? []) {
      if (connected.has(neighbour)) continue;
      connected.add(neighbour);
      pending.push(neighbour);
    }
  }

  return connected;
}

export function materializeFamilyPedigree(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'FamilyPedigree'>,
  stageIndex: number,
  stages: readonly Stage[],
  familySeed: number,
  options: ResolvedFamilyPedigreeGenerationOptions,
): void {
  const nodeConfig = stage.nodeConfig as Partial<typeof stage.nodeConfig>;
  const edgeConfig = stage.edgeConfig as Partial<typeof stage.edgeConfig>;
  const nodeType = nodeConfig?.type;
  const edgeType = edgeConfig?.type;
  if (!nodeType) return;
  const diseases = diseasesForStage(stage, stages);

  const familyCtx: GenerationContext = {
    ...ctx,
    // Topology, family-specific attributes, and names live on a dedicated
    // seeded stream. Changing a pedigree cannot move the random stream used by
    // any other stage, and adding an earlier ordinary stage cannot reshape it.
    valueGen: new ValueGenerator(familySeed, ctx.config.today),
  };
  const plan = generateFamilyPedigreePlan(
    familyCtx.valueGen,
    options,
    diseases,
    stage.boundaries?.requireChildrenContributors === 'required',
  );

  const nodeScope: EntityScopeRef = { entity: 'node', type: nodeType };
  const nodeVariables =
    familyCtx.entityConstraints.node.get(nodeType) ?? new Map();
  const nodeIds = new Map<string, string>();
  // The live interface seeds every existing node of its configured type into
  // the pedigree, then serializes that complete membership when committing.
  // Preserve the same membership boundary in synthetic interviews so a
  // committed metadata list never hides eligible nodes created earlier.
  const preexistingFamilyNodes = draft.nodes.filter(
    (node) => node.type === nodeType,
  );
  const earlierPedigreeStageIds = new Set(
    stages
      .slice(0, stageIndex)
      .filter(
        (candidate) =>
          candidate.type === 'FamilyPedigree' &&
          candidate.nodeConfig?.type === nodeType &&
          candidate.nodeConfig?.egoVariable === nodeConfig.egoVariable,
      )
      .map((candidate) => candidate.id),
  );
  // A later pedigree over the same type represents the same focal person. Reuse
  // the earlier pedigree's ego rather than clearing its identity and creating a
  // second ego that the earlier stage's committed membership cannot see.
  const egoVariable = nodeConfig.egoVariable;
  const inheritedEgo = egoVariable
    ? preexistingFamilyNodes.find(
        (node) =>
          node.stageId !== undefined &&
          earlierPedigreeStageIds.has(node.stageId) &&
          node[entityAttributesProperty][egoVariable] === true,
      )
    : undefined;
  const planEgo = plan.people.find((person) => person.key === plan.egoKey);
  const pedigreeVariables = new Set([
    nodeConfig.egoVariable,
    nodeConfig.relationshipVariable,
    nodeConfig.biologicalSexVariable,
    ...diseases.map((disease) => disease.variable),
  ]);
  const familyNodes: NcNode[] = [];

  for (const [index, person] of plan.people.entries()) {
    if (person.key === plan.egoKey && inheritedEgo !== undefined) {
      nodeIds.set(person.key, inheritedEgo[entityPrimaryKeyProperty]);
      continue;
    }

    const fixed: Record<string, VariableValue> = {};
    if (nodeConfig.egoVariable) {
      fixed[nodeConfig.egoVariable] = person.key === plan.egoKey;
    }
    if (
      nodeConfig.relationshipVariable &&
      person.relationshipToEgo !== undefined
    ) {
      fixed[nodeConfig.relationshipVariable] = person.relationshipToEgo;
    }
    if (nodeConfig.biologicalSexVariable) {
      fixed[nodeConfig.biologicalSexVariable] = [person.biologicalSex];
    }
    for (const disease of diseases) {
      fixed[disease.variable] = person.affectedVariables.has(disease.variable);
    }

    assertFixedValuesAccepted(familyCtx, nodeScope, fixed);
    // The interface owns these semantic variables. Leave a value absent when
    // FamilyPedigree itself cannot derive one instead of filling it with an
    // unrelated generic draw (for example, relationship-to-ego on ego).
    const only = new Set(
      [...nodeVariables.keys()].filter(
        (variableId) => !pedigreeVariables.has(variableId),
      ),
    );
    const attributes = generateAttributesForEntity(
      familyCtx,
      nodeScope,
      index,
      {
        existing: fixed,
        only,
        preferRealisticNameVariables: nodeConfig.nodeLabelVariable
          ? new Set([nodeConfig.nodeLabelVariable])
          : undefined,
      },
    );
    Object.assign(attributes, fixed);
    claimFixedValues(familyCtx, nodeScope, fixed);

    const uid = uuid();
    nodeIds.set(person.key, uid);
    familyNodes.push({
      [entityPrimaryKeyProperty]: uid,
      type: nodeType,
      [entityAttributesProperty]: attributes,
      stageId: stage.id,
    });
  }
  draft.nodes.push(...familyNodes);

  // The live interface keeps earlier same-typed nodes in the pedigree. Apply
  // this stage's ego/disease ownership through the same constraint-aware draw
  // used for generated people, regenerating only variables connected to those
  // fixed semantics and preserving every unrelated earlier-stage attribute.
  for (const [index, node] of preexistingFamilyNodes.entries()) {
    const fixed: Record<string, VariableValue> = {};
    const isInheritedEgo = node === inheritedEgo;
    if (nodeConfig.egoVariable) {
      fixed[nodeConfig.egoVariable] = isInheritedEgo;
    }
    for (const disease of diseases) {
      fixed[disease.variable] =
        isInheritedEgo && planEgo !== undefined
          ? planEgo.affectedVariables.has(disease.variable)
          : false;
    }
    if (Object.keys(fixed).length === 0) continue;

    assertFixedValuesAccepted(familyCtx, nodeScope, fixed);
    const connected = constraintConnectedVariables(
      nodeVariables,
      Object.keys(fixed),
    );
    for (const id of Object.keys(fixed)) connected.delete(id);

    const previous = { ...node[entityAttributesProperty] };
    const regenerated = generateAttributesForEntity(
      familyCtx,
      nodeScope,
      plan.people.length + index,
      {
        existing: { ...previous, ...fixed },
        only: connected,
        preferRealisticNameVariables: nodeConfig.nodeLabelVariable
          ? new Set([nodeConfig.nodeLabelVariable])
          : undefined,
      },
    );
    replaceFixedValues(familyCtx, nodeScope, previous, fixed);
    Object.assign(node[entityAttributesProperty], regenerated, fixed);
  }

  if (!edgeType) {
    draft.stageMetadata[stageIndex] = { isNetworkCommitted: true };
    return;
  }
  const edgeScope: EntityScopeRef = { entity: 'edge', type: edgeType };
  const memberNodeIds = new Set(
    [...preexistingFamilyNodes, ...familyNodes].map(
      (node) => node[entityPrimaryKeyProperty],
    ),
  );
  const preexistingFamilyEdges = draft.edges.filter(
    (edge) =>
      edge.type === edgeType &&
      memberNodeIds.has(edge.from) &&
      memberNodeIds.has(edge.to),
  );
  const familyEdges: NcEdge[] = [];
  for (const relationship of plan.relationships) {
    const from = nodeIds.get(relationship.from);
    const to = nodeIds.get(relationship.to);
    if (!from || !to) {
      throw new Error(
        `FamilyPedigree relationship references a missing person: ${relationship.from} -> ${relationship.to}`,
      );
    }
    const attributes = edgeAttributes(edgeConfig, relationship);
    assertFixedValuesAccepted(familyCtx, edgeScope, attributes);
    claimFixedValues(familyCtx, edgeScope, attributes);
    familyEdges.push({
      [entityPrimaryKeyProperty]: uuid(),
      type: edgeType,
      from,
      to,
      [entityAttributesProperty]: attributes,
    });
  }
  draft.edges.push(...familyEdges);

  const metadataNodes = [...preexistingFamilyNodes, ...familyNodes].map(
    (node) => {
      const attributes = node[entityAttributesProperty];
      const isEgo =
        nodeConfig.egoVariable !== undefined &&
        attributes[nodeConfig.egoVariable] === true;
      const storedLabel = nodeConfig.nodeLabelVariable
        ? attributes[nodeConfig.nodeLabelVariable]
        : undefined;
      return {
        id: node[entityPrimaryKeyProperty],
        label: isEgo
          ? 'You'
          : typeof storedLabel === 'string' && storedLabel.length > 0
            ? storedLabel
            : String(
                (nodeConfig.relationshipVariable
                  ? attributes[nodeConfig.relationshipVariable]
                  : undefined) ?? 'Family Member',
              ),
        isEgo,
      };
    },
  );
  const metadataEdges = [...preexistingFamilyEdges, ...familyEdges].map(
    (edge) => ({
      id: edge[entityPrimaryKeyProperty],
      from: edge.from,
      to: edge.to,
      attributes: edge[entityAttributesProperty],
    }),
  );

  draft.stageMetadata[stageIndex] = {
    isNetworkCommitted: true,
    nodes: metadataNodes,
    edges: metadataEdges,
    noChildrenAffirmed: !plan.hasEgoChildren,
    ...(stage.framing?.mode === 'participantChoice'
      ? { selectedFraming: 'gamete' }
      : {}),
  };
}
