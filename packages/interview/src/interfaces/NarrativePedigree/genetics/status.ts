import type { VariableValue } from '@codaco/shared-consts';

import { readOwnProperty } from '../../../utils/ownProperty';

export type Status =
  | 'affected'
  | 'obligateAffected'
  | 'obligateCarrier'
  | 'atRiskAffected'
  | 'atRiskCarrier'
  | 'unknown';

// Screen-reader labels for each genetic status.
const STATUS_LABELS: Record<Status, string> = {
  affected: 'Affected',
  obligateAffected: 'Obligate affected',
  obligateCarrier: 'Obligate carrier',
  atRiskAffected: 'At risk (affected)',
  atRiskCarrier: 'At risk (carrier)',
  unknown: 'Status unknown',
};

/** Screen-reader-only labels; genetic status keys and model outputs remain unchanged. */
export function getStatusLabel(status: Status): string {
  return STATUS_LABELS[status];
}

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

/**
 * Everyone marked affected by a disease: those whose boolean disease
 * attribute is true. Anyone else, false or unanswered, is not affected.
 */
export function affectedSet(
  people: readonly {
    id: string;
    attributes: Readonly<Record<string, VariableValue>>;
  }[],
  diseaseAttribute: string,
): Set<string> {
  const result = new Set<string>();
  for (const person of people) {
    if (readOwnProperty(person.attributes, diseaseAttribute) === true) {
      result.add(person.id);
    }
  }
  return result;
}
