import type { NodeDefinition } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { getNodeLabelAttribute } from './getNodeLabelAttribute';

type ResolveRosterNodeLabelArgs = {
  codebookVariables: NodeDefinition['variables'];
  node: NcNode;
  subjectLabel: string;
  sequentialNumber: number;
};

// Only string/number values produce a meaningful title; everything else
// (objects, arrays, null) would stringify to noise like "[object Object]".
const coerceToLabel = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value === '' ? null : value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
};

// Derives a human-readable title for an external-roster card. Falls back through
// the name heuristic, then the first usable attribute value (covers
// preview-export rosters whose attribute keys are UUIDs absent from the running
// codebook), then a stable placeholder so we never surface the content-hash _uid.
export const resolveRosterNodeLabel = ({
  codebookVariables,
  node,
  subjectLabel,
  sequentialNumber,
}: ResolveRosterNodeLabelArgs): string => {
  const attributes = node[entityAttributesProperty];

  const attribute = getNodeLabelAttribute(codebookVariables, attributes);
  if (attribute) {
    const label = coerceToLabel(attributes[attribute]);
    if (label !== null) {
      return label;
    }
  }

  for (const value of Object.values(attributes)) {
    const label = coerceToLabel(value);
    if (label !== null) {
      return label;
    }
  }

  return `Unnamed ${subjectLabel} ${sequentialNumber}`;
};
