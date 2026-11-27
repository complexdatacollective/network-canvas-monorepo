import {
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

/**
 * How the nodes of a network are connected, read for one node at a time. Built
 * once for a list of nodes and a list of edges and then only asked: the edges
 * are indexed as it is built, and each count of one edge type, and each
 * type's most and fewest, is worked out the first time it is asked for and
 * kept.
 */
export type ConnectivityIndex = Readonly<{
  /** The edges that join the node to another, or to itself. */
  edgesOf: (nodeId: string) => readonly NcEdge[];
  /** How many of those edges there are: all of them, or those of one type. */
  degree: (nodeId: string, edgeType?: string) => number;
  /**
   * The fewest and the most such edges any node of `nodeType` has; both are
   * 0 when there is no node of that type.
   */
  extremes: (
    nodeType: string,
    edgeType?: string,
  ) => Readonly<{ min: number; max: number }>;
}>;

const NO_EDGES: readonly NcEdge[] = [];

export const buildConnectivityIndex = (
  nodes: readonly NcNode[],
  edges: readonly NcEdge[],
): ConnectivityIndex => {
  const edgesByNode = new Map<string, NcEdge[]>();
  const add = (nodeId: string, edge: NcEdge) => {
    const own = edgesByNode.get(nodeId);
    if (own === undefined) edgesByNode.set(nodeId, [edge]);
    else own.push(edge);
  };
  for (const edge of edges) {
    add(edge.from, edge);
    // An edge from a node to itself is one edge of that node.
    if (edge.to !== edge.from) add(edge.to, edge);
  }

  const degreesByType = new Map<string, Map<string, number>>();
  const degreesOf = (edgeType: string): Map<string, number> => {
    let degrees = degreesByType.get(edgeType);
    if (degrees === undefined) {
      degrees = new Map();
      for (const [nodeId, own] of edgesByNode) {
        let count = 0;
        for (const edge of own) if (edge.type === edgeType) count += 1;
        if (count > 0) degrees.set(nodeId, count);
      }
      degreesByType.set(edgeType, degrees);
    }
    return degrees;
  };

  const degree = (nodeId: string, edgeType?: string): number =>
    edgeType === undefined
      ? (edgesByNode.get(nodeId)?.length ?? 0)
      : (degreesOf(edgeType).get(nodeId) ?? 0);

  const extremesByKey = new Map<string, { min: number; max: number }>();
  const extremes = (nodeType: string, edgeType?: string) => {
    // No type id holds a space, so the key is unambiguous.
    const key = `${nodeType} ${edgeType ?? ''}`;
    let found = extremesByKey.get(key);
    if (found === undefined) {
      let min = Number.POSITIVE_INFINITY;
      let max = 0;
      for (const node of nodes) {
        if (node.type !== nodeType) continue;
        const own = degree(node[entityPrimaryKeyProperty], edgeType);
        if (own < min) min = own;
        if (own > max) max = own;
      }
      found = { min: Number.isFinite(min) ? min : 0, max };
      extremesByKey.set(key, found);
    }
    return found;
  };

  return {
    edgesOf: (nodeId) => edgesByNode.get(nodeId) ?? NO_EDGES,
    degree,
    extremes,
  };
};

/** The index of a network with no nodes or edges. */
export const EMPTY_CONNECTIVITY: ConnectivityIndex = buildConnectivityIndex(
  [],
  [],
);
