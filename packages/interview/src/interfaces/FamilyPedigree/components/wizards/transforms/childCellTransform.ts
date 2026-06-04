import type { NcEdge, NcNode } from '@codaco/shared-consts';
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import { buildChildParentage } from './buildChildParentage';
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

  const { nodes, edges, parents } = buildChildParentage(
    'child',
    values,
    variableConfig,
  );
  batch.nodes.push(...nodes);
  batch.edges.push(...edges);

  const additionalParents = values['additional-parent'] as
    | Record<string, unknown>[]
    | undefined;
  if (values.hasOtherParents === true && Array.isArray(additionalParents)) {
    for (let i = 0; i < additionalParents.length; i++) {
      const ap = additionalParents[i];
      if (!ap) continue;
      const apName = (ap.name as string | undefined) ?? '';
      const apExtraAttrs = extractCustomAttributes(ap);
      const tempId = `additional-parent-${String(i)}`;

      batch.nodes.push({
        tempId,
        data: {
          attributes: {
            [variableConfig.nodeLabelVariable]: apName,
            [variableConfig.egoVariable]: false,
            ...apExtraAttrs,
          },
        },
      });

      batch.edges.push({
        source: tempId,
        target: 'child',
        data: {
          attributes: {
            [variableConfig.relationshipTypeVariable]: 'social',
            [variableConfig.isActiveVariable]: true,
          },
        },
      });
    }
  }

  for (let i = 0; i < parents.length; i++) {
    for (let j = i + 1; j < parents.length; j++) {
      const key = `partnership-${parents[i]!.roleKey}-${parents[j]!.roleKey}`;
      const val = values[key] as string | undefined;
      if (val === 'current' || val === 'ex') {
        batch.edges.push({
          source: parents[i]!.ref,
          target: parents[j]!.ref,
          data: {
            attributes: {
              [variableConfig.relationshipTypeVariable]: 'partner',
              [variableConfig.isActiveVariable]: val === 'current',
            },
          },
        });
      }
    }
  }

  return batch;
}
