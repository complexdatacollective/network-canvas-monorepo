// What the SMTP transport does when a server takes the connection and then
// goes quiet, which is the failure every bound in `createSmtpMailer` exists
// for. The numbers are a deployment property rather than a preference: an
// invitation attempt expires after 60 seconds (packages/studio-sync/src/jobs.ts)
// and a container stop gives an in-flight send 25 (src/jobs/worker.ts), so a
// send left at nodemailer's own defaults — 2 minutes to connect, 30 seconds
// for a greeting, 10 idle minutes — outlasts both, and the job it belongs to
// is failed as 'pg-boss shut down while active' instead of being retried.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  startSilentSmtp,
  type SilentSmtp,
} from '../../__tests__/support/smtp.ts';
import { createMailer } from '../email.ts';

/**
 * The case waits out the greeting timeout itself, because the timeout is the
 * subject: nothing shorter distinguishes the bound this build asks for from
 * the one nodemailer would have used.
 */
const GREETING_CASE_TIMEOUT_MS = 45_000;

describe('the SMTP mailer', () => {
  let smtp: SilentSmtp;

  beforeEach(async () => {
    smtp = await startSilentSmtp();
  });

  afterEach(async () => {
    await smtp.close();
  });

  it(
    'gives up on a server that never greets, well inside a stop window',
    async () => {
      const mailer = createMailer({
        kind: 'smtp',
        url: `smtp://127.0.0.1:${smtp.port}`,
        from: 'studio@example.test',
      });

      const began = Date.now();
      await expect(
        mailer.sendMagicLink({
          email: 'researcher@example.org',
          url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
        }),
      ).rejects.toThrow(/Greeting never received/);
      const waited = Date.now() - began;

      // It really did wait for a greeting: a refused connection or a rejected
      // address would fail in milliseconds and say nothing about the bound.
      expect(waited).toBeGreaterThan(5_000);
      // And it is this build's bound rather than nodemailer's 30 seconds.
      // nodemailer throws away a configuration object handed to
      // `createTransport` beside a `url`, so the two are one edit apart.
      expect(waited).toBeLessThan(20_000);
    },
    GREETING_CASE_TIMEOUT_MS,
  );
});
