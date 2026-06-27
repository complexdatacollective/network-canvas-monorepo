import { type FocalPosition } from '@codaco/shared-consts';

import { type GeneticGraph } from './genetics/geneticGraph';

/**
 * Resolves the set of node ids that correspond to a given focal position.
 *
 * Returns an empty set for ego-relative positions when `egoId` is undefined
 * or not present in the graph. `everyone` always returns all node ids
 * regardless of ego presence.
 */
export function resolveFocal(
  position: FocalPosition,
  graph: GeneticGraph,
  egoId: string | undefined,
): Set<string> {
  switch (position) {
    case 'ego': {
      if (egoId === undefined || !graph.nodeIds().includes(egoId)) {
        return new Set();
      }
      return new Set([egoId]);
    }

    case 'egoChildren': {
      if (egoId === undefined) {
        return new Set();
      }
      return new Set(graph.childrenOf(egoId));
    }

    case 'egoParents': {
      if (egoId === undefined) {
        return new Set();
      }
      return new Set(graph.parentsOf(egoId).map((p) => p.id));
    }

    case 'egoSiblings': {
      if (egoId === undefined) {
        return new Set();
      }
      const siblings = [
        ...graph.fullSiblingsOf(egoId),
        ...graph.halfSiblingsOf(egoId),
      ];
      return new Set(siblings);
    }

    case 'everyone': {
      return new Set(graph.nodeIds());
    }

    default: {
      const _exhaustive: never = position;
      return _exhaustive;
    }
  }
}
