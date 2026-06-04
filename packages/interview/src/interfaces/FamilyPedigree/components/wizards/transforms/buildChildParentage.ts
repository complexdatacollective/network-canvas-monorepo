import type { VariableValue } from '@codaco/shared-consts';
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

const KNOWN_PERSON_KEYS = new Set(['name']);

function extractCustomAttributes(
  obj: Record<string, unknown>,
): Record<string, VariableValue> | undefined {
  const attrs: Record<string, VariableValue> = {};
  let hasAttrs = false;
  for (const [key, val] of Object.entries(obj)) {
    if (!KNOWN_PERSON_KEYS.has(key) && val !== undefined) {
      attrs[key] = val as VariableValue;
      hasAttrs = true;
    }
  }
  return hasAttrs ? attrs : undefined;
}

export type RoleKey = 'egg-source' | 'sperm-source' | 'carrier-source';
export type ChildRelationshipType = 'biological' | 'donor' | 'surrogate';

const NEW_PERSON_NAMESPACE: Record<RoleKey, string> = {
  'egg-source': 'new-egg-source',
  'sperm-source': 'new-sperm-source',
  'carrier-source': 'new-carrier',
};

export type ResolvedParent = { ref: string; roleKey: RoleKey };

export type ChildParentage = {
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

  // When the egg parent carried, the egg source is also the gestational carrier.
  // Existing egg source => add a second (carrier) edge; new egg source => flag it.
  if (eggParentCarried) {
    if (resolvedEggSourceId) {
      existingParentEdges.push({
        sourceId: resolvedEggSourceId,
        roleKey: 'carrier-source',
        relationshipType: 'biological',
        isGestationalCarrier: true,
      });
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
    edges.push({
      source: entry.tempId,
      target: childTempId,
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
    edges.push({
      source: entry.sourceId,
      target: childTempId,
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
