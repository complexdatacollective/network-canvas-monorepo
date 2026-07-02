import type { NcEdge, NcNode, VariableValue } from '@codaco/shared-consts';
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import { buildParentageBatch } from './buildParentageBatch';
import { extractCustomAttributes, readBiologicalSex } from './personAttributes';

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

  const childAttributes: Record<string, VariableValue> = {
    [variableConfig.nodeLabelVariable]: childName,
    [variableConfig.egoVariable]: false,
    ...childExtraAttrs,
  };
  // The child's own biological sex is a "known" person key, so it is not among
  // the custom attributes — read and persist it explicitly (a child is a leaf
  // whose sex is needed for sex-linked genetics).
  const childSex = readBiologicalSex(childValues?.biologicalSex);
  if (childSex !== undefined) {
    childAttributes[variableConfig.biologicalSexVariable] = childSex;
  }

  batch.nodes.push({
    tempId: 'child',
    data: { attributes: childAttributes },
  });

  const parentage = buildParentageBatch('child', values, variableConfig);
  batch.nodes.push(...parentage.nodes);
  batch.edges.push(...parentage.edges);

  return batch;
}
