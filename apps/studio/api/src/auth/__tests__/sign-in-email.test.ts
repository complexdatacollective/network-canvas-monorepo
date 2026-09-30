// A sign-in email is queued, never sent from the request (#1895). What this
// file pins is the hook better-auth is handed (`auth/service.ts`'s
// `makeSendMagicLink`): `sendMagicLink` is a promise, and better-auth reads its
// outcome to decide whether the person is told to check their inbox — so a
// queue that refused must reject rather than resolve, and the sign-in request
// must fail with it.
//
// What it does not pin is the transaction around the enqueue: `Jobs.enqueue`
// requires `Transaction` and only a scope provides one, so the guarantee is
// structural and is proved against a real database in
// `src/jobs/__tests__/transaction.test.ts`.
//
// The end-to-end half against the real queue — a magic-link request producing
// exactly one `sign-in-email` row carrying the minted link — is in
// src/__tests__/auth.test.ts.
import { assert, layer } from '@effect/vitest';
import { Effect, Layer, Predicate } from 'effect';
import { describe } from 'vitest';

import { TestDatabaseLive, testDb } from '../../__tests__/support/database.ts';
import { testCipher } from '../../__tests__/support/secrets.ts';
import { limiterWithoutStore } from '../../__tests__/support/valkey.ts';
import { Environment, readEnv } from '../../env.ts';
import { JobRefused, Jobs, RecordedJobs } from '../../jobs/jobs.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { AuthService, makeSendMagicLink } from '../service.ts';

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

/** The hook as better-auth receives it: a promise over the given services. */
const sendThroughHook = Effect.flatMap(makeSendMagicLink, (send) =>
  Effect.tryPromise({
    try: () => send(MAGIC_LINK),
    catch: (cause: unknown) => cause,
  }),
);

const env = readEnv();

/**
 * The live service over the scratch schema, with whichever queue a case gives
 * it: the hook is built inside the layer, so this is the wiring better-auth is
 * actually handed rather than the hook in isolation.
 */
const liveAuth = AuthService.layer.pipe(
  Layer.provide(Layer.succeed(Environment, env)),
  Layer.provide(Layer.succeed(RateLimiter)(limiterWithoutStore)),
  Layer.provide(Layer.succeed(SecretsCipher)(testCipher())),
);

/** A magic-link request as the browser sends one, through better-auth's own handler. */
const requestMagicLink = (email: string) =>
  AuthService.use((auth) =>
    auth.handler(
      new Request(new URL('/api/auth/sign-in/magic-link', env.auth?.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': env.auth?.baseUrl ?? '',
        },
        body: JSON.stringify({ email, callbackURL: '/' }),
      }),
    ),
  );

describe.skipIf(!testDb)('queueing a sign-in email', () => {
  layer(TestDatabaseLive)('over the application client', (suite) => {
    suite.effect('enqueues exactly one sign-in email carrying the link', () =>
      Effect.gen(function* () {
        const recorded = yield* RecordedJobs;
        yield* recorded.clear;

        // Through the promise seam better-auth is handed, not the Effect
        // underneath it: what this case is about is that the seam works at
        // all from outside Effect.
        yield* sendThroughHook;

        // That it recorded at all is the transaction oracle: the recording
        // enqueue requires `Transaction` like the live one, and nothing but a
        // scope provides one — so a hook that had skipped the scope could not
        // have reached this point.
        assert.deepStrictEqual(
          recorded.recorded.map(({ queue, payload }) => ({ queue, payload })),
          [{ queue: 'sign-in-email' as const, payload: MAGIC_LINK }],
        );
      }).pipe(Effect.provide(Jobs.layerRecording)),
    );

    suite.effect('rejects rather than resolve when the queue refuses', () =>
      Effect.gen(function* () {
        const outcome = yield* Effect.exit(sendThroughHook);
        // Rejected, so better-auth answers the sign-in request with a failure
        // rather than telling the person to check an inbox nothing will reach.
        assert.isTrue(outcome._tag === 'Failure');
      }).pipe(Effect.provide(refusingJobs)),
    );

    suite.effect(
      'fails the sign-in request when the queue refuses the link',
      () =>
        Effect.gen(function* () {
          // The same refusal through the live service: the hook the layer
          // built, reached by better-auth's own magic-link endpoint. A hook
          // that swallowed the refusal would answer 200 here — the person
          // told to check an inbox the link never reaches.
          const response = yield* requestMagicLink(
            `refused-${Date.now()}@example.org`,
          );
          assert.notStrictEqual(response.status, 200);
          assert.isAtLeast(response.status, 500);
        }).pipe(Effect.provide(liveAuth.pipe(Layer.provide(refusingJobs)))),
    );

    suite.effect('answers the sign-in request once the link is queued', () =>
      Effect.gen(function* () {
        const recorded = yield* RecordedJobs;
        yield* recorded.clear;
        const email = `queued-${Date.now()}@example.org`;

        // The positive control for the case above: the same request against
        // a queue that accepts is a 200, and the one job it made carries the
        // address it was asked for and a link into this deployment.
        const response = yield* requestMagicLink(email);
        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(
          recorded.recorded.map(({ queue }) => queue),
          ['sign-in-email'],
        );
        const payload = recorded.recorded[0]?.payload;
        assert.strictEqual(
          Predicate.hasProperty(payload, 'email') ? payload.email : undefined,
          email,
        );
      }).pipe(
        Effect.provide(liveAuth.pipe(Layer.provideMerge(Jobs.layerRecording))),
      ),
    );
  });
});
