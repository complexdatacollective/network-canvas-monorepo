import { Context, type Redacted } from 'effect';

export class AuditActor extends Context.Service<
  AuditActor,
  {
    readonly kind: 'user' | 'participant';
    readonly id: string;
    readonly label: Redacted.Redacted;
  }
>()('@studio/AuditActor') {}
