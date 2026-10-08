import { Context, type Redacted } from 'effect';

export class AuditContext extends Context.Service<
  AuditContext,
  {
    readonly teamId: string;
    readonly teamLabel: Redacted.Redacted;
    readonly actorKind: 'user' | 'participant';
    readonly actorId: string;
    readonly actorLabel: Redacted.Redacted;
    readonly requestId: string;
  }
>()('@studio/audit/AuditContext') {}
