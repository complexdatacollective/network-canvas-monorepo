import { v4 as uuid } from 'uuid';

import type { Stage } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_VALUES,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type BiologicalSex,
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
  PedigreePerson,
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

function biologicalSexFromValue(
  value: VariableValue | undefined,
): BiologicalSex | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined;
  return BIOLOGICAL_SEX_VALUES.find((candidate) => candidate === value[0]);
}

function categoricalValue(
  value: VariableValue | undefined,
): string | undefined {
  return Array.isArray(value) && value.length === 1
    ? String(value[0])
    : undefined;
}

type ContributorAncestryTopUp = {
  people: PedigreePerson[];
  relationships: PedigreeRelationship[];
  anchors: Map<string, string>;
  hasInheritedChildren: boolean;
};

/**
 * Complete two generations above co-parents already connected to an inherited
 * ego's children. A later compatible pedigree includes those earlier children
 * in its committed graph, so its contributor boundary applies to them too.
 */
function inheritedContributorAncestry(
  draft: NetworkDraft,
  inheritedEgo: NcNode | undefined,
  nodeType: string,
  nodeConfig: Partial<StageOfType<'FamilyPedigree'>['nodeConfig']>,
  edgeType: string | undefined,
  edgeConfig: Partial<StageOfType<'FamilyPedigree'>['edgeConfig']>,
  required: boolean,
): ContributorAncestryTopUp {
  const topUp: ContributorAncestryTopUp = {
    people: [],
    relationships: [],
    anchors: new Map(),
    hasInheritedChildren: false,
  };
  const relationshipVariable = edgeConfig.relationshipTypeVariable;
  if (
    !required ||
    inheritedEgo === undefined ||
    edgeType === undefined ||
    relationshipVariable === undefined
  ) {
    return topUp;
  }

  const nodesById = new Map(
    draft.nodes
      .filter((node) => node.type === nodeType)
      .map((node) => [node[entityPrimaryKeyProperty], node]),
  );
  const relevantEdges = draft.edges.filter(
    (edge) =>
      edge.type === edgeType &&
      nodesById.has(edge.from) &&
      nodesById.has(edge.to),
  );
  const relationshipType = (edge: NcEdge) =>
    categoricalValue(edge[entityAttributesProperty][relationshipVariable]);
  const geneticEdges = relevantEdges.filter((edge) => {
    const type = relationshipType(edge);
    return type === 'biological' || type === 'donor';
  });
  const egoId = inheritedEgo[entityPrimaryKeyProperty];
  const childIds = new Set(
    geneticEdges.filter((edge) => edge.from === egoId).map((edge) => edge.to),
  );
  topUp.hasInheritedChildren = childIds.size > 0;
  if (childIds.size === 0) return topUp;

  const coParentIds = new Set(
    geneticEdges
      .filter((edge) => childIds.has(edge.to) && edge.from !== egoId)
      .map((edge) => edge.from)
      .filter((id) => nodesById.has(id)),
  );
  const addedPeople = new Set<string>();
  const anchorKey = (nodeId: string) => `inherited:${nodeId}`;
  const anchor = (nodeId: string) => {
    const key = anchorKey(nodeId);
    topUp.anchors.set(key, nodeId);
    return key;
  };
  const relationshipKey = (type: string, from: string, to: string) => {
    const resolvedFrom = topUp.anchors.get(from) ?? from;
    const resolvedTo = topUp.anchors.get(to) ?? to;
    const endpoints =
      type === 'partner'
        ? [resolvedFrom, resolvedTo].toSorted().join('::')
        : `${resolvedFrom}->${resolvedTo}`;
    return `${type}:${endpoints}`;
  };
  const relationshipKeys = new Set(
    relevantEdges.map((edge) =>
      relationshipKey(relationshipType(edge) ?? 'unknown', edge.from, edge.to),
    ),
  );
  const addPerson = (
    key: string,
    generation: number,
    biologicalSex: BiologicalSex,
  ) => {
    if (addedPeople.has(key)) return;
    addedPeople.add(key);
    topUp.people.push({
      key,
      generation,
      relationshipToEgo: undefined,
      biologicalSex,
      affectedVariables: new Set(),
    });
  };
  const addRelationship = (relationship: PedigreeRelationship) => {
    const key = relationshipKey(
      relationship.relationshipType,
      relationship.from,
      relationship.to,
    );
    if (relationshipKeys.has(key)) return;
    relationshipKeys.add(key);
    topUp.relationships.push(relationship);
  };
  const addPartner = (first: string, second: string) =>
    addRelationship({
      from: first,
      to: second,
      relationshipType: 'partner',
      isActive: true,
    });
  const addParentage = (parent: string, child: string, role: 'egg' | 'sperm') =>
    addRelationship({
      from: parent,
      to: child,
      relationshipType: 'biological',
      isActive: true,
      ...(role === 'egg' ? { isGestationalCarrier: true } : {}),
      gameteRole: role,
    });
  const roleForExistingParent = (edge: NcEdge): 'egg' | 'sperm' | undefined => {
    const configuredRole = edgeConfig.gameteRoleVariable
      ? categoricalValue(
          edge[entityAttributesProperty][edgeConfig.gameteRoleVariable],
        )
      : undefined;
    if (configuredRole === 'egg' || configuredRole === 'sperm') {
      return configuredRole;
    }
    const biologicalSexVariable = nodeConfig.biologicalSexVariable;
    const sex = biologicalSexVariable
      ? biologicalSexFromValue(
          nodesById.get(edge.from)?.[entityAttributesProperty][
            biologicalSexVariable
          ],
        )
      : undefined;
    return sex === 'female' ? 'egg' : sex === 'male' ? 'sperm' : undefined;
  };

  type ParentRef = {
    key: string;
    nodeId?: string;
    role: 'egg' | 'sperm';
  };
  const ensuredParents = new Map<string, ParentRef[]>();
  const ensureParents = (
    targetKey: string,
    targetId: string | undefined,
    prefix: string,
    parentGeneration: number,
  ): ParentRef[] => {
    const alreadyEnsured = ensuredParents.get(targetKey);
    if (alreadyEnsured !== undefined) return alreadyEnsured;

    const existingEdges =
      targetId === undefined
        ? []
        : geneticEdges.filter((edge) => edge.to === targetId);
    const parents: ParentRef[] = existingEdges.map((edge, index) => ({
      key: anchor(edge.from),
      nodeId: edge.from,
      role: roleForExistingParent(edge) ?? (index === 0 ? 'egg' : 'sperm'),
    }));
    const occupiedRoles = new Set(parents.map(({ role }) => role));

    while (parents.length < 2) {
      const role = !occupiedRoles.has('egg') ? 'egg' : 'sperm';
      const key = `${prefix}-${role}-parent-${String(parents.length)}`;
      addPerson(key, parentGeneration, role === 'egg' ? 'female' : 'male');
      addParentage(key, targetKey, role);
      parents.push({ key, role });
      occupiedRoles.add(role);
    }
    const firstParent = parents[0];
    const secondParent = parents[1];
    if (firstParent !== undefined && secondParent !== undefined) {
      addPartner(firstParent.key, secondParent.key);
    }
    ensuredParents.set(targetKey, parents);
    return parents;
  };

  for (const coParentId of coParentIds) {
    const coParentKey = anchor(coParentId);
    const parentRefs = ensureParents(
      coParentKey,
      coParentId,
      `contributor-${coParentId}`,
      -1,
    );
    for (const [index, parent] of parentRefs.entries()) {
      ensureParents(
        parent.key,
        parent.nodeId,
        `contributor-${coParentId}-parent-${String(index)}`,
        -2,
      );
    }
  }

  return topUp;
}

