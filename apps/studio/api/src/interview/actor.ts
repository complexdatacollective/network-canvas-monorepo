import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';

export const participantAuditActor = (
  sessionId: string,
  participantCode: string | null,
): AuditActor['Service'] =>
  AuditActor.of({
    kind: 'participant',
    id: sessionId,
    label: participantCode ?? sessionId.slice(0, 8),
  });
