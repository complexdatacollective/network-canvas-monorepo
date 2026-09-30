import type { Context } from 'effect';
import type pg from 'pg';

import type { DeniedAttempts } from '../audit/denial-rate-limit.ts';
import type { AuditSignal } from '../audit/signal.ts';
import type { AuthService } from '../auth/service.ts';
import type { Database } from '../db/client.ts';
import type {
  AuthCapabilities,
  DeploymentStatus,
  InstallationReader,
} from '../domain.ts';
import type { Jobs } from '../jobs/jobs.ts';
import type { RateLimiter } from '../rate-limit/limiter.ts';
import type { SecretsCipher } from '../secrets/services.ts';

/**
 * Everything the `/rpc` handlers are wired from, resolved once by
 * `createStudio` and handed to the handler layers as one value (`studio.rpc`).
 *
 * The auth provider and the rate limiter are not here: the handlers and the
 * middlewares ask the `AuthService` and `RateLimiter` services for them, which
 * the program's layer graph provides (`programs/serve.ts`).
 *
 * The optional members are the surfaces a deployment may not have configured.
 * Their absence is a deployment bug rather than an authorization refusal —
 * every procedure that needs one dies rather than declaring an error for it —
 * which is the reading today's `INTERNAL_SERVER_ERROR` rows already had.
 */
export type RpcDeps = {
  /** What sign-in this instance offers, for `status`. */
  readonly capabilities: AuthCapabilities;
  readonly deployment: DeploymentStatus;
  /** The installation row behind `status.setup` and the instance's name. */
  readonly readInstallation: InstallationReader;
  readonly pool?: pg.Pool | undefined;
  /**
   * The Effect services every data-layer caller on this plane runs on (#1931
   * stage 3): the application client, the operator signal, the job queue, the
   * process's cipher and the audit denial window.
   *
   * It is a `Context` rather than a set of layers because one of its
   * consumers is a promise — the installation read `status` answers from — and the
   * program that owns the layers is the only thing that can supply it. Absent wherever there is no database, where
   * every procedure that would need one refuses beside the missing pool.
   */
  readonly services?: Context.Context<StudioServices> | undefined;
};

/** What a request-serving process resolves its data-layer work against. */
export type StudioServices =
  | Database
  | AuditSignal
  | Jobs
  | SecretsCipher
  | DeniedAttempts;

/**
 * What the `/rpc` route runs on: the data layer, plus the auth provider the
 * `Authenticated` middleware and the access helpers ask, and the limiter every
 * scope on this plane is charged against. Always present — a process with no
 * database has the disabled auth service and a limiter over no store — so no
 * handler branches on either being missing.
 */
export type RpcServices = StudioServices | AuthService | RateLimiter;
