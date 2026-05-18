import { ProtocolNotFoundError } from '../errors';
import type { InterviewExportInput, ProtocolExportInput } from '../input';
import type { ExportFailure } from '../output';

export function partitionByProtocolAvailability(
  sessions: InterviewExportInput[],
  protocols: Record<string, ProtocolExportInput>,
): { resolvable: InterviewExportInput[]; missing: ExportFailure[] } {
  const resolvable: InterviewExportInput[] = [];
  const missing: ExportFailure[] = [];
  for (const session of sessions) {
    if (protocols[session.protocolHash]) {
      resolvable.push(session);
    } else {
      missing.push({
        kind: 'protocol-missing',
        sessionId: session.id,
        error: new ProtocolNotFoundError({
          hash: session.protocolHash,
          sessionId: session.id,
        }),
      });
    }
  }
  return { resolvable, missing };
}
