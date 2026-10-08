import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';

import { interfaceMessages } from './messages';

/**
 * The confirmation asked for before leaving a form whose changes would be
 * lost, saying why they cannot be saved (by default, that they are invalid).
 */
export default function discardChangesDialog(
  reason: MessageDescriptor = interfaceMessages.discardChangesDescription,
) {
  return {
    title: <AppMessage message={interfaceMessages.discardChangesTitle} />,
    description: <AppMessage message={reason} />,
    confirmLabel: <AppMessage message={interfaceMessages.discardChanges} />,
    cancelLabel: <AppMessage message={interfaceMessages.keepChanges} />,
    intent: 'destructive' as const,
  };
}
