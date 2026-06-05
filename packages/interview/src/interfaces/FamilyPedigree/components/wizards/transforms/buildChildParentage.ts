import type { VariableValue } from '@codaco/shared-consts';
import type {
  CommitBatch,
  GameteRole,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import { extractCustomAttributes } from './personAttributes';

type RoleKey = 'egg-source' | 'sperm-source' | 'carrier-source';
type ChildRelationshipType = 'biological' | 'donor' | 'surrogate';

const NEW_PERSON_NAMESPACE: Record<RoleKey, string> = {
  'egg-source': 'new-egg-source',
  'sperm-source': 'new-sperm-source',
  // intentionally 'new-carrier', not 'new-carrier-source'
  'carrier-source': 'new-carrier',
};

/** The gamete a parent role contributes, for internal relationship labelling. */
export function gameteRoleForRole(roleKey: RoleKey): GameteRole | undefined {
  if (roleKey === 'egg-source') return 'egg';
  if (roleKey === 'sperm-source') return 'sperm';
  return undefined;
}

type ResolvedParent = { ref: string; roleKey: RoleKey };

type ChildParentage = {
  nodes: CommitBatch['nodes'];
  edges: CommitBatch['edges'];
  /** Ordered parents (new entries first, then existing) for partnership pairing. */
  parents: ResolvedParent[];
};

type ParentEntry = {
  tempId: string;
  roleKey: RoleKey;
  attributes: Record<string, VariableValue>;
  relationshipType: ChildRelationshipType;
  isGestationalCarrier: boolean;
};

type ExistingParentEdge = {
  sourceId: string;
  roleKey: RoleKey;
  relationshipType: ChildRelationshipType;
  isGestationalCarrier: boolean;
};

/**
 * Build the parent nodes and parent->child edges for one child from its triad
 * answers (egg-source / sperm-source / carrier-source, donor flags, and
 * whether the egg parent carried). Co-parent `partner` edges are NOT emitted
 * here — callers own those via their own partnership inputs.
 */
export function buildChildParentage(
  childTempId: string,
  triadValues: Record<string, unknown>,
  variableConfig: VariableConfig,
): ChildParentage {
  const nodes: CommitBatch['nodes'] = [];
  const edges: CommitBatch['edges'] = [];

  const parentEntries: ParentEntry[] = [];
  const existingParentEdges: ExistingParentEdge[] = [];
  let resolvedEggSourceId: string | undefined;

  const eggParentCarried = triadValues['egg-parent-carried'] !== false;
  const activeRoles: RoleKey[] = eggParentCarried
    ? ['egg-source', 'sperm-source']
    : ['egg-source', 'sperm-source', 'carrier-source'];

  for (const roleKey of activeRoles) {
    const selection = triadValues[roleKey] as string | undefined;
    if (!selection) continue;

    const isDonor = triadValues[`${roleKey}-is-donor`] === true;
    let relationshipType: ChildRelationshipType = 'biological';
    if (isDonor) relationshipType = 'donor';
    if (roleKey === 'carrier-source') relationshipType = 'surrogate';

    if (selection === 'new') {
      const namespace = NEW_PERSON_NAMESPACE[roleKey];
      const personValues = triadValues[namespace] as
        | Record<string, unknown>
        | undefined;
      if (!personValues) continue;
      const name = (personValues.name as string | undefined) ?? '';
      const extraAttrs = extractCustomAttributes(personValues);
      parentEntries.push({
        tempId: namespace,
        roleKey,
        attributes: {
          [variableConfig.nodeLabelVariable]: name,
          [variableConfig.egoVariable]: false,
          ...extraAttrs,
        },
        relationshipType,
        isGestationalCarrier: roleKey === 'carrier-source',
      });
    } else {
      if (roleKey === 'egg-source') resolvedEggSourceId = selection;
      existingParentEdges.push({
        sourceId: selection,
        roleKey,
        relationshipType,
        isGestationalCarrier: roleKey === 'carrier-source',
      });
    }
  }

  // When the egg parent carried, they are also the gestational carrier. Flag
  // that single egg edge rather than adding a second (carrier) edge, so a parent
  // who is both the egg source and the carrier has exactly one parent->child
  // edge (a new egg source is flagged the same way below).
  if (eggParentCarried) {
    if (resolvedEggSourceId) {
      const eggEdge = existingParentEdges.find(
        (e) => e.roleKey === 'egg-source',
      );
      if (eggEdge) eggEdge.isGestationalCarrier = true;
    } else {
      const eggEntry = parentEntries.find(
        (e) => e.tempId === NEW_PERSON_NAMESPACE['egg-source'],
      );
      if (eggEntry) eggEntry.isGestationalCarrier = true;
    }
  }

  for (const entry of parentEntries) {
    nodes.push({
      tempId: entry.tempId,
      data: { attributes: entry.attributes },
    });
    const edgeAttributes: Record<string, VariableValue> = {
      [variableConfig.relationshipTypeVariable]: entry.relationshipType,
      [variableConfig.isActiveVariable]: true,
    };
    if (entry.isGestationalCarrier) {
      edgeAttributes[variableConfig.isGestationalCarrierVariable] = true;
    }
    const gameteRole = gameteRoleForRole(entry.roleKey);
    edges.push({
      source: entry.tempId,
      target: childTempId,
      ...(gameteRole ? { gameteRole } : {}),
      data: { attributes: edgeAttributes },
    });
  }

  for (const entry of existingParentEdges) {
    const edgeAttributes: Record<string, VariableValue> = {
      [variableConfig.relationshipTypeVariable]: entry.relationshipType,
      [variableConfig.isActiveVariable]: true,
    };
    if (entry.isGestationalCarrier) {
      edgeAttributes[variableConfig.isGestationalCarrierVariable] = true;
    }
    const gameteRole = gameteRoleForRole(entry.roleKey);
    edges.push({
      source: entry.sourceId,
      target: childTempId,
      ...(gameteRole ? { gameteRole } : {}),
      data: { attributes: edgeAttributes },
    });
  }

  const parents: ResolvedParent[] = [
    ...parentEntries.map((e) => ({ ref: e.tempId, roleKey: e.roleKey })),
    ...existingParentEdges.map((e) => ({
      ref: e.sourceId,
      roleKey: e.roleKey,
    })),
  ];

  return { nodes, edges, parents };
}
