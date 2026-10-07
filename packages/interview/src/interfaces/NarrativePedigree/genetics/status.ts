import type { IntlShape } from '@codaco/app-i18n/messages';
import type { VariableValue } from '@codaco/shared-consts';

import { resolveInterviewIntl } from '../../../i18n/resolveIntl';
import { messages } from '../messages';

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
const statusMessages = {
  affected: messages.affected,
  obligateAffected: messages.obligateAffected,
  obligateCarrier: messages.obligateCarrier,
  atRiskAffected: messages.atRiskAffected,
  atRiskCarrier: messages.atRiskCarrier,
  unknown: messages.statusUnknown,
};

/** Display-only labels; genetic status keys and model outputs remain unchanged. */
export function getStatusLabel(status: Status, intl?: IntlShape): string {
  return resolveInterviewIntl(intl).formatMessage(statusMessages[status]);
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
    if (person.attributes[diseaseAttribute] === true) {
      result.add(person.id);
    }
  }
  return result;
}
