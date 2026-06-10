import type { StoredSessionLite } from '~/lib/db/types';

type DeleteProtocolMessage = {
  description: string;
  hasUnexported: boolean;
};

// Builds the confirmation copy for deleting a protocol. Unexported interview
// records take priority in the messaging since deleting them loses data that
// exists nowhere else.
export function buildDeleteProtocolMessage(
  protocolName: string,
  protocolSessions: StoredSessionLite[],
): DeleteProtocolMessage {
  const unexportedCount = protocolSessions.filter(
    (s) => s.exportedAt === null,
  ).length;
  const totalCount = protocolSessions.length;
  const hasUnexported = unexportedCount > 0;

  if (hasUnexported) {
    const recordsClause =
      unexportedCount === 1
        ? '1 interview record has not been exported and will be permanently lost'
        : `${unexportedCount} interview records have not been exported and will be permanently lost`;
    return {
      description: `${recordsClause} if you delete this protocol. Export them first if you want to keep the data. This cannot be undone.`,
      hasUnexported,
    };
  }

  let description = `The protocol "${protocolName}" will be permanently deleted.`;
  if (totalCount > 0) {
    const recordsPhrase =
      totalCount === 1
        ? '1 interview record'
        : `${totalCount} interview records`;
    description += ` ${recordsPhrase} will also be deleted.`;
  }
  description += ' This cannot be undone. Do you want to continue?';
  return { description, hasUnexported };
}
