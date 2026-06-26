import type {
  NcEdge,
  NcNode,
  RelationshipType,
  VariableValue,
} from '@codaco/shared-consts';
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import { gameteRoleForRole } from './buildChildParentage';
import { extractCustomAttributes, readBiologicalSex } from './personAttributes';

function buildPersonAttributes(
  person: Record<string, unknown>,
  variableConfig: VariableConfig,
  includeBiologicalSex: boolean,
): Record<string, VariableValue> {
  const name = (person.name as string | undefined) ?? '';
  const extraAttrs = extractCustomAttributes(person);

  const attrs: Record<string, VariableValue> = {
    [variableConfig.nodeLabelVariable]: name,
    [variableConfig.egoVariable]: false,
    ...extraAttrs,
  };

  if (includeBiologicalSex) {
    const sex = readBiologicalSex(person.biologicalSex);
    if (sex !== undefined) {
      attrs[variableConfig.biologicalSexVariable] = sex;
    }
  }

  return attrs;
}

type RoleKey = 'egg-source' | 'sperm-source' | 'carrier-source';

const ROLE_KEYS: RoleKey[] = ['egg-source', 'sperm-source', 'carrier-source'];

type ResolvedParent = {
  roleKey: RoleKey;
  tempId: string;
  isExisting: boolean;
};

export function siblingCellTransform(
  values: Record<string, unknown>,
  _anchorNodeId: string,
  nodes: Map<string, NcNode>,
  _edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): CommitBatch {
  const batch: CommitBatch = { nodes: [], edges: [] };

  const siblingData = values.sibling as Record<string, unknown>;
  batch.nodes.push({
    tempId: 'sibling',
    data: {
      attributes: buildPersonAttributes(siblingData, variableConfig, true),
    },
  });

  const resolvedParents: ResolvedParent[] = [];
  const tempIdByRole = new Map<RoleKey, string>();
  const eggParentCarried = values['egg-parent-carried'] !== false;

  const activeRoles: RoleKey[] = eggParentCarried
    ? ['egg-source', 'sperm-source']
    : ['egg-source', 'sperm-source', 'carrier-source'];

  for (const roleKey of activeRoles) {
    const selection = values[roleKey] as string | undefined;
    if (!selection) continue;

    if (nodes.has(selection)) {
      resolvedParents.push({ roleKey, tempId: selection, isExisting: true });
      tempIdByRole.set(roleKey, selection);
    } else if (selection === 'new') {
      const newPersonData = values[`new-${roleKey}`] as Record<string, unknown>;
      const tempId = `new-${roleKey}`;
      // Egg and sperm gamete parents derive sex from gameteRole; carrier-source
      // (and the separate new-carrier namespace below) is not a gamete parent.
      const isGameteParen =
        roleKey === 'egg-source' || roleKey === 'sperm-source';
      batch.nodes.push({
        tempId,
        data: {
          attributes: buildPersonAttributes(
            newPersonData,
            variableConfig,
            !isGameteParen,
          ),
        },
      });
      resolvedParents.push({ roleKey, tempId, isExisting: false });
      tempIdByRole.set(roleKey, tempId);
    }
  }

  if (eggParentCarried) {
    const eggTempId = tempIdByRole.get('egg-source');
    if (eggTempId) {
      const eggParent = resolvedParents.find((p) => p.roleKey === 'egg-source');
      resolvedParents.push({
        roleKey: 'carrier-source',
        tempId: eggTempId,
        isExisting: eggParent?.isExisting ?? false,
      });
      tempIdByRole.set('carrier-source', eggTempId);
    }
  }

  const carrierTempId = tempIdByRole.get('carrier-source');

  const seenEdges = new Set<string>();
  for (const parent of resolvedParents) {
    const edgeKey = `${parent.tempId}->sibling`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    let relationshipType: Extract<
      RelationshipType,
      'biological' | 'donor' | 'surrogate'
    >;
    const isCarrier = parent.roleKey === 'carrier-source';

    if (isCarrier) {
      // A gestational carrier never contributes the egg, so they are never a
      // genetic parent — always a (non-genetic) surrogate.
      relationshipType = 'surrogate';
    } else if (parent.roleKey === 'egg-source') {
      relationshipType =
        values['egg-source-is-donor'] === true ? 'donor' : 'biological';
    } else {
      relationshipType =
        values['sperm-source-is-donor'] === true ? 'donor' : 'biological';
    }

    const shouldMarkGC = isCarrier || parent.tempId === carrierTempId;

    const edgeAttributes: Record<string, VariableValue> = {
      [variableConfig.relationshipTypeVariable]: [relationshipType],
      [variableConfig.isActiveVariable]: true,
    };
    if (shouldMarkGC) {
      edgeAttributes[variableConfig.isGestationalCarrierVariable] = true;
    }

    const gameteRole = gameteRoleForRole(parent.roleKey);
    if (gameteRole) {
      edgeAttributes[variableConfig.gameteRoleVariable] = gameteRole;
    }
    batch.edges.push({
      source: parent.tempId,
      target: 'sibling',
      data: { attributes: edgeAttributes },
    });
  }

  for (const key of Object.keys(values)) {
    if (!key.startsWith('partnership-')) continue;
    const val = values[key] as string | undefined;
    if (val !== 'current' && val !== 'ex') continue;

    const suffix = key.slice('partnership-'.length);
    const roleKeys = ROLE_KEYS.filter((rk) => suffix.startsWith(rk + '-'));
    if (roleKeys.length === 0) continue;

    const firstRole = roleKeys.reduce((a, b) => (a.length >= b.length ? a : b));
    const secondRolePart = suffix.slice(firstRole.length + 1);
    const secondRole = ROLE_KEYS.find((rk) => rk === secondRolePart);
    if (!secondRole) continue;

    const sourceId = tempIdByRole.get(firstRole);
    const targetId = tempIdByRole.get(secondRole);
    if (!sourceId || !targetId) continue;

    batch.edges.push({
      source: sourceId,
      target: targetId,
      data: {
        attributes: {
          [variableConfig.relationshipTypeVariable]: ['partner'],
          [variableConfig.isActiveVariable]: val === 'current',
        },
      },
    });
  }

  const additionalParents = values['additional-parent'] as
    | Record<string, unknown>[]
    | undefined;
  if (values.hasOtherParents === true && Array.isArray(additionalParents)) {
    for (let i = 0; i < additionalParents.length; i++) {
      const ap = additionalParents[i];
      if (!ap) continue;
      const tempId = `additional-parent-${String(i)}`;

      batch.nodes.push({
        tempId,
        data: {
          attributes: buildPersonAttributes(ap, variableConfig, true),
        },
      });

      batch.edges.push({
        source: tempId,
        target: 'sibling',
        data: {
          attributes: {
            [variableConfig.relationshipTypeVariable]: ['social'],
            [variableConfig.isActiveVariable]: true,
          },
        },
      });
    }
  }

  return batch;
}
