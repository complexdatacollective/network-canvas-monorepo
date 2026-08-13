import {
  MAX_SYNTHETIC_POPULATION,
  type Stage,
} from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_VALUES,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  isFamilyPedigreeStageMetadata,
  type BiologicalSex,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { ValueGenerator } from '../../ValueGenerator';
import { withRuleTiedVariables } from '../analyse/ruleTiedVariables';
import {
  pedigreeDrawnNodeVariables,
  pedigreeEgoNodeVariables,
  scopeKeyFor,
} from '../analyse/stageEffects';
import {
  claimFixedValues,
  constraintsFor,
  generateAttributesForEntity,
  replaceFixedValues,
} from '../attributes';
import { SyntheticDataConstraintError } from '../constraints/error';
import type { EntityScopeRef } from '../constraints/generateEntityAttributes';
import type { GenerationContext, NetworkDraft, StageOfType } from '../context';
import { ruleBrokenByFixedValues } from '../nodes';
import {
  applyMissingness,
  equalityGroups,
  groupMissingProbability,
  missingProbabilities,
  missingProbabilitiesFor,
  requiredVariables,
  requiredVariablesFor,
} from '../plan/networkPlan';
import { deterministicUuid } from '../plan/random';
import {
  generateFamilyPedigreePlan,
  MAX_REQUIRED_PEDIGREE_CORE,
} from './generateFamilyPedigree';
import {
  readPedigreeOptionValue,
  storedPedigreeOptionValue,
} from './semanticValues';
import type {
  PedigreeDisease,
  PedigreePerson,
  PedigreeRelationship,
  ResolvedFamilyPedigreeGenerationOptions,
} from './types';

function diseasesForStage(
  ctx: GenerationContext,
  stage: StageOfType<'FamilyPedigree'>,
  stages: readonly Stage[],
): PedigreeDisease[] {
  const byVariable = new Map<string, PedigreeDisease>();
  const narrativePatternByVariable = new Map<
    string,
    PedigreeDisease['inheritancePattern']
  >();

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
      const existingPattern = narrativePatternByVariable.get(disease.variable);
      if (
        existingPattern !== undefined &&
        existingPattern !== disease.inheritancePattern
      ) {
        const nodeType = stage.nodeConfig.type;
        throw new SyntheticDataConstraintError(
          [
            {
              entity: 'node',
              entityType: nodeType,
              entityTypeName: ctx.codebook.node?.[nodeType]?.name,
              variableIds: [disease.variable],
              variableNames: [
                variableName(
                  ctx,
                  { entity: 'node', type: nodeType },
                  disease.variable,
                ),
              ],
              rules: ['inheritancePattern'],
              reason:
                `NarrativePedigree stages assign both ${existingPattern} and ` +
                `${disease.inheritancePattern} to the same disease variable`,
            },
          ],
          'one disease variable cannot represent conflicting inheritance patterns',
        );
      }
      narrativePatternByVariable.set(
        disease.variable,
        disease.inheritancePattern,
      );
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
  edgeVariables: Record<string, { type: string }> | undefined,
): Record<string, VariableValue> {
  const attributes: Record<string, VariableValue> = {};
  if (edgeConfig.relationshipTypeVariable) {
    attributes[edgeConfig.relationshipTypeVariable] = storedPedigreeOptionValue(
      edgeVariables?.[edgeConfig.relationshipTypeVariable],
      relationship.relationshipType,
    );
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
    attributes[edgeConfig.gameteRoleVariable] = storedPedigreeOptionValue(
      edgeVariables?.[edgeConfig.gameteRoleVariable],
      relationship.gameteRole,
    );
  }
  return attributes;
}

function biologicalSexFromValue(
  value: VariableValue | undefined,
): BiologicalSex | undefined {
  const stored = readPedigreeOptionValue(value);
  return BIOLOGICAL_SEX_VALUES.find((candidate) => candidate === stored);
}

/**
 * One node uid, made safe to embed in a NUL-delimited ancestry key.
 *
 * The keys below identify people and relationships across a mix of committed
 * node uids and freshly minted person keys, and a committed uid is an
 * arbitrary caller-chosen string — roster rows keep whatever `_uid` the
 * external data carried. Joining such uids on a printable separator is not
 * injective: `('a::b', 'c')` and `('a', 'b::c')` read alike, so an unrelated
 * existing edge could swallow a partner link the live interface would create,
 * and two distinct co-parents' minted ancestors could merge into one person.
 * `pairKey`/`topologyKey` length-prefix for the same reason; here the uids are
 * NUL-delimited instead, escaped exactly as `plan/random.ts` escapes stream
 * path segments, so a uid containing neither NUL nor SOH — every ordinary id —
 * stays byte-identical inside its key.
 */
