// A sign-in email is queued, never sent from the request (#1895). What this
// file pins is the transaction around that enqueue: better-auth reads the
// outcome of `sendMagicLink` to decide whether the person is told to check
// their inbox, so a failure must not commit and must not be swallowed.
//
// The end-to-end half — a magic-link request producing exactly one
// `sign-in-email` job carrying the minted link — is in
// src/__tests__/auth.test.ts, against the real better-auth endpoint.
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { JobClient } from '../client.ts';
import {
  createSignInEmailSender,
  enqueueSignInEmail,
} from '../sign-in-email.ts';

const MAGIC_LINK = {
  email: 'researcher@example.org',
  url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
};

/** Records the statements the enqueue runs, in order, and whether it let go. */
function recordingPool() {
  const statements: string[] = [];
  let released = 0;
  const client = {
    query: (text: string) => {
      statements.push(text);
      return Promise.resolve({ rows: [] });
    },
    release: () => {
      released += 1;
    },
  } as unknown as pg.PoolClient;
  const pool = {
    connect: () => Promise.resolve(client),
  } as unknown as pg.Pool;
  return { pool, statements, released: () => released };
}

/** `enqueue` is the whole of the client, so a double needs nothing else. */
function jobClient(enqueue: JobClient['enqueue']): JobClient {
  return { enqueue };
}

describe('queueing a sign-in email', () => {
  it('creates the job inside a committed transaction', async () => {
    const { pool, statements, released } = recordingPool();
    const enqueue = vi.fn(() => Promise.resolve('job-1'));

    await enqueueSignInEmail(jobClient(enqueue), pool, MAGIC_LINK);

    expect(statements).toEqual(['BEGIN', 'COMMIT']);
    // The enqueue runs on the transaction's own client — passing the pool
    // would put the insert on a different connection, outside it.
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ release: expect.any(Function) }),
      'sign-in-email',
      MAGIC_LINK,
    );
    expect(released()).toBe(1);
  });

  it('rolls back and rethrows when the enqueue fails', async () => {
    const { pool, statements, released } = recordingPool();
    const refused = new Error('sign-in-email refused the job');

    await expect(
      enqueueSignInEmail(
        jobClient(() => Promise.reject(refused)),
        pool,
        MAGIC_LINK,
      ),
    ).rejects.toBe(refused);

    // Rethrown, so better-auth answers the sign-in request with a failure
    // rather than telling the person to check an inbox nothing will reach.
    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(released()).toBe(1);
  });

  it('refuses when the process has no queue to reach', async () => {
    const { pool, statements } = recordingPool();

    await expect(
      createSignInEmailSender(undefined, pool)(MAGIC_LINK),
    ).rejects.toThrow(/No job client is configured/);

    // Refused before a connection is taken: there is nothing to roll back,
    // and a lane with no database must not open one to find that out.
    expect(statements).toEqual([]);
  });
});
