import { Context } from 'effect';

export class AuditContext extends Context.Service<
  AuditContext,
  {
    readonly teamId: string;
    readonly teamLabel: string;
    readonly actorId: string;
    readonly actorLabel: string;
    readonly requestId: string;
  }
>()('@studio/audit/AuditContext') {}
