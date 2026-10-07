import type { IntlShape } from '@codaco/app-i18n/messages';
import type { FramingId } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { resolveInterviewIntl } from '../../../../i18n/resolveIntl';
import { getFramingTerms } from '../../framingTerms';
import type { RelationshipType } from '../../legacyValues';
import { messages } from '../../messages';
import type { FamilyEdge, GameteRole, VariableConfig } from '../../store';
import { getEdgeRelationshipType } from '../../utils/edgeUtils';

function readGameteRole(value: unknown): GameteRole | undefined {
  // Stored as a single-element categorical array; also tolerate a bare string.
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'egg' || v === 'sperm' ? v : undefined;
}

type PathStep = 'parent' | 'child' | 'partner';

type BfsEntry = {
  nodeId: string;
  path: PathStep[];
  /** Node IDs along the path (excluding ego and the target node). */
  intermediaries: string[];
};

/**
 * BFS from ego, recording the edge-type path to every reachable node.
 * Returns a Map from nodeId to the shortest path info.
 */
function bfsFromEgo(
  egoId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Map<string, BfsEntry> {
  const result = new Map<string, BfsEntry>();
  const visited = new Set<string>([egoId]);
  const queue: BfsEntry[] = [{ nodeId: egoId, path: [], intermediaries: [] }];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const edge of edges.values()) {
      const relType = getEdgeRelationshipType(
        edge,
        variableConfig.relationshipTypeVariable,
      );

      if (relType === 'partner') {
        // Partner edges are bidirectional
        let neighborId: string | null = null;
        if (edge.from === current.nodeId) neighborId = edge.to;
        else if (edge.to === current.nodeId) neighborId = edge.from;

        if (neighborId && !visited.has(neighborId) && nodes.has(neighborId)) {
          visited.add(neighborId);
          const entry: BfsEntry = {
            nodeId: neighborId,
            path: [...current.path, 'partner'],
            intermediaries:
              current.nodeId === egoId
                ? []
                : [...current.intermediaries, current.nodeId],
          };
          result.set(neighborId, entry);
          queue.push(entry);
        }
        continue;
      }

      // Parent edge: from is parent, to is child
      // Traversing "up" (child -> parent): current is to, neighbor is from
      if (edge.to === current.nodeId) {
        const neighborId = edge.from;
        if (!visited.has(neighborId) && nodes.has(neighborId)) {
          visited.add(neighborId);
          const entry: BfsEntry = {
            nodeId: neighborId,
            path: [...current.path, 'parent'],
            intermediaries:
              current.nodeId === egoId
                ? []
                : [...current.intermediaries, current.nodeId],
          };
          result.set(neighborId, entry);
          queue.push(entry);
        }
      }

      // Traversing "down" (parent -> child): current is from, neighbor is to
      if (edge.from === current.nodeId) {
        const neighborId = edge.to;
        if (!visited.has(neighborId) && nodes.has(neighborId)) {
          visited.add(neighborId);
          const entry: BfsEntry = {
            nodeId: neighborId,
            path: [...current.path, 'child'],
            intermediaries:
              current.nodeId === egoId
                ? []
                : [...current.intermediaries, current.nodeId],
          };
          result.set(neighborId, entry);
          queue.push(entry);
        }
      }
    }
  }

  return result;
}

type RelationshipKind =
  | 'parent'
  | 'social-parent'
  | 'donor'
  | 'surrogate'
  | 'child'
  | 'partner'
  | 'sibling'
  | 'step-parent'
  | 'step-child'
  | 'grandparent'
  | 'grandparent-partner'
  | 'grandchild'
  | 'aunt-uncle'
  | 'cousin'
  | 'niece-nephew'
  | 'sibling-in-law'
  | 'child-in-law'
  | 'great-grandparent'
  | 'great-grandchild';

function classifyPath(path: PathStep[]): RelationshipKind | null {
  const key = path.join(',');

  const directMap: Record<string, RelationshipKind> = {
    'parent': 'parent',
    'child': 'child',
    'partner': 'partner',
    'parent,partner': 'step-parent',
    'partner,child': 'step-child',
    'parent,parent': 'grandparent',
    'parent,parent,partner': 'grandparent-partner',
    'parent,parent,parent': 'great-grandparent',
    'child,child': 'grandchild',
    'child,child,child': 'great-grandchild',
    'child,partner': 'child-in-law',
    'parent,parent,child': 'aunt-uncle',
    'parent,parent,child,child': 'cousin',
  };

  if (directMap[key]) return directMap[key];

  // Sibling: parent,child where the child is NOT ego (handled by BFS — ego is never revisited)
  if (key === 'parent,child') return 'sibling';
  if (key === 'parent,child,partner') return 'sibling-in-law';
  if (key === 'parent,child,child') return 'niece-nephew';

  return null;
}

/**
 * Determine the parent edge type for a direct parent of ego.
 */
function getParentEdgeType(
  nodeId: string,
  egoId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): RelationshipType | null {
  for (const edge of edges.values()) {
    const relType = getEdgeRelationshipType(
      edge,
      variableConfig.relationshipTypeVariable,
    );
    if (edge.from === nodeId && edge.to === egoId && relType !== 'partner') {
      return relType ?? null;
    }
  }
  return null;
}

/**
 * The gamete role recorded on a direct parent->ego edge, if any. Lets an
 * unnamed biological/donor parent be labelled as the egg or sperm parent.
 * Reads the role from the edge attribute stored under `gameteRoleVariable`.
 */
