import { Context, Schema } from 'effect';
import { RpcMiddleware } from 'effect/rpc';

import { RateLimited, Unauthorized } from '../schema/errors.ts';
import type { UserId } from '../schema/ids.ts';
import type { AuditActor } from './auditActor.ts';

export class Principal extends Context.Service<
  Principal,
  {
    readonly kind: 'user';
    readonly userId: UserId;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly name: string;
    readonly locale: string | null;
    readonly sessionId: string;
  }
>()('@studio/Principal') {}

/**
 * `requiredForClient` is false: the credential is an httpOnly cookie the
 * browser attaches itself, so there is nothing for a client-side layer to do.
 */
export class Authenticated extends RpcMiddleware.Service<
  Authenticated,
  { provides: Principal | AuditActor }
>()('@studio/Authenticated', {
  error: Schema.Union([Unauthorized, RateLimited]),
  requiredForClient: false,
}) {}
