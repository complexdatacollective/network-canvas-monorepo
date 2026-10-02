import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Exit, Layer, Scope } from 'effect';

import {
  startSilentSmtp,
  type SilentSmtp,
} from '../../__tests__/support/smtp.ts';
import { Mailer } from '../mailer.ts';
import { MailerSmtp } from '../smtp.ts';

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

        expect(waited).toBeGreaterThan(5_000);
        expect(waited).toBeLessThan(20_000);
      }),
    GREETING_CASE_TIMEOUT_MS,
  );
});
