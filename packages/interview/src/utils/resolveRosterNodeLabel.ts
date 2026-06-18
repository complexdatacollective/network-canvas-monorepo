import type { NodeDefinition } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { getNodeLabelAttribute } from './getNodeLabelAttribute';

type ResolveRosterNodeLabelArgs = {
  codebookVariables: NodeDefinition['variables'];
  node: NcNode;
  subjectLabel: string;
  sequentialNumber: number;
};

// Only string/number attribute values make a meaningful card title; other
// types (booleans, locations, arrays) would stringify to noise.
const coerceToLabel = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value === '' ? null : value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
};

// Derives the title shown on an external-roster card. Resolution order: the
// name heuristic, then the first usable attribute value (so preview-export
// rosters whose attribute keys are UUIDs absent from the running codebook
// still show real data), then a stable placeholder. This deliberately never
// returns the node's content-hash primary key, which is opaque to participants.
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
