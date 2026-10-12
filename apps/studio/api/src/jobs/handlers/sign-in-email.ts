import { Effect } from 'effect';

import {
  type MailFailed,
  Mailer,
  type MailNotConfigured,
} from '../../mail/mailer.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';

export const signInEmail = Effect.fn('job.sign-in-email')(function* (
  job: HandledJob<'sign-in-email'>,
): Effect.fn.Return<JobOutcome, MailFailed | MailNotConfigured, Mailer> {
  const mailer = yield* Mailer;
  yield* mailer.sendMagicLink({
    email: job.payload.email,
    url: job.payload.url,
  });
  return 'completed';
});
