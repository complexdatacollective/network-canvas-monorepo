import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcNode } from '@codaco/shared-consts';

export type Status =
  | 'affected'
  | 'obligateAffected'
  | 'obligateCarrier'
  | 'atRiskAffected'
  | 'atRiskCarrier'
  | 'unknown';

// Lower index = higher precedence (affected is highest, unknown is lowest).
const STATUS_PRECEDENCE: readonly Status[] = [
  'affected',
  'obligateAffected',
  'obligateCarrier',
  'atRiskAffected',
  'atRiskCarrier',
  'unknown',
];

export function mergeStatus(a: Status, b: Status): Status {
  const indexA = STATUS_PRECEDENCE.indexOf(a);
  const indexB = STATUS_PRECEDENCE.indexOf(b);
  return indexA <= indexB ? a : b;
}

export function affectedSet(
  nodes: NcNode[],
  diseaseVariable: string,
): Set<string> {
  const result = new Set<string>();
  for (const node of nodes) {
    if (node[entityAttributesProperty][diseaseVariable] === true) {
      result.add(node._uid);
    }
  }
  return result;
}
