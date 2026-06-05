import type { NcEdge, NcNode } from '@codaco/shared-consts';
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import { buildParentageBatch } from './buildParentageBatch';
import { extractCustomAttributes } from './personAttributes';

export function childCellTransform(
  values: Record<string, unknown>,
  _anchorNodeId: string,
  _nodes: Map<string, NcNode>,
  _edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): CommitBatch {
  const batch: CommitBatch = { nodes: [], edges: [] };

  const childValues = values.child as Record<string, unknown> | undefined;
  const childName = (childValues?.name as string | undefined) ?? '';
  const childExtraAttrs = childValues
    ? extractCustomAttributes(childValues)
    : undefined;

  batch.nodes.push({
    tempId: 'child',
    data: {
      attributes: {
        [variableConfig.nodeLabelVariable]: childName,
        [variableConfig.egoVariable]: false,
        ...childExtraAttrs,
      },
    },
  });

  const parentage = buildParentageBatch('child', values, variableConfig);
  batch.nodes.push(...parentage.nodes);
  batch.edges.push(...parentage.edges);

  return batch;
}
