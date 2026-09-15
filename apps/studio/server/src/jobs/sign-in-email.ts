import type pg from 'pg';

import type { SignInEmailJob } from '@codaco/studio-sync/jobs';

import type { JobClient } from './client.ts';

// Sign-in mail is the worker's (#1895): the web process creates a job and
// holds no transport at all. The magic-link URL travels in the payload — the
// documented exception to identifiers-only payloads, because the token is
// minted by better-auth inside the request and exists nowhere else.

/**
 * A transaction of its own, because better-auth mints the link outside any
 * transaction of ours: there is no domain write for this job to join. It is
 * still a transaction rather than a bare enqueue so `enqueueJob`'s contract —
 * a job is created by a client, inside a transaction — holds for every caller,
 * and so a failure leaves nothing half-written.
 */
export async function enqueueSignInEmail(
  jobs: JobClient,
  pool: pg.Pool,
  data: SignInEmailJob,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await jobs.enqueue(client, 'sign-in-email', data);
    await client.query('COMMIT');
  } catch (error) {
    // Rethrown, so better-auth answers the sign-in request with a failure
    // rather than telling the person to check an inbox nothing will reach.
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * What `createAuthService` hands better-auth. Without a job client there is no
 * queue to reach — the Netlify lane, which has no database — and refusing is
 * the honest answer: this process cannot send the mail itself.
 */
export function createSignInEmailSender(
  jobs: JobClient | undefined,
  pool: pg.Pool,
): (data: SignInEmailJob) => Promise<void> {
  return (data) => {
    if (!jobs) {
      return Promise.reject(
        new Error(
          'No job client is configured; cannot queue the sign-in email for the worker',
        ),
      );
    }
    return enqueueSignInEmail(jobs, pool, data);
  };
}
