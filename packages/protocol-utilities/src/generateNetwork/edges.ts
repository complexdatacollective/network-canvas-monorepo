import type { NcNode } from '@codaco/shared-consts';

export function getNodesOfType(nodes: NcNode[], nodeType: string): NcNode[] {
  return nodes.filter((n) => n.type === nodeType);
}
