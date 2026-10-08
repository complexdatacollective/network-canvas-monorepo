import { Redacted } from 'effect';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';

export const participantAuditActor = (
  sessionId: string,
  participantCode: Redacted.Redacted | null,
): AuditActor['Service'] =>
  AuditActor.of({
    kind: 'participant',
    id: sessionId,
    label: participantCode ?? Redacted.make(sessionId.slice(0, 8)),
  });
