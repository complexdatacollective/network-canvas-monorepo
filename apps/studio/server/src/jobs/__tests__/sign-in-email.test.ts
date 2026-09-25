// A sign-in email is queued, never sent from the request (#1895). What this
// file pins is the seam better-auth sees: `sendMagicLink` is a promise, and
// better-auth reads its outcome to decide whether the person is told to check
// their inbox — so a queue that refused must reject rather than resolve.
//
// What it no longer pins is the transaction around the enqueue. That used to
// be three statements this suite counted on a fake pool (`BEGIN`, the insert,
// `COMMIT`), because the node-postgres path took a `pg.Pool` and could have
// opened a connection of its own. `Jobs.enqueue` requires `Transaction` and
// only a scope provides one, so the guarantee is structural and is proved
// against a real database in `src/jobs/__tests__/transaction.test.ts`.
//
// The end-to-end half — a magic-link request producing exactly one
// `sign-in-email` job carrying the minted link — is in
// src/__tests__/auth.test.ts, against the real better-auth endpoint.
import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe } from 'vitest';

import { TestDatabaseLive, testDb } from '../../__tests__/support/database.ts';
import type { Database } from '../../db/client.ts';
import { JobRefused, Jobs, RecordedJobs } from '../jobs.ts';
import { createSignInEmailSender } from '../sign-in-email.ts';

const MAGIC_LINK = {
  email: 'researcher@example.org',
  url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
};

/** A queue that refuses everything, which is the only outcome that matters. */
const refusingJobs = Layer.succeed(Jobs)(
  Jobs.of({
    enqueue: (queue) =>
      Effect.fail(new JobRefused({ queue, reason: 'the queue is gone' })),
  }),
);

describe.skipIf(!testDb)('queueing a sign-in email', () => {
  layer(TestDatabaseLive)('over the application client', (suite) => {
    suite.effect('creates the job inside a transaction of its own', () =>
      Effect.gen(function* () {
        const services = yield* Effect.context<Database | Jobs>();
        const recorded = yield* RecordedJobs;
        yield* recorded.clear;

        // Through the promise seam better-auth is handed, not the Effect
        // underneath it: what this case is about is that the seam works at
        // all from outside Effect.
        yield* Effect.promise(() =>
          createSignInEmailSender(services)(MAGIC_LINK),
        );

        // That it recorded at all is the transaction oracle: the recording
        // enqueue requires `Transaction` like the live one, and nothing but a
        // scope provides one — so a sender that had skipped the scope could
        // not have reached this point.
        assert.deepStrictEqual(
          recorded.recorded.map(({ queue, payload }) => ({ queue, payload })),
          [{ queue: 'sign-in-email' as const, payload: MAGIC_LINK }],
        );
      }).pipe(Effect.provide(Jobs.layerRecording)),
    );

    suite.effect('rejects rather than resolve when the queue refuses', () =>
      Effect.gen(function* () {
        const services = yield* Effect.context<Database | Jobs>();
        const outcome = yield* Effect.exit(
          Effect.tryPromise({
            try: () => createSignInEmailSender(services)(MAGIC_LINK),
            catch: (cause: unknown) => cause,
          }),
        );
        // Rejected, so better-auth answers the sign-in request with a failure
        // rather than telling the person to check an inbox nothing will reach.
        assert.isTrue(outcome._tag === 'Failure');
      }).pipe(Effect.provide(refusingJobs)),
    );
  });
});
