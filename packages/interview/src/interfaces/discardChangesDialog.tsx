import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';

import { runtimeMessages } from '../i18n/runtimeMessages';
import { interfaceMessages } from './messages';

/**
 * Why a form whose answers failed their checks cannot be saved: the
 * passphrase, when a check compares them with protected answers while it has
 * not been entered, or otherwise that they are invalid.
 */
export function failedCheckReason(
  passphraseNeeded: boolean,
): MessageDescriptor {
  return passphraseNeeded
    ? runtimeMessages.protectedAnswersNotSaved
    : interfaceMessages.discardChangesDescription;
}

/**
 * The confirmation asked for before leaving a form whose changes would be
 * lost, saying why they cannot be saved (by default, that they are invalid).
 */
export default function discardChangesDialog(
  reason:
    | MessageDescriptor
    | string = interfaceMessages.discardChangesDescription,
) {
  return {
    title: <AppMessage message={interfaceMessages.discardChangesTitle} />,
    // A string is a stage's own words, already in the interview's language.
    description:
      typeof reason === 'string' ? reason : <AppMessage message={reason} />,
    confirmLabel: <AppMessage message={interfaceMessages.discardChanges} />,
    cancelLabel: <AppMessage message={commonMessages.cancel} />,
    intent: 'destructive' as const,
  };
}
