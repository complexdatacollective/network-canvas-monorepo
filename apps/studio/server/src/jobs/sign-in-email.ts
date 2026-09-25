import { type Context, Effect } from 'effect';

import type { SignInEmailJob } from '@codaco/studio-sync/jobs';

import type { Database } from '../db/client.ts';
import { UntenantedScope } from '../db/tenant.ts';
import { Jobs } from './jobs.ts';

// Sign-in mail is the worker's (#1895): the web process creates a job and
// holds no transport at all. The magic-link URL travels in the payload — the
// documented exception to identifiers-only payloads, because the token is
// minted by better-auth inside the request and exists nowhere else.

/**
 * A transaction of its own, because better-auth mints the link outside any
 * transaction of ours: there is no domain write for this job to join. It is
 * still a transaction rather than a bare statement because `Jobs.enqueue`
 * requires `Transaction` and nothing but a scope provides one — which is the
 * queue's atomicity guarantee at the type level, and holds for this caller
 * exactly as it does for a command with domain work beside its job.
 *
 * Untenanted: a sign-in belongs to no team, and the queue's own tables carry
 * no tenant policy. The scope still pins the application role, which is the
 * half of it a bare statement outside a transaction would lose.
 */
const enqueueSignInEmail = (
  data: SignInEmailJob,
): Effect.Effect<void, never, Database | Jobs> =>
  UntenantedScope.open(
    Effect.flatMap(Jobs, (jobs) => jobs.enqueue('sign-in-email', data)),
  ).pipe(
    // Nothing about a magic link is retryable here and nothing downstream can
    // act on the distinction: a refused singleton and an unreachable database
    // both mean the mail was not queued. Raising it as a defect is what makes
    // better-auth answer the sign-in request with a failure rather than tell
    // the person to check an inbox nothing will reach.
    Effect.orDie,
    Effect.asVoid,
  );

/**
 * What `createAuthService` hands better-auth: a promise-shaped sender over the
 * services the program already built.
 *
 * The context is handed down rather than a runtime built here, for the reason
 * the protocol-builder router's is (`rpc/deps.ts`): better-auth's callback is
 * a promise, the data layer under it is Effect, and the program that owns the
 * layers is the only thing that can supply them. A process with no database
 * has no context to hand down and no queue to reach, and `createAuthService`
 * returns the disabled service instead — so there is no "no job client"
 * refusal left to write.
 */
export const createSignInEmailSender =
  (services: Context.Context<Database | Jobs>) =>
  (data: SignInEmailJob): Promise<void> =>
    Effect.runPromise(Effect.provide(enqueueSignInEmail(data), services));