export function materializeFamilyPedigree(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: StageOfType<'FamilyPedigree'>,
  stageIndex: number,
  stages: readonly Stage[],
  diseaseStages: readonly Stage[],
  familySeed: number,
  options: ResolvedFamilyPedigreeGenerationOptions,
): void {
  const nodeConfig = stage.nodeConfig as Partial<typeof stage.nodeConfig>;
  const edgeConfig = stage.edgeConfig as Partial<typeof stage.edgeConfig>;
  const nodeType = nodeConfig?.type;
  const edgeType = edgeConfig?.type;
  if (!nodeType) return;
  const diseases = diseasesForStage(stage, diseaseStages);

  const familyCtx: GenerationContext = {
    ...ctx,
    // Topology, family-specific attributes, and names live on a dedicated
    // seeded stream. Changing a pedigree cannot move the random stream used by
    // any other stage, and adding an earlier ordinary stage cannot reshape it.
    valueGen: new ValueGenerator(familySeed, ctx.config.today),
  };
  const nodeScope: EntityScopeRef = { entity: 'node', type: nodeType };
  const nodeVariables =
    familyCtx.entityConstraints.node.get(nodeType) ?? new Map();
  // The live interface seeds every existing node of its configured type into
  // the pedigree, then serializes that complete membership when committing.
  // Preserve the same membership boundary in synthetic interviews so a
  // committed metadata list never hides eligible nodes created earlier.
  const preexistingFamilyNodes = draft.nodes.filter(
    (node) => node.type === nodeType,
  );
  const earlierPedigreeStages = stages
    .slice(0, stageIndex)
    .filter(
      (candidate): candidate is StageOfType<'FamilyPedigree'> =>
        candidate.type === 'FamilyPedigree' &&
        candidate.nodeConfig?.type === nodeType,
    );
  const compatibleEgoPedigreeStageIds = new Set(
    earlierPedigreeStages
      .filter(
        (candidate) =>
          candidate.nodeConfig?.egoVariable === nodeConfig.egoVariable,
      )
      .map((candidate) => candidate.id),
  );
  const earlierOwnedVariables = new Map(
    earlierPedigreeStages.map((candidate) => [
      candidate.id,
      new Set(
        [
          candidate.nodeConfig?.egoVariable,
          candidate.nodeConfig?.relationshipVariable,
          candidate.nodeConfig?.biologicalSexVariable,
          ...diseasesForStage(candidate, diseaseStages).map(
            (disease) => disease.variable,
          ),
        ].filter((variable): variable is string => variable !== undefined),
      ),
    ]),
  );
  // A later pedigree over the same type represents the same focal person. Reuse
  // the earlier pedigree's ego rather than clearing its identity and creating a
  // second ego that the earlier stage's committed membership cannot see.
  const egoVariable = nodeConfig.egoVariable;
  const inheritedEgo = egoVariable
    ? preexistingFamilyNodes.find(
        (node) =>
          node.stageId !== undefined &&
          compatibleEgoPedigreeStageIds.has(node.stageId) &&
          node[entityAttributesProperty][egoVariable] === true,
      )
    : undefined;
  const inheritedEgoSex =
    inheritedEgo !== undefined && nodeConfig.biologicalSexVariable !== undefined
      ? biologicalSexFromValue(
          inheritedEgo[entityAttributesProperty][
            nodeConfig.biologicalSexVariable
          ],
        )
      : undefined;
  const plan = generateFamilyPedigreePlan(
    familyCtx.valueGen,
    options,
    diseases,
    stage.boundaries?.requireChildrenContributors === 'required',
    inheritedEgoSex,
  );
  const contributorAncestry = inheritedContributorAncestry(
    draft,
    inheritedEgo,
    nodeType,
    nodeConfig,
    edgeType,
    edgeConfig,
    stage.boundaries?.requireChildrenContributors === 'required',
  );
  const planPeople = [...plan.people, ...contributorAncestry.people];
  const planRelationships = [
    ...plan.relationships,
    ...contributorAncestry.relationships,
  ];
  const planEgo = plan.people.find((person) => person.key === plan.egoKey);
  const nodeIds = new Map(contributorAncestry.anchors);
  const pedigreeVariables = new Set([
    nodeConfig.egoVariable,
    nodeConfig.relationshipVariable,
    nodeConfig.biologicalSexVariable,
    ...diseases.map((disease) => disease.variable),
  ]);
  const familyNodes: NcNode[] = [];

  for (const [index, person] of planPeople.entries()) {
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

  // The live interface keeps earlier same-typed nodes in the pedigree. Nodes
  // owned by an earlier committed pedigree remain authoritative for that
  // stage's Narrative views. Preserve only the semantics that earlier stage
  // actually owned: a disease introduced by this stage must still be normalized
  // over those nodes. Apply the same constraint-aware draw as generated people
  // while protecting every earlier semantic and unrelated attribute.
  for (const [index, node] of preexistingFamilyNodes.entries()) {
    const protectedVariables =
      node.stageId === undefined
        ? new Set<string>()
        : (earlierOwnedVariables.get(node.stageId) ?? new Set<string>());

    const fixed: Record<string, VariableValue> = {};
    if (
      nodeConfig.egoVariable &&
      !protectedVariables.has(nodeConfig.egoVariable)
    ) {
      fixed[nodeConfig.egoVariable] = false;
    }
    for (const disease of diseases) {
      if (protectedVariables.has(disease.variable)) continue;
      fixed[disease.variable] =
        node === inheritedEgo && planEgo !== undefined
          ? planEgo.affectedVariables.has(disease.variable)
          : false;
    }
    if (Object.keys(fixed).length === 0) continue;

    const preserved = Object.fromEntries(
      [...protectedVariables]
        .map((id) => [id, node[entityAttributesProperty][id]] as const)
        .filter(
          (entry): entry is readonly [string, VariableValue] =>
            entry[1] !== undefined,
        ),
    );
    assertFixedValuesAccepted(familyCtx, nodeScope, {
      ...preserved,
      ...fixed,
    });
    const connected = constraintConnectedVariables(
      nodeVariables,
      Object.keys(fixed),
    );
    for (const id of Object.keys(fixed)) connected.delete(id);
    for (const id of protectedVariables) connected.delete(id);

    const previous = { ...node[entityAttributesProperty] };
    const regenerated = generateAttributesForEntity(
      familyCtx,
      nodeScope,
      planPeople.length + index,
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
  for (const relationship of planRelationships) {
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
    edgeIdVersion: 1,
    nodes: metadataNodes,
    edges: metadataEdges,
    noChildrenAffirmed:
      !plan.hasEgoChildren && !contributorAncestry.hasInheritedChildren,
    ...(stage.framing?.mode === 'participantChoice'
      ? { selectedFraming: 'gamete' }
      : {}),
  };
}
