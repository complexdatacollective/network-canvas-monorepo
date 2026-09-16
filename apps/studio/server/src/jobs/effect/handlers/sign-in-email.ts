import { Effect } from 'effect';

import {
  type MailFailed,
  Mailer,
  type MailNotConfigured,
} from '../../../mail/mailer.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';

// Sending the sign-in email, which is all the web process delegated when it
// enqueued the job (#1895). The whole handler is one send: there is no row to
// settle and nothing to record, because the magic link exists only in the
// payload and better-auth already decided the person may have one.
//
// What the port of src/jobs/handlers/sign-in-email.ts dropped, and why:
//
//  - The parse. `JobWorker.work` decodes the row against the queue's schema
//    before a handler sees it (#1927 §11), so a payload an older release or a
//    hand-written row left behind never reaches this code — it kills the job
//    rather than failing it, which no retry could have fixed either way.
//  - The `try`/`catch` and the outcome line. Failing is the error channel, and
//    `drainOnce` writes the line from the row's own attempt counters. That
//    matters here more than elsewhere: the queue names no dead letter — a
//    sign-in link is useless by the time anyone could act on a dead-lettered
//    copy — so the last failed attempt is the end of it, and the worker's
//    `failed` line is the only record a deployment gets.
//  - The `for` loop over a batch. The native queue claims one row per step.
//
// Both of the transport's failures are left to the queue: `MailFailed` is a
// transport that refused, and `MailNotConfigured` is a deployment with no
// transport at all. The second is not a state this handler should be in — the
// registration is what decides not to work the mail queues without a transport
// (#1895's ruling), rather than burning the two retries while an operator is
// still setting SMTP up — but that decision is stage 3's wiring, and until it
// lands a send attempted anyway fails the attempt and says why on the row.
export const signInEmail = Effect.fn('job.sign-in-email')(function* (
  job: HandledJob<'sign-in-email'>,
): Effect.fn.Return<JobOutcome, MailFailed | MailNotConfigured, Mailer> {
  const mailer = yield* Mailer;
  // The payload reaches the transport unchanged: the URL is the whole of what
  // better-auth minted and nothing here may rewrite it.
  yield* mailer.sendMagicLink({
    email: job.payload.email,
    url: job.payload.url,
  });
  return 'completed';
});
