import { defineMessages } from '@codaco/app-i18n/messages';
import type { LocalizedMessage } from '~/i18n/messageResult';
import type { StoredSessionLite } from '~/lib/db/types';

const messages = defineMessages({
  unexported: {
    id: 'interviewer.deleteProtocol.unexported',
    defaultMessage:
      '{count, plural, one {# interview record has not been exported and will be permanently lost if you delete this protocol. Export it first if you want to keep the data. This cannot be undone.} other {# interview records have not been exported and will be permanently lost if you delete this protocol. Export them first if you want to keep the data. This cannot be undone.}}',
    description:
      'Destructive confirmation prioritizing interview records that have never been exported.',
  },
  exported: {
    id: 'interviewer.deleteProtocol.exported',
    defaultMessage:
      'The protocol "{name}" will be permanently deleted. {count, plural, =0 {} one {# interview record will also be deleted. } other {# interview records will also be deleted. }}This cannot be undone. Do you want to continue?',
    description:
      'Destructive confirmation when all records have already been exported; name is researcher-authored protocol metadata.',
  },
});

export function buildDeleteProtocolMessage(
  protocolName: string,
  protocolSessions: StoredSessionLite[],
): { description: LocalizedMessage; hasUnexported: boolean } {
  const unexportedCount = protocolSessions.filter(
    (session) => session.exportedAt === null,
  ).length;
  const hasUnexported = unexportedCount > 0;
  return {
    description: hasUnexported
      ? { descriptor: messages.unexported, values: { count: unexportedCount } }
      : {
          descriptor: messages.exported,
          values: {
            name: protocolName,
            count: protocolSessions.length,
          },
        },
    hasUnexported,
  };
}
