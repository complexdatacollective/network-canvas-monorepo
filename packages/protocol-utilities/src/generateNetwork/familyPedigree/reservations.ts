import type { Stage } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_VALUES,
  GAMETE_ROLES,
  RELATIONSHIP_TYPES,
  type VariableValue,
} from '@codaco/shared-consts';

import {
  scopeKey,
  uniqueSlotMembers,
  type EntityScopeRef,
} from '../constraints/generateEntityAttributes';
import type { GenerationContext } from '../context';
import { PEDIGREE_RELATIONSHIP_TO_EGO_VALUES } from './types';

function reserveWrittenValue(
  ctx: GenerationContext,
  ref: Extract<EntityScopeRef, { entity: 'node' | 'edge' }>,
  variableId: string,
  value: VariableValue,
): void {
  const entity = ctx.entityConstraints[ref.entity].get(ref.type);
  if (entity === undefined) return;

  const registry = scopeKey(ref);
  for (const [slot, memberIds] of uniqueSlotMembers(entity)) {
    if (memberIds.includes(variableId)) {
      ctx.uniqueRegistry.reserve(registry, slot, value);
    }
  }
}

/** Hold all values the isolated pedigree materializer may write itself. */
export function reserveFamilyPedigreeFixedValues(
  ctx: GenerationContext,
  stages: readonly Stage[],
): void {
  for (const stage of stages) {
    if (stage.type !== 'FamilyPedigree') continue;
    const nodeConfig = stage.nodeConfig as Partial<typeof stage.nodeConfig>;
    const edgeConfig = stage.edgeConfig as Partial<typeof stage.edgeConfig>;
    if (!nodeConfig?.type) continue;

    const nodeRef = {
      entity: 'node' as const,
      type: nodeConfig.type,
    };
    if (nodeConfig.egoVariable) {
      for (const value of [true, false]) {
        reserveWrittenValue(ctx, nodeRef, nodeConfig.egoVariable, value);
      }
    }
    const diseaseVariables = new Set(
      (stage.nominationPrompts ?? []).map((prompt) => prompt.variable),
    );
    for (const candidate of stages) {
      if (
        candidate.type !== 'NarrativePedigree' ||
        candidate.sourceStageId !== stage.id
      ) {
        continue;
      }
      for (const disease of candidate.diseases) {
        diseaseVariables.add(disease.variable);
      }
    }
    for (const value of [true, false]) {
      for (const variable of diseaseVariables) {
        reserveWrittenValue(ctx, nodeRef, variable, value);
      }
    }
    if (nodeConfig.relationshipVariable) {
      for (const value of PEDIGREE_RELATIONSHIP_TO_EGO_VALUES) {
        reserveWrittenValue(
          ctx,
          nodeRef,
          nodeConfig.relationshipVariable,
          value,
        );
      }
    }
    if (nodeConfig.biologicalSexVariable) {
      for (const value of BIOLOGICAL_SEX_VALUES) {
        reserveWrittenValue(ctx, nodeRef, nodeConfig.biologicalSexVariable, [
          value,
        ]);
      }
    }

    if (!edgeConfig?.type) continue;
    const edgeRef = {
      entity: 'edge' as const,
      type: edgeConfig.type,
    };
    if (edgeConfig.relationshipTypeVariable) {
      for (const value of RELATIONSHIP_TYPES) {
        reserveWrittenValue(ctx, edgeRef, edgeConfig.relationshipTypeVariable, [
          value,
        ]);
      }
    }
    if (edgeConfig.isActiveVariable) {
      for (const value of [true, false]) {
        reserveWrittenValue(ctx, edgeRef, edgeConfig.isActiveVariable, value);
      }
    }
    if (edgeConfig.isGestationalCarrierVariable) {
      reserveWrittenValue(
        ctx,
        edgeRef,
        edgeConfig.isGestationalCarrierVariable,
        true,
      );
    }
    if (edgeConfig.gameteRoleVariable) {
      for (const value of GAMETE_ROLES) {
        reserveWrittenValue(ctx, edgeRef, edgeConfig.gameteRoleVariable, [
          value,
        ]);
      }
    }
  }
}
