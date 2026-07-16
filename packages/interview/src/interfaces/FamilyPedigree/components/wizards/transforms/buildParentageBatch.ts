import type { CommitBatch, VariableConfig } from '../../../store';
import { buildChildParentage } from './buildChildParentage';
import { extractCustomAttributes } from './personAttributes';

/**
 * Build the parent nodes + parent->target edges (genetic triad, additional
 * social parents, and partnerships between the resolved parents) for a target
 * node that already has a temp/real id. Does NOT create the target node.
 */
export function buildParentageBatch(
  targetTempId: string,
  values: Record<string, unknown>,
  variableConfig: VariableConfig,
): CommitBatch {
  const batch: CommitBatch = { nodes: [], edges: [] };

  const { nodes, edges, parents } = buildChildParentage(
    targetTempId,
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
        target: targetTempId,
        data: {
          attributes: {
            [variableConfig.relationshipTypeVariable]: ['social'],
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
              [variableConfig.relationshipTypeVariable]: ['partner'],
              [variableConfig.isActiveVariable]: val === 'current',
            },
          },
        });
      }
    }
  }

  return batch;
}
