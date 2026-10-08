import { Context } from 'effect';

export class AuditActor extends Context.Service<
  AuditActor,
  {
    readonly kind: 'user' | 'participant';
    readonly id: string;
    readonly label: string;
  }
>()('@studio/AuditActor') {}