const escapeUidForKey = (uid: string): string =>
  uid.includes('\u0000') || uid.includes('\u0001')
    ? uid
        .replaceAll('\u0001', '\u0001\u0002')
        .replaceAll('\u0000', '\u0001\u0001')
    : uid;

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
    readPedigreeOptionValue(
      edge[entityAttributesProperty][relationshipVariable],
    );
  const geneticEdges = relevantEdges.filter((edge) => {
    const type = relationshipType(edge);
    return type === 'biological' || type === 'donor';
  });
  const egoId = inheritedEgo[entityPrimaryKeyProperty];
  const childIds = new Set(
    geneticEdges.filter((edge) => edge.from === egoId).map((edge) => edge.to),
  );
  topUp.hasInheritedChildren = childIds.size > 0;
  if (childIds.size === 0 || !required) return topUp;

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
    const resolvedFrom = escapeUidForKey(topUp.anchors.get(from) ?? from);
    const resolvedTo = escapeUidForKey(topUp.anchors.get(to) ?? to);
    // NUL-joined over escaped endpoints rather than '::' / '->' over raw ones.
    // Endpoints are arbitrary uids, so no printable separator is injective:
    // an existing partner edge ('a::b', 'c') keyed identically to a new one
    // between parents 'a' and 'b::c', and the seeded entry made
    // `addRelationship` silently drop a link the live interface would create.
    const endpoints =
      type === 'partner'
        ? [resolvedFrom, resolvedTo].toSorted().join('\u0000')
        : `${resolvedFrom}\u0000${resolvedTo}`;
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
      ? readPedigreeOptionValue(
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
    // The co-parent's uid is NUL-terminated inside the scope so the minted
    // keys stay distinct per co-parent. Embedded raw, a co-parent whose
    // caller-chosen uid was 'x-parent-0' produced the very keys reserved for
    // co-parent 'x''s grandparents, and `addPerson` merged two distinct
    // relatives into one node.
    const contributorScope = `contributor-${escapeUidForKey(coParentId)}\u0000`;
    const parentRefs = ensureParents(
      coParentKey,
      coParentId,
      contributorScope,
      -1,
    );
    for (const [index, parent] of parentRefs.entries()) {
      ensureParents(
        parent.key,
        parent.nodeId,
        `${contributorScope}parent-${String(index)}`,
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
  const diseases = diseasesForStage(ctx, stage, diseaseStages);

  const familyCtx: GenerationContext = {
    ...ctx,
    // Topology, family-specific attributes, and names live on a dedicated
    // seeded stream. Changing a pedigree cannot move the random stream used by
    // any other stage, and adding an earlier ordinary stage cannot reshape it.
    valueGen: new ValueGenerator(familySeed, ctx.config.today),
  };
  const nodeScope: EntityScopeRef = { entity: 'node', type: nodeType };
  // Built once for the family rather than per relative: `equalityGroups`
  // resolves the whole type's generation order.
  const nodeScopeKey = scopeKeyFor('node', nodeType);
  const pedigreeMissing = missingProbabilities(familyCtx.codebook);
  const pedigreeRequired = requiredVariables(familyCtx.codebook);
  const pedigreeGroups = equalityGroups(constraintsFor(familyCtx, nodeScope));
  const pedigreeMissingProbabilities = missingProbabilitiesFor(
    pedigreeMissing,
    nodeScopeKey,
  );
  const pedigreeRequiredVariables = requiredVariablesFor(
    pedigreeRequired,
    nodeScopeKey,
  );
  /**
   * The variables of a relative whose value is certainly unanswered, judged
   * exactly as the plan path judges them (`certainlyMissingVariables`): no
   * required member, no member this pedigree fixes, and a group probability of
   * exactly 1. Drawing one and then nulling it is not merely wasted work — a
   * `unique` draw CLAIMS its value from the run's registry and the missingness
   * pass deletes the attribute without releasing the claim, so a small value
   * space was exhausted by a family whose final state holds no values at all.
   */
  const certainlyMissingFor = (fixedKeys: ReadonlySet<string>): Set<string> => {
    const certain = new Set<string>();
    for (const members of pedigreeGroups) {
      if (members.some((id) => fixedKeys.has(id))) continue;
      if (
        groupMissingProbability(
          members,
          pedigreeMissingProbabilities,
          pedigreeRequiredVariables,
        ) !== 1
      ) {
        continue;
      }
      for (const id of members) certain.add(id);
    }
    return certain;
  };
  /**
   * Every primary key the caller's rosters carry, drawn or not. A roster
   * row's `_uid` is an arbitrary caller-chosen string, so nothing stops one
   * matching a uid this stage's seeded stream mints — and a network holding
   * two entities under one key conflates them in the committed metadata and
   * silently halves them in any consumer keyed by `_uid`. `planNetwork`'s own
   * `mintUid` guards its mints the same way; redrawing advances the same
   * memoised stream, so a protocol containing no collision mints
   * byte-identical ids to before the guard.
   */
  const suppliedRosterUids = new Set<string>();
  for (const pool of Object.values(ctx.externalData ?? {})) {
    for (const row of pool) {
      suppliedRosterUids.add(row[entityPrimaryKeyProperty]);
    }
  }
  const mintPedigreeUid = (entityType: string): string => {
    // Seeded rather than random: a fixed seed has to reproduce a session
    // byte for byte, and an entity's id is part of that.
    const stream = familyCtx.valueGen.randomSource.stream(
      'id',
      'pedigree',
      entityType,
    );
    let uid = deterministicUuid(stream);
    while (suppliedRosterUids.has(uid)) uid = deterministicUuid(stream);
    return uid;
  };
  // The live interface seeds every existing node of its configured type into
  // the pedigree, then serializes that complete membership when committing.
  // Preserve the same membership boundary in synthetic interviews so a
  // committed metadata list never hides eligible nodes created earlier.
  const preexistingFamilyNodes = draft.nodes.filter(
    (node) => node.type === nodeType,
  );
  const earlierPedigreeStages = stages
    .slice(0, stageIndex)
    .map((candidate, index) => ({ candidate, index }))
    .filter(
      (
        entry,
      ): entry is {
        candidate: StageOfType<'FamilyPedigree'>;
        index: number;
      } =>
        entry.candidate.type === 'FamilyPedigree' &&
        entry.candidate.nodeConfig?.type === nodeType,
    );
  const compatibleEgoPedigreeStageIds = new Set(
    earlierPedigreeStages
      .filter(
        ({ candidate }) =>
          candidate.nodeConfig?.egoVariable === nodeConfig.egoVariable,
      )
      .map(({ candidate }) => candidate.id),
  );
  const earlierOwnedVariables = new Map(
    earlierPedigreeStages.map(({ candidate }) => [
      candidate.id,
      new Set(
        [
          candidate.nodeConfig?.egoVariable,
          candidate.nodeConfig?.relationshipVariable,
          candidate.nodeConfig?.biologicalSexVariable,
          ...diseasesForStage(ctx, candidate, diseaseStages).map(
            (disease) => disease.variable,
          ),
        ].filter((variable): variable is string => variable !== undefined),
      ),
    ]),
  );
  const protectedVariablesByNodeId = new Map<string, Set<string>>();
  for (const { candidate, index } of earlierPedigreeStages) {
    const metadata = draft.stageMetadata[index];
    if (!isFamilyPedigreeStageMetadata(metadata)) continue;
    const owned = earlierOwnedVariables.get(candidate.id);
    if (owned === undefined) continue;

    for (const member of metadata.nodes ?? []) {
      const protectedVariables =
        protectedVariablesByNodeId.get(member.id) ?? new Set<string>();
      for (const variable of owned) protectedVariables.add(variable);
      protectedVariablesByNodeId.set(member.id, protectedVariables);
    }
  }
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
  const inheritedEgoSourceSexVariable = earlierPedigreeStages.find(
    ({ candidate }) => candidate.id === inheritedEgo?.stageId,
  )?.candidate.nodeConfig.biologicalSexVariable;
  const inheritedEgoSex =
    inheritedEgo !== undefined && nodeConfig.biologicalSexVariable !== undefined
      ? (biologicalSexFromValue(
          inheritedEgo[entityAttributesProperty][
            nodeConfig.biologicalSexVariable
          ],
        ) ??
        (inheritedEgoSourceSexVariable
          ? biologicalSexFromValue(
              inheritedEgo[entityAttributesProperty][
                inheritedEgoSourceSexVariable
              ],
            )
          : undefined))
      : undefined;
  // The pedigree's ceiling is spent against what remains of the RUN's
  // population, exactly as `withinPopulationCeiling` trims the planner's
  // stages against one shared budget. Each pedigree appends its family to the
  // people already materialised, so several stages each inside their own
  // ceiling reach an unbounded whole by another route — the accumulation the
  // run-wide cap exists to prevent, since generation is synchronous on
  // Architect's main thread. Clamped rather than refused, like the planner's
  // trim; the required seven-person core still stands under any clamp, as it
  // does under the caller's own floor.
  // What is left, less what the families STILL AHEAD are required to hold.
  //
  // Their cores bypass every ceiling, so a pedigree that spent the remainder
  // on optional branches would leave the next one to append its core past the
  // cap — which is how three families turned a 10,000 budget into 10,019. The
  // planner sets the same amount aside before it divides the budget; this is
  // its walk-time half, since only here is the order of the families known.
  // `diseaseStages` is the plan's own walked list, so a pedigree this seed
  // never reaches reserves nothing.
  const pedigreesAhead = diseaseStages.filter(
    (candidate, index) =>
      candidate.type === 'FamilyPedigree' &&
      stages.indexOf(candidate) > stageIndex &&
      // Guard against a duplicate object identity in the walked list.
      diseaseStages.indexOf(candidate) === index,
  ).length;
  const remainingPopulationBudget = Math.max(
    0,
    MAX_SYNTHETIC_POPULATION -
      draft.nodes.length -
      pedigreesAhead * MAX_REQUIRED_PEDIGREE_CORE,
  );
  const budgetedOptions =
    options.maxNodes > remainingPopulationBudget
      ? { ...options, maxNodes: remainingPopulationBudget }
      : options;
  const plan = generateFamilyPedigreePlan(
    familyCtx.valueGen,
    budgetedOptions,
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
  const drawnVariables = pedigreeDrawnNodeVariables(stage);
  const codebookNodeVariables = familyCtx.codebook.node?.[nodeType]?.variables;
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
      fixed[nodeConfig.relationshipVariable] = storedPedigreeOptionValue(
        codebookNodeVariables?.[nodeConfig.relationshipVariable],
        person.relationshipToEgo,
      );
    }
    if (nodeConfig.biologicalSexVariable) {
      fixed[nodeConfig.biologicalSexVariable] = storedPedigreeOptionValue(
        codebookNodeVariables?.[nodeConfig.biologicalSexVariable],
        person.biologicalSex,
      );
    }
    for (const disease of diseases) {
      fixed[disease.variable] = person.affectedVariables.has(disease.variable);
    }

    assertFixedValuesAccepted(familyCtx, nodeScope, fixed);
    // Draw the fields this stage actually renders, plus variables whose rules
    // tie them to those fields or to a semantic value fixed above. A variable
    // merely sharing this node type is left unset. Semantic variables absent
    // from `fixed` stay absent too — for example relationship-to-ego on ego —
    // because the interface owns them and has no value to derive there.
    const isPlannedEgo = person.key === plan.egoKey;
    // The live setup asks ego only for biological sex. Its iconic pedigree
    // node needs no label, and the additional family-member form is not shown
    // for ego either. The shared helper applies the same write set to this draw
    // and to the feasibility tally.
    const only = isPlannedEgo
      ? // The walked stages, for the reason the diseases themselves use them:
        // this set is derived from the narratives that read this pedigree, so
        // a narrative the seed settles as skipped must not put its disease
        // variable on ego either. Handed the whole protocol, it drew a flag
        // belonging to a screen the session never reaches.
        pedigreeEgoNodeVariables(stage, diseaseStages, codebookNodeVariables)
      : withRuleTiedVariables(
          codebookNodeVariables,
          new Set([...drawnVariables, ...Object.keys(fixed)]),
        );
    const fixedKeys = new Set(Object.keys(fixed));
    for (const id of fixedKeys) only.delete(id);
    // Certainly-missing groups are withheld from the draw rather than drawn
    // and then nulled, as the plan path withholds them: a `unique` draw CLAIMS
    // its value from the run's registry and the deletion below does not
    // release it, so a >=7-person family could exhaust a small value space for
    // a variable no relative ends up holding. Named to the missingness pass
    // instead, so its group decision (and stream draw) is unchanged.
    const certain = certainlyMissingFor(fixedKeys);
    const reachedButUnanswered = new Set(
      [...certain].filter((id) => only.has(id)),
    );
    for (const id of certain) only.delete(id);
    const attributes = generateAttributesForEntity(
      familyCtx,
      nodeScope,
      index,
      {
        existing: fixed,
        only,
        preferRealisticNameVariables:
          !isPlannedEgo && nodeConfig.nodeLabelVariable
            ? new Set([nodeConfig.nodeLabelVariable])
            : undefined,
      },
    );
    Object.assign(attributes, fixed);
    // A family's people are drawn by this specialist generator rather than by
    // the plan, so neither the plan's missingness pass nor the walk's reaches
    // them: a label or family-member form field declaring
    // `missingProbability: 1` stayed populated on every relative. The plan's
    // own pass, so one descriptor cannot mean two things — group-aware, and a
    // value the pedigree fixes is never made missing.
    applyMissingness(
      attributes,
      fixedKeys,
      pedigreeMissingProbabilities,
      pedigreeRequiredVariables,
      pedigreeGroups,
      familyCtx.valueGen.randomSource,
      nodeScopeKey,
      reachedButUnanswered,
    );
    claimFixedValues(familyCtx, nodeScope, fixed);

    const uid = mintPedigreeUid(nodeType);
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
    const protectedVariables = new Set(
      protectedVariablesByNodeId.get(node[entityPrimaryKeyProperty]),
    );
    if (node.stageId !== undefined) {
      for (const variable of earlierOwnedVariables.get(node.stageId) ?? []) {
        protectedVariables.add(variable);
      }
    }

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
    if (
      node === inheritedEgo &&
      planEgo !== undefined &&
      nodeConfig.biologicalSexVariable &&
      !protectedVariables.has(nodeConfig.biologicalSexVariable)
    ) {
      fixed[nodeConfig.biologicalSexVariable] = storedPedigreeOptionValue(
        codebookNodeVariables?.[nodeConfig.biologicalSexVariable],
        planEgo.biologicalSex,
      );
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
    const fixedKeys = new Set(Object.keys(fixed));
    const connected = withRuleTiedVariables(codebookNodeVariables, fixedKeys);
    for (const id of fixedKeys) connected.delete(id);
    for (const id of protectedVariables) connected.delete(id);
    // The same missingness contract as the new-relative draw above: this
    // normalisation is a draw over the rule-tied closure too, so a declared
    // `missingProbability` must mean the same thing on a pre-existing family
    // member as on a freshly created one. Without it, a certainly-missing
    // rule-tied variable ended up POPULATED on every pre-existing member while
    // staying absent on every generated relative — one descriptor, two
    // behaviours inside a single stage. Certain groups are withheld from the
    // draw, the rest pass through `applyMissingness` after it.
    const certain = certainlyMissingFor(fixedKeys);
    const reachedButUnanswered = new Set(
      [...certain].filter((id) => connected.has(id)),
    );
    for (const id of certain) connected.delete(id);

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
    applyMissingness(
      regenerated,
      fixedKeys,
      pedigreeMissingProbabilities,
      pedigreeRequiredVariables,
      pedigreeGroups,
      familyCtx.valueGen.randomSource,
      nodeScopeKey,
      reachedButUnanswered,
    );
    Object.assign(node[entityAttributesProperty], regenerated, fixed);
  }

  if (!edgeType) {
    draft.stageMetadata[stageIndex] = { isNetworkCommitted: true };
    return;
  }
  const edgeScope: EntityScopeRef = { entity: 'edge', type: edgeType };
  const codebookEdgeVariables = familyCtx.codebook.edge?.[edgeType]?.variables;
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
    const attributes = edgeAttributes(
      edgeConfig,
      relationship,
      codebookEdgeVariables,
    );
    assertFixedValuesAccepted(familyCtx, edgeScope, attributes);
    claimFixedValues(familyCtx, edgeScope, attributes);
    familyEdges.push({
      [entityPrimaryKeyProperty]: mintPedigreeUid(edgeType),
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