function getDirectParentGameteRole(
  nodeId: string,
  egoId: string,
  edges: Map<string, FamilyEdge>,
  variableConfig: VariableConfig,
): GameteRole | undefined {
  for (const edge of edges.values()) {
    const relType = getEdgeRelationshipType(
      edge,
      variableConfig.relationshipTypeVariable,
    );
    if (edge.from === nodeId && edge.to === egoId && relType !== 'partner') {
      const role = readGameteRole(
        edge[entityAttributesProperty][variableConfig.gameteRoleVariable],
      );
      if (role) return role;
    }
  }
  return undefined;
}

/** "Egg Parent"/"Sperm Parent" (or framed equivalent) or "Egg Donor"/"Sperm Donor". */
function gameteParentLabel(
  gameteRole: GameteRole,
  kind: RelationshipKind,
  framing: FramingId,
  intl?: IntlShape,
): string {
  const terms = getFramingTerms(framing, intl);
  if (kind === 'donor') {
    return gameteRole === 'egg' ? terms.eggDonor : terms.spermDonor;
  }
  return gameteRole === 'egg' ? terms.eggParent : terms.spermParent;
}

const relationshipMessages = {
  'parent': messages.parent,
  'social-parent': messages.socialParent,
  'donor': messages.donor,
  'surrogate': messages.surrogate,
  'child': messages.child,
  'partner': messages.partner,
  'sibling': messages.sibling,
  'step-parent': messages.stepParent,
  'step-child': messages.stepChild,
  'grandparent': messages.grandparent,
  'grandparent-partner': messages.grandparentPartner,
  'grandchild': messages.grandchild,
  'aunt-uncle': messages.auntUncle,
  'cousin': messages.cousin,
  'niece-nephew': messages.nieceNephew,
  'sibling-in-law': messages.siblingPartner,
  'child-in-law': messages.childPartner,
  'great-grandparent': messages.greatGrandparent,
  'great-grandchild': messages.greatGrandchild,
};

/**
 * Find the nearest named intermediary on the path, searching from the
 * target node back toward ego.
 */
function findNearestNamedIntermediary(
  intermediaries: string[],
  nodes: Map<string, NcNode>,
  variableConfig: VariableConfig,
): { name: string; index: number } | null {
  // Search from end (closest to target) back toward ego
  for (let i = intermediaries.length - 1; i >= 0; i--) {
    const node = nodes.get(intermediaries[i]!);
    const name = node?.[entityAttributesProperty][
      variableConfig.nodeLabelVariable
    ] as string | undefined;
    if (name) return { name, index: i };
  }
  return null;
}

/**
 * Determine the relationship label from the intermediary to the target node.
 * This is the "last hop" label used in possessive form: "{name}'s {label}".
 */
function namedIntermediaryLabel(
  path: PathStep[],
  name: string,
  intl: IntlShape,
): string {
  const lastStep = path[path.length - 1];
  const message =
    lastStep === 'parent'
      ? messages.namedParent
      : lastStep === 'child'
        ? messages.namedChild
        : lastStep === 'partner'
          ? messages.namedPartner
          : messages.namedRelative;
  return intl.formatMessage(message, { name });
}

/**
 * Compute display labels for all unnamed nodes in a single BFS pass.
 * More efficient than calling getDisplayLabel per-node when labelling
 * the entire graph.
 */
export function computeAllDisplayLabels(
  egoId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  framing: FramingId,
  intl?: IntlShape,
): Map<string, string> {
  const formatter = resolveInterviewIntl(intl);
  const bfsResults = bfsFromEgo(egoId, nodes, edges, variableConfig);
  const labels = new Map<string, string>();

  const SKIP_INTERMEDIARY = new Set<RelationshipKind>([
    'sibling',
    'sibling-in-law',
  ]);

  for (const [nodeId, node] of nodes) {
    if (node[entityAttributesProperty][variableConfig.egoVariable] === true)
      continue;

    const storedName = node[entityAttributesProperty][
      variableConfig.nodeLabelVariable
    ] as string | undefined;
    if (storedName) continue;

    const entry = bfsResults.get(nodeId);
    if (!entry) {
      labels.set(nodeId, formatter.formatMessage(messages.familyMember));
      continue;
    }

    let kind = classifyPath(entry.path);
    if (!kind) {
      labels.set(nodeId, formatter.formatMessage(messages.familyMember));
      continue;
    }

    if (kind === 'parent') {
      const edgeType = getParentEdgeType(nodeId, egoId, edges, variableConfig);
      if (edgeType === 'social') kind = 'social-parent';
      else if (edgeType === 'donor') kind = 'donor';
      else if (edgeType === 'surrogate') kind = 'surrogate';
    }

    if (kind === 'parent' || kind === 'donor') {
      const gameteRole = getDirectParentGameteRole(
        nodeId,
        egoId,
        edges,
        variableConfig,
      );
      if (gameteRole) {
        labels.set(
          nodeId,
          gameteParentLabel(gameteRole, kind, framing, formatter),
        );
        continue;
      }
    }

    if (!SKIP_INTERMEDIARY.has(kind)) {
      const intermediary = findNearestNamedIntermediary(
        entry.intermediaries,
        nodes,
        variableConfig,
      );
      if (intermediary) {
        labels.set(
          nodeId,
          namedIntermediaryLabel(entry.path, intermediary.name, formatter),
        );
        continue;
      }
    }

    labels.set(nodeId, formatter.formatMessage(relationshipMessages[kind]));
  }

  return labels;
}
