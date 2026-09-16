// What the SMTP transport does when a server takes the connection and then
// goes quiet, which is the failure every bound in `MailerSmtp` exists for. The
// numbers are a deployment property rather than a preference: an invitation
// attempt expires after 60 seconds (packages/studio-sync/src/jobs.ts) and a
// container stop gives an in-flight send 25 (`stopTimeout`,
// src/jobs/worker.ts), so a send left at nodemailer's own defaults —
// 2 minutes to connect, 30 seconds for a greeting, 10 idle minutes — outlasts
// both: the stop interrupts the attempt mid-send and the row stays `active`
// until its lease expires and the reaper walks it down the retry ladder,
// rather than the next attempt starting promptly.
import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Exit, Layer, Scope } from 'effect';

import {
  startSilentSmtp,
  type SilentSmtp,
} from '../../__tests__/support/smtp.ts';
import { Mailer } from '../mailer.ts';
import { MailerSmtp } from '../smtp.ts';

/**
 * The case waits out the greeting timeout itself, because the timeout is the
 * subject: nothing shorter distinguishes the bound this build asks for from
 * the one nodemailer would have used.
 */
const GREETING_CASE_TIMEOUT_MS = 45_000;

describe('the SMTP mailer', () => {
  it.live(
    'gives up on a server that never greets, well inside a stop window',
    () =>
      Effect.gen(function* () {
        const smtp: SilentSmtp = yield* Effect.acquireRelease(
          Effect.promise(() => startSilentSmtp()),
          (open) => Effect.promise(() => open.close()),
        );

        // Through a built layer, because the transport is acquired when the
        // layer is built and closed when its scope goes: the bound is a
        // property of the service a program gets, not of a constructor.
        const scope = yield* Scope.make();
        const services = yield* Layer.buildWithScope(
          MailerSmtp({
            url: `smtp://127.0.0.1:${smtp.port}`,
            from: 'studio@example.test',
          }),
          scope,
        );
        const mailer = Context.get(services, Mailer);

        const began = Date.now();
        yield* Effect.promise(() =>
          expect(
            Effect.runPromise(
              mailer.sendMagicLink({
                email: 'researcher@example.org',
                url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
              }),
            ),
          ).rejects.toThrow(/Greeting never received/),
        );
        const waited = Date.now() - began;
        yield* Scope.close(scope, Exit.void);

        // It really did wait for a greeting: a refused connection or a rejected
        // address would fail in milliseconds and say nothing about the bound.
        expect(waited).toBeGreaterThan(5_000);
        // And it is this build's bound rather than nodemailer's 30 seconds.
        // nodemailer throws away a configuration object handed to
        // `createTransport` beside a `url`, so the two are one edit apart.
        expect(waited).toBeLessThan(20_000);
      }),
    GREETING_CASE_TIMEOUT_MS,
  );
});
