export type EdgeEndpoints = { from: string; to: string; type: string };

/**
 * The one place edge identity is decided. For an undirected edge type, A to B
 * and B to A are the same edge; for a directed type they are two edges that
 * can both exist. Direction comes from the edge type, never from the edge.
 */
export const edgeIdentityKey = (
  edge: EdgeEndpoints,
  directed: boolean,
): string => {
  const [first, second] =
    directed || edge.from <= edge.to
      ? [edge.from, edge.to]
      : [edge.to, edge.from];
  return JSON.stringify([edge.type, first, second]);
};

export const findEdge = <E extends EdgeEndpoints>(
  edges: readonly E[],
  endpoints: EdgeEndpoints,
  directed: boolean,
): E | undefined => {
  const key = edgeIdentityKey(endpoints, directed);
  return edges.find((edge) => edgeIdentityKey(edge, directed) === key);
};

export const toggleEdge = <E extends EdgeEndpoints>(
  edges: readonly E[],
  endpoints: EdgeEndpoints,
  directed: boolean,
):
  | { action: 'remove'; edge: E }
  | { action: 'add' }
  | { action: 'refuse'; reason: 'selfLoop' } => {
  if (endpoints.from === endpoints.to) {
    return { action: 'refuse', reason: 'selfLoop' };
  }
  const existing = findEdge(edges, endpoints, directed);
  return existing ? { action: 'remove', edge: existing } : { action: 'add' };
};
