import { SignInEmailJobSchema } from '@codaco/studio-sync/jobs';

import type { MagicLinkMailer } from '../../mail/mailer.ts';
import { logJobOutcome } from '../log.ts';
import type { HandledJob } from './job.ts';

// Sending the sign-in email, which is all the web process delegated when it
// enqueued the job (#1895). The whole handler is one send: there is no row to
// settle and nothing to record, because the magic link exists only in the
// payload and better-auth already decided the person may have one.

export type SignInEmailHandlerDeps = {
  mailer: MagicLinkMailer;
};

/**
 * Registered only when the worker has a mail transport; without one the queue
 * is deliberately unworked and the jobs wait (#1895's ruling), so this is
 * never constructed with a mailer that refuses every send — which would burn
 * the two retries and fail the job while the operator was still setting SMTP up.
 */
export function createSignInEmailHandler({
  mailer,
}: SignInEmailHandlerDeps): (jobs: HandledJob[]) => Promise<void> {
  return async (jobs) => {
    // pg-boss hands every handler an array. The registration asks for one job
    // at a time, so the loop body runs once; it is a loop rather than a
    // `jobs[0]` so that a future batch size does not silently drop the rest.
    for (const job of jobs) {
      // Counted from 1 because that is what an operator reading the line means
      // by "attempt"; pg-boss's retryCount is 0 on the first try.
      const attempt = job.retryCount + 1;
      try {
        // Parsed rather than cast: the column is JSON, and a row written by an
        // older release or by hand would otherwise reach nodemailer as a
        // malformed address.
        const data = SignInEmailJobSchema.parse(job.data);
        await mailer.sendMagicLink(data);
        logJobOutcome({
          queue: 'sign-in-email',
          jobId: job.id,
          outcome: 'completed',
          attempt,
        });
      } catch (error) {
        logJobOutcome({
          queue: 'sign-in-email',
          jobId: job.id,
          // The queue has no dead letter — a sign-in link is useless by the
          // time a person could act on a dead-lettered copy — so the last
          // failed attempt is the end of it, and the line has to say so.
          outcome: job.retryCount >= job.retryLimit ? 'failed' : 'retrying',
          attempt,
          error,
        });
        // Throwing is how a handler fails a job: pg-boss stores the error as
        // the job's output and schedules the retry, or marks it failed.
        throw error;
      }
    }
  };
}
