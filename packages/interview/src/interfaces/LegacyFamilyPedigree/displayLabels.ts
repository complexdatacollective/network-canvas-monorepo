import type { IntlShape } from '@codaco/app-i18n/messages';
import type { FramingId } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { resolveInterviewIntl } from '../../i18n/resolveIntl';
import { messages } from './messages';
import { computeAllDisplayLabels } from './pedigree-layout/utils/getDisplayLabel';
import type { VariableConfig } from './store';

/**
 * Computes display labels for all nodes in the pedigree.
 * Named nodes use their name. Unnamed nodes get a BFS-based relationship
 * label with numbering when multiple nodes share the same role.
 *
 * Pass `knownEgoId` to skip the attribute-based ego discovery and use a
 * pre-resolved id instead. This is required when the caller already has the
 * correct ego id and the node map may contain other nodes whose egoVariable
 * attribute is also true (e.g. from synthetic random generation in stories).
 */
export function computeNodeDisplayLabels(
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  framing: FramingId,
  knownEgoId?: string,
  intl?: IntlShape,
): Map<string, string> {
  const formatter = resolveInterviewIntl(intl);
  let egoId: string;
  if (knownEgoId !== undefined) {
    egoId = knownEgoId;
  } else {
    const egoEntry = [...nodes.entries()].find(
      ([, n]) =>
        n[entityAttributesProperty][variableConfig.egoVariable] === true,
    );
    if (!egoEntry) return new Map();
    egoId = egoEntry[0];
  }

  const computedLabels = computeAllDisplayLabels(
    egoId,
    nodes,
    edges,
    variableConfig,
    framing,
    formatter,
  );

  const labels = new Map<string, string>([
    [egoId, formatter.formatMessage(messages.you)],
  ]);
  const roleBuckets = new Map<string, string[]>();

  for (const [nodeId, node] of nodes) {
    if (nodeId === egoId) continue;

    const storedName = node[entityAttributesProperty][
      variableConfig.nodeLabelVariable
    ] as string | undefined;
    if (storedName) {
      labels.set(nodeId, storedName);
      continue;
    }

    const role =
      computedLabels.get(nodeId) ??
      formatter.formatMessage(messages.familyMember);
    const bucket = roleBuckets.get(role) ?? [];
    bucket.push(nodeId);
    roleBuckets.set(role, bucket);
  }

  for (const [role, nodeIds] of roleBuckets) {
    if (nodeIds.length === 1) {
      labels.set(nodeIds[0]!, role);
    } else {
      nodeIds.forEach((id, i) => {
        labels.set(
          id,
          formatter.formatMessage(messages.numberedRelative, {
            role,
            number: i + 1,
          }),
        );
      });
    }
  }

  return labels;
}
