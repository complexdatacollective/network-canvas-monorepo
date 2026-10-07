import type { Codebook } from '@codaco/protocol-validation';

import type {
  EdgeWithResequencedID,
  NodeWithResequencedID,
  SessionWithResequencedIDs,
} from '../input';
import type { ExportFormat } from '../options';
import { getOwn } from '../utils/general';

/**
 * Partition a network as needed for edge-list and adjacency-matrix formats.
 * Each network contains a reference to the original nodes, with a subset of edges
 * based on the type.
 *
 * @param  {Object} codebook
 * @param  {Object} session in NC format
 * @param  {string} format one of `formats`
 * @return {Array} An array of networks, partitioned by type. Each network object is decorated
 *                 with the type's name (`partitionEntity`) and codebook id
 *                 (`partitionEntityId`) to facilitate format naming.
 */
export const partitionByType = (
  codebook: Codebook,
  session: SessionWithResequencedIDs,
  format: ExportFormat,
): (SessionWithResequencedIDs & {
  partitionEntity?: string;
  partitionEntityId?: string;
})[] => {
  const getEntityName = (uuid: string, type: 'node' | 'edge') =>
    getOwn(codebook[type], uuid)?.name ?? null;

  switch (format) {
    // For graphml and ego formats, we don't need to do any processing because
    // everything is contained in a single file.
    case 'graphml':
    case 'ego': {
      return [session];
    }
    case 'attributeList': {
      if (!session.nodes.length) {
        return [session];
      }

      const partitionedNodeMap = new Map<string, NodeWithResequencedID[]>();
      for (const node of session.nodes) {
        const existing = partitionedNodeMap.get(node.type);
        if (existing) {
          existing.push(node);
        } else {
          partitionedNodeMap.set(node.type, [node]);
        }
      }

      return [...partitionedNodeMap].map(([nodeType, nodes]) => ({
        ...session,
        nodes,
        partitionEntity: getEntityName(nodeType, 'node') ?? undefined,
        partitionEntityId: nodeType,
      }));
    }

    case 'edgeList':
    case 'adjacencyMatrix': {
      if (!session.edges.length) {
        return [session];
      }

      const partitionedEdgeMap = new Map<string, EdgeWithResequencedID[]>();
      for (const edge of session.edges) {
        const existing = partitionedEdgeMap.get(edge.type);
        if (existing) {
          existing.push(edge);
        } else {
          partitionedEdgeMap.set(edge.type, [edge]);
        }
      }

      return [...partitionedEdgeMap].map(([edgeType, edges]) => ({
        ...session,
        edges,
        partitionEntity: getEntityName(edgeType, 'edge') ?? undefined,
        partitionEntityId: edgeType,
      }));
    }
  }
};
