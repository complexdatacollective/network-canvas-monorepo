import type { NcEdge, NcNode } from '@codaco/shared-consts';

export function getNodesOfType(nodes: NcNode[], nodeType: string): NcNode[] {
  return nodes.filter((n) => n.type === nodeType);
}

export function getEdgesOfType(edges: NcEdge[], edgeType: string): NcEdge[] {
  return edges.filter((e) => e.type === edgeType);
}
