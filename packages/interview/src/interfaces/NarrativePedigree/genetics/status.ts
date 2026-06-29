import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcNode } from '@codaco/shared-consts';

export type Status =
  | 'affected'
  | 'obligateAffected'
  | 'obligateCarrier'
  | 'atRiskAffected'
  | 'atRiskCarrier'
  | 'unknown';

// Human-readable labels for each genetic status. Single source of truth for the
// text describing a status, shared by the (decorative) node markers and the
// screen-reader status summary so they never drift apart.
export const STATUS_LABELS: Record<Status, string> = {
  affected: 'Affected',
  obligateAffected: 'Obligate affected',
  obligateCarrier: 'Obligate carrier',
  atRiskAffected: 'At risk (affected)',
  atRiskCarrier: 'At risk (carrier)',
  unknown: 'Status unknown',
};

// Label for the secondary at-risk-homozygous marker (a person who may be
// homozygous-affected), shown alongside their primary status.
export const AT_RISK_HOMOZYGOUS_LABEL =
  'At risk of being affected (homozygous)';

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
